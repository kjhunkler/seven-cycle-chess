const {test}=require('node:test');
const assert=require('node:assert/strict');
const {lobbyHarness}=require('./lobby-harness.cjs');
for(const count of [2,3,4])for(const requester of [0,count-1])test(`${count} players: ${requester?'guest':'host'} returns everyone to the same lobby and starts a new round`,async()=>{
 const hub=lobbyHarness(),clients=Array.from({length:count},(_,i)=>hub.add('Player '+(i+1))),host=clients[0];
 await hub.pump();
 for(let i=1;i<count;i++){
  await host.run(`invitePlayer(lastFriends.find(f=>f.name==='Player ${i+1}').id)`);await hub.pump();
  await clients[i].run('acceptInvite([...pendingInvites.values()][0])');await hub.pump();
 }
 host.match.run(`lobbyAction(1,{action:'config',config:{...lobbyConfig,map:${count===2?10:count===3?6:4},shops:true}})`);await hub.pump();
 const config=host.match.run('JSON.stringify(lobbyConfig)'),rooms=clients.map(c=>c.run('JSON.stringify([...links.keys()])'));
 const ready=async()=>{for(const c of clients)c.match.elements.get('ready-button').onclick();await hub.pump()};
 await ready();
 host.match.run('for(const castle of Object.values(N).filter(n=>n.castle&&n.owner!==1)){castle.stock.fill(0);arrive({to:castle.id,owner:1,type:0,n:1})}loop(5100)');await hub.pump();
 const stale=JSON.parse(host.match.run('JSON.stringify(snapshot(2))'));
 for(const c of clients){assert.equal(c.match.run('over'),1);c.match.run('render()')}
 const dialog=clients[requester].match.created.find(el=>el.className==='endgame-dialog');
 assert.equal(dialog.querySelector('.endgame-retry').textContent,'Return to lobby');
 dialog.querySelector('.endgame-retry').listeners.get('click')();await hub.pump();
 for(let i=0;i<count;i++){
  const c=clients[i];
  assert.equal(c.run('session'),true);assert.equal(c.run('JSON.stringify([...links.keys()])'),rooms[i]);
  assert.equal(c.match.run('matchRound'),1);assert.equal(c.match.run('gameStarted'),false);
  assert.equal(c.match.run('over'),0);assert.equal(c.match.run('lobbyReady.some(Boolean)'),false);
  assert.equal(c.match.run('JSON.stringify(lobbyConfig)'),config);
  assert.equal(c.match.run('humanPlayers.length'),count);assert.equal(c.match.run('lobbyMembers.length'),count);
  assert.equal(c.match.elements.get('variant-dialog').open,true);
  assert.equal(c.match.run('Object.values(N).filter(n=>n.castle).every(n=>!n.disabled)'),true);
 }
 // An old terminal board must never revive the previous game, even with a high sequence.
 stale.sequence=99999;clients[1].match.context.stale=stale;
 clients[1].match.run('matchGame.receive(stale,1)');assert.equal(clients[1].match.run('gameStarted'),false);
 await ready();
 for(const c of clients){assert.equal(c.match.run('gameStarted'),true);assert.equal(c.match.run('countdownRemaining'),5000)}
 host.match.run('matchGame.receive({kind:"lobby-action",action:"rematch",round:0},2)');
 assert.equal(host.match.run('gameStarted'),true);
 host.match.run('countdownRemaining=0;matchGame.receive({kind:"route",node:"P2",to:N.P2.adj[0],sequence:99999,round:0},2)');
 assert.equal(host.match.run('N.P2.routes.length'),0,'previous-round commands are ignored');
});

test('requesting a return during an active match leaves it running',async()=>{
 const hub=lobbyHarness(),host=hub.add('Host'),guest=hub.add('Guest');await hub.pump();
 await host.run('invitePlayer(lastFriends[0].id)');await hub.pump();await guest.run('acceptInvite([...pendingInvites.values()][0])');await hub.pump();
 host.match.elements.get('ready-button').onclick();guest.match.elements.get('ready-button').onclick();await hub.pump();
 host.match.run('matchGame.returnToLobby();lobbyAction(2,{action:"rematch",round:0})');
 assert.equal(host.match.run('gameStarted'),true);assert.equal(host.match.run('matchRound'),0);
});
