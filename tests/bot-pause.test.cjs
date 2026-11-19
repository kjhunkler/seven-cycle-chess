const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
const {lobbyHarness}=require('./lobby-harness.cjs');

test('bot game waits for Start and Pause freezes troops, production, transformations and rotation',()=>{
  const h=createGame('index.html');
  const button=h.created.find(e=>e.className==='battle-solo-toggle');
  h.run('render();loop(200);loop(1000)');
  assert.ok(button.innerHTML.includes('Start bot game'));
  assert.equal(h.run('N.P1.tm'),0);
  assert.equal(h.run('botGame.active'),false);
  button.onclick();assert.ok(button.innerHTML.includes('Pause bot game'));
  h.run('aiT=999;loop(200)');assert.ok(h.run('N.P1.tm')>0);
  button.onclick();assert.ok(button.innerHTML.includes('Resume bot game'));
  h.run('N.P1.stock.fill(0);G=[{from:"C2",to:"P1",owner:2,type:0,n:10,t:.99}];productionCycle={active:{buff:0,debuff:1},next:{buff:1,debuff:2},endsAt:45100,remaining:45000};last=200');
  const before=h.run('JSON.stringify([N,G,transformationClock,aiT])');
  h.run('loop(1200);loop(2200)');
  assert.equal(h.run('JSON.stringify([N,G,transformationClock,aiT])'),before);
  assert.equal(h.run('productionCycle.endsAt'),47100);
  assert.equal(h.run('over'),0);
  assert.equal(h.run('botGame.bestBot()'),null);
  button.onclick();h.run('loop(200)');assert.equal(h.run('over'),2);
  h.run('act("restart");loop(300)');
  assert.ok(button.innerHTML.includes('Start bot game'));assert.equal(h.run('botGame.active'),false);
});

test('node drags and transformations resume a paused bot game',()=>{
  const h=createGame('index.html'),map=h.elements.get('map');
  const pointer={pointerId:1,button:0,clientX:150,clientY:300,target:{closest:selector=>selector==='[data-id]'?{dataset:{id:'P1'}}:null},preventDefault(){}};
  map.listeners.get('pointerdown')(pointer);
  assert.equal(h.run('botGame.active'),true,'starting a node drag resumes the solo game');
  h.run('botGame.pause();sel="P1";act("p"+((N.P1.ut+1)%T.length))');
  assert.equal(h.run('botGame.active'),true,'changing production resumes the solo game');
  assert.ok(h.run('N.P1.cd')>0,'the transformation is applied');
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


test('solo toolbar keeps playback first and battle settings pause a running game',()=>{
  const h=createGame('index.html');
  const shell=h.created.find(e=>e.className==='battle-shell');
  const play=h.created.find(e=>e.className==='battle-solo-toggle');
  const settings=shell.querySelector('.battle-settings-button');
  assert.deepEqual(shell.querySelector('.battle-tools').children.filter(e=>!e.hidden),[play,h.elements.get('open-maps'),settings]);
  settings.onclick();
  assert.equal(h.run('botGame.started'),false);
  play.onclick();
  settings.onclick();
  assert.equal(h.run('botGame.paused'),true);
  assert.ok(play.innerHTML.includes('Resume bot game'));
  const dialog=h.created.find(e=>e.className==='battle-settings-dialog');
  dialog.querySelector('[data-close]').onclick();
  assert.equal(dialog.open,false);
  assert.equal(h.run('botGame.paused'),true);
  const replay=h.created.find(e=>e.className==='battle-solo-replay');
  h.run('over=1;render()');
  assert.equal(play.hidden,true);
  assert.equal(replay.hidden,false);
  assert.deepEqual(shell.querySelector('.battle-tools').children.filter(e=>!e.hidden),[replay,h.elements.get('open-maps'),settings]);
  replay.onclick();
  assert.equal(h.run('over'),0);
  assert.equal(play.hidden,false);
});

test('opening the profile pauses a running bot game and closing it leaves the game paused',()=>{
  const h=createGame('index.html');
  const profile=h.elements.get('friends-panel');
  const toggle=profile.listeners.get('toggle');
  h.run('botGame.start()');
  profile.open=true;
  toggle();
  assert.equal(h.run('botGame.paused'),true);
  profile.open=false;
  toggle();
  assert.equal(h.run('botGame.paused'),true);
});
