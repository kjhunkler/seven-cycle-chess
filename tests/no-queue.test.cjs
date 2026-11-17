const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
for(const page of ['index.html','match.html']){
 test(page+': optional game settings default off',()=>{
  const h=createGame(page);
  assert.equal(h.run(page==='index.html'?'!botConfig.noQueue&&!botConfig.shops&&!botConfig.productionRotation':'!lobbyConfig.noQueue&&!lobbyConfig.shops&&!lobbyConfig.productionRotation'),true);
  assert.equal(h.run('productionCycle'),null);
  assert.equal(h.run('Object.values(N).some(n=>n.shop)'),false);
 });
 test(page+': no queue castles produce, transform, resume, and cap like regular nodes',()=>{
  const h=createGame(page);
  h.run(page==='index.html'?'botConfig.noQueue=true;init();aiT=999':'lobbyConfig.noQueue=true;online=true;gameStarted=true;init();connectedPlayers=[1,2,3,4];botThink=999');
  assert.equal(h.run('N.P1.stock[N.P1.ut]'),6);
  h.run('globalThis.type=N.P1.ut;globalThis.nextType=(type+1)%7;N.P1.routes=[];N.P1.orders=[];globalThis.initial=tot(N.P1);for(let i=0;i<31;i++)step(.1);act("q0");panel();render()');
  assert.equal(h.run('tot(N.P1)'),7);
  assert.equal(h.run('N.P1.q.length'),0);
  assert.doesNotMatch(h.elements.get('panel').innerHTML,/queue-strip|fruit-palette/);
  assert.equal(h.elements.get('panel').hidden,true);
  h.run('map.querySelector=()=>null;typeWheel.style.setProperty=()=>{};select("P1");openWheel("P1",200,200)');
  assert.equal(h.run('typeWheel.children.slice(-7).every(button=>!button.disabled)'),true);
  h.run('act("p"+nextType)');
  assert.equal(h.run('N.P1.pend'),h.run('nextType'));
  h.run('panel()');
  assert.equal(h.elements.get('panel').hidden,false);
  assert.match(h.elements.get('panel').innerHTML,/Transforming/);
  h.run('step(1)');
  assert.equal(h.run('tot(N.P1)'),7);
  h.run('for(let i=0;i<41;i++)step(.1)');
  assert.equal(h.run('N.P1.ut'),h.run('nextType'));
  assert.equal(h.run('N.P1.stock[type]'),0);
  h.run('for(let i=0;i<31;i++)step(.1)');
  assert.equal(h.run('N.P1.stock[nextType]'),8);
  h.run('N.P1.stock.fill(0);N.P1.stock[nextType]=CONFIG.cap;for(let i=0;i<31;i++)step(.1)');
  assert.equal(h.run('tot(N.P1)'),99);
  h.run('N.P2.stock.fill(0);arrive({to:"P2",owner:1,type:nextType,n:1})');
  assert.equal(h.run('over'),1);
 });
}
test('online No queue setting invalidates readiness and appears in snapshots',()=>{
 const h=createGame();
 h.run('matchGame.start(1,()=>{});lobbyReady=[true,true];lobbyAction(2,{action:"config",config:{map:2,speed:1,shops:false,noQueue:true,productionRotation:false}})');
 assert.equal(h.run('lobbyConfig.noQueue'),true);
 assert.equal(h.run('lobbyReady.some(Boolean)'),false);
 h.run('init();gameStarted=true;applyCommand(1,{kind:"queue",type:0});select("P1");applyCommand(1,{kind:"produce",node:"P1",type:(N.P1.ut+1)%7})');
 assert.equal(h.run('N.P1.q.length'),0);
 assert.equal(h.run('N.P1.cd'),5);
 assert.equal(h.run('snapshot(1).config.noQueue'),true);
 assert.equal(h.run('validConfig({map:2,speed:1,shops:false,noQueue:"yes"})'),false);
});
for(const page of ['index.html','match.html'])test(page+': no queue keeps multiplayer elimination rules',()=>{
 const h=createGame(page);
 h.run(page==='index.html'?'botConfig.map=4;botConfig.noQueue=true;init()':'lobbyConfig.map=4;lobbyConfig.noQueue=true;init()');
 h.run('N.P3.stock.fill(0);arrive({to:"P3",owner:1,type:0,n:1})');
 assert.equal(h.run('N.P3.disabled'),true);
 assert.equal(h.run('over'),0);
 h.run('N.P2.stock.fill(0);arrive({to:"P2",owner:1,type:0,n:1});N.P4.stock.fill(0);arrive({to:"P4",owner:1,type:0,n:1})');
 assert.equal(h.run('over'),1);
});
