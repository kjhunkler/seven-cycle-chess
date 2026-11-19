const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildSync}=require('../spacetime-lobby/node_modules/esbuild');
const root=path.join(__dirname,'..');
const source=buildSync({stdin:{contents:"export {DbConnection,tables} from './spacetime-lobby/bindings'; export {createLobbyDirectory} from './spacetime-lobby/client.js';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',define:{'import.meta.url':JSON.stringify('http://localhost/')},write:false}).outputFiles[0].text;
const compiled={exports:{}};new Function('require','module','exports',source)(require,compiled,compiled.exports);
const {DbConnection,tables,createLobbyDirectory}=compiled.exports;
const server=process.env.FRUIT_WARS_TEST_SERVER||'http://127.0.0.1:3017';
const database=process.env.FRUIT_WARS_TEST_DB||'fruit-wars-transport-test';
const connections=[];
async function connect(){
 return new Promise((resolve,reject)=>{
  const conn=DbConnection.builder().withUri(server).withDatabaseName(database).onConnect(c=>{
   c.subscriptionBuilder().onApplied(()=>resolve(c)).onError(reject).subscribe([tables.player,tables.gameActivity,tables.myLobbyMessages,tables.pendingInvitations]);
  }).onConnectError((_,e)=>reject(e)).build();connections.push(conn);
 });
}
async function waitFor(read,timeout=7000){
 const until=Date.now()+timeout;
 while(Date.now()<until){const result=read();if(result)return result;await new Promise(r=>setTimeout(r,20))}
 throw Error('Timed out waiting for database update');
}
async function announce(conn){
 const key=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
 const jwk=await crypto.subtle.exportKey('jwk',key.publicKey), id=crypto.randomUUID();
 await conn.reducers.announce({id,name:'Test '+id.slice(0,6),key:JSON.stringify(jwk)});return id;
}

test('real database enforces recipient privacy, room membership, snapshot replacement and expiry', {timeout:45000}, async t=>{
 t.after(()=>{for(const c of connections)c.disconnect()});
 const [host,guest,stranger]=await Promise.all([connect(),connect(),connect()]);
 const [hostId,guestId]=await Promise.all([announce(host),announce(guest),announce(stranger)]);
 await host.reducers.setGameActivity({active:true,join:true});
 await waitFor(()=>guest.db.gameActivity.id.find(hostId));
 await guest.reducers.requestGameEntry({to:hostId,mode:'spectate'});
 const entry=await waitFor(()=>[...host.db.myLobbyMessages.iter()].find(m=>m.kind==='entry-request'));
 assert.equal(entry.from,guestId);assert.equal([...stranger.db.myLobbyMessages.iter()].length,0);
 await stranger.reducers.acknowledgeLobbyMessages({ids:[entry.id]});
 assert.ok([...host.db.myLobbyMessages.iter()].some(m=>m.id===entry.id));
 await host.reducers.acknowledgeLobbyMessages({ids:[entry.id]});
 const room=crypto.randomUUID();await host.reducers.sendInvitation({to:guestId,room});
 await waitFor(()=>[...guest.db.pendingInvitations.iter()].some(m=>m.room===room));
 await assert.rejects(stranger.reducers.acceptLobbyRoom({room}));
 await guest.reducers.acceptLobbyRoom({room});
 const message={room,iv:'abcdefghijklmnop',payload:'A'.repeat(32),state:true};
 await assert.rejects(stranger.reducers.sendLobbyMessage(message));
 await host.reducers.sendLobbyMessage(message);await host.reducers.sendLobbyMessage({...message,payload:'B'.repeat(32)});
 await waitFor(()=>[...guest.db.myLobbyMessages.iter()].find(m=>m.payload==='B'.repeat(32)));
 assert.equal([...guest.db.myLobbyMessages.iter()].filter(m=>m.kind==='state').length,1);
 assert.equal([...stranger.db.myLobbyMessages.iter()].length,0);
 await host.reducers.sendLobbyMessage({...message,state:false,payload:'C'.repeat(32)});
 await host.reducers.sendLobbyMessage({...message,state:false,payload:'D'.repeat(32)});
 await waitFor(()=>[...guest.db.myLobbyMessages.iter()].filter(m=>m.kind==='envelope').length===2);
 await waitFor(()=>![...guest.db.myLobbyMessages.iter()].some(m=>m.kind==='state'),20000);
 assert.equal([...guest.db.myLobbyMessages.iter()].filter(m=>m.kind==='envelope').length,2);
 await host.reducers.setGameActivity({active:false,join:false});
 await assert.rejects(guest.reducers.requestGameEntry({to:hostId,mode:'join'}));
});

test('real public lobby advertises games and exchanges encrypted signaling and relay traffic without a broker',{timeout:30000},async t=>{
 const store={};globalThis.localStorage={getItem:key=>store[key]??null,setItem:(key,value)=>{store[key]=String(value)},removeItem:key=>{delete store[key]}};
 const directories=[];
 t.after(()=>{for(const d of directories)d.disconnect();delete globalThis.localStorage});
 function add(name){
  const games=[];
  const context=vm.createContext({crypto,TextEncoder,TextDecoder,btoa,atob,Date,receiveRelayGame:(room,game)=>games.push({room,game}),directoryFactory:()=>{const d=createLobbyDirectory(database,server);directories.push(d);return d}});
  context.window={FRUIT_WARS_SPACETIME_DB:database};
  vm.runInContext(fs.readFileSync(path.join(root,'public-lobby.js'),'utf8'),context);
  vm.runInContext('const testLobby=createPublicLobby(async()=>({createLobbyDirectory:directoryFactory}))',context);
  return {games,call:(action,fields={})=>{context.action=action;context.name=name;context.fields=fields;return vm.runInContext('testLobby(action,name,fields)',context)}};
 }
 const host=add('Host'),guest=add('Guest');let roster;
 for(let i=0;i<40;i++){
  await host.call('poll',{activity:{join:true}});roster=await guest.call('poll');
  if(roster.friends.some(f=>f.name==='Host'&&f.activity?.join))break;
  await new Promise(r=>setTimeout(r,50));
 }
 const friend=roster.friends.find(f=>f.name==='Host');assert.equal(friend?.activity?.join,true);
 await guest.call('enter',{to:friend.id,mode:'spectate'});
 let entry;
 for(let i=0;i<30&&!entry;i++){
  entry=(await host.call('poll',{activity:{join:true}})).events.find(e=>e.kind==='entry-request');
  if(!entry)await new Promise(r=>setTimeout(r,30));
 }
 assert.equal(entry?.mode,'spectate');
 const {room}=await host.call('invite',{to:entry.from});
 let invitation;
 for(let i=0;i<30&&!invitation;i++){
  invitation=(await guest.call('poll')).events.find(e=>e.kind==='invite');
  if(!invitation)await new Promise(r=>setTimeout(r,30));
 }
 assert.equal(invitation?.room,room);
 await guest.call('accept',{room});
 await host.call('signal',{room,description:{type:'offer',sdp:'actual-database'}});
 let signal;
 for(let i=0;i<30&&!signal;i++){
  signal=(await guest.call('poll')).events.find(e=>e.kind==='signal');
  if(!signal)await new Promise(r=>setTimeout(r,30));
 }
 assert.equal(signal?.description.sdp,'actual-database');
 await host.call('game',{room,game:{kind:'welcome',seat:0}});
 await waitFor(()=>guest.games.find(g=>g.game.kind==='welcome'));
 assert.equal(guest.games.at(-1).game.seat,0);
 await guest.call('game',{room,game:{kind:'join-game'}});
 await waitFor(()=>host.games.some(g=>g.game.kind==='join-game'));
 await host.call('game',{room,game:{kind:'state',large:'x'.repeat(150000)}});
 await waitFor(()=>guest.games.some(g=>g.game.large?.length===150000));
 await guest.call('leave',{room});
 let leave;
 for(let i=0;i<30&&!leave;i++){
  leave=(await host.call('poll',{activity:{join:true}})).events.find(e=>e.kind==='leave');
  if(!leave)await new Promise(r=>setTimeout(r,30));
 }
 assert.equal(leave?.room,room);
});

test('real game spectates a live solo board and takes over a bot through the database relay',{timeout:30000},async t=>{
 const store={};globalThis.localStorage={getItem:key=>store[key]??null,setItem:(key,value)=>{store[key]=String(value)},removeItem:key=>{delete store[key]}};
 const directories=[];t.after(()=>{for(const d of directories)d.disconnect();delete globalThis.localStorage});
 const {lobbyHarness}=require('./lobby-harness.cjs');
 const hub=lobbyHarness({setup(context,{match}){
  Object.assign(match.context,{dispatchEvent(){},Event});
  Object.assign(context,{FRUIT_WARS_SPACETIME_DB:database,TextEncoder,TextDecoder,btoa,atob,Event,
   loadMapCatalog(){},dispatchEvent(){},mapLibrary:{sync(){}},
   loadTestDirectory:async()=>({createLobbyDirectory:()=>{const d=createLobbyDirectory(database,server);directories.push(d);return d}})});
  vm.runInContext(fs.readFileSync(path.join(root,'public-lobby.js'),'utf8').replace('const publicLobby = createPublicLobby();','const publicLobby = createPublicLobby(loadTestDirectory);'),context);
 }});
 const host=hub.add('Game Host'),guest=hub.add('Game Guest');
 async function until(check){for(let i=0;i<100;i++){await hub.beat();if(check())return;await new Promise(r=>setTimeout(r,25))}throw Error('Game connection timed out: '+host.els.get('[role=status]')?.textContent+' / '+guest.els.get('[role=status]')?.textContent)}
 host.solo.run('botConfig.map=4;init();botGame.start();N.P2.stock[0]=70');
 await until(()=>guest.run('lastFriends.some(f=>f.name==="Game Host"&&f.activity?.join)'));
 await guest.run('enterGame(lastFriends.find(f=>f.name==="Game Host").id,"spectate")');
 await until(()=>guest.run('player===0'));
 assert.equal(host.run('!!frame'),false);
 await until(()=>guest.match.run('Object.keys(N).length>0'));
 assert.ok(host.run('[...links.values()].some(l=>l.relay&&l.connected)'));
 guest.run('transmit({kind:"join-game"})');
 await until(()=>guest.run('player>1'));
 assert.equal(guest.run('player'),2);
 await until(()=>host.run('game()?.started')&&guest.match.run('humanPlayers.includes(2)'));
 assert.equal(host.match.run('N.P2.stock[0]'),70);
 assert.ok(guest.match.run('humanPlayers.includes(2)'));
});
