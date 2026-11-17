/* Shared presentation layer. Simulation and network commands stay in each edition. */
(() => {
  const board = document.getElementById('map');
  if (!board) return;
  // Presentation helpers belong here, independent of each edition's simulation.
  const strengthLabel = value => Number(value.toFixed(2));
  const player = () => typeof localPlayer === 'undefined' ? 1 : localPlayer;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const storage = { get(key) { try { return localStorage.getItem(key); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, value); } catch {} } };
  let motion = storage.get('fw-motion') !== 'off', haptics = storage.get('fw-haptics') !== 'off';
  const animated = () => motion && !reduced.matches;
  const vibrate = pattern => { if (haptics && typeof navigator.vibrate === 'function' && !document.hidden) { try { navigator.vibrate(pattern); } catch {} } };
  const fruitPaths = [
    '<path d="M12 7C3 2 1 13 7 20c2 2 4 0 5 0s3 2 5 0C23 13 21 2 12 7Z" fill="#f26574"/><path d="M12 7c-1-4 2-5 5-4-1 3-3 4-5 4" fill="#8fd5a0"/>',
    '<circle cx="12" cy="13" r="9" fill="#ffad48"/><path d="M11 5c1-5 5-4 7-3-1 4-4 4-7 3" fill="#89cb84"/><path d="M6 12c0-2 1-3 3-4"/>',
    '<path d="M4 5c0 9 6 13 15 8-2 9-16 10-17-2Z" fill="#f5d565"/><path d="m4 5 1-3M19 13l2-2" stroke="#bb934c"/><path d="M5 11c2 6 6 7 10 5"/>',
    '<path d="M12 2c5 0 3 5 8 11 5 10-19 14-17 1C4 8 8 2 12 2Z" fill="#8bc56b" stroke="#477e59"/><circle cx="12" cy="15" r="4" fill="#a66a47" stroke="none"/>',
    '<g fill="#8299ed" stroke="#5268ad"><circle cx="8" cy="14" r="6"/><circle cx="16" cy="15" r="6"/><circle cx="12" cy="7" r="6"/></g><path d="m10 6 2 2 2-2" stroke="#d4ddff"/>',
    '<path d="M12 6C1 1 0 21 11 22 23 23 23 4 15 5Z" fill="#b28be4"/><path d="M12 6c0-4 3-5 6-4-1 3-3 4-6 4" fill="#8fcba4"/><path d="M7 10c-1 2-1 4 0 6"/>',
    '<circle cx="12" cy="12" r="10" fill="#a67954"/><ellipse cx="12" cy="10" rx="8" ry="7" fill="#fff0cf"/><ellipse cx="12" cy="10" rx="4" ry="3" fill="#d9ba8b" stroke="none"/>'
  ];
  const art = i => `<g stroke="#ffffff80" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${fruitPaths[i]}</g>`;
  const icon = (i, cls='fruit-icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${art(i)}</svg>`;
  const castle = '<path d="M3 21V9h4V3h4v5h2V3h4v6h4v12H3Z" fill="#f6eacb" stroke="#a99d82" stroke-width="1.1"/><path d="M10 21v-6a2 2 0 0 1 4 0v6" fill="#6d7483"/><path d="M5 11h3m8 0h3" stroke="#a99d82"/>';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shell = document.createElement('section');
  shell.className = 'battle-shell';
  shell.innerHTML = '';
  board.before(shell); shell.append(board);
  board.setAttribute('viewBox','-5 -7 110 116');
  board.setAttribute('role','group');
  board.setAttribute('aria-label','Battlefield. Focus a node and press Enter to select. Select a connected node and press Enter to send troops.');
  const footer = document.createElement('div');
  footer.className = 'battle-footer';
  footer.innerHTML = '<span><i class="key-dot ally"></i> Your territory</span><span><i class="key-dot enemy"></i> Rival</span><span><i class="key-dot neutral"></i> Unclaimed</span><span class="board-hint">Drag to route · Tap to stop</span>';
  shell.append(footer);
  const settings = document.createElement('div'); settings.className = 'feedback-settings';
  settings.innerHTML = '<button type="button" id="motion-toggle"></button><button type="button" id="haptic-toggle"></button>';
  (document.querySelector('#match-profile')||document.querySelector('#lobby')||document.querySelector('#friends-panel'))?.append(settings);
  const endgame=document.createElement('dialog');endgame.className='endgame-dialog';
  endgame.innerHTML='<p class="endgame-message"></p><div class="endgame-actions"><button type="button" class="endgame-retry">Play again</button><button type="button" class="endgame-close">Close</button></div>';
  document.body.append(endgame);
  const endgameMessage=endgame.querySelector('.endgame-message'),retryButton=endgame.querySelector('.endgame-retry'),closeButton=endgame.querySelector('.endgame-close');
  const closeEndgame=()=>{if(typeof endgame.close==='function')endgame.close();else endgame.removeAttribute?.('open');};
  closeButton.addEventListener('click',closeEndgame);
  retryButton.addEventListener('click',()=>{
    closeEndgame();
    if(typeof online==='undefined')act('restart');
    else if(parent!==window)parent.postMessage({kind:'leave-match'},location.origin);
  });
  const updateSettings = () => {
    document.documentElement.dataset.motion = animated() ? 'on' : 'off';
    const m=document.getElementById('motion-toggle'), h=document.getElementById('haptic-toggle');
    m.textContent = reduced.matches ? 'Motion: reduced' : `Motion: ${motion?'on':'off'}`; m.setAttribute('aria-pressed',String(animated())); m.disabled=reduced.matches;
    h.textContent = typeof navigator.vibrate !== 'function' ? 'Haptics unavailable' : `Haptics: ${haptics?'on':'off'}`; h.disabled=typeof navigator.vibrate !== 'function'; h.setAttribute('aria-pressed',String(haptics));
  };
  document.getElementById('motion-toggle').onclick=()=>{motion=!motion;storage.set('fw-motion',motion?'on':'off');updateSettings()};
  document.getElementById('haptic-toggle').onclick=()=>{haptics=!haptics;storage.set('fw-haptics',haptics?'on':'off');updateSettings();vibrate(15)};
  reduced.addEventListener('change',updateSettings);updateSettings();
  let effects=[], previousNodes=null, previousWinner=0, modalWinner=0, panelHTML='', statusHTML='';
  const burst = (n, color) => effects.push({x:n.x,y:n.y,color,start:performance.now()});
  const originalInit=init;
  init=function(){originalInit();effects=[];previousNodes=null;previousWinner=0;modalWinner=0;panelHTML='';statusHTML='';closeEndgame()};
  const originalArrive=arrive;
  arrive=function(g){const n=N[g.to];if(n.owner!==g.owner&&vis().has(n.id))burst(n,'#f5d765');return originalArrive(g)};
  const originalSelect=select;
  select=function(id){if(sel!==id&&N[id]?.owner===player())vibrate(9);return originalSelect(id)};
  const originalSend=send;
  send=function(from,to){
    const a=N[from], b=N[to], ok=!over&&a?.owner===player()&&a.adj.includes(to)&&a.stock[sendType]>0&&canEnter(b,player(),sendType);
    const result=originalSend(from,to);vibrate(ok?[12,25,18]:[30,35,30]);
    if(ok)burst(a,'var(--p1)');return result;
  };
  document.addEventListener('click',e=>{if(e.target.closest('[data-act]'))vibrate(8)});
  board.addEventListener('keydown',e=>{
    const node=e.target.closest('[data-id]');if(!node)return;
    if(e.key==='Enter'||e.key===' '){e.preventDefault();const id=node.dataset.id;if(sel&&sel!==id&&N[sel].adj.includes(id))send(sel,id);else {const selected=sel===id;routeCommand({kind:'stop',node:id});pick(id);if(selected){const r=node.getBoundingClientRect();openWheel(id,r.x+r.width/2,r.y+r.height/2);}}pl=0;}
    if(e.key==='Escape'){sel=null;closeWheel();pl=0;}
    if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();const nodes=[...board.querySelectorAll('[data-id]')],at=nodes.indexOf(node),delta=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;nodes[(at+delta+nodes.length)%nodes.length].focus();}
  });
  window.boardNodes=()=>N;
  render=function(){
    const V=vis(), now=performance.now(), me=player();
    const N=Object.fromEntries(Object.entries(window.boardNodes()).map(([id,n])=>[id,{...n,y:me===2?100-n.y:n.y}]));
    footer.querySelector('.ally').style.background=me===1?'var(--p1)':'var(--p2)';
    footer.querySelector('.enemy').style.background=me===1?'var(--p2)':'var(--p1)';
    const snapshot=Object.fromEntries(Object.values(N).map(n=>[n.id,{owner:n.owner,visible:V.has(n.id)}]));
    if(previousNodes)for(const n of Object.values(N)){const old=previousNodes[n.id];if(old&&old.owner!==n.owner&&old.visible&&V.has(n.id)){burst(n,n.owner===me?'var(--p1)':'var(--p2)');vibrate(n.owner===me?[22,40,35]:[45,35,45]);}}
    previousNodes=snapshot;
    if(over!==previousWinner){if(over)vibrate(over===me?[35,60,35,60,90]:[100,60,100]);previousWinner=over;}
    if(over!==modalWinner){
      modalWinner=over;
      if(over){
        endgameMessage.textContent=over===me?'Victory. The orchard is yours.':'Your castle has fallen.';
        retryButton.textContent=typeof online==='undefined'?'Play again':'Leave match';
        if(typeof endgame.showModal==='function'&&!endgame.open)endgame.showModal();else endgame.setAttribute('open','');
      }else closeEndgame();
    }
    let h='<defs><radialGradient id="node-shine" cx="32%" cy="20%" r="85%"><stop stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#000000" stop-opacity=".16"/></radialGradient><pattern id="board-grid" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".12" fill="var(--mut)" opacity=".25"/></pattern></defs><rect x="-5" y="-7" width="110" height="116" fill="url(#board-grid)" pointer-events="none"/>';
    for(const a of Object.values(N))if(!a.shop)for(const id of a.adj||[]){if(a.id>=id)continue;const b=N[id];if(!b||b.shop&&!a.castle)continue;const on=V.has(a.id)||V.has(id),active=sel&&(a.id===sel||id===sel);h+=`<path d="M${a.x} ${a.y}L${b.x} ${b.y}" class="route ${active?'route-active':''}" opacity="${on?1:.2}"/>`;if(active)h+=`<path d="M${a.x} ${a.y}L${b.x} ${b.y}" class="route-flow" stroke-dashoffset="${animated()?-now/160:0}"/>`;}
    for(const n of Object.values(N)){
      const v=V.has(n.id),r=n.shop?3.5:n.castle?6.5:5.2,k=big(n),selected=sel===n.id,col=!v||!n.owner?'var(--neu)':n.owner===1?'var(--p1)':n.owner===2?'var(--p2)':n.owner===3?'#a56bd4':'#df9b3e';
      const label=v?`${n.shop==='shield'?'Shield shop':n.shop==='boost'?'Speed shop':n.castle?'Castle':'Outpost'} ${n.id}, ${n.owner===me?'yours':n.owner?'rival':'unclaimed'}, ${n.shop?`${n.charge||0} of 10 charge`:`${strengthLabel(tot(n))} troops`}`:`${n.id}, unexplored`;
      h+=`<g data-id="${n.id}" class="board-node ${n.shake>0||typeof shakeNodes!=='undefined'&&shakeNodes[n.id]>now?'node-shaking':''}" role="button" tabindex="0" aria-label="${escape(label)}" aria-pressed="${selected}"><circle cx="${n.x}" cy="${n.y+1}" r="${r+.4}" fill="#000" opacity=".2"/><circle cx="${n.x}" cy="${n.y}" r="${r+.7}" fill="var(--card)" stroke="${col}" stroke-width=".35"/><circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${col}" opacity="${v?1:.35}"/><circle cx="${n.x}" cy="${n.y}" r="${r}" fill="url(#node-shine)"/>`;
      if(selected)h+=`<circle cx="${n.x}" cy="${n.y}" r="${r+1.25}" fill="none" stroke="var(--fg)" stroke-width=".45"/><circle cx="${n.x}" cy="${n.y}" r="${r+2}" fill="none" stroke="var(--p1)" opacity="${animated()?.4+.2*Math.sin(now/250):.6}" stroke-width=".5"/>`;
      const routeType=sel&&N[sel].castle?N[sel].selectedType:sendType;
      if(sel&&N[sel].adj.includes(n.id)&&routeType!=null&&canEnter(n,me,routeType)){
        const type=routeType;
        let color='var(--mut)',mark='';if(v&&n.owner!==me&&k>=0&&N[sel].stock[type]>0){const d=mult(type,k)-mult(k,type);color=d>0?'#71bc91':d<0?'#ee8792':'var(--mut)';mark=d>0?'+':d<0?'−':'=';}
        h+=`<circle cx="${n.x}" cy="${n.y}" r="${r+1.7}" fill="none" stroke="${color}" stroke-width=".55" stroke-dasharray="1 1"/>`;
        if(mark)h+=`<circle cx="${n.x+r+1}" cy="${n.y-r}" r="2" fill="var(--card)"/><text x="${n.x+r+1}" y="${n.y-r+1.1}" text-anchor="middle" font-size="3.6" font-weight="800" fill="${color}">${mark}</text>`;
      }
      if(v&&n.shields>0)h+=`<text x="${n.x}" y="${n.y+2}" text-anchor="middle" font-size="10" opacity=".25" pointer-events="none">🛡️</text>`;
      if(v){if(n.shop){const icon=n.shop==='shield'?'🛡️':'⚡';h+=`<text x="${n.x}" y="${n.y+1.1}" text-anchor="middle" font-size="4.2" font-weight="900" fill="var(--fg)" pointer-events="none">${icon}</text><circle cx="${n.x}" cy="${n.y}" r="5.3" fill="none" stroke="${n.abilityReady?'#efc94c':'var(--mut)'}" stroke-width=".8" stroke-dasharray="${n.abilityCd>0?'2 1':'none'}" class="${n.abilityCd>0?'shop-cooldown':''}"/> <text x="${n.x}" y="${n.y+7}" text-anchor="middle" font-size="2.5" font-weight="800" fill="var(--fg)">${n.abilityCd>0?`${Math.ceil(n.abilityCd)}s`:n.abilityReady?'READY':`${n.charge||0}/10`}</text>`;}else{const size=n.castle?8:7,flash=n.cd>0&&animated()?.6+.4*Math.sin(now/100):1;h+=`<g opacity="${flash}" transform="translate(${n.x-size/2} ${n.y-size/2-.3}) scale(${size/24})" pointer-events="none">${n.castle?castle:art(k>=0?k:n.ut)}</g>`;}
        const progress=n.cd>0?1-n.cd/CONFIG.cooldown:n.castle?(n.q.length?n.tm/CONFIG.castleRate:0):n.owner?n.tm/CONFIG.outpostRate:0;
        if(progress>0)h+=`<circle cx="${n.x}" cy="${n.y}" r="${r-.3}" fill="none" stroke="#fff" opacity=".7" stroke-width=".45" pathLength="100" stroke-dasharray="${Math.min(100,progress*100)} 100" transform="rotate(-90 ${n.x} ${n.y})"/>`;
        h+=`<rect x="${n.x-3.8}" y="${n.y+r-1}" width="7.6" height="3.6" rx="1.8" fill="var(--card)" stroke="${col}" stroke-width=".3"/><text x="${n.x}" y="${n.y+r+1.6}" text-anchor="middle" font-size="2.6" font-weight="800" fill="var(--fg)">${strengthLabel(tot(n))}</text>`;
        if(n.shields>0)h+=`<circle cx="${n.x}" cy="${n.y}" r="${r+3.1}" fill="none" stroke="#55d9ff" stroke-width="1.5" class="shield-ring"/><text x="${n.x-r-1.1}" y="${n.y-r+1}" font-size="3.4" text-anchor="middle" fill="#63e4ff" stroke="var(--card)" stroke-width=".7" paint-order="stroke">🛡️${n.shields>1?`×${n.shields}`:''}</text>`;
        if(n.boost>0)h+=`<circle cx="${n.x}" cy="${n.y}" r="${r+1.5}" fill="none" stroke="#ffd34e" stroke-width="1.5" stroke-dasharray="1 1"/><text x="${n.x+r+1.1}" y="${n.y-r+1}" font-size="3.4" text-anchor="middle" fill="#ffd34e" stroke="var(--card)" stroke-width=".7" paint-order="stroke">⚡${Math.ceil(n.boost)}s</text>`;
      }else h+=`<text x="${n.x}" y="${n.y+1.3}" text-anchor="middle" font-size="4" fill="var(--mut)">?</text>`;
      h+=`<circle cx="${n.x}" cy="${n.y}" r="7.4" fill="transparent"/></g>`;
    }
    for(const a of Object.values(N)){
      if(a.owner!==me)continue;
      const routes=[...(a.routes||[])];if(drag?.from===a.id&&drag.to&&!routes.includes(drag.to))routes.push(drag.to);
      for(const to of routes){const b=N[to],angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
        h+=`<g pointer-events="none" transform="translate(${a.x} ${a.y}) rotate(${angle})"><path class="sending-arrow" d="M8 0H13M11 -2L13 0L11 2" fill="none" stroke="${me===1?'var(--p1)':'var(--p2)'}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      }
    }
    if(drag?.moved&&N[drag.from]?.shop&&drag.to){const a=N[drag.from],b=N[drag.to],mx=(a.x+b.x)/2+(b.y-a.y)*.16,my=(a.y+b.y)/2-(b.x-a.x)*.16;h+=`<path d="M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}" fill="none" stroke="${a.shop==='shield'?'#63e4ff':'#ffd34e'}" stroke-width="1.3" stroke-dasharray="2 1" class="ability-arc" pointer-events="none"/>`;}
    for(const g of G){if(g.owner!==me&&!V.has(g.from)&&!V.has(g.to))continue;const a=N[g.from],b=N[g.to],x=a.x+(b.x-a.x)*g.t,y=a.y+(b.y-a.y)*g.t,t=Math.max(0,g.t-.065),color=g.owner===1?'var(--p1)':g.owner===2?'var(--p2)':g.owner===3?'#a56bd4':'#df9b3e';h+=`<g pointer-events="none"><path d="M${a.x+(b.x-a.x)*t} ${a.y+(b.y-a.y)*t}L${x} ${y}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><circle cx="${x}" cy="${y}" r="1.9" fill="var(--card)" stroke="${color}" stroke-width=".35"/><g transform="translate(${x-1.5} ${y-1.5}) scale(.125)">${art(g.type)}</g></g>`;}
    effects=effects.filter(e=>now-e.start<800);
    if(animated())for(const e of effects){const t=(now-e.start)/800;h+=`<g pointer-events="none" opacity="${1-t}"><circle cx="${e.x}" cy="${e.y}" r="${5+t*8}" fill="none" stroke="${e.color}" stroke-width="${.8*(1-t)}"/>`;for(let j=0;j<8;j++){const a=j*Math.PI/4;h+=`<circle cx="${e.x+Math.cos(a)*(5+t*10)}" cy="${e.y+Math.sin(a)*(5+t*10)}" r="${.65*(1-t)}" fill="${e.color}"/>`;}h+='</g>';}
    const focused=board.contains(document.activeElement)?document.activeElement.dataset.id:null;
    board.innerHTML=h;if(focused)board.querySelector(`[data-id="${focused}"]`)?.focus({preventScroll:true});
    refreshWheel();
    shell.classList.toggle('battle-ended',!!over);
  };
  const button=(i,action,active=false,label='Queue')=>`<button type="button" class="fruit-button ${active?'on':''}" data-act="${action}${i}" aria-label="${label} ${escape(T[i][1])}" title="${escape(T[i][1])}" ${action==='q'?'':`aria-pressed="${active}"`}>${icon(i)}<span>${escape(T[i][1])}</span></button>`;
  panel=function(){
    const me=player(), c=N['P'+me];
    const status=over?'':escape(msg||'Choose your next move. Drag from your castle or an outpost to create a route.');
    if(status!==statusHTML){document.getElementById('msg').innerHTML=status;statusHTML=status;}
    let h=`<div class="queue-strip" aria-label="Queue"><span>${c.q.length?c.q.map((i,index)=>`<button type="button" class="queued-fruit" data-act="dropq${index}" aria-label="Remove queued ${escape(T[i][1])}">${icon(i,'queue-icon')}</button>`).join(''):'Tap a fruit to queue'}</span></div><div class="fruit-palette">${T.map((_,i)=>button(i,'q')).join('')}</div>`;
    if(sel&&N[sel]?.owner===me&&N[sel].cd>0)h+=`<div class="transform-status">Transforming · ${N[sel].cd.toFixed(1)}s <button data-act="cancel">Cancel</button></div>`;
    if(h!==panelHTML){const active=document.activeElement,action=document.getElementById('panel').contains(active)?active.dataset.act:null;document.getElementById('panel').innerHTML=h;panelHTML=h;if(action)document.querySelector(`#panel [data-act="${action}"]`)?.focus({preventScroll:true});}
  };
  document.getElementById('msg').setAttribute('aria-live','polite');
  const refreshWheel=()=>{
    if(typeWheel.hidden)return;
    const node=window.boardNodes()[typeWheel.dataset.node];
    if(!node||node.owner!==player()){closeWheel();return;}
    typeWheel.querySelectorAll('button[data-type]').forEach(button=>{
      const i=Number(button.dataset.type),selected=node.castle?node.selectedType===i:(node.pend??node.ut)===i;
      button.disabled=node.castle&&node.stock[i]<=CONFIG.strengthEpsilon;
      button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-label',node.castle?`${T[i][1]}, ${strengthLabel(node.stock[i])} available`:`Produce ${T[i][1]}`);
      button.classList.toggle('on',selected);
      button.innerHTML=icon(i)+(node.castle?`<small>${strengthLabel(node.stock[i])}</small>`:'');
    });
  };
  window.refreshTypeWheel=refreshWheel;
  const oldWheel=openWheel;
  openWheel=function(...args){oldWheel(...args);if(!typeWheel.hidden){refreshWheel();vibrate(18)}};
  render();panel();
})();
