/* Shared presentation layer. Simulation and network commands stay in each edition. */
(() => {
  const board = document.getElementById('map');
  if (!board) return;
  // Presentation helpers belong here, independent of each edition's simulation.
  const strengthLabel = value => Number(value.toFixed(2));
  const player = () => typeof localPlayer === 'undefined' ? 1 : localPlayer;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const storage = { get(key) { try { return localStorage.getItem(key); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, value); } catch {} } };
  let motion = storage.get('fw-motion') !== 'off', haptics = storage.get('fw-haptics') === 'on';
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
  shell.innerHTML = '<div class="battle-top"><div><span class="eyebrow">TACTICAL BATTLEFIELD</span><strong>Every fruit has a fighting chance.</strong></div><span class="live-pill"><i></i> LIVE</span></div><div class="battle-stats" aria-label="Battle status"></div>';
  board.before(shell); shell.append(board);
  board.setAttribute('viewBox','-5 -7 110 116');
  board.setAttribute('role','group');
  board.setAttribute('aria-label','Battlefield. Focus a node and press Enter to select. Select a connected node and press Enter to send troops.');
  const footer = document.createElement('div');
  footer.className = 'battle-footer';
  footer.innerHTML = '<span><i class="key-dot ally"></i> Your territory</span><span><i class="key-dot enemy"></i> Rival</span><span><i class="key-dot neutral"></i> Unclaimed</span><span class="board-hint">Select · Connect · Conquer</span>';
  shell.append(footer);
  const settings = document.createElement('div'); settings.className = 'feedback-settings';
  settings.innerHTML = '<span>Make your move.</span><button type="button" id="motion-toggle"></button><button type="button" id="haptic-toggle"></button>';
  shell.after(settings);
  const updateSettings = () => {
    document.documentElement.dataset.motion = animated() ? 'on' : 'off';
    const m=document.getElementById('motion-toggle'), h=document.getElementById('haptic-toggle');
    m.textContent = reduced.matches ? 'Motion: reduced' : `Motion: ${motion?'on':'off'}`; m.setAttribute('aria-pressed',String(animated())); m.disabled=reduced.matches;
    h.textContent = typeof navigator.vibrate !== 'function' ? 'Haptics unavailable' : `Haptics: ${haptics?'on':'off'}`; h.disabled=typeof navigator.vibrate !== 'function'; h.setAttribute('aria-pressed',String(haptics));
  };
  document.getElementById('motion-toggle').onclick=()=>{motion=!motion;storage.set('fw-motion',motion?'on':'off');updateSettings()};
  document.getElementById('haptic-toggle').onclick=()=>{haptics=!haptics;storage.set('fw-haptics',haptics?'on':'off');updateSettings();vibrate(15)};
  reduced.addEventListener('change',updateSettings);updateSettings();
  let effects=[], previousNodes=null, previousWinner=0, panelHTML='', statusHTML='';
  const burst = (n, color) => effects.push({x:n.x,y:n.y,color,start:performance.now()});
  const originalInit=init;
  init=function(){originalInit();effects=[];previousNodes=null;previousWinner=0;panelHTML='';statusHTML=''};
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
    if(e.key==='Enter'||e.key===' '){e.preventDefault();const id=node.dataset.id;if(sel&&sel!==id&&N[sel].adj.includes(id))send(sel,id);else pick(id);pl=0;}
    if(e.key==='Escape'){sel=null;closeWheel();pl=0;}
    if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();const nodes=[...board.querySelectorAll('[data-id]')],at=nodes.indexOf(node),delta=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;nodes[(at+delta+nodes.length)%nodes.length].focus();}
  });
  render=function(){
    const V=vis(), now=performance.now(), me=player();
    footer.querySelector('.ally').style.background=me===1?'var(--p1)':'var(--p2)';
    footer.querySelector('.enemy').style.background=me===1?'var(--p2)':'var(--p1)';
    const snapshot=Object.fromEntries(Object.values(N).map(n=>[n.id,{owner:n.owner,visible:V.has(n.id)}]));
    if(previousNodes)for(const n of Object.values(N)){const old=previousNodes[n.id];if(old&&old.owner!==n.owner&&old.visible&&V.has(n.id)){burst(n,n.owner===me?'var(--p1)':'var(--p2)');vibrate(n.owner===me?[22,40,35]:[45,35,45]);}}
    previousNodes=snapshot;
    if(over!==previousWinner){if(over)vibrate(over===me?[35,60,35,60,90]:[100,60,100]);previousWinner=over;}
    let h='<defs><radialGradient id="node-shine" cx="32%" cy="20%" r="85%"><stop stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#000000" stop-opacity=".16"/></radialGradient><pattern id="board-grid" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".12" fill="var(--mut)" opacity=".25"/></pattern></defs><rect x="-5" y="-7" width="110" height="116" fill="url(#board-grid)" pointer-events="none"/>';
    for(const[a,b]of EDGES){const A=N[a],B=N[b],on=V.has(a)||V.has(b),active=sel&&(a===sel||b===sel);h+=`<path d="M${A.x} ${A.y}L${B.x} ${B.y}" class="route ${active?'route-active':''}" opacity="${on?1:.2}"/>`;if(active)h+=`<path d="M${A.x} ${A.y}L${B.x} ${B.y}" class="route-flow" stroke-dashoffset="${animated()?-now/160:0}"/>`;}
    for(const n of Object.values(N)){
      const v=V.has(n.id),r=n.castle?6.5:5.2,k=big(n),selected=sel===n.id,col=!v||!n.owner?'var(--neu)':n.owner===1?'var(--p1)':'var(--p2)';
      const label=v?`${n.castle?'Castle':'Outpost'} ${n.id}, ${n.owner===me?'yours':n.owner?'rival':'unclaimed'}, ${strengthLabel(tot(n))} troops${n.castle?'':', '+T[n.ut][1]}`:`${n.id}, unexplored`;
      h+=`<g data-id="${n.id}" class="board-node" role="button" tabindex="0" aria-label="${escape(label)}" aria-pressed="${selected}"><circle cx="${n.x}" cy="${n.y+1}" r="${r+.4}" fill="#000" opacity=".2"/><circle cx="${n.x}" cy="${n.y}" r="${r+.7}" fill="var(--card)" stroke="${col}" stroke-width=".35"/><circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${col}" opacity="${v?1:.35}"/><circle cx="${n.x}" cy="${n.y}" r="${r}" fill="url(#node-shine)"/>`;
      if(selected)h+=`<circle cx="${n.x}" cy="${n.y}" r="${r+1.25}" fill="none" stroke="var(--fg)" stroke-width=".45"/><circle cx="${n.x}" cy="${n.y}" r="${r+2}" fill="none" stroke="var(--p1)" opacity="${animated()?.4+.2*Math.sin(now/250):.6}" stroke-width=".5"/>`;
      if(sel&&N[sel].adj.includes(n.id)&&canEnter(n,me,sendType)){
        let color='var(--mut)',mark='';if(v&&n.owner!==me&&k>=0&&N[sel].stock[sendType]>0){const d=mult(sendType,k)-mult(k,sendType);color=d>0?'#71bc91':d<0?'#ee8792':'var(--mut)';mark=d>0?'+':d<0?'−':'=';}
        h+=`<circle cx="${n.x}" cy="${n.y}" r="${r+1.7}" fill="none" stroke="${color}" stroke-width=".55" stroke-dasharray="1 1"/>`;
        if(mark)h+=`<circle cx="${n.x+r+1}" cy="${n.y-r}" r="2" fill="var(--card)"/><text x="${n.x+r+1}" y="${n.y-r+1.1}" text-anchor="middle" font-size="3.6" font-weight="800" fill="${color}">${mark}</text>`;
      }
      if(v){const size=n.castle?8:7;h+=`<g transform="translate(${n.x-size/2} ${n.y-size/2-.3}) scale(${size/24})" pointer-events="none">${n.castle?castle:art(k>=0?k:n.ut)}</g>`;
        const progress=n.cd>0?1-n.cd/CONFIG.cooldown:n.castle?(n.q.length?n.tm/CONFIG.castleRate:0):n.owner?n.tm/CONFIG.outpostRate:0;
        if(progress>0)h+=`<circle cx="${n.x}" cy="${n.y}" r="${r-.3}" fill="none" stroke="#fff" opacity=".7" stroke-width=".45" pathLength="100" stroke-dasharray="${Math.min(100,progress*100)} 100" transform="rotate(-90 ${n.x} ${n.y})"/>`;
        h+=`<rect x="${n.x-3.8}" y="${n.y+r-1}" width="7.6" height="3.6" rx="1.8" fill="var(--card)" stroke="${col}" stroke-width=".3"/><text x="${n.x}" y="${n.y+r+1.6}" text-anchor="middle" font-size="2.6" font-weight="800" fill="var(--fg)">${strengthLabel(tot(n))}</text>`;
      }else h+=`<text x="${n.x}" y="${n.y+1.3}" text-anchor="middle" font-size="4" fill="var(--mut)">?</text>`;
      h+=`<circle cx="${n.x}" cy="${n.y}" r="7.4" fill="transparent"/></g>`;
    }
    if(drag?.moved){const a=N[drag.from],end=new DOMPoint(drag.x,drag.y).matrixTransform(board.getScreenCTM().inverse());h+=`<path pointer-events="none" d="M${a.x} ${a.y}L${end.x} ${end.y}" stroke="var(--p1)" stroke-width=".8" stroke-dasharray="2 1"/><circle pointer-events="none" cx="${end.x}" cy="${end.y}" r="2" fill="none" stroke="var(--p1)" stroke-width=".5"/>`;}
    for(const g of G){if(g.owner!==me&&!V.has(g.from)&&!V.has(g.to))continue;const a=N[g.from],b=N[g.to],x=a.x+(b.x-a.x)*g.t,y=a.y+(b.y-a.y)*g.t,t=Math.max(0,g.t-.065);h+=`<g pointer-events="none"><path d="M${a.x+(b.x-a.x)*t} ${a.y+(b.y-a.y)*t}L${x} ${y}" stroke="${g.owner===1?'var(--p1)':'var(--p2)'}" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><circle cx="${x}" cy="${y}" r="1.9" fill="var(--card)" stroke="${g.owner===1?'var(--p1)':'var(--p2)'}" stroke-width=".35"/><g transform="translate(${x-1.5} ${y-1.5}) scale(.125)">${art(g.type)}</g></g>`;}
    effects=effects.filter(e=>now-e.start<800);
    if(animated())for(const e of effects){const t=(now-e.start)/800;h+=`<g pointer-events="none" opacity="${1-t}"><circle cx="${e.x}" cy="${e.y}" r="${5+t*8}" fill="none" stroke="${e.color}" stroke-width="${.8*(1-t)}"/>`;for(let j=0;j<8;j++){const a=j*Math.PI/4;h+=`<circle cx="${e.x+Math.cos(a)*(5+t*10)}" cy="${e.y+Math.sin(a)*(5+t*10)}" r="${.65*(1-t)}" fill="${e.color}"/>`;}h+='</g>';}
    const focused=board.contains(document.activeElement)?document.activeElement.dataset.id:null;
    board.innerHTML=h;if(focused)board.querySelector(`[data-id="${focused}"]`)?.focus({preventScroll:true});
    const mine=Object.values(N).filter(n=>n.owner===me),visible=Object.values(N).filter(n=>V.has(n.id));
    const stats=`<span><b>${mine.length}</b> territories</span><span><b>${strengthLabel(mine.reduce((s,n)=>s+tot(n),0))}</b> troops</span><span><b>${visible.length} / ${Object.keys(N).length}</b> revealed</span>`;
    const statsEl=shell.querySelector('.battle-stats');if(statsEl.innerHTML!==stats)statsEl.innerHTML=stats;
    shell.classList.toggle('battle-ended',!!over);
  };
  const button=(i,action,active=false,label='Queue')=>`<button type="button" class="fruit-button ${active?'on':''}" data-act="${action}${i}" aria-label="${label} ${escape(T[i][1])}" title="${escape(T[i][1])}" ${action==='q'?'':`aria-pressed="${active}"`}>${icon(i)}<span>${escape(T[i][1])}</span></button>`;
  panel=function(){
    const me=player(), c=N['P'+me];
    const status=over?`<strong>${over===me?'Victory. The orchard is yours.':'Your castle has fallen.'}</strong> ${typeof online==='undefined'?'<button data-act="restart">Play again ↗</button>':''}`:escape(msg||'Choose your next move. Drag between connected outposts to send troops.');
    if(status!==statusHTML){document.getElementById('msg').innerHTML=status;statusHTML=status;}
    let h=`<div class="panel-heading"><div><span class="eyebrow">REINFORCEMENTS</span><h2>Grow your army</h2></div><span class="queue-count">${c.q.length} / 20 queued</span></div><div class="fruit-palette">${T.map((_,i)=>button(i,'q')).join('')}</div><div class="queue-strip"><span>${c.q.length?c.q.map(i=>icon(i,'queue-icon')).join(''):'Your next move starts here. Queue a fruit.'}</span><button data-act="qc" aria-label="Clear production queue">Clear</button></div>`;
    if(sel){const n=N[sel];h+=`<div class="selection-panel"><div class="panel-heading"><div><span class="eyebrow">COMMAND CENTER</span><h2>${n.castle?'Your castle':'Outpost '+n.id}</h2></div><button data-act="half" aria-pressed="${half}">Send ${half?'half':'all'} ↗</button></div><div class="stock-row">${n.stock.map((k,i)=>k?`<button data-act="s${i}" class="stock-button ${sendType===i?'on':''}" aria-label="Send ${escape(T[i][1])}, ${strengthLabel(k)} troops" aria-pressed="${sendType===i}">${icon(i)}<b>${strengthLabel(k)}</b></button>`:'').join('')||'<small>No troops ready. Production is on its way.</small>'}</div>`;
      if(!n.castle)h+=`<p class="production-label">${n.cd>0?'Changing production…':'Produce at this outpost'}</p><div class="fruit-palette">${T.map((_,i)=>button(i,'p',(n.pend??n.ut)===i,'Produce')).join('')}</div>`;
      h+='<small class="command-hint">Drag to a linked outpost, or focus it and press Enter to send.</small></div>';
    }else h+='<div class="selection-empty"><span>◎</span><div><b>Your kingdom starts with one castle.</b><small>Select your castle to command your troops.</small></div></div>';
    if(h!==panelHTML){const active=document.activeElement,action=document.getElementById('panel').contains(active)?active.dataset.act:null;document.getElementById('panel').innerHTML=h;panelHTML=h;if(action)document.querySelector(`#panel [data-act="${action}"]`)?.focus({preventScroll:true});}
  };
  document.getElementById('msg').setAttribute('aria-live','polite');
  const oldWheel=openWheel;
  openWheel=function(...args){oldWheel(...args);if(!typeWheel.hidden){typeWheel.querySelectorAll('button').forEach((b,i)=>{b.innerHTML=icon(i)});vibrate(18)}};
  render();panel();
})();
