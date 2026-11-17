/* Persistent routes are simulated by the host and included in normal snapshots. */
const myPlayer=()=>typeof localPlayer==='undefined'?1:localPlayer;
function applyRouteCommand(owner,data){
  if(!['route','stop','cancel'].includes(data.kind))return false;
  const n=Object.hasOwn(N,data.node)?N[data.node]:null;
  if(over||!n||n.owner!==owner)return true;
  if(data.kind==='route'&&n.adj.includes(data.to)){
    n.routes??=[];if(!n.routes.includes(data.to))n.routes.push(data.to);
  }
  if(data.kind==='stop'){n.routes=[];n.routeIndex=0;}
  if(data.kind==='cancel'){n.pend=null;n.cd=0;}
  return true;
}
function routeCommand(data){
  if(typeof command==='function')command(data);else applyRouteCommand(1,data);
}
(()=>{
  const baseInit=init;
  init=function(){
    baseInit();
    for(const n of Object.values(N)){n.routes=[];n.routeIndex=0;}
    if(typeof localPlayer!=='undefined'){
      for(const [a,b] of [['P1','P2'],['C1','A1'],['C2','A2'],['C3','A3'],['B1','B4'],['B2','B3']]){
        N[b].ut=N[a].ut;N[b].stock=[...N[a].stock];
      }
    }
    msg='Drag along a line to send continuously. Tap to stop; hold to transform.';
  };
  const baseArrive=arrive;
  arrive=function(g){const owner=N[g.to].owner;baseArrive(g);if(N[g.to].owner!==owner){N[g.to].routes=[];N[g.to].routeIndex=0;}};
  const baseDepart=depart;
  depart=function(n,dt){
    if(n.routes?.length&&n.departure<=dt&&tot(n)>1+CONFIG.strengthEpsilon){
      for(let offset=0;offset<n.routes.length;offset++){
        const at=((n.routeIndex||0)+offset)%n.routes.length,to=n.routes[at];
        const type=n.stock.findIndex((v,i)=>v>CONFIG.strengthEpsilon&&canEnter(N[to],n.owner,i));
        if(type<0)continue;
        const count=Math.min(1,n.stock[type],tot(n)-1);
        n.stock[type]-=count;
        G.push({from:n.id,to,owner:n.owner,type,n:count,t:0});
        n.routeIndex=(at+1)%n.routes.length;n.departure=CONFIG.departureInterval+dt;break;
      }
    }
    baseDepart(n,dt);
  };
  send=function(from,to){if(N[from]?.owner===myPlayer())routeCommand({kind:'route',node:from,to});};
  const baseAct=act;
  act=function(a){if(a==='cancel'){routeCommand({kind:'cancel',node:sel});return;}baseAct(a);};
  let wheelNode=null;
  closeWheel=function(){typeWheel.hidden=true;wheelNode=null;};
  openWheel=function(id,x,y){
    const n=N[id];if(over||!n||n.castle||n.cd>0||n.owner!==myPlayer())return;
    select(id);wheelNode=id;
    if(drag)drag.held=true;
    typeWheel.innerHTML='<span>Transform</span>';
    T.forEach(([emoji,name],i)=>{
      const b=document.createElement('button'),a=2*Math.PI*i/T.length-Math.PI/2;
      b.style.left=102+75*Math.cos(a)+'px';b.style.top=102+75*Math.sin(a)+'px';
      b.textContent=emoji;b.dataset.type=i;b.setAttribute('aria-label','Produce '+name);b.setAttribute('aria-pressed',String(n.ut===i));
      if(n.ut===i)b.className='on';
      b.onclick=()=>{if(N[id].owner===myPlayer()){select(id);act('p'+i);}closeWheel();pl=0;};typeWheel.append(b);
    });
    typeWheel.style.left=Math.max(4,Math.min(innerWidth-212,x-104))+'px';
    typeWheel.style.top=Math.max(4,Math.min(innerHeight-212,y-104))+'px';typeWheel.hidden=false;pl=0;
  };
  const point=(x,y)=>{const p=new DOMPoint(x,y).matrixTransform(map.getScreenCTM().inverse());if(myPlayer()===2)p.y=100-p.y;return p;};
  const snap=(id,x,y)=>{
    const a=N[id],p=point(x,y),dx=p.x-a.x,dy=p.y-a.y,len=Math.hypot(dx,dy);
    if(len<7)return null;
    let best=null,score=.82;
    for(const to of a.adj){const b=N[to],vx=b.x-a.x,vy=b.y-a.y,c=(dx*vx+dy*vy)/(len*Math.hypot(vx,vy));if(c>score){best=to;score=c;}}
    return best;
  };
  const routeTarget=(id,x,y)=>{
    const hit=document.elementFromPoint?.(x,y)?.closest('[data-id]')?.dataset.id;
    return hit&&N[id].adj.includes(hit)?hit:snap(id,x,y);
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
    holdTimer=setTimeout(()=>{if(drag&&!drag.moved){routeCommand({kind:'stop',node:id});openWheel(id,e.clientX,e.clientY);}},CONFIG.holdMs);
  });
  map.addEventListener('pointermove',e=>{
    if(drag?.id!==e.pointerId)return;e.preventDefault();
    if(drag.held){
      const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-type]');
      typeWheel.querySelectorAll('button').forEach(b=>b.classList.toggle('hover',b===hit));return;
    }
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6){drag.moved=true;clearTimeout(holdTimer);}
    if(drag.moved){select(drag.from);drag.to=routeTarget(drag.from,e.clientX,e.clientY);pl=0;}
  });
  map.addEventListener('pointerup',e=>{
    if(drag?.id!==e.pointerId)return;e.preventDefault();clearTimeout(holdTimer);
    const d=drag;
    if(d.held){const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-type]');if(b&&typeWheel.contains(b))b.click();else closeWheel();}
    else if(d.moved){d.to=routeTarget(d.from,e.clientX,e.clientY);if(d.to)send(d.from,d.to);}
    else {const selected=sel===d.from;routeCommand({kind:'stop',node:d.from});select(d.from);if(selected&&!d.wasOpen)openWheel(d.from,e.clientX,e.clientY);}
    drag=null;pl=0;
  });
  const abort=()=>{clearTimeout(holdTimer);if(drag?.held)closeWheel();drag=null;};
  map.addEventListener('pointercancel',abort);map.addEventListener('lostpointercapture',abort);
  init();
})();
