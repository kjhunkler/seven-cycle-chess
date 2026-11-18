/* Routes and their optional troop budgets are simulated by the host. */
let portionPercent=100;
let soloPlayId;
function portionControlEnabled(){return !!transformationConfig().portionControl}
const myPlayer=()=>typeof localPlayer==='undefined'?1:localPlayer;
let eliminatedBy={};
// Forward/inverse view transforms keep pointer directions aligned with the map.
function boardViewPoint(p,owner,inverse=false){
 if(N.P4)return {x:owner===2||owner===4?100-p.x:p.x,y:owner===1||owner===2?100-p.y:p.y};
 if(N.P3)return rotateBoardPoint(p,(inverse?-1:1)*(owner-1)*2*Math.PI/3);
 return {x:p.x,y:owner===2?100-p.y:p.y};
}
function survivingOwner(owner){while(eliminatedBy[owner])owner=eliminatedBy[owner];return owner}
function botShopTurn(owner){
  const homeNode=playerHome(owner);if(!homeNode)return;
  for(const shop of Object.values(N).filter(n=>n.shop&&n.owner===owner)){
    if(shop.abilityReady){const ability={kind:'ability',from:shop.id,to:homeNode.id};if(typeof applyCommand==='function')applyCommand(owner,ability);else applyRouteCommand(owner,ability);continue}
    if(shop.abilityCd>0)continue;
    const incoming=G.filter(g=>g.to===shop.id&&g.owner===owner).reduce((sum,g)=>sum+g.n,0)+Object.values(N).flatMap(n=>n.orders).filter(o=>o.to===shop.id&&o.owner===owner).reduce((sum,o)=>sum+o.count,0);
    const type=big(homeNode),count=Math.min(10-shop.charge-incoming,type<0?0:homeNode.stock[type]-2);
    if(count>0)dispatch(homeNode,shop.id,type,count);
  }
}
function removeDefeatedShops(owner){
  const removed=new Set(Object.values(N).filter(n=>n.shop&&n.owner===owner).map(n=>n.id));
  if(!removed.size)return;
  for(const n of Object.values(N)){
    n.adj=n.adj.filter(id=>!removed.has(id));
    n.routes=(n.routes||[]).filter(id=>!removed.has(id));
    n.orders=n.orders.filter(order=>{if(!removed.has(order.to))return true;n.stock[n.ut]+=order.count;return false});
    if(n.abilityTargets)n.abilityTargets=n.abilityTargets.filter(id=>!removed.has(id));
  }
  G=G.filter(g=>{if(!removed.has(g.to)&&!removed.has(g.from))return true;const source=N[g.from];if(source&&!source.shop&&!source.disabled)source.stock[source.ut]+=g.n;return false});
  for(const id of removed)delete N[id];
  if(removed.has(sel)){sel=null;closeWheel()}
  if(removed.has(drag?.from)||removed.has(drag?.to))drag=null;
}
function playerHome(owner){return Object.values(N).find(n=>n.home===owner)}
function isEliminated(owner){return !!eliminatedBy[owner]}
function eliminatePlayer(loser,winner){
  removeDefeatedShops(loser);
  eliminatedBy[loser]=winner;
  for(const n of Object.values(N)){
    if(n.home===loser)n.home=0;
    if(n.owner===loser){n.owner=winner;for(const order of n.orders)order.owner=winner;}
  }
  for(const g of G)g.owner=survivingOwner(g.owner);
  sel=null;drag=null;closeWheel();
  const remaining=Object.values(N).filter(n=>n.home);
  over=remaining.length===1?remaining[0].home:0;
  if(typeof botConfig!=='undefined' && soloPlayId && (loser===1 || over===1) && typeof finishSoloPlay==='function'){
    finishSoloPlay(soloPlayId,botConfig.map,over===1);soloPlayId=undefined;
  }
  msg=isEliminated(myPlayer())?'You were eliminated. Your fruit joined the captor. Spectating the remaining players.':'A player was eliminated. Keep playing.';
}
function capturedHome(node,loser,winner){
  // Only the name moves. The captured and replacement nodes retain their normal state.
  const next=transformationConfig().fullElimination?Object.values(N).filter(n=>!n.shop&&n.owner===loser).sort((a,b)=>tot(b)-tot(a)||a.id.localeCompare(b.id))[0]:null;
  node.home=0;
  if(next)next.home=loser;
  else eliminatePlayer(loser,winner);
}
function applyRouteCommand(owner,data){
  if(!['route','stop','cancel'].includes(data.kind))return false;
  const n=Object.hasOwn(N,data.node)?N[data.node]:null;
  if(over||!n||n.owner!==owner)return true;
  if(data.kind==='route'&&n.adj.includes(data.to)){
    n.routes??=[];
    if(!n.routes.includes(data.to)){
      if(portionControlEnabled()){
        if(![25,50,75,100].includes(data.portion))return true;
        const stock=tot(n);if(stock<=CONFIG.strengthEpsilon)return true;
        n.routeRemaining??={};
        n.routeRemaining[data.to]=Math.min(stock,Math.max(1,Math.floor(stock*data.portion/100)));
      }
      n.routes.push(data.to);
      if(typeof botConfig!=='undefined' && owner===1 && !soloPlayId && typeof recordSoloPlay==='function')soloPlayId=recordSoloPlay(botConfig.map);
    }
  }
  if(data.kind==='stop'){n.routes=[];n.routeRemaining={};n.routeIndex=0;}
  if(data.kind==='cancel'){n.pend=null;n.cd=0;n.transformAt=null;}
  return true;
}
function routeCommand(data){
  if(typeof command==='function')command(data);else applyRouteCommand(1,data);
}
function bounceTroop(g,progress){
  [g.from,g.to]=[g.to,g.from];
  g.t=g.previous=progress;
  if(typeof unitCorrections!=='undefined')unitCorrections.delete(g.id);
}
(()=>{
  const baseInit=init;
  init=function(){
    baseInit();
    soloPlayId=undefined;
    eliminatedBy={};
    for(const n of Object.values(N)){n.routes=[];n.routeRemaining={};n.routeIndex=0;}
    for(const group of selectedLayout(transformationConfig()).startGroups){
      const first=N[group[0]];
      for(const id of group.slice(1)){N[id].ut=first.ut;N[id].stock=[...first.stock]}
    }
    for(const n of Object.values(N))if(n.home){n.ut=Math.max(0,big(n));}
    closeWheel();
    msg='Drag from your nodes to create a route. Tap to stop; hold to choose or transform.';
  };
  const baseArrive=arrive;
  arrive=function(g){
    g.owner=survivingOwner(g.owner);
    const target=N[g.to];if(!target)return;
    if(target.disabled)return;
    if(!target.shop&&target.owner===g.owner&&!canEnter(target,g.owner,g.type)){
      bounceTroop(g,0);
      G.push(g);return;
    }
    const owner=target.owner,home=target.home;baseArrive(g);
    if(home&&target.owner!==owner)capturedHome(target,home,g.owner);
    if(target.owner!==owner){target.routes=[];target.routeRemaining={};target.routeIndex=0;}
  };
  const baseDepart=depart;
  depart=function(n,dt){
    if(n.disabled)return;
    if(n.routes?.length&&n.departure<=dt&&tot(n)>CONFIG.strengthEpsilon){
      for(let offset=0;offset<n.routes.length;offset++){
        const at=((n.routeIndex||0)+offset)%n.routes.length,to=n.routes[at];
        const type=n.stock[n.ut]>CONFIG.strengthEpsilon&&canEnter(N[to],n.owner,n.ut)?n.ut:-1;
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
  };
  send=function(from,to){if(N[from]?.owner!==myPlayer())return;if(N[from]?.shop)routeCommand({kind:'ability',from,to});else routeCommand({kind:'route',node:from,to,portion:portionPercent});};
  const baseAct=act;
  act=function(a){
    if(a==='cancel'){routeCommand({kind:'cancel',node:sel});return;}
    baseAct(a);
  };
  const tapSlop=6;
  let wheelNode=null;
  closeWheel=function(){typeWheel.hidden=true;wheelNode=null;};
  openWheel=function(id,x,y){
    const n=N[id];if(over||!n||n.shop||n.owner!==myPlayer())return;
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
      b.textContent=emoji;b.dataset.type=i;b.setAttribute('aria-label','Produce '+name);
      b.setAttribute('aria-pressed',String((n.pend??n.ut)===i));
      b.disabled=false;
      if(((n.pend??n.ut)===i))b.className='on';
      const choose=()=>{
        const node=N[id];
        if(wheelNode!==id||!typeWheel.contains(b)||node?.owner!==myPlayer())return;
        select(id);
        act(node.cd>0&&(i===node.ut||i===node.pend)?'cancel':'p'+i);
        closeWheel();pl=0;
      };
      let press=null;
      b.addEventListener('pointerdown',e=>{
        if(e.button!==0||!e.isPrimary)return;
        press={id:e.pointerId,x:e.clientX,y:e.clientY};
        b.setPointerCapture(e.pointerId);
      });
      b.addEventListener('pointerup',e=>{
        if(press?.id!==e.pointerId)return;
        const nearPress=Math.hypot(e.clientX-press.x,e.clientY-press.y)<=tapSlop;
        const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('button');
        press=null;
        if(hit===b||(nearPress&&!typeWheel.contains(hit)))choose();
      });
      b.addEventListener('lostpointercapture',e=>{
        if(press?.id===e.pointerId)press=null;
      });
      // Keyboard activation and the board's hold-and-drag release both use click.
      b.onclick=e=>{if(e.detail===0)choose();};
      typeWheel.append(b);
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
  typeWheel.addEventListener('dragstart',e=>e.preventDefault());
  map.addEventListener('contextmenu',e=>e.preventDefault());
  map.addEventListener('pointerdown',e=>{
    if(e.button!==0||drag)return;e.preventDefault();
    const id=e.target.closest('[data-id]')?.dataset.id;
    if(!id){closeWheel();sel=null;return;}
    if(over||N[id].owner!==myPlayer()){closeWheel();return;}
    const wasOpen=wheelNode===id;closeWheel();
    drag={id:e.pointerId,from:id,startX:e.clientX,startY:e.clientY,moved:false,wasOpen};
    map.setPointerCapture(e.pointerId);
    holdTimer=setTimeout(()=>{if(drag&&!drag.moved){if(!(N[id]?.cd>0))routeCommand({kind:'stop',node:id});openWheel(id,e.clientX,e.clientY);}},CONFIG.holdMs);
  });
  map.addEventListener('pointermove',e=>{
    if(drag?.id!==e.pointerId)return;e.preventDefault();
    if(drag.held){
      const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-type]');
      typeWheel.querySelectorAll('button').forEach(b=>b.classList.toggle('hover',b===hit));return;
    }
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>tapSlop){drag.moved=true;clearTimeout(holdTimer);}
    if(drag.moved){if(!N[drag.from]?.shop)select(drag.from);drag.x=e.clientX;drag.y=e.clientY;drag.to=routeTarget(drag.from,e.clientX,e.clientY);pl=0;}
  });
  map.addEventListener('pointerup',e=>{
    if(drag?.id!==e.pointerId)return;e.preventDefault();clearTimeout(holdTimer);
    const d=drag;
    if(d.held){const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-type]');if(b&&typeWheel.contains(b))b.click();}
    else if(d.moved){d.to=routeTarget(d.from,e.clientX,e.clientY);if(d.to)send(d.from,d.to);}
    else if(N[d.from]?.cd>0)openWheel(d.from,e.clientX,e.clientY);
    else {const selected=sel===d.from;routeCommand({kind:'stop',node:d.from});select(d.from);if(selected&&!d.wasOpen)openWheel(d.from,e.clientX,e.clientY);}
    drag=null;pl=0;
  });
  const abort=()=>{clearTimeout(holdTimer);if(drag?.held)closeWheel();drag=null;};
  map.addEventListener('pointercancel',abort);map.addEventListener('lostpointercapture',abort);
  init();
})();
