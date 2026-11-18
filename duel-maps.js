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
function mapPlayerCount(id){return id===4?4:[3,6].includes(id)?3:2}
