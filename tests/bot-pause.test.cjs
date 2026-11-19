const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
const {lobbyHarness}=require('./lobby-harness.cjs');

test('bot game waits for Start and Pause freezes troops, production, transformations and rotation',()=>{
  const h=createGame('index.html');
  const button=h.created.find(e=>e.className==='battle-solo-toggle');
  h.run('render();loop(200);loop(1000)');
  assert.equal(button.textContent,'Start bot game');
  assert.equal(h.run('N.P1.tm'),0);
  assert.equal(h.run('botGame.active'),false);
  button.onclick();assert.equal(button.textContent,'Pause bot game');
  h.run('aiT=999;loop(200)');assert.ok(h.run('N.P1.tm')>0);
  button.onclick();assert.equal(button.textContent,'Resume bot game');
  h.run('N.P1.stock.fill(0);G=[{from:"C2",to:"P1",owner:2,type:0,n:10,t:.99}];productionCycle={active:{buff:0,debuff:1},next:{buff:1,debuff:2},endsAt:45100,remaining:45000};last=200');
  const before=h.run('JSON.stringify([N,G,transformationClock,aiT])');
  h.run('loop(1200);loop(2200)');
  assert.equal(h.run('JSON.stringify([N,G,transformationClock,aiT])'),before);
  assert.equal(h.run('productionCycle.endsAt'),47100);
  assert.equal(h.run('over'),0);
  assert.equal(h.run('botGame.bestBot()'),null);
  button.onclick();h.run('loop(200)');assert.equal(h.run('over'),2);
  h.run('act("restart");loop(300)');
  assert.equal(button.textContent,'Start bot game');assert.equal(h.run('botGame.active'),false);
});

test('paused hosts reject stale friend joins and spectator upgrades, then become joinable on resume',async()=>{
  const hub=lobbyHarness(),host=hub.add('Host'),friend=hub.add('Friend');
  await hub.pump();assert.equal(host.run('openActivity()'),null);
  host.solo.run('botGame.start()');await hub.pump();
  assert.equal(friend.run('lastFriends.find(f=>f.name==="Host").activity.join'),true);
  host.solo.run('botGame.pause()');
  await friend.run('enterGame(lastFriends.find(f=>f.name==="Host").id,"join")');await hub.pump();
  assert.equal(host.run('!!frame'),false);assert.equal(host.run('links.size'),0);
  assert.equal(friend.run('lastFriends.find(f=>f.name==="Host").activity'),null);
  host.solo.run('botGame.start()');
  friend.run('pendingEntry=null');
  await friend.run('enterGame(lastFriends.find(f=>f.name==="Host").id,"spectate")');await hub.pump();
  assert.equal(friend.run('player'),0);
  host.solo.run('botGame.pause()');
  await friend.run('transmit({kind:"join-game"})');await hub.pump();
  assert.equal(friend.run('player'),0);assert.equal(host.run('!!frame'),false);
  host.solo.run('botGame.start()');
  await friend.run('transmit({kind:"join-game"})');await hub.pump();
  assert.equal(friend.run('player'),2);assert.equal(host.run('!!frame'),true);
});
