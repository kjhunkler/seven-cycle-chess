const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
for(const page of ['index.html','match.html']){
  test(`${page}: castle queue uses each fruit's production modifier and shows indicators`,()=>{
    const game=createGame(page),{run,elements}=game;
    run(`productionCycle={active:{buff:0,debuff:1}};G=[];N.P1.q=[0,1];N.P1.tm=0;N.P1.routes=[];N.P1.orders=[];N.P1.boost=0;N.P1.stock.fill(0);panel();render()`);
    assert.match(elements.get('panel').innerHTML,/queued-fruit[^]*production-badge production-buff/);
    assert.match(elements.get('panel').innerHTML,/fruit-button[^]*production-badge production-debuff/);
    assert.match(elements.get('map').innerHTML,/node-production node-production-buff/);
    run('step(CONFIG.castleRate / 1.25)');
    assert.equal(run('N.P1.stock[0]'),1);
    assert.equal(run('N.P1.q[0]'),1);
    run('panel();render()');
    assert.match(elements.get('map').innerHTML,/node-production node-production-debuff/);
    run('step(CONFIG.castleRate)');
    assert.equal(run('N.P1.stock[1]'),0);
    assert.equal(run('N.P1.tm'),run('CONFIG.castleRate * .75'));
    run('step(CONFIG.castleRate / .75 - CONFIG.castleRate + .000001)');
    assert.equal(run('N.P1.stock[1]'),1);
    run('productionCycle=null;panel();render()');
    assert.doesNotMatch(elements.get('panel').innerHTML,/production-badge/);
    assert.doesNotMatch(elements.get('map').innerHTML,/node-production/);
  });
}
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
