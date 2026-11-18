// Simulation time is authoritative; wave boundaries follow game speed and pause with play.
let transformationClock=0;
function transformationConfig(){return typeof botConfig!=='undefined'?botConfig:lobbyConfig}
function transformationPeriod(){return transformationConfig().transformationTime??10}
function beginTransformation(node,type){
 node.pend=type;node.tm=0;
 if(transformationConfig().transformationWave){
  const period=transformationPeriod();
  node.transformAt=(Math.floor((transformationClock+1e-8)/period)+1)*period;
  node.cd=node.transformAt-transformationClock;
 }else{node.transformAt=null;node.cd=CONFIG.cooldown}
}
function advanceTransformation(node,dt){
 node.cd=node.transformAt!=null?Math.max(0,node.transformAt-transformationClock):Math.max(0,node.cd-dt);
 if(node.cd<1e-8)node.cd=0;
}
function transformationProgress(node){
 const duration=transformationConfig().transformationWave?transformationPeriod():CONFIG.cooldown;
 return Math.max(0,Math.min(1,1-node.cd/duration));
}
const PRODUCTION_CYCLE_MS = 45000;
const PRODUCTION_BUFF = 1.25;
const PRODUCTION_DEBUFF = 0.75;

function pickProductionPair(nodes, units, typeCount) {
  const counts = Array(typeCount).fill(0);
  for (const { stock, orders } of Object.values(nodes)) {
    stock.forEach((count, type) => { counts[type] += count; });
    for (const { type, count } of orders) counts[type] += count;
  }
  for (const { type, n } of units) counts[type] += n;
  const peak = Math.max(1, ...counts);
  const weights = counts.map(count => 1 + 0.25 * count / peak);

  function draw() {
    let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    return weights.findIndex(weight => (roll -= weight) < 0);
  }
  const buff = draw();
  weights[buff] = 0;
  return { buff, debuff: draw() };
}

function startProductionCycle(nodes, units, typeCount, now) {
  return {
    active: pickProductionPair(nodes, units, typeCount),
    next: pickProductionPair(nodes, units, typeCount),
    endsAt: now + PRODUCTION_CYCLE_MS,
    remaining: PRODUCTION_CYCLE_MS
  };
}

function advanceProductionCycle(cycle, nodes, units, typeCount, now) {
  if (now >= cycle.endsAt) {
    cycle.active = cycle.next;
    cycle.next = pickProductionPair(nodes, units, typeCount);
    cycle.endsAt = now + PRODUCTION_CYCLE_MS;
  }
  cycle.remaining = cycle.endsAt - now;
}

function productionMultiplier(cycle, type) {
  if (type === cycle?.active.buff) return PRODUCTION_BUFF;
  if (type === cycle?.active.debuff) return PRODUCTION_DEBUFF;
  return 1;
}

function renderProductionCycle(cycle, types) {
  const strip = document.getElementById("production-cycle");
  strip.hidden = !cycle;
  if (!cycle) return;
  for (const phase of ["active", "next"]) {
    for (const [effect, multiplier] of [["buff", PRODUCTION_BUFF], ["debuff", PRODUCTION_DEBUFF]]) {
      const icon = document.getElementById(`production-${phase}-${effect}`);
      const [fruit, name] = types[cycle[phase][effect]];
      if (icon.textContent === fruit) continue;
      icon.textContent = fruit;
      const percent = Math.round((multiplier - 1) * 100);
      const label = `${name} ${percent > 0 ? "+" : ""}${percent}% production speed`;
      icon.title = label;
      icon.setAttribute("aria-label", label);
    }
  }
  const countdown=document.getElementById("production-countdown");
  if(countdown){
    const seconds=Math.ceil(cycle.remaining/1000);
    const label=`Next in ${seconds}s`;
    if(countdown.textContent!==label)countdown.textContent=label;
  }
  document.getElementById("production-progress").value = PRODUCTION_CYCLE_MS - cycle.remaining;
}
