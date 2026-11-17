const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');const {EventEmitter}=require('node:events');
function broker(){const clients=[],packets=[];let now=100000;
 const mqtt={connect(){const client=new EventEmitter();client.topics=[];client.subscribe=(topics,options,cb)=>{client.topics=topics;cb()};client.publishAsync=async(route,raw)=>{packets.push([route,raw]);for(const peer of clients)if(peer.topics.includes(route))peer.emit('message',route,Buffer.from(raw))};clients.push(client);queueMicrotask(()=>client.emit('connect'));return client}};
 function add(name){const games=[];const context=vm.createContext({crypto,TextEncoder,TextDecoder,btoa,atob,Date:{now:()=>now},receiveRelayGame:(room,game)=>games.push({room,game})});context.window={mqtt};vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../public-lobby.js'),'utf8'),context);return {name,games,call:(action,fields={})=>{context.action=action;context.name=name;context.fields=fields;return vm.runInContext('publicLobby(action,name,fields)',context)}}}
 const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,10))};return {add,settle,clients,packets,advance:ms=>now+=ms};
}
test('encrypted public signaling supports three independent guests and deduplicates relay controls',async()=>{
 const b=broker(),people=Array.from({length:4},(_,i)=>b.add('Player '+i));for(const p of people)await p.call('poll').catch(()=>{});await b.settle();for(const p of people)await p.call('poll');await b.settle();b.advance(4001);for(const p of people)await p.call('poll');await b.settle();
 const host=people[0],friends=(await host.call('poll')).friends;assert.equal(friends.length,3);
 for(let i=1;i<4;i++){
  for(const person of people)await person.call('poll');await b.settle();
  const friend=friends.find(f=>f.name===people[i].name);const {room}=await host.call('invite',{to:friend.id});await b.settle();const invite=(await people[i].call('poll')).events.find(e=>e.kind==='invite');assert.equal(invite.room,room);assert.ok(invite.from);
  await people[i].call('accept',{room});await b.settle();assert.ok((await host.call('poll')).events.some(e=>e.kind==='accept'&&e.room===room));
  await host.call('game',{room,game:{kind:'welcome',seat:i+1}});await b.settle();assert.equal(people[i].games[0].game.seat,i+1);
  const [route,raw]=b.packets.at(-1);for(const client of b.clients)if(client.topics.includes(route))client.emit('message',route,Buffer.from(raw));await b.settle();assert.equal(people[i].games.length,1,'QoS replay ignored');
  b.advance(601000);await host.call('poll');await people[i].call('poll');await host.call('game',{room,game:{kind:'state',large:'x'.repeat(150000)}});await b.settle();assert.equal(people[i].games.at(-1).game.large.length,150000,'long direct match retains relay credentials and large snapshots encode');
 }
});
