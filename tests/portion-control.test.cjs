const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame,Element}=require('./game-harness.cjs');
function setup(page,enabled=true){
 const h=createGame(page);
 h.run(page==='index.html'?`botConfig.portionControl=${enabled};init()`:`lobbyConfig.portionControl=${enabled};online=true;gameStarted=true;init()`);
 h.run('N.P1.stock=[20,0,0,0,0,0,0];N.P1.selectedType=0;globalThis.to=N.P1.adj.find(id=>!N[id].shop);');
 return h;
}
for(const page of ['index.html','match.html']){
 for(const portion of [25,50,75,100])test(`${page}: ${portion}% sends its fixed budget and removes arrow`,()=>{
  const h=setup(page);
  h.run(`portionPercent=${portion};send('P1',to);portionPercent=100;`);
  const expected=20*portion/100;
  assert.equal(h.run('N.P1.routeRemaining[to]'),expected);
  h.run(`for(let i=0;i<${expected-1};i++)depart(N.P1,1)`);
  assert.equal(h.run('N.P1.routes.length'),1);
  h.run('depart(N.P1,1)');
  assert.equal(h.run('N.P1.routes.length'),0);
  assert.equal(h.run('G.reduce((s,g)=>s+g.n,0)'),expected);
  assert.equal(h.run('tot(N.P1)'),20-expected);
  h.run('N.P1.stock[0]+=10;for(let i=0;i<30;i++)depart(N.P1,1)');
  assert.equal(h.run('G.reduce((s,g)=>s+g.n,0)'),expected);
 });
 test(`${page}: disabled mode retains permanent routes and a garrison`,()=>{
  const h=setup(page,false);
  h.run("send('P1',to);for(let i=0;i<30;i++)depart(N.P1,1)");
  assert.equal(h.run('N.P1.routes.length'),1);
  assert.equal(h.run('tot(N.P1)'),1);
 });
 test(`${page}: separate arrows keep independent budgets despite production and slider changes`,()=>{
  const h=setup(page);
  h.run("portionPercent=25;send('P1',to);globalThis.other=N.P1.adj.find(id=>id!==to&&!N[id].shop);portionPercent=50;send('P1',other);N.P1.stock[0]+=20;for(let i=0;i<30;i++)depart(N.P1,1)");
  assert.equal(h.run('G.filter(g=>g.to===to).reduce((s,g)=>s+g.n,0)'),5);
  assert.equal(h.run('G.filter(g=>g.to===other).reduce((s,g)=>s+g.n,0)'),10);
  assert.equal(h.run('N.P1.routes.length'),0);
 });
 test(`${page}: small portions round down with at least one troop; stop permits fresh budget`,()=>{
  const h=setup(page);
  h.run("N.P1.stock[0]=7;portionPercent=25;send('P1',to)");
  assert.equal(h.run('N.P1.routeRemaining[to]'),1);
  h.run("applyRouteCommand(1,{kind:'stop',node:'P1'});N.P1.stock[0]=20;send('P1',to)");
  assert.equal(h.run('N.P1.routeRemaining[to]'),5);
 });
}
test('online validates portion setting and commands; snapshots include only own budgets',()=>{
 const h=setup('match.html');
 assert.equal(h.run('validConfig({...lobbyConfig,portionControl:"yes"})'),false);
 h.run("applyCommand(1,{kind:'route',node:'P1',to,portion:33})");
 assert.equal(h.run('N.P1.routes.length'),0);
 h.run("portionPercent=25;send('P1',to)");
 assert.equal(h.run('snapshot(1).nodes.P1.routeRemaining[to]'),5);
 assert.equal(h.run('Object.keys(snapshot(2).nodes.P1.routeRemaining).length'),0);
});
test('guest slider travels with command and host expires the arrow',()=>{
 const host=createGame(),guest=createGame();
 const deliver=(target,data,source)=>{target.context.packet=JSON.parse(JSON.stringify(data));target.run(`matchGame.receive(packet,${source})`)};
 host.context.wire=data=>deliver(guest,data,1);guest.context.wire=data=>deliver(host,data,2);
 host.run('matchGame.start(1,wire)');guest.run('matchGame.start(2,wire)');
 host.run('lobbyAction(1,{action:"config",config:{...lobbyConfig,portionControl:true}});gameStarted=true;N.P2.stock=[20,0,0,0,0,0,0];N.P2.selectedType=0;peerSend(snapshot(2),2)');
 guest.run("portionPercent=25;send('P2',N.P2.adj[0]);portionPercent=100");
 assert.equal(host.run('N.P2.routeRemaining[N.P2.adj[0]]'),5);
 host.run('for(let i=0;i<5;i++)depart(N.P2,1);peerSend(snapshot(2),2)');
 assert.equal(guest.run('N.P2.routes.length'),0);
});

for(const page of ['index.html','match.html'])test(page+': slider visibility and input follow the optional setting',()=>{
 let shell;const before=Element.prototype.before;
 Element.prototype.before=function(node){shell=node};
 let h;try{h=createGame(page)}finally{Element.prototype.before=before}
 const control=shell.children.find(node=>node.className==='portion-control');
 assert.equal(control.hidden,true);
 h.run(page==='index.html'?'botConfig.portionControl=true;render()':'lobbyConfig.portionControl=true;render()');
 assert.equal(control.hidden,false);
 const slider=control.querySelector('input');slider.value='25';slider.listeners.get('input')();
 assert.equal(h.run('portionPercent'),25);
 assert.equal(control.querySelector('output').textContent,'25%');
 if(page==='index.html'){
  const dialog=h.context.document.body.children.find(node=>node.className==='battle-settings-dialog');
  dialog.querySelector('form').elements={map:{value:'1'},speed:{value:'1'},shops:{checked:false},productionRotation:{checked:false},noQueue:{checked:false},portionControl:{checked:false},transformationWave:{checked:false},transformationTime:{value:'10'}};
  dialog.listeners.get('change')();h.run('render()');assert.equal(control.hidden,true);
 }else{
  h.run('matchGame.start(1,()=>{});lobbyReady=[true,true];variantField("portionControl").checked=true');
  h.elements.get('variant-form').listeners.get('change')();
  assert.equal(h.run('lobbyConfig.portionControl'),true);
  assert.equal(h.run('lobbyReady.some(Boolean)'),false);
 }
});
