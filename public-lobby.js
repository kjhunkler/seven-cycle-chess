function createPublicLobby(loadDirectory = () => import('./spacetime-lobby-client.js?v=global-chat-1')) {
  const id = crypto.randomUUID();
  const friends = new Map(), rooms = new Map(), inbox = [];
  let opening, directory, keys, publicKey;
  const b64 = value => {const bytes=new Uint8Array(value);let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw)};
  const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const encode = value => new TextEncoder().encode(value);
  const cipher = (iv, room) => ({name:'AES-GCM',iv,additionalData:encode(room)});
  async function shared(key) {
    const remote = await crypto.subtle.importKey('jwk',key,{name:'ECDH',namedCurve:'P-256'},false,[]);
    return crypto.subtle.deriveKey({name:'ECDH',public:remote},keys.privateKey,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function receive(data) {
    if(data.kind==='invite') {
      if(typeof data.name!=='string'||!data.key||rooms.has(data.room)||rooms.size>=100)return;
      rooms.set(data.room,{id:data.id,key:await shared(data.key),seen:Date.now(),accepted:false});
      inbox.push({kind:'invite',room:data.room,name:data.name.slice(0,32),from:data.id,expiresAt:data.expiresAt});
      return;
    }
    if(data.kind==='entry-request') {
      if(['join','spectate'].includes(data.mode)&&inbox.length<100)
        inbox.push({kind:'entry-request',from:data.from,name:data.name,mode:data.mode});
      return;
    }
    const room=rooms.get(data.room);
    if(!room||room.id!==data.from||room.received?.has(data.iv))return;
    const raw=await crypto.subtle.decrypt(cipher(decode(data.iv),data.room),room.key,decode(data.payload));
    const event=JSON.parse(new TextDecoder().decode(raw));
    room.received??=new Set();room.received.add(data.iv);
    if(room.received.size>2048)room.received.delete(room.received.values().next().value);
    room.seen=Date.now();
    if(event.kind==='accept')room.accepted=true;
    if(event.kind==='game')receiveRelayGame(data.room,event.game);
    if(['accept','signal','candidate','relay','leave'].includes(event.kind))inbox.push({...event,room:data.room});
    if(event.kind==='leave')rooms.delete(data.room);
  }
  async function open() {
    if(!window.FRUIT_WARS_SPACETIME_DB)throw new Error('The public lobby requires SpacetimeDB.');
    keys=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
    publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey);
    const {createLobbyDirectory}=await loadDirectory();
    directory=createLobbyDirectory(window.FRUIT_WARS_SPACETIME_DB,window.FRUIT_WARS_SPACETIME_HOST||undefined,window.FRUIT_WARS_AUTH_CLIENT);
    directory.onMessage(receive);
  }
  return async (action,name,fields={}) => {
    opening??=open().catch(error=>{opening=undefined;throw error});
    await opening;
    if(['save-map','comment-map','vote-map','start-map-play'].includes(action))return directory.mapAction(action,fields);
    if(action==='record-match'||action==='record-solo')return directory.record(fields,action==='record-solo');
    if(['sign-in','sign-out','rename-account'].includes(action))return directory.accountAction(action,name);
    if(action==='poll') {
      let directoryUnavailable=false;
      try {
        const online=await directory.poll({id,name,key:publicKey},receive,fields.activity??null);
        friends.clear();for(const friend of online)friends.set(friend.id,friend);
      }catch {directoryUnavailable=true}
      const now=Date.now();
      for(const [key,room]of rooms)if(!room.accepted&&now-room.seen>30000){rooms.delete(key);inbox.push({kind:'expired',room:key})}
      return {iceServers:[{urls:'stun:stun.l.google.com:19302'}],
        friends:[...friends].map(([id,{key,...friend}])=>({id,...friend})),events:inbox.splice(0),directoryUnavailable,
        community:directory.community(),matchHistory:directory.history(),account:directory.account()};
    }
    if(action==='enter')return directory.enter(fields.to,fields.mode);
    if(action==='invite') {
      const friend=friends.get(fields.to);
      if(!friend||friend.online===false)throw new Error('Friend is offline.');
      const room=crypto.randomUUID();
      rooms.set(room,{id:fields.to,key:await shared(friend.key),seen:Date.now(),accepted:false});
      try{await directory.invite(fields.to,room)}catch(error){rooms.delete(room);throw error}
      return {room};
    }
    if(!['accept','signal','candidate','relay','game','leave'].includes(action))throw new Error('Unknown lobby action.');
    const room=rooms.get(fields.room);
    if(!room)throw new Error('Invitation expired.');
    if(action==='accept'){await directory.accept(fields.room);room.accepted=true}
    room.seen=Date.now();
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const raw=encode(JSON.stringify({kind:action,name,description:fields.description,candidate:fields.candidate,game:fields.game}));
    const payload=await crypto.subtle.encrypt(cipher(iv,fields.room),room.key,raw);
    await directory.send({room:fields.room,iv:b64(iv),payload:b64(payload),state:action==='game'&&fields.game?.kind==='state'});
    if(action==='leave'){rooms.delete(fields.room);await directory.close(fields.room)}
    return {};
  };
}
const publicLobby = createPublicLobby();
