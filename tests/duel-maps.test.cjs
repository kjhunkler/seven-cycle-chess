const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
const maps=[[7,'Hourglass',13],[8,'Twin rivers',12],[9,'Crown lattice',20],[10,'Ring road',14],[11,'Crossroads',15]];
for(const [map,name,count]of maps)for(const page of ['index.html','match.html'])for(const shops of [false,true])test(`${page}: ${name} reflects geometry, connections and starting fruit across both axes (shops ${shops})`,()=>{
 const h=createGame(page);
 h.run(page==='index.html'?`botConfig.map=${map};botConfig.shops=${shops};init()`:`matchGame.start(1,()=>{});lobbyConfig.map=${map};lobbyConfig.shops=${shops};init();gameStarted=true`);
 assert.equal(h.run('Object.values(N).filter(n=>!n.shop).length'),count);
 assert.equal(h.run('Object.values(N).filter(n=>n.castle).length'),2);
 assert.equal(h.run('Object.values(N).filter(n=>n.shop).length'),shops?4:0);
 for(const axis of ['x','y'])assert.equal(h.run(`Object.values(N).every(n=>{
  const flip=p=>({x:${axis==='x'?'100-p.x':'p.x'},y:${axis==='y'?'100-p.y':'p.y'}});
  const p=flip(n),mirror=Object.values(N).find(b=>b.x===p.x&&b.y===p.y);
  return mirror&&mirror.adj.length===n.adj.length&&n.ut===mirror.ut&&JSON.stringify(n.stock)===JSON.stringify(mirror.stock)&&n.adj.every(id=>{
   const q=flip(N[id]);return mirror.adj.some(to=>N[to].x===q.x&&N[to].y===q.y);
  });
 })`),true,axis+' symmetry includes initial fruit and garrisons');
 assert.equal(h.run(`(()=>{const visited=new Set(['P1']),queue=['P1'];for(const id of queue)for(const to of N[id].adj)if(!visited.has(to)){visited.add(to);queue.push(to)}return visited.size===Object.keys(N).length})()`),true,'all nodes and shops reachable');
 h.run('render();panel();routeCommand({kind:"route",node:"P1",to:N.P1.adj.find(id=>!N[id].shop)});depart(N.P1,.1)');
 assert.equal(h.run('G.some(g=>g.from==="P1")'),true,'starting fruit can travel along the new map');
 h.run('N.P2.stock.fill(0);arrive({to:"P2",owner:1,type:N.P1.ut,n:1})');
 assert.equal(h.run('over'),1,'two-player victory rules apply');
});
for(const [map,name]of maps)test(name+': paths do not cross, skip over nodes, or crowd nodes',()=>{
 const h=createGame(),{nodes,edges}=JSON.parse(h.run(`JSON.stringify(TWO_PLAYER_MAPS[${map}])`));
 const points=Object.values(nodes);
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)assert.ok(Math.hypot(points[i][0]-points[j][0],points[i][1]-points[j][1])>=14,'node spacing');
 const side=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
 for(const [a,b]of edges){
  for(const [id,p]of Object.entries(nodes))if(id!==a&&id!==b){
   const onLine=Math.abs(side(nodes[a],nodes[b],p))<1e-8;
   const between=(p[0]-nodes[a][0])*(p[0]-nodes[b][0])+(p[1]-nodes[a][1])*(p[1]-nodes[b][1])<0;
   assert.ok(!onLine||!between,'edge skips no node');
  }
  for(const [c,d]of edges)if(new Set([a,b,c,d]).size===4){
   assert.ok(!(side(nodes[a],nodes[b],nodes[c])*side(nodes[a],nodes[b],nodes[d])<0&&side(nodes[c],nodes[d],nodes[a])*side(nodes[c],nodes[d],nodes[b])<0),'edges do not cross');
  }
 }
});
test('five new maps are distinct, synchronized online, and restricted to two players',()=>{
 const host=createGame(),guest=createGame();host.run('matchGame.start(1,()=>{})');guest.run('matchGame.start(2,()=>{})');
 const fingerprints=new Set();
 for(const [map]of maps){
  assert.equal(host.run(`validConfig({...lobbyConfig,map:${map}})`),true);
  host.run(`lobbyConfig.map=${map};init();gameStarted=true`);
  guest.context.packet=JSON.parse(host.run('JSON.stringify(snapshot(2))'));
  guest.run('matchGame.receive(packet,1);render()');
  assert.equal(guest.run('lobbyConfig.map'),map);
  assert.equal(guest.run('Object.keys(N).length'),host.run('Object.keys(N).length'));
  fingerprints.add(host.run(`JSON.stringify(TWO_PLAYER_MAPS[${map}].edges.map(([a,b])=>[TWO_PLAYER_MAPS[${map}].nodes[a],TWO_PLAYER_MAPS[${map}].nodes[b]]))`));
  host.run('gameStarted=false;matchGame.setMembers([1,2,3].map(seat=>({seat,name:"Player "+seat,connected:true})))');
  assert.equal(host.run('lobbyConfig.map'),3,'third player switches to a three-player map');
  assert.equal(host.run(`validConfig({...lobbyConfig,map:${map}})`),false);
  host.run('matchGame.setMembers([1,2].map(seat=>({seat,name:"Player "+seat,connected:true})))');
 }
 assert.equal(fingerprints.size,5);
});
