const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGame } = require('./game-harness.cjs');
const { mapLayout, defaultMaps, radialHomes } = require('../duel-maps.js');

function layout(players, difficulty=5) {
  const homes = players>4 ? radialHomes(players).map((p,i)=>['P'+(i+1),p]) : Object.entries(defaultMaps[players].nodes).filter(([id]) => id.startsWith('P'));
  return {players, mirror:players===2||players===4, nodes:{...Object.fromEntries(homes),J1:[50,50]},
    edges:homes.map(([id])=>[id,'J1']),difficulty:{J1:difficulty}};
}

test('database and playable fallback share fourteen connected, seat-symmetric defaults', () => {
  assert.equal(Object.keys(defaultMaps).length,14);
  for (const map of Object.values(defaultMaps)) assert.deepEqual(mapLayout(map).startGroups,map.startGroups);
});

test('publishing rejects asymmetric neutral strength, missing paths, invalid seats and disconnected nodes', () => {
  const map=structuredClone(defaultMaps[2]);
  assert.throws(()=>mapLayout({...map,difficulty:{D1:9}}),/difficulty/);
  assert.throws(()=>mapLayout({...map,edges:map.edges.slice(1)}),/Paths must match/);
  assert.throws(()=>mapLayout({...map,players:3}),/starting node/);
  assert.throws(()=>mapLayout({...map,nodes:{...map.nodes,J1:[50,50]}}),/Connect every node/);
  assert.throws(()=>mapLayout({...map,difficulty:{D1:100}}),/between 1 and 99/);
});

for (const players of [2,3,4,5,6,7,8,9]) test(players+' seats can play a published revision with the same perspective and garrison', () => {
  const host=createGame();
  const catalog={maps:[{id:403,revision:1,players,name:'Canopy'}],
    versions:[{key:'403/1',layout:JSON.stringify(layout(players,17))}]};
  host.context.catalog=catalog;
  host.run('loadMapCatalog(catalog);matchGame.start(1,()=>{});Object.assign(lobbyConfig,selectionConfig(403));init()');
  assert.equal(host.run('validConfig(lobbyConfig)'),true);
  assert.equal(host.run('tot(N.J1)'),17);
  const view=host.run('JSON.stringify(boardViewPoint(N.P1,1))');
  for(let seat=2;seat<=players;seat++){
    const p=JSON.parse(view),q=JSON.parse(host.run('JSON.stringify(boardViewPoint(N.P'+seat+','+seat+'))'));
    assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<0.015);
  }
  catalog.maps[0].revision=2;catalog.versions.push({key:'403/2',layout:JSON.stringify(layout(players,21))});
  host.run('loadMapCatalog(catalog);init()');
  assert.equal(host.run('tot(N.J1)'),17,'published edits preserve already selected rounds');
  const solo=createGame('index.html');solo.context.catalog=catalog;
  solo.run('loadMapCatalog(catalog);Object.assign(botConfig,selectionConfig(403));init();render()');
  assert.equal(solo.run('tot(N.J1)'),21);
  if(players>4){
    assert.doesNotMatch(solo.elements.get('map').innerHTML,/compact-troop-count/,'the full board is the default even on larger maps');
    assert.throws(()=>mapLayout({...layout(players),edges:layout(players).edges.slice(1)}),/Paths must match/);
    assert.equal(host.run(`gameStarted=true;applyCommand(${players},{kind:'route',node:'P${players}',to:'J1'});N.P${players}.routes.includes('J1')`),true);
  }
});

test('custom spawns keep seat ownership, individual paths and shop positions in solo and online play', () => {
  const board=layout(4);
  board.customHomes=true;
  board.nodes.P2=[35,20];
  board.edges.push(['P1','P2']);
  assert.throws(()=>mapLayout({...board,customHomes:false}),/perspectives/);
  for(const page of ['index.html','match.html']){
    const game=createGame(page),config=page==='index.html'?'botConfig':'lobbyConfig';
    game.context.catalog={maps:[{id:403,revision:1,players:4,name:'Team camp'}],
      versions:[{key:'403/1',layout:JSON.stringify(board)}]};
    game.run('loadMapCatalog(catalog);Object.assign('+config+',selectionConfig(403),{teams:true,teamSize:2,shops:true});init()');
    assert.equal(game.run('N.P2.owner===2&&allies(1,2)&&N.P2.adj.includes("P1")'),true);
    assert.equal(game.run('boardViewPoint(N.P2,2).x'),35);
    assert.equal(game.run('boardViewPoint(N.P2,2,true).y'),20);
    assert.equal(game.run('Object.values(N).filter(n=>n.shop).every(s=>Object.values(N).every(n=>s===n||Math.hypot(s.x-n.x,s.y-n.y)>=8))'),true);
  }
});

test('guests recover a lobby packet that arrived before its map subscription', () => {
  const guest=createGame();guest.context.dispatchEvent=()=>{};guest.context.Event=class {};
  guest.run('matchGame.start(2,()=>{})');
  guest.run('matchGame.receive({kind:"lobby",round:0,revision:7,configVersion:3,humans:[1,2],connected:[1,2],ready:[true,false],config:{...lobbyConfig,map:401,mapRevision:2}})');
  guest.context.catalog={maps:[{id:401,revision:2,name:'Canopy'}],versions:[{key:'401/2',layout:JSON.stringify(layout(2,19))}]};
  guest.run('matchGame.setCatalog(catalog)');
  assert.equal(guest.run('lobbyConfig.map'),401);
  assert.equal(guest.run('configVersion'),3);
});

test('editor moves and groups spawns with undo, and preserves the draft through pinch zoom', () => {
  const game=createGame('index.html'),get=game.context.document.getElementById;
  const library=get('map-library'),query=library.querySelector.bind(library);
  library.querySelector=selector=>['.team-settings','[name="teams"]','[name="teamSize"]'].includes(selector)?null:query(selector);
  const area=get('editor-board');
  let view, guides;
  area.firstChild={
    setAttribute(name,value){if(name==='viewBox')view=value.split(' ').map(Number)},
    insertAdjacentHTML(position,value){guides=value},
    getScreenCTM(){return {inverse(){return view}}},
  };
  game.context.DOMPoint=class {
    constructor(x,y){this.x=x;this.y=y}
    matrixTransform([x,y,size]){return {x:x+this.x*size/108,y:y+this.y*size/108}}
  };
  game.context.URL=URL;
  game.context.structuredClone=structuredClone;
  game.context.location.href='http://localhost/';
  game.run(fs.readFileSync(path.join(__dirname,'../map-library.js'),'utf8'));
  game.run('botGame.start()');
  get('open-maps').onclick();
  assert.equal(library.open,true);
  assert.equal(game.run('botGame.paused'),true);
  library.querySelector('[data-close]').onclick();
  assert.equal(game.run('botGame.paused'),true);
  get('new-map').onclick();
  get('editor-players').onchange({target:{value:'9'}});
  assert.equal(get('editor-players').value,'9');
  assert.equal(get('editor-status').textContent,'');
  assert.equal((area.innerHTML.match(/data-node=/g)||[]).length,10);
  get('editor-players').onchange({target:{value:'8'}});
  const presets=get('editor-spawns'),tool=get('editor-tool');
  const standard=area.innerHTML;
  presets.onchange({target:{value:'4'}});
  assert.equal(presets.value,'4');
  assert.match(area.innerHTML,/data-node="P1".*?cx="33.5" cy="87"/);
  assert.match(area.innerHTML,/data-node="P4".*?cx="66.5" cy="87"/);
  const grouped=area.innerHTML;
  tool.value='move';tool.onchange();
  const click=(x,y,node)=>area.onclick({clientX:x+4,clientY:y+4,target:{closest:()=>node&&{dataset:{node}},dataset:{}}});
  click(33.5,87,'P1');click(50,50,'J1');
  assert.match(get('editor-status').textContent,/empty position/);
  click(26,70);
  assert.equal(presets.value,'custom');
  assert.match(area.innerHTML,/data-node="P1".*?cx="26" cy="70"/);
  assert.match(area.innerHTML,/data-edge="P1-J1" x1="26" y1="70"/);
  get('editor-undo').onclick();
  assert.equal(area.innerHTML,grouped);
  get('editor-undo').onclick();
  assert.equal(area.innerHTML,standard);
  tool.value='node';tool.onchange();
  const touch=(pointerId,clientX,clientY)=>({pointerType:'touch',pointerId,clientX,clientY});
  area.onpointerdown(touch(1,40,54));
  area.onpointerdown(touch(2,68,54));
  area.onpointermove(touch(1,12,54));
  assert.equal(view[2],54);
  area.onpointerup(touch(1,12,54));
  area.onpointerup(touch(2,68,54));
  const tap={clientX:80,clientY:70,target:{closest:()=>null,dataset:{}}};
  const before=area.innerHTML;
  area.onclick(tap);
  assert.equal(area.innerHTML,before);
  get('editor-grid').checked=true;
  get('editor-guides').checked=true;
  get('editor-grid').onchange();
  assert.match(guides,/map-grid-line/);
  assert.equal(guides.match(/map-symmetry-line/g).length,8);
  assert.equal(view[2],54);
  get('editor-reset-view').onclick();
  assert.deepEqual(view,[-4,-4,108,108]);
  area.onpointerdown(touch(3,80,70));
  area.onpointerup(touch(3,80,70));
  area.onclick(tap);
  assert.equal((area.innerHTML.match(/data-node=/g)||[]).length,17);
});
