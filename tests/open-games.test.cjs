const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
const {lobbyHarness}=require('./lobby-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));

test('bot selection counts garrisons, queued departures and traveling fruit, with stable ties',()=>{
  const g=createGame('index.html');
  g.run('botConfig.map=4;init();for(const n of Object.values(N))n.stock.fill(0);N.P2.stock[0]=20;N.P3.stock[1]=8;N.P3.orders=[{owner:3,count:8,to:N.P3.adj[0],type:1}];G=[{owner:3,n:5}];N.P4.stock[0]=20');
  assert.equal(g.run('botGame.bestBot()'),3);
  g.run('G=[]');assert.equal(g.run('botGame.bestBot()'),2);
  assert.equal(g.run('bestOpenBot([1,2])'),4);
  g.run('botConfig.teams=true');assert.equal(g.run('botGame.bestBot()'),2);
  assert.equal(g.run('bestOpenBot([1,2])'),null,'never replace an opponent in team mode');
  g.run('N.P2.home=0;eliminatedBy[2]=3');assert.equal(g.run('botGame.bestBot()'),null);
  g.run('over=3');assert.equal(g.run('botGame.active'),false);
});

test('watching a solo game keeps it solo; joining preserves its live board and starts no countdown',async()=>{
  const hub=lobbyHarness(),host=hub.add('Host'),watcher=hub.add('Watcher'),joiner=hub.add('Joiner');
  host.solo.run('botConfig.map=4;botConfig.shops=true;botConfig.fullElimination=true;botConfig.portionControl=true;init();N.P3.stock[0]=80;N.P1.routes=[N.P1.adj[0]];N.P1.routeRemaining={[N.P1.adj[0]]:3};N.P1.pend=2;N.P1.cd=3;G=[{from:"P3",to:N.P3.adj[0],owner:3,type:0,n:2,t:.4}];transformationClock=17;portionPercent=25');
  await hub.pump();
  assert.equal(watcher.run('lastFriends.find(f=>f.name==="Host").activity.join'),true);
  await watcher.run('enterGame(lastFriends.find(f=>f.name==="Host").id,"spectate")');await hub.pump();await hub.beat();
  assert.equal(watcher.run('player'),0);
  assert.equal(host.run('!!frame'),false,'spectating does not interrupt the solo board');
  assert.deepEqual(plain(watcher.match.run('N')),plain(host.solo.run('N')));
  assert.equal(watcher.match.run('vis().size'),host.solo.run('Object.keys(N).length'));
  watcher.match.run('render();command({kind:"produce",node:"P3",type:5})');
  assert.equal(watcher.match.run('pendingCommands.length'),0);
  const before=plain(host.solo.run('botGame.exportState()'));
  await joiner.run('enterGame(lastFriends.find(f=>f.name==="Host").id,"join")');await hub.pump();
  assert.equal(joiner.run('player'),3);
  assert.equal(host.match.run('gameStarted'),true);
  assert.equal(host.match.run('countdownRemaining'),0);
  assert.deepEqual(plain(host.match.run('N')),before.nodes);
  assert.equal(host.match.run('G[0].t'),.4);
  assert.deepEqual(plain(host.match.run('lobbyConfig')),before.config);
  assert.equal(host.match.run('transformationClock'),17);
  assert.equal(host.match.run('portionPercent'),25);
  assert.deepEqual(plain(host.match.run('humanPlayers')),[1,3]);
  assert.deepEqual(plain(host.match.run('spectatorSeats')),[0]);
  host.match.run('loop(200)');await hub.pump();
  assert.equal(watcher.match.run('N.P3.stock[0]'),host.match.run('N.P3.stock[0]'));
  assert.ok(joiner.match.run('N.P3.stock[0]')>0);
  assert.equal(joiner.match.run('N.P1.stock.reduce((a,b)=>a+b,0)'),0,'new player uses normal fog');
});

test('spectators upgrade in place, teammates are reserved once, and rematches retain the group',async()=>{
  const hub=lobbyHarness(),host=hub.add('Host'),a=hub.add('A'),b=hub.add('B');
  host.solo.run('botConfig.map=4;botConfig.teams=true;init();N.P3.stock[0]=99');
  await hub.pump();
  for(const c of [a,b]){await c.run('enterGame(lastFriends.find(f=>f.name==="Host").id,"spectate")');await hub.pump()}
  await hub.beat();
  const frame=a.run('frame');
  await a.run('transmit({kind:"join-game"})');await hub.pump();
  assert.equal(a.run('player'),2);assert.equal(a.run('frame'),frame);
  assert.equal(a.match.run('localPlayer'),2);
  await b.run('transmit({kind:"join-game"})');await hub.pump();
  assert.equal(b.run('player'),0);assert.deepEqual(plain(host.match.run('humanPlayers')),[1,2]);
  assert.match(b.els.get('#lobby').querySelector('[role=status]').textContent,/No eligible/);
  host.match.run('over=1;matchGame.returnToLobby()');await hub.pump();
  assert.equal(a.match.run('gameStarted'),false);
  assert.equal(b.match.run('gameStarted'),false);
  assert.equal(b.match.elements.get('ready-button').hidden,true);
  host.match.elements.get('ready-button').onclick();a.match.elements.get('ready-button').onclick();await hub.pump();
  assert.equal(host.match.run('gameStarted'),true);
  assert.equal(b.match.run('gameStarted'),true);
});

test('simultaneous free-for-all join requests reserve distinct strongest bots',async()=>{
  const hub=lobbyHarness(),host=hub.add('Host'),a=hub.add('A'),b=hub.add('B');
  host.solo.run('botConfig.map=4;init();N.P3.stock[0]=80;N.P4.stock[0]=60');await hub.pump();
  await Promise.all([a,b].map(c=>c.run('enterGame(lastFriends.find(f=>f.name==="Host").id,"join")')));await hub.pump();
  assert.deepEqual([a.run('player'),b.run('player')].sort(),[3,4]);
  assert.deepEqual(plain(host.match.run('humanPlayers')),[1,3,4]);
  const original=host.match.run('N.P1.ut');
  host.match.run('matchGame.receive({kind:"produce",node:"P1",type:4,sequence:1,round:0},0);matchGame.receive({kind:"lobby-action",action:"rematch",round:0},0)');
  assert.equal(host.match.run('N.P1.ut'),original);assert.equal(host.match.run('N.P1.pend'),null);
});

test('entries arriving during the iframe handoff wait and join distinct seats',async()=>{
  const hub=lobbyHarness(),host=hub.add('Host'),a=hub.add('A'),b=hub.add('B');
  host.solo.run('botConfig.map=4;init();N.P3.stock[0]=80;N.P4.stock[0]=60');await hub.pump();
  hub.holdFrames();
  await a.run('enterGame(lastFriends.find(f=>f.name==="Host").id,"join")');await hub.pump();
  assert.equal(host.run('adopting'),true);
  await b.run('enterGame(lastFriends.find(f=>f.name==="Host").id,"join")');await hub.pump();
  assert.equal(host.run('deferredEntries.length'),1);
  hub.releaseFrames();await hub.pump();
  assert.deepEqual([a.run('player'),b.run('player')],[3,4]);
  assert.equal(host.run('deferredEntries.length'),0);
  assert.equal(host.match.run('countdownRemaining'),0);
});
