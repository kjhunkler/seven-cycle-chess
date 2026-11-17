const {test}=require('node:test');const assert=require('node:assert/strict');const {createGame}=require('./game-harness.cjs');
function start(map=2,shops=false){const h=createGame();h.run(`matchGame.start(1,()=>{});lobbyConfig={map:${map},speed:.5,shops:${shops}};init();gameStarted=true`);return h}
for(const count of [2,3,4]){
 test(`${count} seats: readiness, command ownership and per-player fog`,()=>{
  const games=Array.from({length:count},()=>createGame()),queue=[];
  games.forEach((h,i)=>{h.context.send=(data,target)=>{const packet=JSON.parse(JSON.stringify(data));if(i===0){for(let p=2;p<=count;p++)if(target===undefined||target===p)queue.push([p,packet,1])}else queue.push([1,packet,i+1])};h.run(`matchGame.start(${i+1},send,${JSON.stringify(Array.from({length:count},(_,j)=>j+1))})`)});
  const drain=()=>{let limit=100;while(queue.length){assert.ok(limit-->0);const [target,data,source]=queue.shift();games[target-1].context.packet=data;games[target-1].context.source=source;games[target-1].run('matchGame.receive(packet,source)')}};
  drain();for(const h of games)h.elements.get('ready-button').onclick();drain();
  for(const h of games)assert.equal(h.run('gameStarted'),true);
  for(let p=2;p<=count;p++){games[p-1].run('act("q0")');games[p-1].run('routeCommand({kind:"route",node:"P1",to:"C1"})')};drain();
  for(let p=2;p<=count;p++)assert.equal(games[0].run(`N.P${p}.q[0]`),0);
  assert.equal(games[0].run('N.P1.routes.length'),0);
  games[0].run('loop(200)');drain();
  for(let p=2;p<=count;p++)assert.equal(games[p-1].run(`N.P${p}.owner`),p);
  assert.equal(games[1].run('N.P1.stock.reduce((a,b)=>a+b,0)'),0,'remote stock hidden');
 });
}
test('settings invalidate all ready flags and stale ready packets cannot launch',()=>{
 const h=start(3);h.run('gameStarted=false;humanPlayers=[1,2,3];lobbyReady=[true,true,true,false];lobbyAction(2,{action:"config",config:{map:3,speed:1,shops:true}});lobbyAction(3,{action:"ready",value:true,configVersion:0})');
 assert.equal(h.run('lobbyReady.some(Boolean)'),false);assert.equal(h.run('gameStarted'),false);
 h.run('lobbyAction(3,{action:"config",config:{map:2,speed:1,shops:false}})');assert.equal(h.run('lobbyConfig.map'),3);
});
test('late client lobby messages and ready actions cannot reset an active match',()=>{
 const h=start();h.run('N.P1.stock[0]=77;matchGame.receive({kind:"lobby",started:false,config:{map:4,speed:1,shops:true}},2);matchGame.receive({kind:"lobby-action",action:"ready",value:false,configVersion:0},2)');assert.equal(h.run('gameStarted'),true);assert.equal(h.run('N.P1.stock[0]'),77);
});
test('reconnect retains state, while fresh start resets revisions',()=>{
 const h=start();h.run('N.P1.stock[0]=77;matchGame.rebind(()=>{});matchGame.reconnect(()=>{})');assert.equal(h.run('N.P1.stock[0]'),77);h.run('matchGame.start(2,()=>{});lastLobbyRevision=10;matchGame.start(2,()=>{})');assert.equal(h.run('lastLobbyRevision'),-1);
});
test('two-player castle capture still ends the game',()=>{const h=start();h.run('N.P2.stock.fill(0);arrive({to:"P2",owner:1,type:0,n:1})');assert.equal(h.run('over'),1)});
for(const map of [3,4])test(`${map} players: elimination converts territory, queued and moving fruit, disables castle and removes lines`,()=>{
 const h=start(map,true);h.run('N.P3.stock.fill(0);N.A3.owner=3;N.A3.stock=[5,0,0,0,0,0,0];N.A3.ut=0;N.A3.routes=["P3"];N.A3.orders=[{to:"B4",owner:3,type:0,count:2}];G=[{from:"A3",to:"B4",owner:3,type:0,n:1,t:.4},{from:"P3",to:"B4",owner:3,type:0,n:1,t:.4}];arrive({to:"P3",owner:1,type:0,n:1});render();panel()');
 assert.equal(h.run('over'),0);assert.equal(h.run('N.P3.disabled&&N.P3.owner===0'),true);assert.equal(h.run('N.A3.owner'),1);assert.equal(h.run('N.A3.orders[0].owner'),1);assert.equal(h.run('G[0].owner'),1);assert.equal(h.run('Object.values(N).some(n=>n.adj.includes("P3")||n.routes.includes("P3"))'),false);
 assert.doesNotMatch(h.elements.get('map').innerHTML,/data-id="P3"/);assert.equal(h.run('N.S3H.owner'),1);assert.equal(h.run('N.P1.adj.includes("S3H")'),true);
 h.run('applyCommand(3,{kind:"queue",type:1})');assert.equal(h.run('N.P3.q.length'),0);
 if(map===4){h.run('N.P4.stock.fill(0);arrive({to:"P4",owner:2,type:0,n:1})');assert.equal(h.run('over'),0)}
 h.run('N.P2.stock.fill(0);arrive({to:"P2",owner:1,type:0,n:1})');assert.equal(h.run('over'),1);assert.equal(h.run('N.A3.owner'),1);
});
test('eliminated host can spectate and simulation continues',()=>{const h=start(4);h.run('N.P1.stock.fill(0);arrive({to:"P1",owner:3,type:0,n:1});render();panel();step(.1)');assert.equal(h.run('over'),0);assert.equal(h.run('vis().size===Object.keys(N).length'),true);assert.match(h.elements.get('panel').innerHTML,/^$/);assert.match(h.elements.get('msg').innerHTML,/Spectating/)});
test('same-frame arrivals from an eliminated player use their new owner',()=>{const h=start(4);h.run('N.P3.stock.fill(0);arrive({to:"P3",owner:1,type:0,n:1});N.A3.owner=1;N.A3.ut=0;N.A3.stock=[4,0,0,0,0,0,0];arrive({to:"A3",owner:3,type:0,n:1})');assert.equal(h.run('N.A3.stock[0]'),5)});
test('all seats receive shops; bots charge and use them',()=>{const h=start(4,true);assert.equal(h.run('Object.values(N).filter(n=>n.shop).length'),8);h.run('N.P3.stock=[20,0,0,0,0,0,0];botShopTurn(3)');assert.ok(h.run('N.P3.orders.some(o=>o.to==="S3H")'));h.run('N.S3H.abilityReady=true;botShopTurn(3)');assert.equal(h.run('N.P3.shields'),1)});
test('solo four-player mode uses the same elimination rules',()=>{const h=createGame('index.html');h.run('botConfig.map=4;init();N.P3.stock.fill(0);arrive({to:"P3",owner:1,type:0,n:1});render()');assert.equal(h.run('N.P3.disabled'),true);assert.equal(h.run('over'),0)});
