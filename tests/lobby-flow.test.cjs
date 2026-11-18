const {test}=require('node:test');const assert=require('node:assert/strict');const {lobbyHarness}=require('./lobby-harness.cjs');
for(const count of [2,3,4])test(`${count} browsers join one room, start together and route commands by seat`,async()=>{
 const hub=lobbyHarness(),clients=Array.from({length:count},(_,i)=>hub.add('Player '+(i+1)));await hub.pump();const host=clients[0];
 for(let i=1;i<count;i++){
  await host.run(`invitePlayer(lastFriends.find(f=>f.name==='Player ${i+1}').id)`);await hub.pump();await clients[i].run('acceptInvite([...pendingInvites.values()][0])');await hub.pump();
 }
 assert.equal(host.run('links.size'),count-1);
 clients.forEach((c,i)=>assert.equal(c.run('player'),i+1));
 assert.equal(host.match.run('lobbyConfig.noQueue'),true);
 host.match.run('lobbyAction(1,{action:"config",config:{...lobbyConfig,noQueue:false}})');await hub.pump();
 for(const c of clients)c.match.elements.get('ready-button').onclick();await hub.pump();
 for(const c of clients)assert.equal(c.match.run('gameStarted'),true);
 host.match.run('loop(5100)');await hub.pump();
 for(let i=1;i<count;i++)clients[i].match.run('act("q1")');await hub.pump();
 for(let i=1;i<count;i++)assert.equal(host.match.run(`N.P${i+1}.q[0]`),1);
 hub.advance(130);host.match.run('loop(5200)');await hub.pump();for(let i=1;i<count;i++)assert.equal(clients[i].match.run(`N.P${i+1}.q[0]`),1);
 // The established match survives transport rebinding and a temporary absence.
 host.match.run('N.P1.stock[0]=77');hub.advance(21000);await hub.beat();await hub.pump();assert.equal(host.match.run('N.P1.stock[0]'),77);
});
test('invitation expiry and leave clear stale toasts even outside an active room',async()=>{
 const hub=lobbyHarness(),host=hub.add('Host'),guest=hub.add('Guest');await hub.pump();await host.run('invitePlayer(lastFriends[0].id)');await hub.pump();assert.equal(guest.run('pendingInvites.size'),1);
 hub.advance(31000);await hub.pump();assert.equal(guest.run('pendingInvites.size'),0);await hub.beat();assert.equal(host.run('links.size'),0);
});
test('guest leaving a running match keeps other players and enables a bot',async()=>{
 const hub=lobbyHarness(),host=hub.add('Host'),guest=hub.add('Guest');await hub.pump();await host.run('invitePlayer(lastFriends[0].id)');await hub.pump();await guest.run('acceptInvite([...pendingInvites.values()][0])');await hub.pump();host.match.elements.get('ready-button').onclick();guest.match.elements.get('ready-button').onclick();await hub.pump();
 guest.run('reset("Left")');await hub.pump();assert.equal(host.match.run('gameStarted'),true);assert.equal(host.match.run('connectedPlayers.includes(2)'),false);assert.equal(host.run('session'),true);
});

test('large direct snapshots reassemble out of order without restarting a match',async()=>{
 const hub=lobbyHarness(),host=hub.add('Host'),guest=hub.add('Guest');await hub.pump();await host.run('invitePlayer(lastFriends[0].id)');await hub.pump();await guest.run('acceptInvite([...pendingInvites.values()][0])');await hub.pump();host.match.elements.get('ready-button').onclick();guest.match.elements.get('ready-button').onclick();await hub.pump();
 const packets=[];host.context.capture=raw=>packets.push(JSON.parse(raw));host.run('const direct=[...links.values()][0];direct.relay=false;direct.state={readyState:"open",bufferedAmount:0,send:capture}');
 const state=JSON.parse(JSON.stringify(host.match.run('snapshot(2)')));state.padding='x'.repeat(30000);host.context.packet=state;host.run('sendLink(direct,packet)');assert.ok(packets.length>1);
 for(const packet of packets.reverse()){guest.context.packet=packet;guest.run('receiveGame([...links.values()][0],packet)')}
 assert.equal(guest.match.run('lastSequence'),state.sequence);assert.equal(guest.match.run('gameStarted'),true);assert.equal(guest.run('[...links.values()][0].fragments.size'),0);
});
