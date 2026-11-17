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
  addEventListener() {}
  before() {}
  after() {}
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  contains() { return false; }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
}
for (const page of ['index.html', 'orchard.html', 'signal.html', 'match.html']) {
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
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (match[1].trim()) vm.runInContext(match[1], context, { filename: page });
    }
    vm.runInContext(fs.readFileSync(path.join(root, 'board-ui.js'), 'utf8'), context, { filename: 'board-ui.js' });
    assert.match(get('panel').innerHTML, /Grow your army/);
    assert.match(get('map').innerHTML, /board-node/);
    if (page === 'match.html') vm.runInContext('matchGame.start(1, () => {})', context);
    vm.runInContext('act("q0"); for(let i=0;i<25;i++)step(.1); select("P1"); panel(); render();', context);
    assert.match(get('panel').innerHTML, /COMMAND CENTER/);
    assert.ok(vm.runInContext('N.P1.stock[0] >= 1', context));
    vm.runInContext('sendType=0; send("P1","C1"); step(.1); render(); panel();', context);
    assert.ok(vm.runInContext('G.some(g => g.from === "P1" && g.to === "C1")', context));
    assert.ok(frames.length > 0);
    frames.shift()(200);
    if (page === 'match.html') {
      vm.runInContext('matchGame.start(2, () => {}); render(); panel();', context);
      assert.match(get('panel').innerHTML, /Grow your army/);
    }
  });
}

