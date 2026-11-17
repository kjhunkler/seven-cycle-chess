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
 const h=start(map,true);h.run('N.P3.stock.fill(0);N.A3.owner=3;N.A3.stock=[5,0,0,0,0,0,0];N.A3.ut=0;N.A3.routes=["P3"];N.A3.orders=[{to:"B2",owner:3,type:0,count:2}];G=[{from:"A3",to:"B2",owner:3,type:0,n:1,t:.4},{from:"P3",to:"B2",owner:3,type:0,n:1,t:.4}];arrive({to:"P3",owner:1,type:0,n:1});render();panel()');
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
for(const page of ['index.html','match.html'])test(page+': triangular map preserves nodes and edges under rotation',()=>{
 const h=createGame(page);
 h.run(page==='index.html'?'botConfig.map=3;botConfig.shops=false;init()':'lobbyConfig.map=3;lobbyConfig.shops=false;init()');
 assert.equal(h.run('Object.keys(N).length'),10);
 assert.equal(h.run('Object.values(N).reduce((sum,n)=>sum+n.adj.length,0)'),24);
 assert.equal(h.run(`Object.values(N).every(n=>{
 const p=rotateBoardPoint(n,2*Math.PI/3);
 const rotated=Object.values(N).find(b=>Math.hypot(p.x-b.x,p.y-b.y)<1e-8);
 return rotated&&n.adj.every(id=>{const q=rotateBoardPoint(N[id],2*Math.PI/3);return rotated.adj.some(to=>Math.hypot(q.x-N[to].x,q.y-N[to].y)<1e-8)});
 })`),true);
 for(let player=1;player<=3;player++)assert.equal(h.run(`(()=>{const p=rotateBoardPoint(N.P${player},${player-1}*2*Math.PI/3);return Math.abs(p.x-50)<1e-8&&Math.abs(p.y-96)<1e-8})()`),true);
});
for(const page of ['index.html','match.html'])test(page+': Twin branches matches the sketch and supports routes and shops',()=>{
 const h=createGame(page);
 h.run(page==='index.html'?'botConfig.map=5;botConfig.shops=false;init()':'lobbyConfig.map=5;lobbyConfig.shops=false;init()');
 assert.equal(h.run('Object.keys(N).length'),10);
 assert.equal(h.run('Object.values(N).filter(n=>n.castle).length'),2);
 const expected={P2:['A1','A3'],A1:['P2','A2','B1'],A2:['A1','A3','B1','B2'],A3:['P2','A2','B2'],B1:['A1','A2','C1','C2'],B2:['A2','A3','C2','C3'],C1:['B1','C2','P1'],C2:['B1','B2','C1','C3'],C3:['B2','C2','P1'],P1:['C1','C3']};
 assert.deepEqual(JSON.parse(h.run('JSON.stringify(Object.fromEntries(Object.values(N).map(n=>[n.id,[...n.adj].sort()])))')),Object.fromEntries(Object.entries(expected).map(([id,adj])=>[id,adj.sort()])));
 h.run('applyRouteCommand(1,{kind:"route",node:"P1",to:"C1"})');
 assert.equal(h.run('N.P1.routes[0]'),'C1');
 assert.equal(h.run('Object.values(N).every(n=>{const mirror=Object.values(N).find(b=>b.x===n.x&&b.y===100-n.y);return mirror&&n.adj.every(id=>mirror.adj.some(to=>N[to].x===N[id].x&&N[to].y===100-N[id].y))})'),true);
 h.run(page==='index.html'?'botConfig.shops=true;init()':'lobbyConfig.shops=true;init()');
 assert.equal(h.run('Object.values(N).filter(n=>n.shop).length'),4);
 h.run('render();panel()');
});
test('Twin branches seat capacity is two and adding a third player changes map',()=>{
 const h=createGame();
 assert.equal(h.run('validConfig({map:5,speed:1,shops:false})'),true);
 h.run('humanPlayers=[1,2,3]');
 assert.equal(h.run('validConfig({map:5,speed:1,shops:false})'),false);
 h.run('humanPlayers=[1,2];lobbyConfig.map=5;matchGame.setMembers([{seat:1,name:"One",connected:true},{seat:2,name:"Two",connected:true}])');
 assert.equal(h.run('lobbyConfig.map'),5);
 h.run('matchGame.setMembers([{seat:1,name:"One",connected:true},{seat:2,name:"Two",connected:true},{seat:3,name:"Three",connected:true}])');
 assert.equal(h.run('lobbyConfig.map'),3);
});
for(const page of ['index.html','match.html'])test(page+': four-player schema has both axis symmetries and four jumps between all castles',()=>{
 const h=createGame(page);
 h.run(page==='index.html'?'botConfig.map=4;botConfig.shops=false;init()':'lobbyConfig.map=4;lobbyConfig.shops=false;init()');
 assert.equal(h.run('Object.keys(N).length'),17);
 assert.equal(h.run('Object.values(N).reduce((sum,n)=>sum+n.adj.length,0)'),52);
 for(const axis of ['x','y'])assert.equal(h.run(`Object.values(N).every(n=>{
 const flip=p=>({x:${axis==='x'?'100-p.x':'p.x'},y:${axis==='y'?'100-p.y':'p.y'}});
 const p=flip(n),mirror=Object.values(N).find(b=>b.x===p.x&&b.y===p.y);
 return mirror&&n.adj.every(id=>{const q=flip(N[id]);return mirror.adj.some(to=>N[to].x===q.x&&N[to].y===q.y)});
 })`),true);
 const distances=JSON.parse(h.run(`JSON.stringify([1,2,3,4].flatMap(a=>{
 const d={['P'+a]:0},queue=['P'+a];for(const id of queue)for(const to of N[id].adj)if(d[to]===undefined){d[to]=d[id]+1;queue.push(to)}
 return [1,2,3,4].filter(b=>b>a).map(b=>d['P'+b]);
 }))`));
 assert.deepEqual(distances,[4,4,4,4,4,4]);
 for(let owner=1;owner<=4;owner++){
  assert.equal(h.run(`boardViewPoint(N.P${owner},${owner}).y`),92);
  assert.equal(h.run(`Object.values(N).every(n=>{const p=boardViewPoint(boardViewPoint(n,${owner}),${owner},true);return p.x===n.x&&p.y===n.y})`),true);
 }
 h.run(page==='index.html'?'botConfig.shops=true;init()':'lobbyConfig.shops=true;init()');
 assert.equal(h.run('Object.values(N).filter(n=>n.shop).length'),8);
 h.run('render();panel()');
});
