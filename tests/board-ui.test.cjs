const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

// A minimal DOM for exercising real game startup and frames without network/lobby side effects.
// Browser checks cover layout, pointer hit testing, and actual DOM rendering.
class Element {
  constructor() { this.dataset = {}; this.style = {}; this.innerHTML = ''; this.children = []; this.hidden = false; this.classList = { toggle() {} }; }
  setAttribute() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  addEventListener() {}
  before() {}
  after() {}
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  contains() { return false; }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
}
for (const page of ['index.html', 'match.html']) {
  test(`${page}: shared UI initializes, advances production, and dispatches troops`, () => {
    const elements = new Map();
    const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
    const frames = [];
    const context = vm.createContext({
      document: { querySelector: () => new Element(), getElementById: get, createElement: () => new Element(), body: new Element(), documentElement: new Element(), activeElement: null, addEventListener() {} },
      navigator: {}, localStorage: { getItem() { return null; }, setItem() {} },
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      performance: { now: () => 100 }, requestAnimationFrame: fn => frames.push(fn),
      addEventListener() {}, setTimeout, clearTimeout, innerWidth: 1000, innerHeight: 800,
      parent: { postMessage() {} }, location: { origin: 'http://localhost', replace() {} }, console,
    });
    context.window = context;
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    vm.runInContext(fs.readFileSync(path.join(root, 'production-cycle.js'), 'utf8'), context, { filename: 'production-cycle.js' });
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (match[1].trim()) vm.runInContext(match[1], context, { filename: page });
    }
    vm.runInContext(fs.readFileSync(path.join(root, 'controls.js'), 'utf8'), context, { filename: 'controls.js' });
    vm.runInContext(fs.readFileSync(path.join(root, 'board-ui.js'), 'utf8'), context, { filename: 'board-ui.js' });
    assert.match(get('panel').innerHTML, /Queue/);
    assert.match(get('map').innerHTML, /board-node/);
    if (page === 'match.html') vm.runInContext('matchGame.start(1, () => {});gameStarted=true', context);
    vm.runInContext('productionCycle=startProductionCycle(N,G,T.length,100);productionCycle.active={buff:1,debuff:2}; act("q0"); for(let i=0;i<25;i++)step(.1); select("P1"); panel(); render();', context);
    assert.match(get('panel').innerHTML, /Queue/);
    assert.ok(vm.runInContext('N.P1.stock[0] >= 1', context));
    vm.runInContext('sendType=0; send("P1","C1"); step(.1); render(); panel();', context);
    assert.ok(vm.runInContext('G.some(g => g.from === "P1" && g.to === "C1")', context));

    vm.runInContext('N.P1.stock=[7,0,0,0,0,0,0];N.P1.selectedType=0;G=[];N.P1.departure=0;send("P1","C2");for(let i=0;i<30;i++)depart(N.P1,.1)', context);
    assert.equal(vm.runInContext('tot(N.P1)', context), 1, 'routes preserve one defender');
    assert.equal(vm.runInContext('G.filter(g=>g.to==="C1").length', context), 3);
    assert.equal(vm.runInContext('G.filter(g=>g.to==="C2").length', context), 3);
    assert.equal(vm.runInContext('N.P1.selectedType', context), 0, 'the last defender keeps its fruit selected');
    vm.runInContext('N.P1.stock=[2,1,0,0,0,0,0];N.P1.selectedType=0;N.P1.routes=["C1"];N.P1.routeIndex=0;N.P1.departure=0;G=[];for(let i=0;i<30;i++)depart(N.P1,.1)', context);
    assert.equal(vm.runInContext('N.P1.stock[0]', context), 0, 'selected fruit is fully spent');
    assert.equal(vm.runInContext('N.P1.selectedType', context), 0, 'castle keeps the selected fruit');
    assert.equal(vm.runInContext('N.P1.routes.length', context), 1, 'routes remain when the selected fruit runs out');
    vm.runInContext('N.C1.owner=1;N.C1.ut=1;N.P1.stock=[2,3,0,0,0,0,0];N.P1.selectedType=0;N.P1.routes=["C1"];N.P1.routeIndex=0;N.P1.departure=0;G=[];depart(N.P1,.1)', context);
    assert.equal(vm.runInContext('G[0].type', context), 1, 'castle falls back to the strongest compatible fruit on a blocked lane');
    assert.equal(vm.runInContext('N.P1.routes.length', context), 1, 'fallback dispatch keeps the route arrow');
    vm.runInContext('routeCommand({kind:"stop",node:"P1"});N.P1.stock[0]=5;G=[];depart(N.P1,1)', context);
    assert.equal(vm.runInContext('G.length', context), 0, 'stop clears future departures');
    vm.runInContext('N.C1.owner=1;N.C1.cd=3;N.C1.pend=2;sel="C1";act("cancel")', context);
    assert.equal(vm.runInContext('N.C1.pend', context), null);
    if(page==='match.html'){
      vm.runInContext('applyCommand(2,{kind:"route",node:"P1",to:"C1"})',context);
      assert.equal(vm.runInContext('N.P1.routes.length',context),0,'remote cannot command opponent');
      vm.runInContext('matchGame.start(1,()=>{})',context);
      assert.equal(vm.runInContext('JSON.stringify(N.P1.stock)===JSON.stringify(N.P2.stock)&&N.A1.ut===N.C1.ut',context),true,'symmetric starting armies');
    }
    assert.ok(frames.length > 0);
    frames.shift()(200);
    // Exercise the real frame loop: production must not finish at the old 2s cadence.
    if (page === 'match.html') vm.runInContext('matchGame.start(1, () => {});gameStarted=true', context);
    else vm.runInContext('init()', context);
    vm.runInContext('productionCycle=startProductionCycle(N,G,T.length,100);productionCycle.active={buff:1,debuff:2}; act("q0"); last=100; for(let now=200;now<=3100;now+=100)loop(now)', context);
    assert.equal(vm.runInContext('N.P1.q.length', context), 1, 'still producing after 3 real seconds');
    vm.runInContext('for(let now=3200;now<=4400;now+=100)loop(now)', context);
    assert.equal(vm.runInContext('N.P1.q.length', context), 0, 'production completes after 4 real seconds');
    vm.runInContext('productionCycle.next={buff:0,debuff:1};loop(45100)', context);
    assert.equal(get('production-active-buff').textContent, '🍎');
    assert.equal(get('production-progress').value, 0);
    if (page === 'index.html') {
      vm.runInContext('botConfig.productionRotation=false;act("restart");loop(45200)', context);
      assert.equal(get('production-cycle').hidden, true);
      assert.equal(vm.runInContext('productionMultiplier(productionCycle, 0)', context), 1);
      vm.runInContext('botConfig.productionRotation=true;act("restart");loop(45300)', context);
      assert.equal(get('production-cycle').hidden, false);
    }
    if (page === 'match.html') {
      vm.runInContext('matchGame.start(2, () => {}); render(); panel();', context);
      assert.match(get('panel').innerHTML, /Queue/);
    }
  });
}

