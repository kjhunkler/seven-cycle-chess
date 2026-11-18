const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./game-harness.cjs');
const { mapLayout, defaultMaps } = require('../duel-maps.js');

function layout(players, difficulty=5) {
  const homes = Object.entries(defaultMaps[players].nodes).filter(([id]) => id.startsWith('P'));
  return {players, mirror:players!==3, nodes:{...Object.fromEntries(homes),J1:[50,50]},
    edges:homes.map(([id])=>[id,'J1']),difficulty:{J1:difficulty}};
}

test('database and playable fallback share eleven connected, seat-symmetric defaults', () => {
  assert.equal(Object.keys(defaultMaps).length,11);
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

for (const players of [2,3,4]) test(players+' seats can play a published revision with the same perspective and garrison', () => {
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
