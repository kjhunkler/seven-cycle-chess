const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
for(const page of ['index.html','match.html']){
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
