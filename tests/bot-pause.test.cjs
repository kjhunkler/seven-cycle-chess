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


test('board menu pauses solo play on opening and closing leaves it paused',()=>{
  const h=createGame('index.html');
  const shell=h.created.find(e=>e.className==='battle-shell');
  const toggle=shell.querySelector('.battle-menu-toggle');
  const actions=shell.querySelector('.battle-menu-actions');
  const play=h.created.find(e=>e.className==='battle-solo-toggle');
  assert.equal(actions.hidden,true);
  toggle.onclick();
  assert.equal(h.run('botGame.started'),false,'opening before Start does not start the game');
  toggle.onclick();
  play.onclick();
  assert.equal(h.run('botGame.active'),true);
  toggle.onclick();
  assert.equal(actions.hidden,false);
  assert.equal(h.run('botGame.paused'),true);
  assert.ok(play.innerHTML.includes('Resume bot game'));
  toggle.onclick();
  assert.equal(actions.hidden,true);
  assert.equal(h.run('botGame.paused'),true);
  play.onclick();
  assert.equal(h.run('botGame.active'),true);
  h.run('over=1;render()');
  assert.equal(play.hidden,true,'completed games have no play/pause action');
});

for(const page of ['index.html','match.html']){
  test(page+': fullscreen controls show relevant actions and relocate solo play only',async()=>{
    const h=createGame(page);
    const shell=h.created.find(e=>e.className==='battle-shell');
    const tools=shell.querySelector('.battle-tools');
    const menu=shell.querySelector('.battle-menu');
    const actions=shell.querySelector('.battle-menu-actions');
    const fit=shell.querySelector('.battle-fit-button');
    const fullscreen=shell.querySelector('.battle-fullscreen-button');
    const play=h.created.find(e=>e.className==='battle-solo-toggle');
    assert.equal(fit.hidden,true);
    if(play)assert.deepEqual(tools.children.slice(-2),[play,menu]);
    else assert.equal(play,undefined);
    await fullscreen.onclick();
    assert.equal(fit.hidden,false);
    assert.ok(fullscreen.innerHTML.includes('Exit full screen'));
    if(play)assert.equal(actions.children.at(-1),play);
    await fullscreen.onclick();
    assert.equal(fit.hidden,true);
    if(play)assert.deepEqual(tools.children.slice(-2),[play,menu]);
    let pauses=0;
    h.context.botGame.pause=()=>pauses++;
    shell.querySelector('.battle-menu-toggle').onclick();
    assert.equal(pauses,0,'unstarted solo games and multiplayer never receive a pause command');
    for(const selector of ['.battle-fit-button','.battle-settings-button','.battle-fullscreen-button']){
      assert.ok(shell.querySelector(selector).innerHTML.includes('aria-hidden="true"'),'each action has a decorative icon');
    }
  });
}
