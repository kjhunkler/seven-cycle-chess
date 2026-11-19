const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function database(){
 const clients=[],rooms=new Map(),messages=[];let now=100000;
 function add(name){
  const games=[];let profile,receive;
  const directory={
   onMessage(fn){receive=fn},
   async poll(p,invite,activity){profile={...p,activity,online:true};return clients.filter(c=>c.profile()&&c.profile().id!==p.id).map(c=>c.profile())},
   enter:async(to,mode)=>{const target=clients.find(c=>c.profile()?.id===to);await target.receive({kind:'entry-request',from:profile.id,name,mode})},
   invite:async(to,room)=>{const target=clients.find(c=>c.profile()?.id===to);rooms.set(room,{from:profile.id,to});await target.receive({kind:'invite',id:profile.id,name,key:profile.key,room,expiresAt:now+30000})},
   accept:async()=>{},
   send:async(message)=>{messages.push(message);const r=rooms.get(message.room);const to=r.from===profile.id?r.to:r.from;await clients.find(c=>c.profile()?.id===to).receive({...message,from:profile.id})},
   close:async()=>{},community(){},history(){},account(){}
  };
  const context=vm.createContext({crypto,TextEncoder,TextDecoder,btoa,atob,Date:{now:()=>now},receiveRelayGame:(room,game)=>games.push({room,game}),directoryFactory:()=>directory});
  context.window={FRUIT_WARS_SPACETIME_DB:'test'};
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../public-lobby.js'),'utf8'),context);
  vm.runInContext('const testLobby=createPublicLobby(async()=>({createLobbyDirectory:directoryFactory}))',context);
  const client={name,games,profile:()=>profile,receive:data=>receive(data),call:(action,fields={})=>{context.action=action;context.name=name;context.fields=fields;return vm.runInContext('testLobby(action,name,fields)',context)}};
  clients.push(client);return client;
 }
 return {add,messages,advance:ms=>now+=ms};
}

test('database transport supports independent encrypted rooms with no MQTT client',async()=>{
 const db=database(),people=Array.from({length:4},(_,i)=>db.add('Player '+i));
 for(const p of people)await p.call('poll');for(const p of people)await p.call('poll');
 const host=people[0];
 for(const guest of people.slice(1)){
  const friend=(await host.call('poll')).friends.find(f=>f.name===guest.name);
  const {room}=await host.call('invite',{to:friend.id});
  assert.equal((await guest.call('poll')).events.find(e=>e.kind==='invite').room,room);
  await guest.call('accept',{room});assert.ok((await host.call('poll')).events.some(e=>e.kind==='accept'));
  await host.call('signal',{room,description:{type:'offer',sdp:'test'}});
  assert.equal((await guest.call('poll')).events.find(e=>e.kind==='signal').description.sdp,'test');
  await guest.call('candidate',{room,candidate:{candidate:'ice'}});
  assert.equal((await host.call('poll')).events.find(e=>e.kind==='candidate').candidate.candidate,'ice');
  await host.call('game',{room,game:{kind:'state',large:'x'.repeat(150000)}});
  assert.equal(guest.games.at(-1).game.large.length,150000);
  assert.equal(db.messages.at(-1).state,true);assert.ok(!db.messages.at(-1).payload.includes('large'));
  await guest.receive({...db.messages.at(-1),from:host.profile().id});assert.equal(guest.games.length,1,'duplicate encrypted messages are ignored');
  await host.call('game',{room,game:{kind:'welcome',seat:2}});assert.equal(db.messages.at(-1).state,false);
  await guest.call('leave',{room});assert.ok((await host.call('poll')).events.some(e=>e.kind==='leave'));
 }
});

test('database game activity advertises spectate and join and routes entry requests',async()=>{
 const db=database(),host=db.add('Host'),guest=db.add('Guest');
 await host.call('poll',{activity:{join:true}});await guest.call('poll');
 let friend=(await guest.call('poll')).friends.find(f=>f.name==='Host');assert.equal(friend.activity.join,true);
 await guest.call('enter',{to:friend.id,mode:'spectate'});
 const entry=(await host.call('poll',{activity:{join:true}})).events.find(e=>e.kind==='entry-request');
 assert.equal(entry.mode,'spectate');assert.equal(entry.name,'Guest');
 const {room}=await host.call('invite',{to:entry.from});await guest.call('poll');
 await guest.call('accept',{room});await host.call('poll',{activity:{join:true}});
 await host.call('game',{room,game:{kind:'welcome',seat:0}});assert.equal(guest.games.at(-1).game.seat,0);
 await guest.call('game',{room,game:{kind:'join-game'}});assert.equal(host.games.at(-1).game.kind,'join-game');
 await host.call('poll');friend=(await guest.call('poll')).friends.find(f=>f.name==='Host');assert.equal(friend.activity,null);
});
