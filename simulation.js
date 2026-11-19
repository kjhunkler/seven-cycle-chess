// Movement uses map coordinates so viewport size does not affect speed.
// CONFIG.travel is the time to cross a standard 22-unit connection.
function troopTravelTime(unit){
 const from=N[unit.from],to=N[unit.to];
 return CONFIG.travel*Math.max(Math.hypot(to.x-from.x,to.y-from.y),1e-8)/22;
}
// Simulation time is authoritative; wave boundaries follow game speed and pause with play.
let transformationClock=0;
function transformationConfig(){return typeof botConfig!=='undefined'?botConfig:lobbyConfig}
function transformationPeriod(){return transformationConfig().transformationTime??10}
function beginTransformation(node,type){
 node.pend=type;node.tm=0;
 // Snapshot the cost so reinforcements arriving during a transformation do not
 // increase it.  Troops are removed progressively below, one at a time.
 node.transformationPenaltyTotal=transformationConfig().transformationPenalty?Math.floor(tot(node)*.15):0;
 node.transformationPenaltyLost=0;
 if(transformationConfig().transformationWave){
  const period=transformationPeriod();
  node.transformAt=(Math.floor((transformationClock+1e-8)/period)+1)*period;
  node.cd=node.transformAt-transformationClock;
 }else{node.transformAt=null;node.cd=CONFIG.cooldown}
 node.transformationPenaltyDuration=node.cd;
}
function advanceTransformation(node,dt){
 node.cd=node.transformAt!=null?Math.max(0,node.transformAt-transformationClock):Math.max(0,node.cd-dt);
 if(node.cd<1e-8)node.cd=0;
 const total=node.transformationPenaltyTotal||0;
 const due=Math.floor(total*(1-node.cd/Math.max(node.transformationPenaltyDuration||node.cd,1e-8)));
 while((node.transformationPenaltyLost||0)<due&&tot(node)>0){
  const type=big(node);
  if(type<0)break;
  node.stock[type]=Math.max(0,node.stock[type]-1);
  node.transformationPenaltyLost=(node.transformationPenaltyLost||0)+1;
  // board-ui reads this transient value to replay the node shake for each loss.
  node.shake=.5;
 }
}
function finishTransformation(node){
 const count=tot(node);
 node.ut=node.pend;
 node.pend=null;
 node.transformAt=null;
 node.stock.fill(0);
 node.stock[node.ut]=count;
 delete node.transformationPenaltyTotal;
 delete node.transformationPenaltyLost;
 delete node.transformationPenaltyDuration;
}
function bounceTransformedTroops(transformed){
 for(const group of G){
  const target=N[group.to];
  if(transformed.includes(target)&&allies(survivingOwner(group.owner),target.owner)&&group.type!==target.ut){
   bounceTroop(group,1-group.t);
  }
 }
}
function transformationProgress(node){
 const duration=transformationConfig().transformationWave?transformationPeriod():CONFIG.cooldown;
 return Math.max(0,Math.min(1,1-node.cd/duration));
}

function productionMultiplier(population){
 if(!transformationConfig().diminishingReturns)return 1;
 // Interpolate from 2x at one fruit to 1x at ten and 0.5x at twenty.
 if(population<=10)return 2-(Math.max(1,population)-1)/9;
 return Math.max(.5,1-(population-10)/20);
}
function advanceProduction(node,dt){
 const population=tot(node);
 node.tm+=dt*productionMultiplier(population);
 if(node.tm+CONFIG.strengthEpsilon<CONFIG.outpostRate)return;
 node.tm=Math.max(0,node.tm-CONFIG.outpostRate);
 if(population<CONFIG.cap)node.stock[node.ut]+=1;
}
