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
  document.getElementById("production-progress").value = PRODUCTION_CYCLE_MS - cycle.remaining;
}
