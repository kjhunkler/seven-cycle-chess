const publicLobby = (() => {
  const root = "fruit-wars/kjhunkler-seven-cycle-chess/v3";
  const id = crypto.randomUUID();
  const presence = root + "/presence", address = root + "/inbox/";
  const friends = new Map(), rooms = new Map(), inbox = [];
  let client, ready, opening, lastSeen = 0, lastName, keys, publicKey;
  const valid = value => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
  const b64 = value => btoa(String.fromCharCode(...new Uint8Array(value)));
  const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const encode = value => new TextEncoder().encode(value);
  const cipher = (iv, room) => ({name:"AES-GCM",iv,additionalData:encode(room)});
  async function shared(key) {
    const remote = await crypto.subtle.importKey("jwk",key,{name:"ECDH",namedCurve:"P-256"},false,[]);
    return crypto.subtle.deriveKey({name:"ECDH",public:remote},keys.privateKey,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function receive(route, payload) {
    if (payload.length > 48_000) return;
    const data = JSON.parse(payload.toString());
    if (!valid(data.id) || data.id === id) return;
    if (route === presence) {
      if (typeof data.name === "string" && data.key) friends.set(data.id,{name:data.name.slice(0,32),key:data.key,seen:Date.now()});
      return;
    }
    if (!valid(data.room)) return;
    if (data.kind === "invite" && typeof data.name === "string" && data.key && !rooms.has(data.room)) {
      rooms.set(data.room,{id:data.id,key:await shared(data.key),seen:Date.now()});
      inbox.push({kind:"invite",room:data.room,name:data.name.slice(0,32)});
      return;
    }
    const room = rooms.get(data.room);
    if (!room || room.id !== data.id || typeof data.iv !== "string" || typeof data.payload !== "string") return;
    const raw = await crypto.subtle.decrypt(cipher(decode(data.iv),data.room),room.key,decode(data.payload));
    room.seen = Date.now();
    const event = JSON.parse(new TextDecoder().decode(raw));
    if (event.kind === "game") receiveRelayGame(data.room,event.game);
    if (["accept","signal","relay","leave"].includes(event.kind)) inbox.push({...event,room:data.room});
    if (event.kind === "leave") rooms.delete(data.room);
  }
  async function open() {
    keys = await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveKey"]);
    publicKey = await crypto.subtle.exportKey("jwk",keys.publicKey);
    client = window.mqtt.connect("wss://broker.emqx.io:8084/mqtt",{reconnectPeriod:2000,connectTimeout:6000});
    client.on("connect",() => client.subscribe([presence,address+id],{qos:1},error => {ready=!error;lastSeen=0}));
    client.on("close",() => {ready=false});
    client.on("error",() => {ready=false});
    let chain = Promise.resolve();
    client.on("message",(route,payload) => {chain=chain.then(() => receive(route,payload)).catch(() => {})});
  }
  const publish = (route,data,qos=0) => client.publishAsync(route,JSON.stringify({...data,id}),{qos});
  return async (action,name,fields) => {
    opening ??= open();
    await opening;
    if (!ready) throw new Error("Connecting to the public signaling service.");
    const now = Date.now();
    if (action === "poll") {
      if (now-lastSeen >= 4000 || name!==lastName) {await publish(presence,{name,key:publicKey});lastSeen=now;lastName=name}
      for (const [key,friend] of friends) if (now-friend.seen > 15_000) friends.delete(key);
      for (const [key,room] of rooms) if (now-room.seen > 600_000) rooms.delete(key);
      return {iceServers:[{urls:"stun:stun.l.google.com:19302"}],
        friends:[...friends].map(([id,friend]) => ({id,name:friend.name})),events:inbox.splice(0)};
    }
    if (action === "invite") {
      const friend = friends.get(fields.to);
      if (!friend) throw new Error("Friend is offline.");
      const room = crypto.randomUUID();
      rooms.set(room,{id:fields.to,key:await shared(friend.key),seen:now});
      await publish(address+fields.to,{kind:"invite",room,name,key:publicKey},1);
      return {room};
    }
    const room = rooms.get(fields.room);
    if (!room) throw new Error("Invitation expired.");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const message = encode(JSON.stringify({kind:action,name,description:fields.description,game:fields.game}));
    const payload = await crypto.subtle.encrypt(cipher(iv,fields.room),room.key,message);
    await publish(address+room.id,{room:fields.room,iv:b64(iv),payload:b64(payload)},
      action==="game" && fields.game?.kind==="state" ? 0 : 1);
    if (action === "leave") rooms.delete(fields.room);
    return {};
  };
})();
