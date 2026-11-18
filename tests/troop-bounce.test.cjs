const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');

function setup(page,predicting=false){
 const h=createGame(page);
 h.run(page==='index.html'?'botConfig.noQueue=true;init();aiT=999':'lobbyConfig.noQueue=true;init();online=true;gameStarted=true;connectedPlayers=[1,2,3,4];botThink=999');
 h.run(`
  ${predicting?'localPlayer=2;':''}
  CONFIG.outpostRate=Infinity;
  for(const n of Object.values(N)){n.routes=[];n.orders=[];n.stock.fill(0);n.tm=0;}
  N.A1.owner=N.A2.owner=${predicting?2:1};N.A1.ut=N.A2.ut=0;
  G=[{id:'bouncer',from:'A1',to:'A2',owner:${predicting?2:1},type:0,n:.75,t:.99}];
 `);
 return h;
}

for(const page of ['index.html','match.html']){
 test(page+': friendly transformations block entry while enemy transformations allow combat',()=>{
  const h=setup(page);
  h.run('beginTransformation(N.A2,1)');
  assert.equal(h.run('canEnter(N.A2,1,0)'),false);
  assert.equal(h.run('canEnter(N.A2,2,0)'),true);
  h.run('N.A2.cd=0');
  assert.equal(h.run('canEnter(N.A2,1,0)'),true);
 });

 test(page+': troops bounce off a transforming friendly node and return intact',()=>{
  const h=setup(page);
  h.run('beginTransformation(N.A2,1);step(CONFIG.travel*.02)');
  assert.equal(h.run('G.length'),1);
  assert.equal(h.run('G[0].from+":"+G[0].to'),'A2:A1');
  assert.equal(h.run('G[0].t'),0);
  assert.equal(h.run('G[0].n'),.75);
  assert.equal(h.run('tot(N.A2)'),0);
  h.run('step(CONFIG.travel)');
  assert.equal(h.run('G.length'),0);
  assert.equal(h.run('N.A1.stock[0]'),1);
 });

 test(page+': incompatible endpoints keep bouncing until a matching friendly node accepts',()=>{
  const h=setup(page);
  h.run('N.A1.ut=1;N.A2.ut=2;step(CONFIG.travel*.02)');
  for(const direction of ['A1:A2','A2:A1','A1:A2']){
   h.run('step(CONFIG.travel)');
   assert.equal(h.run('G.length'),1);
   assert.equal(h.run('G[0].from+":"+G[0].to'),direction);
   assert.equal(h.run('G[0].type'),0);
   assert.equal(h.run('G[0].n'),.75);
  }
  h.run('N.A2.ut=0;step(CONFIG.travel)');
  assert.equal(h.run('G.length'),0);
  assert.equal(h.run('N.A2.stock[0]'),1);
 });

 test(page+': a bounced troop can attack an endpoint captured by an enemy',()=>{
  const h=setup(page);
  h.run('N.A2.ut=1;step(CONFIG.travel*.02);N.A1.owner=2;beginTransformation(N.A1,2);step(CONFIG.travel)');
  assert.equal(h.run('G.length'),0);
  assert.equal(h.run('N.A1.owner'),1);
  assert.equal(h.run('N.A1.ut'),0);
  assert.equal(h.run('N.A1.cd'),0);
 });

 test(page+': a matching node accepts after its transformation finishes',()=>{
  const h=setup(page);
  h.run('N.A1.ut=1;beginTransformation(N.A2,1);step(CONFIG.travel*.02);beginTransformation(N.A2,0);N.A2.cd=CONFIG.travel;step(CONFIG.travel);step(CONFIG.travel)');
  assert.equal(h.run('G.length'),0);
  assert.equal(h.run('N.A2.stock[0]'),1);
 });
}

test('guest prediction preserves and repeatedly reverses bounced troops',()=>{
 const h=setup('match.html',true);
 h.run('beginTransformation(N.A2,1);unitCorrections.set("bouncer",{offset:.2,at:100});step(CONFIG.travel*.02)');
 assert.equal(h.run('G[0].id'),'bouncer');
 assert.equal(h.run('unitCorrections.has("bouncer")'),false);
 h.run('N.A1.ut=2;step(CONFIG.travel)');
 assert.equal(h.run('G[0].from+":"+G[0].to'),'A1:A2');
 h.run('N.A2.cd=0;N.A2.ut=0;step(CONFIG.travel)');
 assert.equal(h.run('G.length'),0);
 assert.equal(h.run('N.A2.stock[0]'),1);
});
