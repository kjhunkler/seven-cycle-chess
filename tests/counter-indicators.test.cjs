const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
for(const page of ['index.html','match.html']){
 test(page+': compact profile setting preserves combat comparisons and node progress',()=>{
  const game=createGame(page);
  const profile=game.elements.get('profile-compact-board');
  const markup=()=>game.elements.get('map').innerHTML;
  const setMode=value=>{profile.value=value;profile.onchange();};
  const saved=new Map();
  game.context.localStorage.setItem=(key,value)=>saved.set(key,value);
  game.run(`N.P1.ut=0;N.P1.stock=[6,0,0,0,0,0,0];
    N.C1.owner=2;N.C1.stock=[0,5,0,0,0,0,0];
    N.P1.tm=CONFIG.outpostRate/2;select('P1');render();`);
  assert.doesNotMatch(markup(),/compact-troop-count/);
  setMode('on');
  assert.equal(saved.get('fw-compact-board'),'on');
  assert.match(markup(),/stroke="var\(--p1\)" stroke-width="0\.75"[^]*?r="3\.6" fill="#ee6976"/);
  assert.match(markup(),/class="compact-troop-count"[^>]*>6<\/text>/);
  assert.match(markup(),/stroke-dasharray="50 100"/);
  assert.match(markup(),/Hard advantage · 4×/);
  game.run('N.C1.home=3;N.C2.home=4;N.C3.home=5;render()');
  setMode('auto');
  assert.match(markup(),/compact-troop-count/);
  game.run('N.C3.home=0;eliminatedBy={5:1};render()');
  assert.match(markup(),/compact-troop-count/);
  setMode('off');
  assert.doesNotMatch(markup(),/compact-troop-count/);
  assert.match(markup(),/Hard advantage · 4×/);
 });
 test(page+': all seven fruits show hard, soft and neutral counter strengths in both directions',()=>{
  const h=createGame(page);
  for(let attacker=0;attacker<7;attacker++)for(let offset=0;offset<7;offset++){
   const defender=(attacker+offset)%7;
   h.run(`N.P1.ut=${attacker};N.P1.stock.fill(0);N.P1.stock[${attacker}]=6;N.C1.owner=2;N.C1.ut=${defender};N.C1.stock.fill(0);N.C1.stock[${defender}]=5;select('P1');render()`);
   const html=h.elements.get('map').innerHTML;
   const marker=html.match(/<g class="counter-indicator[^]*?<\/g>/)?.[0];
   assert.ok(marker,`${attacker} against ${defender}`);
   const severity=[1,6].includes(offset)?'hard':[2,5].includes(offset)?'soft':'even';
   assert.ok(marker.includes(`counter-${severity}`));
   assert.ok(marker.includes(offset===1?'Hard advantage · 4×':offset===2?'Soft advantage · 2.24×':offset===5?'Soft disadvantage · 0.45×':offset===6?'Hard disadvantage · 0.25×':'Even matchup · 1×'));
   assert.equal((marker.match(/<path d="([^"]+)"/)?.[1].match(/M/g)||[]).length,severity==='hard'?2:1);
  }
 });
 test(page+': radial menu shows seven non-interactive clockwise hints without changing fruit buttons',()=>{
  const h=createGame(page);
  h.run('map.querySelector=()=>null;typeWheel.style.setProperty=()=>{};openWheel("P1",200,200)');
  const hints=h.run('typeWheel.children.filter(el=>el.className==="wheel-counter-direction")');
  assert.equal(hints.length,7);assert.ok(hints.every(el=>el.textContent==='›'&&!el.onclick));
  assert.equal(h.run('typeWheel.children.filter(el=>el.dataset.type!==undefined).length'),7);
  assert.equal(new Set(hints.map(el=>el.style.transform)).size,7,'each hint follows the clockwise tangent');
 });
}
