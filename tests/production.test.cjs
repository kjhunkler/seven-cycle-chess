const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');

for(const page of ['index.html','match.html']){
 const config=page==='index.html'?'botConfig':'lobbyConfig';
 test(page+': production uses the current garrison size when diminishing returns is enabled',()=>{
  const h=createGame(page);
  h.run('N.P1.ut=0;N.P1.stock=[1,0,0,0,0,0,0];step(1.5)');
  assert.equal(h.run('tot(N.P1)'),1,'default production takes three seconds');
  h.run(config+'.diminishingReturns=true');
  for(const [population,seconds] of [[0,1.5],[1,1.5],[10,3],[20,6],[30,6]]){
   h.run('N.P1.stock[0]='+population+';N.P1.tm=0;step('+seconds+'-.01)');
   assert.equal(h.run('tot(N.P1)'),population);
   h.run('step(.01)');
   assert.equal(h.run('tot(N.P1)'),population+1);
  }
  h.run('N.P1.stock[0]=20;N.P1.tm=0;step(3);N.P1.stock[0]=1;step(.75)');
  assert.equal(h.run('tot(N.P1)'),2,'a smaller garrison speeds up production in progress');
  h.run('N.P1.stock[0]=CONFIG.cap;N.P1.tm=0;step(6)');
  assert.equal(h.run('tot(N.P1)'),h.run('CONFIG.cap'));
 });

 test(page+': visible nodes show their population-based production modifier',()=>{
  const h=createGame(page);
  h.run(config+'.diminishingReturns=true;N.C1.owner=1;N.C1.stock=[1,0,0,0,0,0,0];N.C2.owner=1;N.C2.stock=[20,0,0,0,0,0,0];N.P1.stock=[10,0,0,0,0,0,0];render()');
  const svg=h.elements.get('map').innerHTML;
  const indicators=svg.match(/<g class="node-production node-production-[^"]+"[^]*?<\/g>/g);
  assert.equal(indicators.length,2);
  assert.match(indicators[0],/node-production-buff[^]*?\+100% production speed/);
  assert.match(indicators[1],/node-production-debuff[^]*?-50% production speed/);
  for(const indicator of indicators){
   assert.match(indicator,/<path /);
   assert.doesNotMatch(indicator,/<text|<rect/);
  }
  h.run(config+'.diminishingReturns=false;render()');
  assert.doesNotMatch(h.elements.get('map').innerHTML,/node-production/);
 });
}
