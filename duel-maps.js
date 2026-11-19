// Each seed node and connection is reflected across both board axes.
// The same definitions drive solo and online games.
function symmetricDuelMap(name,seeds,paths){
  const nodes={P1:[50,95],P2:[50,5]},ids=new Map(Object.entries(nodes).map(([id,p])=>[p.join(','),id]));
  const reflect=(p,x,y)=>[x?100-p[0]:p[0],y?100-p[1]:p[1]];
  for(const point of seeds)for(const x of [false,true])for(const y of [false,true]){
    const p=reflect(point,x,y),key=p.join(',');
    if(!ids.has(key)){const id=`J${ids.size-1}`;ids.set(key,id);nodes[id]=p;}
  }
  const links=new Map();
  for(const path of paths.split(' ')){
    const [a,b]=path.split('/').map(p=>p.split(',').map(Number));
    for(const x of [false,true])for(const y of [false,true]){
      const from=ids.get(reflect(a,x,y).join(',')),to=ids.get(reflect(b,x,y).join(','));
      if(!from||!to)throw new Error(`Missing node in ${name}: ${path}`);
      links.set([from,to].sort().join('-'),[from,to]);
    }
  }
  const groups=new Map();
  for(const [id,[x,y]]of Object.entries(nodes)){
    const key=[Math.min(x,100-x),Math.min(y,100-y)].join(',');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(id);
  }
  return {name,nodes,edges:[...links.values()],startGroups:[...groups.values()]};
}
const TWO_PLAYER_MAPS={
  7:symmetricDuelMap('Hourglass',[[24,23],[50,23],[38,40],[50,50]],
    '50,5/24,23 50,5/50,23 24,23/50,23 24,23/38,40 50,23/38,40 38,40/50,50'),
  8:symmetricDuelMap('Twin rivers',[[22,23],[22,40],[50,40]],
    '50,5/22,23 22,23/22,40 22,40/22,60 22,40/50,40'),
  9:symmetricDuelMap('Crown lattice',[[20,22],[40,22],[10,40],[30,40],[50,40]],
    '50,5/20,22 50,5/40,22 20,22/40,22 40,22/60,22 20,22/10,40 20,22/30,40 40,22/30,40 40,22/50,40 10,40/30,40 30,40/50,40 10,40/10,60 30,40/30,60 50,40/50,60'),
  10:symmetricDuelMap('Ring road',[[30,24],[12,40],[50,35],[35,50]],
    '50,5/30,24 30,24/70,24 30,24/12,40 12,40/12,60 30,24/50,35 12,40/35,50 50,35/35,50'),
  11:symmetricDuelMap('Crossroads',[[24,23],[50,23],[24,40],[8,50],[50,50]],
    '50,5/24,23 50,5/50,23 24,23/50,23 24,23/24,40 50,23/24,40 24,40/8,50 24,40/50,50 8,50/50,50')
};

const POS={P2:[50,5],P1:[50,95],A1:[28,22],A2:[50,22],A3:[72,22],B1:[12,50],B2:[38,50],B3:[62,50],B4:[88,50],C1:[28,78],C2:[50,78],C3:[72,78]};
// Threefold symmetric graph: starting nodes, triangle side nodes, vertices, and hub.
// Twin branches follows the ten-node two-player sketch.
// Axis-symmetric four-player schema; every starting-node pair is four edges apart.
const FOUR_POS={P1:[25,8],P2:[75,8],P3:[25,92],P4:[75,92],D1:[50,18],D2:[50,82],A1:[12,32],A2:[38,32],A3:[62,32],A4:[88,32],B1:[12,50],B2:[50,50],B3:[88,50],C1:[12,68],C2:[38,68],C3:[62,68],C4:[88,68]};
const FOUR_EDGES="P1-A1 P1-A2 P2-A3 P2-A4 P3-C1 P3-C2 P4-C3 P4-C4 A1-A2 A3-A4 C1-C2 C3-C4 D1-A2 D1-A3 D2-C2 D2-C3 A2-B2 A3-B2 C2-B2 C3-B2 A1-B1 B1-C1 A4-B3 B3-C4 B1-B2 B2-B3".split(" ").map(e=>e.split("-"));
const BRANCH_POS={P2:[50,6],A1:[20,28],A2:[50,28],A3:[80,28],B1:[35,50],B2:[65,50],C1:[20,72],C2:[50,72],C3:[80,72],P1:[50,94]};
const BRANCH_EDGES="P2-A1 P2-A3 A1-A2 A2-A3 A1-B1 A2-B1 A2-B2 A3-B2 B1-C1 B1-C2 B2-C2 B2-C3 C1-C2 C2-C3 C1-P1 C3-P1".split(" ").map(e=>e.split("-"));
const THREE_POS={P1:[50,96],P2:[89.8371685741,27],P3:[10.1628314259,27],C2:[50,72],A1:[30.9474411167,39],A3:[69.0525588833,39],A2:[50,12],C1:[17.0910346562,69],C3:[82.9089653438,69],B2:[50,50]};
// Expand the original triangle with a node on every path and symmetric bypasses.
const THREE_PATHS="P1-C2 P2-A3 P3-A1 A2-A1 A2-A3 C1-A1 C1-C2 C3-A3 C3-C2 B2-A1 B2-A3 B2-C2".split(" ").map(e=>e.split("-"));
const THREE_EDGES=THREE_PATHS;
const LARGE_THREE_POS={...THREE_POS};
const LARGE_THREE_EDGES=THREE_PATHS.flatMap(([a,b],i)=>{
  const id=`M${i}`,p=THREE_POS[a],q=THREE_POS[b];
  LARGE_THREE_POS[id]=[(p[0]+q[0])/2,(p[1]+q[1])/2];
  return [[a,id],[id,b]];
});
LARGE_THREE_EDGES.push(..."M9-M10 M10-M11 M11-M9 M0-M6 M0-M8 M1-M7 M1-M4 M2-M3 M2-M5".split(" ").map(e=>e.split("-")));
const rotateBoardPoint=(p,angle)=>({x:50+(p.x-50)*Math.cos(angle)-(p.y-50)*Math.sin(angle),y:50+(p.x-50)*Math.sin(angle)+(p.y-50)*Math.cos(angle)});
const MAP_SEAT_COUNTS=[2,3,4,5,6,7,8];
const radialSeatAngle=(seat,players)=>(seat-1)*2*Math.PI/players;
function radialHomes(players,point=[50,92]){
  return Array.from({length:players},(_,i)=>{
    const {x,y}=rotateBoardPoint({x:point[0],y:point[1]},radialSeatAngle(i+1,players));
    return [x,y];
  });
}
function shopPosition(c,kind,triangular,four=false,players=2){
  const side=kind==='shield'?-1:1;
  if(players>4){
    const angle=Math.atan2(c.y-50,c.x-50);
    return {x:Math.max(2,Math.min(98,c.x-side*12*Math.sin(angle))),y:Math.max(2,Math.min(98,c.y+side*12*Math.cos(angle)))};
  }
  return four?{x:c.x+side*15,y:c.y<50?2:98}:triangular?rotateBoardPoint({x:50+side*24,y:90},radialSeatAngle(Number(c.id.slice(1)),3)):{x:Math.max(8,Math.min(92,c.x+side*36)),y:c.y+(c.y<50?5:-5)};
}
const EDGES="P2-A1 P2-A2 P2-A3 A1-A2 A2-A3 A1-B1 A1-B2 A2-B2 A2-B3 A3-B3 A3-B4 B1-B2 B2-B3 B3-B4 B1-C1 B2-C1 B2-C2 B3-C2 B3-C3 B4-C3 C1-C2 C2-C3 C1-P1 C2-P1 C3-P1".split(" ").map(e=>e.split("-"));

// These transforms match boardViewPoint in controls.js. Three-seat boards rotate
// around the hub. Four-seat boards use both reflections to keep seats equivalent.
function symmetryCopies(point, players, mirror) {
  const [x,y]=point;
  if(players===3||players>4) {
    const orbit=p=>radialHomes(players,p);
    return mirror ? [...orbit(point),...orbit([100-x,y])] : orbit(point);
  }
  return players===4 || mirror
    ? [point,[x,100-y],[100-x,y],[100-x,100-y]]
    : [point,[x,100-y]];
}
function nodeAt(nodes,point) {
  return Object.keys(nodes).find(id=>Math.hypot(nodes[id][0]-point[0],nodes[id][1]-point[1])<0.015);
}
function mapLayout(raw, requireConnected=true) {
  const {nodes,edges,players,mirror,difficulty={}}=raw;
  const fail=message=>{throw new Error(message)};
  if(!MAP_SEAT_COUNTS.includes(players)||typeof mirror!=='boolean'||!nodes||Array.isArray(nodes)||!Array.isArray(edges))
    fail('Choose a valid map and seat count.');
  const ids=Object.keys(nodes);
  if(ids.length>96||edges.length>300)fail('Maps support up to 96 nodes and 300 paths.');
  for(const id of ids){
    const p=nodes[id];
    if(!/^(?:P[1-8]|[A-OQ-RT-Z][0-9]{1,5})$/.test(id)||!Array.isArray(p)||p.length!==2||
      p.some(v=>!Number.isFinite(v)||v<1||v>99)||nodeAt(nodes,p)!==id)fail('Node positions must be distinct and on the board.');
  }
  const homes=Array.from({length:players},(_,i)=>'P'+(i+1));
  if(homes.some(id=>!nodes[id])||ids.filter(id=>id.startsWith('P')).length!==players)fail('Each seat needs one starting node.');
  // A seat always views its home in the same position as the other seats.
  const [hx,hy]=nodes.P1;
  const seats=players>4?radialHomes(players,nodes.P1):players===4?[[hx,hy],[100-hx,hy],[hx,100-hy],[100-hx,100-hy]]:
    players===3?[0,2,1].map(i=>symmetryCopies(nodes.P1,3,false)[i]):[[hx,hy],[hx,100-hy]];
  if(seats.some((p,i)=>nodeAt(nodes,p)!==homes[i]))fail('Starting nodes must match the seat perspectives.');
  if(!difficulty||typeof difficulty!=='object'||Array.isArray(difficulty)||
     Object.entries(difficulty).some(([id,d])=>!ids.includes(id)||id.startsWith('P')||!Number.isInteger(d)||d<1||d>99))
    fail('Neutral difficulty must be between 1 and 99.');
  const seen=new Set(), startGroups=[],copies={};
  for(const id of ids){
    const orbit=symmetryCopies(nodes[id],players,mirror).map(p=>nodeAt(nodes,p));
    if(orbit.some(other=>!other||other.startsWith('P')!==id.startsWith('P')||(difficulty[other]??5)!==(difficulty[id]??5)))fail('Nodes and difficulty must match across all seats.');
    copies[id]=orbit;
    if(!seen.has(id)){const group=[...new Set(orbit)];startGroups.push(group);group.forEach(other=>seen.add(other))}
  }
  const key=(a,b)=>[a,b].sort().join('-'), paths=new Set(),adj=Object.fromEntries(ids.map(id=>[id,[]]));
  for(const pair of edges){
    if(!Array.isArray(pair)||pair.length!==2)fail('Invalid path.');
    const [a,b]=pair;
    if(!ids.includes(a)||!ids.includes(b)||a===b||paths.has(key(a,b)))fail('Paths must join two different nodes once.');
    paths.add(key(a,b));adj[a].push(b);adj[b].push(a);
  }
  for(const [a,b] of edges)if(copies[a].some((other,i)=>!paths.has(key(other,copies[b][i]))))fail('Paths must match across all seats.');
  const reached=new Set(['P1']);
  for(const id of reached)for(const other of adj[id])reached.add(other);
  if(requireConnected&&reached.size!==ids.length)fail('Connect every node and starting position before publishing.');
  return {players,mirror,nodes,edges,difficulty,startGroups};
}
const expandedNodes={...POS,D1:[18,34],D2:[82,34],E1:[18,66],E2:[82,66]};
const expandedEdges=[...EDGES,...'A1-D1 A3-D2 B1-E1 B4-E2 D1-B1 D2-B4 E1-C1 E2-C3'.split(' ').map(path=>path.split('-'))];
const defaultMaps=Object.fromEntries([
  [1,'Original map',2,POS,EDGES],[2,'Expanded orchard',2,expandedNodes,expandedEdges],
  [3,'Three groves',3,THREE_POS,THREE_EDGES],[4,'Grand orchard',4,FOUR_POS,FOUR_EDGES],
  [5,'Twin branches',2,BRANCH_POS,BRANCH_EDGES],[6,'Expanded three groves',3,LARGE_THREE_POS,LARGE_THREE_EDGES],
  ...Object.entries(TWO_PLAYER_MAPS).map(([id,m])=>[Number(id),m.name,2,m.nodes,m.edges])
].map(([id,name,players,nodes,edges])=>[id,{id,name,...mapLayout({players,nodes,edges,mirror:players!==3,difficulty:{}})}]));
for(const players of [6,8]){
 const homes=radialHomes(players),inner=radialHomes(players,[50,68]);
 const nodes={J0:[50,50]},edges=[];
 for(let i=0;i<players;i++){const p='P'+(i+1),j='J'+(i+1);nodes[p]=homes[i];nodes[j]=inner[i];edges.push([p,j],[j,'J0'],[j,'J'+((i+1)%players+1)])}
 const id=2147483640+players;
 defaultMaps[id]={id,name:players+'-player orchard',...mapLayout({players,mirror:false,nodes,edges,difficulty:{}})};
}
function mapForPlayers(players){return [...latestMaps.values()].find(m=>m.players===players)?.id??2}
const mapVersions=new Map(), latestMaps=new Map(Object.values(defaultMaps).map(m=>[m.id,m]));
function selectedLayout(config){
  return config.mapRevision ? mapVersions.get(config.map+'/'+config.mapRevision) : defaultMaps[config.map] || latestMaps.get(config.map);
}
function mapPlayerCount(id){return latestMaps.get(id)?.players}
function selectionConfig(id){
  const revision=latestMaps.get(id)?.revision;
  return revision?{map:id,mapRevision:revision}:{map:id};
}
// Four-seat maps put P1/P2 on one edge and P3/P4 on the opposite edge.
function teamNumber(seat,size=2){return seat>0 && seat<=8 ? Math.ceil(seat/size) : 0}
function sameSide(a,b,teams){return a>0 && b>0 && (a===b || (teams && teamNumber(a,typeof teams==='number'?teams:2)===teamNumber(b,typeof teams==='number'?teams:2)))}
function matchMapChoice(mapId,teams){return selectionConfig(teams && !teamSizes(mapPlayerCount(mapId)).length ? 4 : mapId)}
function teamSizes(players){return players===4?[2]:players===6?[3,2]:players===8?[4,2]:[]}
function validTeams(config){return (config.teams===undefined||typeof config.teams==='boolean')&&(!config.teams||teamSizes(mapPlayerCount(config.map)).includes(config.teamSize??2))}
function teamSetting(container,players,config){
 const group=container.querySelector('.team-settings');
 if(!group)return; // Browsing maps does not include team configuration controls.
 const sizes=teamSizes(players),field=container.querySelector('[name="teams"]'),size=container.querySelector('[name="teamSize"]');
 group.hidden=!sizes.length;
 field.checked=!!config.teams&&sizes.includes(config.teamSize??2);
 size.replaceChildren(...sizes.map(n=>{const o=document.createElement('option');o.value=String(n);o.textContent=Array(players/n).fill(n).join(' v ');return o}));
 size.value=String(sizes.includes(config.teamSize??2)?config.teamSize??2:sizes[0]);
}
if(typeof module!=='undefined')module.exports={mapLayout,defaultMaps,symmetryCopies,nodeAt,sameSide,radialHomes};

function loadMapCatalog(catalog) {
  for(const version of catalog.versions){
    if(!mapVersions.has(version.key))mapVersions.set(version.key,mapLayout(JSON.parse(version.layout)));
  }
  for(const row of catalog.maps){
    const layout=mapVersions.get(row.id+'/'+row.revision);
    if(layout)latestMaps.set(row.id,{...layout,...row});
  }
}
function drawMapPreview(layout,editable=false,selected=''){
  if(!layout)return '';
  // Only validated node IDs and numeric coordinates enter the SVG markup.
  const {nodes,edges,difficulty}=layout;
  const lines=edges.map(([a,b])=>{
    const [x,y]=nodes[a],[u,v]=nodes[b];
    return '<line data-edge="'+a+'-'+b+'" x1="'+x+'" y1="'+y+'" x2="'+u+'" y2="'+v+'"/>';
  });
  const dots=Object.entries(nodes).map(([id,[x,y]])=>{
    const home=id.startsWith('P'), label=home?id:String(difficulty[id]??5);
    return '<g data-node="'+id+'" class="'+(home?'map-home ':'')+(selected===id?'map-selected':'')+'"><title>'+id+' · '+(home?'Starting node':'Difficulty '+label)+'</title><circle cx="'+x+'" cy="'+y+'" r="3.6"/><text x="'+x+'" y="'+y+'">'+label+'</text></g>';
  });
  return '<svg class="map-preview" viewBox="-4 -4 108 108" '+(editable?'tabindex="0" role="application" aria-label="Map editor board"':'role="img" aria-label="'+layout.players+'-player map preview"')+'>'+lines.join('')+dots.join('')+'</svg>';
}
function setupMapPicker(container, config, {minimum=()=>2, maximum=()=>8, showDetails=true}={}) {
  const select=container.querySelector('[name="map"]');
  const counts=container.querySelector('.map-player-count');
  const navigation=container.querySelector('.map-navigation');
  const preview=document.createElement('div'), info=document.createElement('small');
  let pool=[], poolSize;
  function setPool(players){
    poolSize=players;
    pool=[...latestMaps.values()].filter(m=>m.players===players).sort((a,b)=>a.id-b.id);
    select.replaceChildren(...pool.map(m=>{
      const option=document.createElement('option');
      option.value=String(m.id);option.textContent=m.name;
      return option;
    }));
    previous.disabled=next.disabled=pool.length<=1;
  }
  function choose(id){
    select.value=String(id);
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function arrow(step,label,glyph){
    const button=document.createElement('button');
    button.type='button';button.className='map-step';button.textContent=glyph;
    button.setAttribute('aria-label',label);
    button.onclick=()=>{
      const index=pool.findIndex(m=>m.id===Number(select.value));
      if(pool.length>1)choose(pool[(index+step+pool.length)%pool.length].id);
    };
    return button;
  }
  const previous=arrow(-1,'Previous map','‹'),next=arrow(1,'Next map','›');
  navigation.append(previous,preview,next);
  if(showDetails)navigation.append(info);
  const radios=MAP_SEAT_COUNTS.map(players=>{
    const label=document.createElement('label'),radio=document.createElement('input');
    radio.type='radio';radio.name='map-players';radio.value=String(players);
    radio.onchange=event=>{
      // Notify the enclosing settings form once, through its normal map change.
      event.stopPropagation();
      if(radio.checked){setPool(players);teamSetting(container,players,{...config(),teams:false});if(pool.length)choose(pool[0].id)}
    };
    label.append(radio,String(players));counts.append(label);
    return radio;
  });
  function show(){
    const m=latestMaps.get(Number(select.value)),pinned=config();
    const layout=pinned.map===m?.id && pinned.mapRevision ? selectedLayout(pinned) : m;
    preview.innerHTML=drawMapPreview(layout);
    info.hidden=m?.plays===undefined;
    if(showDetails && !info.hidden)info.textContent=m.plays+' plays · Updated '+new Date(Number(m.updatedAt/1000n)).toLocaleDateString();
  }
  function sync(rebuild=false){
    const id=config().map,players=mapPlayerCount(id);
    if(rebuild || players!==poolSize)setPool(players);
    select.value=String(id);
    for(const radio of radios){
      radio.checked=Number(radio.value)===players;
      const count=Number(radio.value);
      radio.disabled=count<minimum()||count>maximum()||![...latestMaps.values()].some(m=>m.players===count);
    }
    teamSetting(container,players,config());
    show();
  }
  select.addEventListener('change',show);
  addEventListener('map-catalog',()=>sync(true));
  sync();
  return sync;
}
