const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
for(const page of ['index.html','match.html'])test(`${page}: named nodes use regular production modifiers`,()=>{
 const {run,elements}=createGame(page);
 run('productionCycle={active:{buff:0,debuff:1}};N.P1.ut=0;N.P1.stock.fill(0);N.P1.tm=0;render()');
 assert.match(elements.get('map').innerHTML,/node-production node-production-buff/);
 run('step(CONFIG.outpostRate / 1.25)');assert.equal(run('N.P1.stock[0]'),1);
 run('N.P1.ut=1;N.P1.stock.fill(0);render();step(CONFIG.outpostRate)');
 assert.equal(run('N.P1.stock[1]'),0);
 assert.match(elements.get('map').innerHTML,/node-production node-production-debuff/);
 run('step(CONFIG.outpostRate / .75 - CONFIG.outpostRate + .000001)');assert.equal(run('N.P1.stock[1]'),1);
 run('productionCycle=null;render()');assert.doesNotMatch(elements.get('map').innerHTML,/node-production/);
});
for(const page of ['index.html','match.html'])test(page+': production indicators are triangles beside troop counts without visible percentage text',()=>{
 const h=createGame(page);
 h.run('productionCycle={active:{buff:0,debuff:1}};N.C1.owner=1;N.C1.ut=0;N.C1.cd=0;N.C2.owner=1;N.C2.ut=1;N.C2.cd=0;render()');
 const svg=h.elements.get('map').innerHTML;
 const buff=svg.match(/<g class="node-production node-production-buff"[^]*?<\/g>/g);
 const debuff=svg.match(/<g class="node-production node-production-debuff"[^]*?<\/g>/g);
 assert.ok(buff?.length);assert.ok(debuff?.length);
 for(const indicator of [...buff,...debuff]){assert.match(indicator,/<path /);assert.doesNotMatch(indicator,/<text|<rect/);}
 assert.ok(buff.some(mark=>mark.includes('translate(33.5 83.4)')));
 assert.ok(debuff.some(mark=>mark.includes('translate(55.5 84.6)')));
});
