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
  getBoundingClientRect() { return {left: 400, top: 400, width: 40, height: 40}; }
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
    for(const file of ['simulation.js','duel-maps.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (match[1].trim()) vm.runInContext(match[1], context, { filename: page });
    }
    vm.runInContext(fs.readFileSync(path.join(root, 'bot-ai.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(root, 'controls.js'), 'utf8'), context, { filename: 'controls.js' });
    vm.runInContext(fs.readFileSync(path.join(root, 'board-ui.js'), 'utf8'), context, { filename: 'board-ui.js' });
    if (page === 'index.html') {
      const dialog = context.document.body.children.find(element => element.className === 'battle-settings-dialog');
      const fields = {map: {value: '1'}, speed: {value: '1.5'}, fogOfWar: {checked: true}, diminishingReturns: {checked: false}, fullElimination: {checked: false}};
      dialog.querySelector = selector => selector === 'form' ? {elements: fields} : new Element();
      assert.equal(vm.runInContext('botConfig.map===1 && CONFIG.timeScale===1 && !N.D1 && !botConfig.fullElimination && botConfig.fogOfWar && !botConfig.diminishingReturns', context), true, 'original map at standard speed with default rules');
      vm.runInContext('globalThis.originalBoard=N', context);
      dialog.listeners.get('change')();
      assert.equal(vm.runInContext('N===originalBoard && CONFIG.timeScale===1.5', context), true, 'speed applies without resetting');
      fields.fogOfWar.checked = false;
      fields.diminishingReturns.checked = true;
      dialog.listeners.get('change')();
      assert.equal(vm.runInContext('N===originalBoard && !botConfig.fogOfWar && botConfig.diminishingReturns', context), true, 'new rules apply without resetting');
      assert.match(get('map').innerHTML, /Node P2, rival/);
      fields.map.value = '4';
      fields.fullElimination.checked = false;
      dialog.listeners.get('change')();
      assert.equal(vm.runInContext('N!==originalBoard && N.P3.owner===3 && N.P4.owner===4', context), true, 'board-changing settings rebuild the match');
      fields.map.value = '1';
      fields.speed.value = '0.5';
      dialog.listeners.get('change')();
    }
    vm.runInContext(typeof context.matchGame==='undefined'?'panel()':'panel()',context);
    assert.doesNotMatch(get('panel').innerHTML, /Queue/);
    assert.match(get('map').innerHTML, /board-node/);
    if (page === 'match.html') vm.runInContext('matchGame.start(1, () => {});gameStarted=true', context);
    vm.runInContext('N.P1.ut=0;N.P1.stock.fill(0);N.P1.stock[0]=6; for(let i=0;i<30;i++)step(.1); select("P1"); panel(); render();', context);
    assert.doesNotMatch(get('panel').innerHTML, /Queue/);
    assert.ok(vm.runInContext('N.P1.stock[0] === 7', context));
    vm.runInContext('sendType=0; send("P1","C1"); step(.1); render(); panel();', context);
    assert.ok(vm.runInContext('G.some(g => g.from === "P1" && g.to === "C1")', context));

    vm.runInContext('N.P1.stock=[7,0,0,0,0,0,0];N.P1.ut=0;G=[];N.P1.departure=0;send("P1","C2");for(let i=0;i<30;i++)depart(N.P1,.1)', context);
    assert.equal(vm.runInContext('tot(N.P1)', context), 1, 'routes preserve one defender');
    assert.equal(vm.runInContext('G.filter(g=>g.to==="C1").length', context), 3);
    assert.equal(vm.runInContext('G.filter(g=>g.to==="C2").length', context), 3);
    assert.equal(vm.runInContext('N.P1.ut', context), 0, 'the last defender keeps its fruit type');
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
    vm.runInContext('N.C1.owner=1;N.C1.ut=1;N.P1.ut=0;N.P1.stock=[5,0,0,0,0,0,0];N.P1.routes=["C1"];N.P1.routeIndex=0;N.P1.departure=0;G=[];depart(N.P1,.1)',context);
    assert.equal(vm.runInContext('G.length',context),0,'all nodes refuse incompatible friendly fruit');
    vm.runInContext('routeCommand({kind:"stop",node:"P1"});N.P1.stock[0]=5;G=[];depart(N.P1,1)', context);
    assert.equal(vm.runInContext('G.length', context), 0, 'stop clears future departures');
    vm.runInContext(`N.C1.owner=1;N.C1.ut=0;beginTransformation(N.C1,1);sel=null;
      typeWheel.style.setProperty=()=>{};
      typeWheel.contains=button=>typeWheel.children.includes(button);
      typeWheel.querySelectorAll=()=>typeWheel.children.filter(child=>child.dataset.type!==undefined);
    `, context);
    const wheel = context.document.body.children.find(node => node.className === 'type-wheel');
    const tapNode = () => {
      const event = {...pointer, target: target('C1')};
      map.listeners.get('pointerdown')(event);
      map.listeners.get('pointerup')(event);
      assert.equal(wheel.hidden, false);
    };
    const fruit = type => wheel.children.findLast(node => node.dataset.type === type);
    tapNode();
    vm.runInContext('panel()', context);
    assert.equal(get('panel').hidden, true);
    assert.match(fruit(1).innerHTML, /wheel-progress/);
    fruit(1).onclick({detail: 0});
    assert.equal(vm.runInContext('N.C1.cd', context), 0, 'pending fruit cancels');
    vm.runInContext('beginTransformation(N.C1,1);N.C1.cd=2', context);
    tapNode();
    fruit(2).onclick({detail: 0});
    assert.equal(vm.runInContext('N.C1.pend', context), 2, 'different fruit replaces the target');
    assert.equal(vm.runInContext('N.C1.cd', context), 5, 'replacement starts a fresh timer');
    tapNode();
    fruit(0).onclick({detail: 0});
    assert.equal(vm.runInContext('N.C1.pend', context), null, 'current fruit cancels');
    if(page==='match.html'){
      vm.runInContext('applyCommand(2,{kind:"route",node:"P1",to:"C1"})',context);
      assert.equal(vm.runInContext('N.P1.routes.length',context),0,'remote cannot command opponent');
      vm.runInContext('matchGame.start(1,()=>{})',context);
      assert.equal(vm.runInContext('JSON.stringify(N.P1.stock)===JSON.stringify(N.P2.stock)&&N.A1.ut===N.C1.ut',context),true,'symmetric starting armies');
    }
    assert.ok(frames.length > 0);
    frames.shift()(200);
    // Exercise the real frame loop at the Standard 1× default cadence.
    if (page === 'match.html') vm.runInContext('matchGame.start(1, () => {});gameStarted=true', context);
    else vm.runInContext('botConfig.speed=1;CONFIG.timeScale=1;init();botGame.start()', context);
    vm.runInContext('N.P1.ut=0;N.P1.stock.fill(0);N.P1.stock[0]=6; last=100; for(let now=200;now<=3100;now+=100)loop(now)', context);
    assert.equal(vm.runInContext('N.P1.stock[0]', context), 7, 'production completes after 3 real seconds');
    vm.runInContext('for(let now=3200;now<=6300;now+=100)loop(now)', context);
    assert.equal(vm.runInContext('N.P1.stock[0]', context), 8, 'production continues at the Standard cadence');
    if (page === 'match.html') {
      vm.runInContext('matchGame.start(2, () => {}); render(); panel();', context);
      assert.doesNotMatch(get('panel').innerHTML, /Queue/);
    }
  });
}


test('Pages deployment includes every local script loaded by the game', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
  const copy = workflow.match(/cp (.+) site\//);
  assert.ok(copy, 'deployment stages game assets');
  const published = new Set(copy[1].trim().split(/\s+/));
  published.add('lobby-config.js');
  for (const page of ['index.html', 'match.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
      if (/^https?:/.test(match[1])) continue;
      const asset = match[1].replace(/^\.\//, '').split('?')[0];
      assert.ok(published.has(asset), page + ' needs published script ' + asset);
    }
  }
});
