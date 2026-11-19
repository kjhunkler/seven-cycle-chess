function botInterval(){
  switch(transformationConfig().botDifficulty){
    case 'easy': return 3;
    case 'hard': return .75;
    default: return 1.6;
  }
}

function runBotTurns(humans){
  const level=transformationConfig().botDifficulty??'normal';
  for(const node of Object.values(N)){
    if(!node.home||humans.includes(node.home))continue;
    if(level==='easy'){
      botShopTurn(node.home);
      easyBotTurn(node.home);
    }else{
      planBotTurn(node.home,level==='hard');
    }
  }
}

// The original solo opponent samples at most two garrisons per turn.
function easyBotTurn(owner){
  const sources=Object.values(N).filter(n=>n.owner===owner&&!n.disabled&&big(n)>=0)
    .sort(()=>Math.random()-.5).slice(0,2);
  for(const source of sources){
    const type=big(source),amount=source.stock[type];
    if(amount<3)continue;
    let best,score=1;
    for(const id of source.adj){
      const target=N[id];
      if(target.shop||target.disabled)continue;
      const defender=big(target);
      let value;
      if(allies(target.owner,owner))value=target.ut===type&&Math.random()<.3?1.1:0;
      else value=(defender<0?99:amount*botAdvantage(type,defender)/target.stock[defender])*(1+Math.random()*.4);
      if(value>score){best=id;score=value}
    }
    if(best)dispatch(source,best,type,amount);
  }
}

function botAdvantage(type,defender){
  return mult(type,defender)/mult(defender,type);
}

function planBotTurn(owner,hard){
  const nodes=Object.values(N);
  const mine=nodes.filter(n=>n.owner===owner&&!n.shop&&!n.disabled);
  const neighbors=n=>n.adj.map(id=>N[id]).filter(t=>!t.shop&&!t.disabled);
  const rivals=n=>neighbors(n).filter(t=>!allies(t.owner,owner));
  // Express incoming strength in the destination's fruit type.
  const incoming=new Map();
  function record(to,type,count,sender){
    const strength=count*botAdvantage(type,N[to].ut);
    incoming.set(to,(incoming.get(to)||0)+(allies(owner,sender)?strength:-strength));
  }
  for(const g of G)record(g.to,g.type,g.n,g.owner);
  for(const n of mine)for(const o of n.orders)record(o.to,o.type,o.count,o.owner);

  const available=n=>{
    const threat=Math.max(0,-(incoming.get(n.id)||0));
    return Math.max(0,Math.floor(n.stock[n.ut]-Math.max(n.home?1:0,Math.ceil(threat))));
  };
  function send(n,target,count){
    dispatch(n,target.id,n.ut,count);
    record(target.id,n.ut,count,owner);
  }

  const fronts=mine.filter(n=>rivals(n).length);
  if(hard){
    for(const n of [...mine].sort((a,b)=>Number(!!b.home)-Number(!!a.home))){
      let deficit=1-tot(n)-(incoming.get(n.id)||0);
      if(deficit<=0||!(incoming.get(n.id)<0))continue;
      for(const donor of neighbors(n)){
        if(donor.owner!==owner||donor.ut!==n.ut)continue;
        const count=Math.min(available(donor),Math.ceil(deficit));
        if(count>0){send(donor,n,count);deficit-=count}
        if(deficit<=0)break;
      }
    }
  }

  const targets=new Set(fronts.flatMap(rivals));
  const attacks=[];
  for(const t of targets){
    const donors=neighbors(t).filter(n=>n.owner===owner&&available(n)>0);
    if(!donors.length)continue;
    const transit=Math.min(...donors.map(n=>troopTravelTime({from:n.id,to:t.id})));
    const growth=t.owner?Math.ceil(transit*productionMultiplier(productionCycle,t.ut)/CONFIG.outpostRate):0;
    const needed=tot(t)+growth+(t.shields||0)-(incoming.get(t.id)||0);
    if(needed<0)continue;
    const powerFrom=n=>available(n)*botAdvantage(n.ut,t.ut);
    donors.sort((a,b)=>powerFrom(b)-powerFrom(a));
    if(!hard)donors.splice(1);
    const power=donors.reduce((sum,n)=>sum+available(n)*botAdvantage(n.ut,t.ut),0);
    if(power<=needed)continue;
    const priority=(t.home?12:t.owner?2:1)*Math.min(3,power/(needed+1))/(1+transit*.15);
    attacks.push({t,donors,needed,priority});
  }
  for(const {t,donors,needed} of attacks.sort((a,b)=>b.priority-a.priority)){
    if(donors.reduce((sum,n)=>sum+available(n)*botAdvantage(n.ut,t.ut),0)<=needed)continue;
    let remaining=needed;
    for(const n of donors){
      const strength=botAdvantage(n.ut,t.ut);
      const count=Math.min(available(n),Math.floor(remaining/strength)+1+(t.owner?1:0)+(t.home?2:0));
      if(count>0){send(n,t,count);remaining-=count*strength}
      if(remaining<0)break;
    }
  }
  const home=playerHome(owner);
  botShopTurn(owner,Math.max(2,Math.ceil(-(incoming.get(home.id)||0))));
  // Work inward from contested borders so rear garrisons feed the front.
  const distance=new Map(fronts.map(n=>[n,0])),queue=[...fronts];
  for(let i=0;i<queue.length;i++){
    const n=queue[i];
    for(const t of neighbors(n)){
      if(t.owner!==owner||distance.has(t))continue;
      distance.set(t,distance.get(n)+1);queue.push(t);
    }
  }
  for(const n of mine){
    if(n.cd>0||n.orders.length||available(n)<2)continue;
    if(distance.get(n)>0){
      const forward=neighbors(n).filter(t=>distance.get(t)<distance.get(n))
        .sort((a,b)=>Number(b.ut===n.ut)-Number(a.ut===n.ut)||tot(a)-tot(b))[0];
      if(forward.ut===n.ut)send(n,forward,Math.min(available(n),Math.max(0,CONFIG.cap-tot(forward))));
      else if(hard&&forward.cd===0)beginTransformation(n,forward.ut);
    }else if(distance.get(n)===0){
      const target=rivals(n).filter(t=>tot(t)>0&&(incoming.get(t.id)||0)<=tot(t))
        .sort((a,b)=>Number(!!b.home)-Number(!!a.home)||tot(a)-tot(b))[0];
      if(!target)continue;
      const matchup=botAdvantage(n.ut,target.ut);
      if(hard?matchup<=1:matchup<1&&available(n)>=6)beginTransformation(n,(target.ut+T.length-1)%T.length);
    }
  }
}
