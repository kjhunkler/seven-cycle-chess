const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

// A minimal DOM for exercising real game startup and frames without network/lobby side effects.
// Browser checks cover layout, pointer hit testing, and actual DOM rendering.
class Element {
  constructor() { this.listeners = new Map(); this.dataset = {}; this.style = {}; this.innerHTML = ''; this.children = []; this.hidden = false; this.classList = { toggle() {} }; }
  setAttribute() {}
  setPointerCapture() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.get("close")?.(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
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
    if (page === 'index.html') {
      const dialog = context.document.body.children.find(element => element.className === 'battle-settings-dialog');
      const fields = {map: {value: '1'}, speed: {value: '1.5'}, shops: {checked: true}, productionRotation: {checked: true}};
      dialog.querySelector = selector => selector === 'form' ? {elements: fields} : new Element();
      assert.equal(vm.runInContext('botConfig.map===1 && CONFIG.timeScale===1 && !N.D1 && N.S1H.shop==="shield"', context), true, 'original map at standard speed with shops');
      vm.runInContext('globalThis.originalBoard=N', context);
      dialog.listeners.get('change')();
      assert.equal(vm.runInContext('N===originalBoard && CONFIG.timeScale===1.5', context), true, 'speed applies without resetting');
      fields.map.value = '4';
      fields.shops.checked = true;
      fields.productionRotation.checked = false;
      dialog.listeners.get('change')();
      assert.equal(vm.runInContext('N!==originalBoard && N.P3.owner===3 && N.P4.owner===4 && N.S4H.shop==="shield" && productionCycle===null', context), true, 'board-changing settings rebuild the match');
      fields.map.value = '1';
      fields.speed.value = '0.5';
      fields.shops.checked = true;
      fields.productionRotation.checked = true;
      dialog.listeners.get('change')();
    }
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
    assert.equal(vm.runInContext('N.P1.selectedType', context), 1, 'castle selects the next available fruit');
    assert.equal(vm.runInContext('N.P1.routes.length', context), 1, 'routes remain when the selected fruit runs out');
    vm.runInContext('N.P1.stock=[0,3,0,0,0,0,0];N.P1.selectedType=0;N.C1.owner=0;select("P1");render()', context);
    assert.match(get('map').innerHTML, /data-id="C1"[^]*?>(?:\+|−|=)<\/text>/, 'a depleted selection still shows the next fruit matchup');
    vm.runInContext('N.P1.stock.fill(0);N.P1.routes=[]', context);
    const map = get('map');
    const target = id => ({closest: () => ({dataset: {id}})});
    const pointer = {button: 0, pointerId: 1, clientX: 0, clientY: 0, target: target('P1'), preventDefault() {}};
    context.document.elementFromPoint = () => target('C1');
    map.listeners.get('pointerdown')(pointer);
    map.listeners.get('pointermove')({...pointer, clientX: 20});
    vm.runInContext('render()', context);
    assert.match(map.innerHTML, /class="sending-arrow"/, 'drag previews a route even with no stock');
    map.listeners.get('pointerup')({...pointer, clientX: 20});
    vm.runInContext('render()', context);
    assert.match(map.innerHTML, /class="sending-arrow"/, 'released drag keeps the route arrow');
    assert.equal(vm.runInContext('N.P1.routes[0]', context), 'C1', 'an empty castle can set a route for future production');
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
    if (page === 'index.html') assert.match(get('production-countdown').textContent, /Next in \d+s/);
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

