const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');

for(const page of ['index.html','match.html'])for(const map of [2,3,4]){
 test(`${page}, ${map} players: captured name moves to the largest remaining node until elimination`,()=>{
  const h=createGame(page);
  h.run(`${page==='index.html'?'botConfig':'lobbyConfig'}.map=${map};${page==='index.html'?'botConfig':'lobbyConfig'}.fullElimination=true;${page==='index.html'?'botConfig':'lobbyConfig'}.shops=true;init()`);
  h.run('N.A1.owner=2;N.A1.ut=1;N.A1.stock=[0,8,0,0,0,0,0];N.C1.owner=2;N.C1.ut=2;N.C1.stock=[0,0,12,0,0,0,0];N.C1.routes=[N.C1.adj[0]];globalThis.before=JSON.stringify({stock:N.C1.stock,x:N.C1.x,y:N.C1.y,adj:N.C1.adj,routes:N.C1.routes});N.P2.stock.fill(0);arrive({from:"P1",to:"P2",owner:1,type:0,n:1})');
  assert.equal(h.run('playerHome(2).id'),'C1');
  assert.equal(h.run('N.P2.owner===1&&!N.P2.home&&!isEliminated(2)&&over===0'),true);
  assert.equal(h.run('JSON.stringify({stock:N.C1.stock,x:N.C1.x,y:N.C1.y,adj:N.C1.adj,routes:N.C1.routes})===before'),true,'moving the name preserves the destination node');
  assert.equal(h.run('!!N.S2H&&!!N.S2B'),true,'shops survive while their player has territory');
  h.run('N.C1.stock.fill(0);arrive({to:"C1",owner:1,type:0,n:1});render()');
  assert.equal(h.run('playerHome(2).id'),'A1');
  assert.match(h.elements.get('map').innerHTML,/data-home="A1"/);
  assert.doesNotMatch(h.elements.get('map').innerHTML,/data-home="P2"|data-home="C1"/);
  h.run('G=[{from:"A1",to:"P1",owner:2,type:1,n:4,t:.2}];N.A1.stock.fill(0);arrive({to:"A1",owner:1,type:0,n:1});render();panel()');
  assert.equal(h.run('isEliminated(2)&&!playerHome(2)&&!N.S2H&&!N.S2B'),true);
  assert.equal(h.run('G[0].owner'),1,'moving troops do not prevent elimination');
  assert.equal(h.run('over'),map===2?1:0);
  assert.equal(h.run('Object.values(N).every(n=>n.shop||n.stock.filter(x=>x>0).length<=1)'),true);
 });
}

for(const page of ['index.html','match.html'])test(`${page}: relocation ignores shops, uses stable ties, and preserves a name on failed attacks`,()=>{
 const h=createGame(page);
 h.run(`${page==='index.html'?'botConfig':'lobbyConfig'}.fullElimination=true;init();N.P2.stock.fill(0);N.P2.stock[0]=6;N.P2.ut=0;arrive({to:"P2",owner:1,type:0,n:1})`);
 assert.equal(h.run('playerHome(2).id'),'P2');
 h.run('for(const id of ["A1","C1"]){N[id].owner=2;N[id].stock=[9,0,0,0,0,0,0];N[id].ut=0}N.P2.stock.fill(0);arrive({to:"P2",owner:1,type:0,n:1})');
 assert.equal(h.run('playerHome(2).id'),'A1');
});

test('online full elimination synchronizes a relocated name, commands, shops and final defeat',()=>{
 const host=createGame(),guest=createGame();
 host.run('matchGame.start(1,()=>{});lobbyConfig.fullElimination=true;lobbyConfig.shops=true;init();gameStarted=true;N.A1.owner=2;N.A1.ut=0;N.A1.stock=[10,0,0,0,0,0,0];N.P2.stock.fill(0);arrive({to:"P2",owner:1,type:0,n:1});lobbyMembers=[{seat:1,name:"Alice"},{seat:2,name:"Bob"}]');
 guest.run('matchGame.start(2,()=>{})');
 const sync=()=>{guest.context.packet=JSON.parse(host.run('JSON.stringify(snapshot(2))'));guest.run('matchGame.receive(packet,1);render();panel()')};
 sync();
 assert.equal(guest.run('lobbyConfig.fullElimination&&playerHome(2).id==="A1"'),true);
 assert.match(guest.elements.get('map').innerHTML,/data-home="A1"[^]*?<title>Bob<\/title>/);
 host.run('applyCommand(2,{kind:"produce",node:"A1",type:1});N.S2H.abilityReady=true;botShopTurn(2)');
 assert.equal(host.run('N.A1.pend===1&&N.A1.shields===1'),true,'commands and bot abilities follow the relocated name');
 host.run('N.A1.shields=0;N.A1.stock.fill(0);arrive({to:"A1",owner:1,type:0,n:1})');sync();
 assert.equal(guest.run('over===1&&isEliminated(2)&&!N.S2H'),true);
});
