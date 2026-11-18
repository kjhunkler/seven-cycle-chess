const publicLobby = (() => {
  const root = "fruit-wars/kjhunkler-seven-cycle-chess/v4";
  const id = crypto.randomUUID();
  const presence = root + "/presence", address = root + "/inbox/";
  const database = window.FRUIT_WARS_SPACETIME_DB;
  const friends = new Map(), rooms = new Map(), inbox = [];
  let client, ready, opening, directory, lastSeen = 0, lastName, keys, publicKey;
  const valid = value => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
  const b64 = value => {const bytes=new Uint8Array(value);let raw="";for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw)};
  const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const encode = value => new TextEncoder().encode(value);
  const cipher = (iv, room) => ({name:"AES-GCM",iv,additionalData:encode(room)});
  async function shared(key) {
    const remote = await crypto.subtle.importKey("jwk",key,{name:"ECDH",namedCurve:"P-256"},false,[]);
    return crypto.subtle.deriveKey({name:"ECDH",public:remote},keys.privateKey,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function receiveInvite(data) {
    if (data.kind === "invite" && typeof data.name === "string" && data.key && !rooms.has(data.room)) {
      if(rooms.size>=100||inbox.length>=100)return;
      rooms.set(data.room,{id:data.id,key:await shared(data.key),seen:Date.now(),accepted:false});
      inbox.push({kind:"invite",room:data.room,name:data.name.slice(0,32),from:data.id,expiresAt:data.expiresAt ?? Date.now()+30000});
    }
  }
  async function receive(route, payload) {
    if (payload.length > 1_500_000) return;
    const data = JSON.parse(payload.toString());
    if (!valid(data.id) || data.id === id) return;
    if (route === presence) {
      if (!database && typeof data.name === "string" && data.key) friends.set(data.id,{name:data.name.slice(0,32),key:data.key,seen:Date.now()});
      return;
    }
    if (!valid(data.room)) return;
    if (data.kind === "invite") {
      if (!database) await receiveInvite(data);
      return;
    }
    const room = rooms.get(data.room);
    if (!room || room.id !== data.id || typeof data.iv !== "string" || typeof data.payload !== "string") return;
    if(room.received?.has(data.iv))return;
    const raw = await crypto.subtle.decrypt(cipher(decode(data.iv),data.room),room.key,decode(data.payload));
    room.received??=new Set();room.received.add(data.iv);if(room.received.size>2048)room.received.delete(room.received.values().next().value);
    room.seen = Date.now();
    const event = JSON.parse(new TextDecoder().decode(raw));
    if(event.kind==="accept")room.accepted=true;
    if (event.kind === "game") receiveRelayGame(data.room,event.game);
    if (["accept","signal","candidate","relay","leave"].includes(event.kind)) inbox.push({...event,room:data.room});
    if (event.kind === "leave") rooms.delete(data.room);
  }
  async function open() {
    if (database) {
      const {createLobbyDirectory} = await import("./spacetime-lobby-client.js");
      directory = createLobbyDirectory(database, window.FRUIT_WARS_SPACETIME_HOST || undefined);
    }
    keys = await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveKey"]);
    publicKey = await crypto.subtle.exportKey("jwk",keys.publicKey);
    client = window.mqtt.connect("wss://broker.emqx.io:8084/mqtt",{reconnectPeriod:2000,connectTimeout:6000});
    client.on("connect",() => client.subscribe(database ? [address+id] : [presence,address+id],{qos:1},error => {ready=!error;lastSeen=0}));
    client.on("close",() => {ready=false});
    client.on("error",() => {ready=false});
    let chain = Promise.resolve();
    client.on("message",(route,payload) => {chain=chain.then(() => receive(route,payload)).catch(() => {})});
  }
  const publish = (route,data,qos=0) => client.publishAsync(route,JSON.stringify({...data,id}),{qos});
  return async (action,name,fields) => {
    opening ??= open().catch(error => {opening=undefined;throw error});
    await opening;
    if (action === "record-match") return directory?.record(fields);
    if (!ready) throw new Error("Connecting to the public signaling service.");
    const now = Date.now();
    if (action === "poll") {
      let directoryUnavailable = false;
      if (directory) {
        friends.clear();
        try {
          const online = await directory.poll({id,name,key:publicKey},receiveInvite);
          for (const friend of online) friends.set(friend.id,friend);
        } catch {
          directoryUnavailable = true;
        }
      } else {
        if (now-lastSeen >= 4000 || name!==lastName) {await publish(presence,{name,key:publicKey});lastSeen=now;lastName=name}
        for (const [key,friend] of friends) if (now-friend.seen > 15_000) friends.delete(key);
      }
      for (const [key,room] of rooms) if (!room.accepted&&now-room.seen > 30_000) {rooms.delete(key);inbox.push({kind:"expired",room:key})}
      return {iceServers:[{urls:"stun:stun.l.google.com:19302"}],
        friends:[...friends].map(([id,friend]) => ({id,name:friend.name})),events:inbox.splice(0),directoryUnavailable,matchHistory:directory?.history()};
    }
    if (action === "invite") {
      const friend = friends.get(fields.to);
      if (!friend) throw new Error("Friend is offline.");
      const room = crypto.randomUUID();
      rooms.set(room,{id:fields.to,key:await shared(friend.key),seen:now,accepted:false});
      try {
        if (directory) await directory.invite(fields.to,room);
        else await publish(address+fields.to,{kind:"invite",room,name,key:publicKey},1);
      } catch (error) {
        rooms.delete(room);
        throw error;
      }
      return {room};
    }
    const room = rooms.get(fields.room);
    if (!room) throw new Error("Invitation expired.");
    if(action==="accept"){
      room.accepted=true;
      void directory?.accept(fields.room).catch(() => {});
    }
    room.seen=now;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const message = encode(JSON.stringify({kind:action,name,description:fields.description,candidate:fields.candidate,game:fields.game}));
    const payload = await crypto.subtle.encrypt(cipher(iv,fields.room),room.key,message);
    await publish(address+room.id,{room:fields.room,iv:b64(iv),payload:b64(payload)},
      action==="game" && fields.game?.kind==="state" ? 0 : 1);
    if (action === "leave") rooms.delete(fields.room);
    return {};
  };
})();
