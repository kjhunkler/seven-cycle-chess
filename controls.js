/* Routes and their optional troop budgets are simulated by the host. */
let portionPercent=100;
function portionControlEnabled(){return !!transformationConfig().portionControl}
const myPlayer=()=>typeof localPlayer==='undefined'?1:localPlayer;
let castleConquests={};
// Forward/inverse view transforms keep pointer directions aligned with the map.
function boardViewPoint(p,owner,inverse=false){
 if(N.P4)return {x:owner===2||owner===4?100-p.x:p.x,y:owner===1||owner===2?100-p.y:p.y};
 if(N.P3)return rotateBoardPoint(p,(inverse?-1:1)*(owner-1)*2*Math.PI/3);
 return {x:p.x,y:owner===2?100-p.y:p.y};
}
function survivingOwner(owner){while(castleConquests[owner])owner=castleConquests[owner];return owner}
function botShopTurn(owner){
  const castle=N['P'+owner];if(!castle||castle.disabled)return;
  for(const shop of Object.values(N).filter(n=>n.shop&&n.owner===owner)){
    if(shop.abilityReady){const ability={kind:'ability',from:shop.id,to:castle.id};if(typeof applyCommand==='function')applyCommand(owner,ability);else applyRouteCommand(owner,ability);continue}
    if(shop.abilityCd>0)continue;
    const incoming=G.filter(g=>g.to===shop.id&&g.owner===owner).reduce((sum,g)=>sum+g.n,0)+Object.values(N).flatMap(n=>n.orders).filter(o=>o.to===shop.id&&o.owner===owner).reduce((sum,o)=>sum+o.count,0);
    const type=big(castle),count=Math.min(10-shop.charge-incoming,type<0?0:castle.stock[type]-2);
    if(count>0)dispatch(castle,shop.id,type,count);
  }
}
function removeDefeatedShops(owner){
  const removed=new Set(Object.values(N).filter(n=>n.shop&&n.owner===owner).map(n=>n.id));
  if(!removed.size)return;
  for(const n of Object.values(N)){
    n.adj=n.adj.filter(id=>!removed.has(id));
    n.routes=(n.routes||[]).filter(id=>!removed.has(id));
    n.orders=n.orders.filter(order=>{if(!removed.has(order.to))return true;n.stock[n.castle?order.type:n.ut]+=order.count;return false});
    if(n.abilityTargets)n.abilityTargets=n.abilityTargets.filter(id=>!removed.has(id));
  }
  G=G.filter(g=>{if(!removed.has(g.to)&&!removed.has(g.from))return true;const source=N[g.from];if(source&&!source.shop&&!source.disabled)source.stock[source.castle?g.type:source.ut]+=g.n;return false});
  for(const id of removed)delete N[id];
  if(removed.has(sel)){sel=null;closeWheel()}
  if(removed.has(drag?.from)||removed.has(drag?.to))drag=null;
}
function eliminateCastle(castle,winner){
  removeDefeatedShops(castle.owner);
  const loser=castle.owner;castleConquests[loser]=winner;
  const destination=N['P'+winner];
  for(const n of Object.values(N)){
    if(n.owner===loser){n.owner=winner;for(const order of n.orders)order.owner=winner}
    n.adj=n.adj.filter(id=>id!==castle.id);
    n.routes=(n.routes||[]).filter(id=>id!==castle.id);
    n.routeIndex=0;
    n.orders=n.orders.filter(order=>{if(order.to!==castle.id)return true;n.stock[queuedCastle(n)?order.type:n.ut]+=order.count;return false});
    if(n.abilityTargets)n.abilityTargets=n.abilityTargets.filter(id=>id!==castle.id);
  }
  castle.disabled=true;castle.owner=0;castle.q=[];castle.orders=[];castle.routes=[];castle.adj=[];castle.pend=null;castle.cd=0;castle.tm=0;castle.shields=0;castle.boost=0;
  castle.stock.forEach((count,type)=>destination.stock[type]+=count);castle.stock.fill(0);
  G=G.filter(g=>{
    g.owner=survivingOwner(g.owner);
    if(g.to!==castle.id&&g.from!==castle.id)return true;
    const target=g.owner===winner?destination:N[g.from];
    if(target&&!target.disabled)target.stock[target.castle?g.type:target.ut]+=g.n;
    return false;
  });
  sel=null;drag=null;closeWheel();
  const remaining=Object.values(N).filter(n=>n.castle&&!n.disabled);
  over=remaining.length===1?remaining[0].owner:0;
  msg=N['P'+myPlayer()]?.disabled?'Your castle fell. Your fruit joined the captor. Spectating the remaining players.':'A castle fell. Its fruit joined the captor. Keep playing.';
}
function castleFruit(n){
  if(noQueueMode())return n.ut;
  const selected=n.selectedType;
  if(selected==null){
    const strongest=big(n);
    return n.stock[strongest]>CONFIG.strengthEpsilon?strongest:null;
  }
  for(let offset=0;offset<T.length;offset++){
    const type=(selected+offset)%T.length;
    if(n.stock[type]>CONFIG.strengthEpsilon)return type;
  }
  return null;
}
function refreshCastleFruit(n){
  n.selectedType=castleFruit(n);
  if(sel===n.id&&n.owner===myPlayer()&&n.selectedType!=null)sendType=n.selectedType;
}
function castleRouteFruit(n,target){
  const selected=castleFruit(n);
  if(selected!=null&&canEnter(target,n.owner,selected))return selected;
  let best=-1,bestMatch=-Infinity,bestStock=-Infinity;
  for(let i=0;i<T.length;i++){
    const stock=n.stock[i];
    if(stock<=CONFIG.strengthEpsilon||!canEnter(target,n.owner,i))continue;
    const match=target.owner&&!target.castle?mult(i,target.ut):0;
    if(match>bestMatch||match===bestMatch&&stock>bestStock){best=i;bestMatch=match;bestStock=stock;}
  }
  return best;
}
function applyRouteCommand(owner,data){
  if(!['route','stop','cancel','select-troop'].includes(data.kind))return false;
  const n=Object.hasOwn(N,data.node)?N[data.node]:null;
  if(over||!n||n.owner!==owner)return true;
  if(data.kind==='select-troop'){
    if(queuedCastle(n)&&Number.isInteger(data.type)&&data.type>=0&&data.type<T.length&&n.stock[data.type]>CONFIG.strengthEpsilon){n.selectedType=data.type;if(owner===myPlayer())sendType=data.type;}
    return true;
  }
  if(data.kind==='route'&&n.adj.includes(data.to)){
    if(n.castle)refreshCastleFruit(n);
    n.routes??=[];
    if(!n.routes.includes(data.to)){
      if(portionControlEnabled()){
        if(![25,50,75,100].includes(data.portion))return true;
        const stock=tot(n);if(stock<=CONFIG.strengthEpsilon)return true;
        n.routeRemaining??={};
        n.routeRemaining[data.to]=Math.min(stock,Math.max(1,Math.floor(stock*data.portion/100)));
      }
      n.routes.push(data.to);
    }
  }
  if(data.kind==='stop'){n.routes=[];n.routeRemaining={};n.routeIndex=0;}
  if(data.kind==='cancel'){n.pend=null;n.cd=0;n.transformAt=null;}
  return true;
}
function routeCommand(data){
  if(typeof command==='function')command(data);else applyRouteCommand(1,data);
}
(()=>{
  const baseInit=init;
  init=function(){
    baseInit();
    castleConquests={};
    for(const n of Object.values(N)){n.routes=[];n.routeRemaining={};n.routeIndex=0;}
    const duel=TWO_PLAYER_MAPS[transformationConfig().map];
    if(duel){
      for(const group of duel.startGroups)for(const id of group.slice(1)){N[id].ut=N[group[0]].ut;N[id].stock=[...N[group[0]].stock];}
    }else if(N.P4){
      for(const group of [['P1','P2','P3','P4'],['A1','A4','C1','C4'],['A2','A3','C2','C3'],['B1','B3'],['D1','D2']])for(const id of group.slice(1)){N[id].ut=N[group[0]].ut;N[id].stock=[...N[group[0]].stock];}
    }else if(N.D1){
      for(const group of [['P1','P2'],['A1','A3','C1','C3'],['A2','C2'],['B1','B4'],['B2','B3'],['D1','D2','E1','E2']])for(const id of group.slice(1)){N[id].ut=N[group[0]].ut;N[id].stock=[...N[group[0]].stock];}
    }else if(N.P3){
      for(const group of [['P1','P2','P3'],['C2','A1','A3'],['A2','C1','C3']])for(const id of group.slice(1)){N[id].ut=N[group[0]].ut;N[id].stock=[...N[group[0]].stock];}
    }else if(!N.B3){
      for(const [a,b] of [['P1','P2'],['C1','A1'],['C2','A2'],['C3','A3'],['B1','B2']]){N[b].ut=N[a].ut;N[b].stock=[...N[a].stock];}
    }else if(typeof localPlayer!=='undefined'){
      for(const [a,b] of [['P1','P2'],['C1','A1'],['C2','A2'],['C3','A3'],['B1','B4'],['B2','B3']]){
        N[b].ut=N[a].ut;N[b].stock=[...N[a].stock];
      }
    }
    for(const n of Object.values(N))if(n.castle){if(noQueueMode()){n.ut=Math.max(0,big(n));n.q=[]}refreshCastleFruit(n);}
    closeWheel();
    msg='Drag from your castle or an outpost to create a route. Tap to stop; hold to choose or transform.';
  };
  const baseArrive=arrive;
  arrive=function(g){
    g.owner=survivingOwner(g.owner);
    const target=N[g.to];if(!target)return;
    if(target.disabled){const c=N['P'+g.owner];if(c&&!c.disabled)c.stock[g.type]+=g.n;return}
    const owner=target.owner;baseArrive(g);
    if(target.castle&&owner!==g.owner&&over===g.owner){if(Object.values(N).filter(n=>n.castle).length>2)eliminateCastle(target,g.owner);else removeDefeatedShops(owner);}
    if(target.owner!==owner){target.routes=[];target.routeRemaining={};target.routeIndex=0;}
  };
  const baseDepart=depart;
  depart=function(n,dt){
    if(n.disabled)return;
    if(n.castle)refreshCastleFruit(n);
    if(n.routes?.length&&n.departure<=dt&&tot(n)>CONFIG.strengthEpsilon){
      for(let offset=0;offset<n.routes.length;offset++){
        const at=((n.routeIndex||0)+offset)%n.routes.length,to=n.routes[at];
        const type=queuedCastle(n)?castleRouteFruit(n,N[to]):n.stock.findIndex((v,i)=>v>CONFIG.strengthEpsilon&&canEnter(N[to],n.owner,i));
        if(type==null||type<0||n.stock[type]<=CONFIG.strengthEpsilon||!canEnter(N[to],n.owner,type))continue;
        const remaining=n.routeRemaining?.[to];
        const count=Math.min(1,n.stock[type],remaining??Infinity,tot(n)-(remaining==null?1:0),N[to].shop?shopCapacity(N[to]):Infinity);
        if(count<=CONFIG.strengthEpsilon)continue;
        n.stock[type]-=count;
        G.push({from:n.id,to,owner:n.owner,type,n:count,t:0});
        if(remaining!=null){
          n.routeRemaining[to]=Math.max(0,remaining-count);
          if(n.routeRemaining[to]<=CONFIG.strengthEpsilon){
            n.routes.splice(at,1);delete n.routeRemaining[to];
            n.routeIndex=n.routes.length?at%n.routes.length:0;
          }else n.routeIndex=(at+1)%n.routes.length;
        }else n.routeIndex=(at+1)%n.routes.length;
        n.departure=CONFIG.departureInterval+dt;break;
      }
    }
    baseDepart(n,dt);
    if(n.castle)refreshCastleFruit(n);
  };
  const baseSelect=select;
  select=function(id){baseSelect(id);if(N[id]?.castle&&N[id].selectedType!=null)sendType=N[id].selectedType;};
  send=function(from,to){if(N[from]?.owner!==myPlayer())return;if(N[from]?.shop)routeCommand({kind:'ability',from,to});else routeCommand({kind:'route',node:from,to,portion:portionPercent});};
  const baseAct=act;
  act=function(a){
    if(noQueueMode()&&(a[0]==='q'||a.startsWith('dropq')))return;
    if(a==='cancel'){routeCommand({kind:'cancel',node:sel});return;}
    if(a.startsWith('dropq')){
      const index=Number(a.slice(5));
      if(typeof command==='function')command({kind:'dequeue',index});
      else if(Number.isInteger(index)&&index>=0&&index<N['P'+myPlayer()].q.length)N['P'+myPlayer()].q.splice(index,1);
      return;
    }
    baseAct(a);
  };
  let wheelNode=null;
  closeWheel=function(){typeWheel.hidden=true;wheelNode=null;};
  openWheel=function(id,x,y){
    const n=N[id];if(over||!n||n.shop||n.cd>0||n.owner!==myPlayer())return;
    select(id);wheelNode=id;typeWheel.dataset.node=id;
    if(drag)drag.held=true;
    typeWheel.innerHTML='';
    typeWheel.setAttribute('aria-description','Clockwise: each fruit hard counters the next fruit and soft counters the fruit two steps ahead.');
    T.forEach((_,i)=>{
      const hint=document.createElement('div'),angle=2*Math.PI*(i+.5)/T.length-Math.PI/2;
      hint.className='wheel-counter-direction';hint.textContent='›';hint.setAttribute('aria-hidden','true');
      hint.style.left=102+75*Math.cos(angle)+'px';hint.style.top=102+75*Math.sin(angle)+'px';
      hint.style.transform=`translate(-50%,-50%) rotate(${angle*180/Math.PI+90}deg)`;
      typeWheel.append(hint);
    });
    T.forEach(([emoji,name],i)=>{
      const b=document.createElement('button'),a=2*Math.PI*i/T.length-Math.PI/2;
      b.style.left=102+75*Math.cos(a)+'px';b.style.top=102+75*Math.sin(a)+'px';
      b.textContent=emoji;b.dataset.type=i;b.setAttribute('aria-label',queuedCastle(n)?`${name}, ${Math.ceil(n.stock[i])} available`:'Produce '+name);
      b.setAttribute('aria-pressed',String(queuedCastle(n)?n.selectedType===i:(n.pend??n.ut)===i));
      b.disabled=queuedCastle(n)&&n.stock[i]<=CONFIG.strengthEpsilon;
      if((queuedCastle(n)?n.selectedType===i:(n.pend??n.ut)===i))b.className='on';
      b.onclick=()=>{if(N[id].owner===myPlayer()){
        if(queuedCastle(n))routeCommand({kind:'select-troop',node:id,type:i});
        else {select(id);act('p'+i);}
      }closeWheel();pl=0;};typeWheel.append(b);
    });
    const marker=map.querySelector(`[data-id="${id}"] circle:nth-child(2)`)||map.querySelector(`[data-id="${id}"] circle`);
    const rect=marker?.getBoundingClientRect(),cx=rect?rect.left+rect.width/2:x,cy=rect?rect.top+rect.height/2:y;
    const room=Math.max(0,Math.min(cx,innerWidth-cx,cy,innerHeight-cy)-8),scale=Math.max(.55,Math.min(1,room/102));
    typeWheel.style.setProperty('--wheel-hole',`${Math.max(22,(rect?.width||0)/2+8)}px`);
    typeWheel.style.left=cx+'px';typeWheel.style.top=cy+'px';typeWheel.style.transform=`translate(-50%,-50%) scale(${scale})`;typeWheel.hidden=false;pl=0;
  };
  const point=(x,y)=>{const p=new DOMPoint(x,y).matrixTransform(map.getScreenCTM().inverse());return boardViewPoint(p,myPlayer(),true);};
  const snap=(id,x,y)=>{
    const a=N[id],targets=a.shop?a.abilityTargets||[]:a.adj,p=point(x,y),dx=p.x-a.x,dy=p.y-a.y,len=Math.hypot(dx,dy);
    if(len<7)return null;
    let best=null,score=.82;
    for(const to of targets){const b=N[to],vx=b.x-a.x,vy=b.y-a.y,c=(dx*vx+dy*vy)/(len*Math.hypot(vx,vy));if(c>score){best=to;score=c;}}
    return best;
  };
  const routeTarget=(id,x,y)=>{
    const hit=document.elementFromPoint?.(x,y)?.closest('[data-id]')?.dataset.id;
    return hit&&(N[id].shop?N[hit]?.owner===myPlayer()&&!N[hit].shop:N[id].adj.includes(hit))?hit:snap(id,x,y);
  };
  document.addEventListener('pointerdown',e=>{if(!typeWheel.hidden&&!typeWheel.contains(e.target)&&!e.target.closest('[data-id]'))closeWheel();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeWheel();});
  map.addEventListener('contextmenu',e=>e.preventDefault());
  map.addEventListener('pointerdown',e=>{
    if(e.button!==0||drag)return;e.preventDefault();
    const id=e.target.closest('[data-id]')?.dataset.id;
    if(!id){closeWheel();sel=null;return;}
    if(over||N[id].owner!==myPlayer()){closeWheel();return;}
    const wasOpen=wheelNode===id;closeWheel();
    drag={id:e.pointerId,from:id,startX:e.clientX,startY:e.clientY,moved:false,wasOpen};
    map.setPointerCapture(e.pointerId);
    holdTimer=setTimeout(()=>{if(drag&&!drag.moved){if(!N[id].castle)routeCommand({kind:'stop',node:id});openWheel(id,e.clientX,e.clientY);}},CONFIG.holdMs);
  });
  map.addEventListener('pointermove',e=>{
    if(drag?.id!==e.pointerId)return;e.preventDefault();
    if(drag.held){
      const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-type]');
      typeWheel.querySelectorAll('button').forEach(b=>b.classList.toggle('hover',b===hit));return;
    }
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6){drag.moved=true;clearTimeout(holdTimer);}
    if(drag.moved){if(!N[drag.from]?.shop)select(drag.from);drag.x=e.clientX;drag.y=e.clientY;drag.to=routeTarget(drag.from,e.clientX,e.clientY);pl=0;}
  });
  map.addEventListener('pointerup',e=>{
    if(drag?.id!==e.pointerId)return;e.preventDefault();clearTimeout(holdTimer);
    const d=drag;
    if(d.held){const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-type]');if(b&&typeWheel.contains(b))b.click();}
    else if(d.moved){d.to=routeTarget(d.from,e.clientX,e.clientY);if(d.to)send(d.from,d.to);}
    else {const selected=sel===d.from;routeCommand({kind:'stop',node:d.from});select(d.from);if(selected&&!d.wasOpen)openWheel(d.from,e.clientX,e.clientY);}
    drag=null;pl=0;
  });
  const abort=()=>{clearTimeout(holdTimer);if(drag?.held)closeWheel();drag=null;};
  map.addEventListener('pointercancel',abort);map.addEventListener('lostpointercapture',abort);
  init();
})();
