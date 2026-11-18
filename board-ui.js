/* Shared presentation layer. Simulation and network commands stay in each edition. */
(() => {
  const board = document.getElementById('map');
  if (!board) return;
  // Presentation helpers belong here, independent of each edition's simulation.
  const strengthLabel = value => Number(value.toFixed(2));
  const productionEffect = type => {
    const cycle = typeof productionCycle === 'undefined' ? null : productionCycle;
    if (type == null || !cycle) return null;
    const multiplier = productionMultiplier(cycle, type);
    if (multiplier === 1) return null;
    const buff = multiplier > 1;
    return {percent: `${buff ? '+' : '−'}${Math.abs(Math.round((multiplier - 1) * 100))}%`, kind: buff ? 'buff' : 'debuff', arrow: buff ? '▲' : '▼', label: `${T[type][1]} ${buff ? '+' : ''}${Math.round((multiplier - 1) * 100)}% production speed`};
  };
  const productionBadge = type => {
    const effect = productionEffect(type);
    return effect ? `<span class="production-badge production-${effect.kind}" role="img" aria-label="${effect.label}" title="${effect.label}">${effect.arrow}</span>` : '';
  };
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
  const ownerColor = owner => ['var(--neu)','var(--p1)','var(--p2)','#a56bd4','#df9b3e'][owner];
  const art = i => `<g stroke="#ffffff80" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${fruitPaths[i]}</g>`;
  const icon = (i, cls='fruit-icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${art(i)}</svg>`;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shell = document.createElement('section');
  shell.className = 'battle-shell';
  shell.innerHTML = '<div class="battle-tools"><button type="button" class="battle-settings-button" aria-label="Battle settings" title="Battle settings">⚙</button></div>';
  board.before(shell);
  if(typeof botConfig!=='undefined')shell.append(document.getElementById('production-cycle'));
  shell.append(board);
  const startCountdown=document.createElement('div');
  startCountdown.className='match-countdown';startCountdown.hidden=true;
  startCountdown.setAttribute('role','status');startCountdown.setAttribute('aria-live','polite');
  shell.append(startCountdown);
  const portionControl=document.createElement('label');
  portionControl.className='portion-control';
  portionControl.hidden=!portionControlEnabled();
  portionControl.innerHTML='<span>Portion <output>100%</output></span><input type="range" min="25" max="100" step="25" value="100" aria-label="Troops per new arrow" aria-valuetext="100%"><span class="portion-ticks" aria-hidden="true"><span>25%</span><span>50%</span><span>75%</span><span>100%</span></span>';
  const portionSlider=portionControl.querySelector('input'),portionOutput=portionControl.querySelector('output');
  portionSlider.addEventListener('input',()=>{
    const value=Number(portionSlider.value);if(![25,50,75,100].includes(value))return;
    portionPercent=value;portionOutput.textContent=value+'%';portionSlider.setAttribute('aria-valuetext',value+'%');
  });
  shell.append(portionControl);
  const settingsButton=shell.querySelector('.battle-settings-button');
  const settingsDialog=document.createElement('dialog');settingsDialog.className='battle-settings-dialog';
  settingsDialog.innerHTML='<form method="dialog" class="battle-settings-form"><h2>Battle settings</h2><label>Map <select name="map"><option value="1">Original map</option><option value="2">Expanded orchard</option><option value="5">Twin branches · 2 players</option><option value="7">Hourglass · 2 players</option><option value="8">Twin rivers · 2 players</option><option value="9">Crown lattice · 2 players</option><option value="10">Ring road · 2 players</option><option value="11">Crossroads · 2 players</option><option value="3">Three groves · 3 players</option><option value="6">Expanded three groves · 3 players</option><option value="4">Grand orchard</option></select></label><label>Game speed <select name="speed"><option value="0.5">Relaxed</option><option value="1">Standard</option><option value="1.5">Fast</option></select></label><label class="shop-setting"><input name="shops" type="checkbox"> Shop abilities</label><label class="shop-setting"><input name="productionRotation" type="checkbox"> Production rotation</label><label class="shop-setting"><input name="portionControl" type="checkbox"> Portion control</label><label class="shop-setting"><input name="noQueue" type="checkbox"> No queue</label><label class="shop-setting"><input name="transformationWave" type="checkbox"> Transformation Wave</label><label>Transformation time (seconds) <input name="transformationTime" type="number" min="1" max="120" step="0.1" value="10" disabled></label><div class="feedback-settings"><button type="button" id="motion-toggle"></button><button type="button" id="haptic-toggle"></button></div><div class="settings-actions"><button type="button" class="settings-restart">Restart game</button><button value="close">Close</button></div></form>';
  document.body.append(settingsDialog);
  settingsButton.onclick=()=>{if(typeof online==='undefined'){settingsDialog.querySelector('[name=map]').value=String(botConfig.map);settingsDialog.querySelector('[name=speed]').value=String(botConfig.speed);settingsDialog.querySelector('[name=shops]').checked=botConfig.shops;settingsDialog.querySelector('[name=productionRotation]').checked=botConfig.productionRotation;settingsDialog.querySelector('[name=noQueue]').checked=!!botConfig.noQueue;settingsDialog.querySelector('[name=portionControl]').checked=!!botConfig.portionControl;settingsDialog.querySelector('[name=transformationWave]').checked=!!botConfig.transformationWave;settingsDialog.querySelector('[name=transformationTime]').value=String(botConfig.transformationTime??10);settingsDialog.querySelector('[name=transformationTime]').disabled=!botConfig.transformationWave;}if(typeof settingsDialog.showModal==='function')settingsDialog.showModal();else settingsDialog.setAttribute('open','');};
  board.setAttribute('viewBox','-5 -7 110 116');
  board.setAttribute('role','group');
  board.setAttribute('aria-label','Battlefield. Focus a node and press Enter to select. Select a connected node and press Enter to send troops.');
  const footer = document.createElement('div');
  footer.className = 'battle-footer';
  footer.innerHTML = '<span><i class="key-dot ally"></i> Your territory</span><span class="rival-keys"></span><span><i class="key-dot neutral"></i> Unclaimed</span><span class="board-hint">Drag to route · Tap to stop</span>';
  shell.append(footer);
  if(typeof online==='undefined'){
    const applySettings=(restart=false)=>{
      const {map,speed,shops,productionRotation,noQueue,portionControl,transformationWave,transformationTime}=settingsDialog.querySelector('form').elements;
      const next={map:Number(map.value),speed:Number(speed.value),shops:shops.checked,productionRotation:productionRotation.checked,noQueue:!!noQueue?.checked,portionControl:!!portionControl?.checked,transformationWave:!!transformationWave?.checked,transformationTime:Number(transformationTime?.value??10)};
      if(!Number.isFinite(next.transformationTime)||next.transformationTime<1||next.transformationTime>120)return;
      if(transformationTime)transformationTime.disabled=!next.transformationWave;
      const reset=restart||next.transformationWave!==!!botConfig.transformationWave||next.transformationTime!==(botConfig.transformationTime??10)||next.noQueue!==!!botConfig.noQueue||next.map!==botConfig.map||next.shops!==botConfig.shops||next.productionRotation!==botConfig.productionRotation;
      botConfig=next;
      if(reset){
        act('restart');
        previousNodes=null;
        render();
        panel();
        renderProductionCycle(productionCycle,T);
      }else CONFIG.timeScale=next.speed;
    };
    settingsDialog.querySelector('.settings-restart').onclick=()=>{applySettings(true);settingsDialog.close();};
    settingsDialog.addEventListener('change',()=>applySettings());
  }else settingsDialog.querySelector('.battle-settings-form').innerHTML='<h2>Battle settings</h2><p>Settings are chosen before an online match begins.</p><div class="feedback-settings"><button type="button" id="motion-toggle"></button><button type="button" id="haptic-toggle"></button></div><button value="close">Close</button>';
  const endgame=document.createElement('dialog');endgame.className='endgame-dialog';
  endgame.innerHTML='<p class="endgame-message"></p><div class="endgame-actions"><button type="button" class="endgame-retry">Play again</button><button type="button" class="endgame-close">Close</button></div>';
  document.body.append(endgame);
  const endgameMessage=endgame.querySelector('.endgame-message'),retryButton=endgame.querySelector('.endgame-retry'),closeButton=endgame.querySelector('.endgame-close');
  const closeEndgame=()=>{if(typeof endgame.close==='function')endgame.close();else endgame.removeAttribute?.('open');};
  closeButton.addEventListener('click',closeEndgame);
  retryButton.addEventListener('click',()=>{
    closeEndgame();
    if(typeof online==='undefined')act('restart');
    else window.matchGame?.returnToLobby();
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
  init=function(){originalInit();effects=[];previousNodes=null;previousWinner=0;modalWinner=0;panelHTML=null;statusHTML=null;closeEndgame()};
  if(typeof online==='undefined'&&typeof applyRouteCommand==='function'){
    const baseRouteCommand=applyRouteCommand;
    applyRouteCommand=function(owner,data){if(data?.kind==='ability'){const shop=N[data.from],target=N[data.to];if(shop?.shop&&shop.owner===owner&&shop.abilityReady&&shop.abilityCd<=0&&target?.owner===owner&&!target.shop){if(shop.shop==='shield')target.shields=(target.shields||0)+1;else target.boost=Math.max(target.boost||0,7);shop.abilityReady=false;shop.charge=0;shop.abilityCd=10;}return true;}return baseRouteCommand(owner,data)};
  }
  const originalArrive=arrive;
  arrive=function(g){const n=N[g.to];if(n&&n.owner!==g.owner&&vis().has(n.id))burst(n,'#f5d765');return originalArrive(g)};
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
    if(typeof online==='undefined'&&document.querySelector('main')?.inert){closeEndgame();return;}
    const starting=typeof countdownRemaining!=='undefined'&&countdownRemaining>0;
    startCountdown.hidden=!starting;
    if(starting){
      const elapsed=localPlayer===1?0:Math.max(0,performance.now()-countdownSyncedAt);
      const seconds=Math.max(1,Math.ceil((countdownRemaining-elapsed)/1000));
      const label=`Starting in ${seconds}`;
      if(startCountdown.textContent!==label)startCountdown.textContent=label;
    }
    portionControl.hidden=!portionControlEnabled();
    const V=vis(), now=performance.now(), me=player();
    const N=Object.fromEntries(Object.entries(window.boardNodes()).map(([id,n])=>[id,{...n,...boardViewPoint(n,me)}]));
    footer.querySelector('.ally').style.background=ownerColor(me);
    const rivals=Object.values(N).filter(n=>n.castle).map(n=>Number(n.id.slice(1))).filter(owner=>owner!==me);
    const rivalKeys=footer.querySelector('.rival-keys');
    const legend=rivals.map((owner,i)=>`<span><i class="key-dot" style="background:${ownerColor(owner)}"></i> Rival${rivals.length>1?' '+(i+1):''}</span>`).join('');
    if(rivalKeys.innerHTML!==legend)rivalKeys.innerHTML=legend;
    const snapshot=Object.fromEntries(Object.values(N).map(n=>[n.id,{owner:n.owner,visible:V.has(n.id)}]));
    if(previousNodes)for(const n of Object.values(N)){const old=previousNodes[n.id];if(old&&old.owner!==n.owner&&old.visible&&V.has(n.id)){burst(n,ownerColor(n.owner));vibrate(n.owner===me?[22,40,35]:[45,35,45]);}}
    previousNodes=snapshot;
    if(over!==previousWinner){if(over)vibrate(over===me?[35,60,35,60,90]:[100,60,100]);previousWinner=over;}
    if(over!==modalWinner){
      modalWinner=over;
      if(over){
        endgameMessage.textContent=over===me?'Victory. The orchard is yours.':N['P'+me]?.disabled?'The match is over. Another player won.':'Your castle has fallen.';
        retryButton.textContent=typeof online==='undefined'?'Play again':'Return to lobby';
        if(typeof endgame.showModal==='function'&&!endgame.open)endgame.showModal();else endgame.setAttribute('open','');
      }else closeEndgame();
    }
    let h='<defs><radialGradient id="node-shine" cx="32%" cy="20%" r="85%"><stop stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#000000" stop-opacity=".16"/></radialGradient><pattern id="board-grid" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".12" fill="var(--mut)" opacity=".25"/></pattern></defs><rect x="-5" y="-7" width="110" height="116" fill="url(#board-grid)" pointer-events="none"/>',countLabels='';
    for(const a of Object.values(N))if(!a.shop&&!a.disabled)for(const id of a.adj||[]){if(a.id>=id)continue;const b=N[id];if(!b||b.disabled||b.shop&&!a.castle)continue;const on=V.has(a.id)||V.has(id),active=sel&&(a.id===sel||id===sel);h+=`<path d="M${a.x} ${a.y}L${b.x} ${b.y}" class="route ${active?'route-active':''}" opacity="${on?1:.2}"/>`;if(active)h+=`<path d="M${a.x} ${a.y}L${b.x} ${b.y}" class="route-flow" stroke-dashoffset="${animated()?-now/160:0}"/>`;}
    const source=N[sel];
    for(const n of Object.values(N)){
      if(n.disabled)continue;
      const v=V.has(n.id),r=n.shop?3.5:n.castle?6.5:5.2,k=big(n),selected=sel===n.id,col=ownerColor(v?n.owner:0);
      const shopState=n.abilityCd>0?'on cooldown':n.abilityReady?'purchased and ready':'spent';
      const label=v?`${n.shop==='shield'?'Shield shop':n.shop==='boost'?'Speed shop':n.castle?'Castle':'Outpost'} ${n.id}, ${n.owner===me?'yours':n.owner?'rival':'unclaimed'}, ${n.shop?shopState:`${Math.round(tot(n))} troops`}`:`${n.id}, unexplored`;
      h+=`<g data-id="${n.id}" class="board-node ${n.shake>0||typeof shakeNodes!=='undefined'&&shakeNodes[n.id]>now?'node-shaking':''}" role="button" tabindex="0" aria-label="${escape(label)}" aria-pressed="${selected}"><circle cx="${n.x}" cy="${n.y+1}" r="${r+.4}" fill="#000" opacity=".2"/><circle cx="${n.x}" cy="${n.y}" r="${r+.7}" fill="var(--card)" stroke="${col}" stroke-width=".35"/><circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${col}" opacity="${v?1:.35}"/><circle cx="${n.x}" cy="${n.y}" r="${r}" fill="url(#node-shine)"/>`;
      if(selected)h+=`<circle cx="${n.x}" cy="${n.y}" r="${r+1.25}" fill="none" stroke="var(--fg)" stroke-width=".45"/><circle cx="${n.x}" cy="${n.y}" r="${r+2}" fill="none" stroke="var(--p1)" opacity="${animated()?.4+.2*Math.sin(now/250):.6}" stroke-width=".5"/>`;
      if(source?.owner===me&&!source.shop&&!n.shop&&source.adj.includes(n.id)){
        const type=source.castle?castleRouteFruit(source,n):canEnter(n,me,sendType)?sendType:-1;
        let color='var(--mut)',matchup='';
        if(v&&n.owner!==me&&k>=0&&type>=0&&source.stock[type]>CONFIG.strengthEpsilon){
          const ratio=mult(type,k)/mult(k,type),advantage=ratio>1+CONFIG.strengthEpsilon,disadvantage=ratio<1-CONFIG.strengthEpsilon;
          const hard=Math.max(ratio,1/ratio)>=3,levels=hard?2:1;
          color=advantage?'#71bc91':disadvantage?'#ee8792':'var(--mut)';
          const label=`${advantage||disadvantage?(hard?'Hard':'Soft')+' '+(advantage?'advantage':'disadvantage'):'Even matchup'} · ${Number(ratio.toFixed(2))}× combat strength`;
          let paths='M-1 0H1';
          if(advantage||disadvantage){
            const direction=advantage?1:-1;
            paths=Array.from({length:levels},(_,i)=>{const y=(i-(levels-1)/2)*1.5;return `M-1.1 ${y+direction*.5}L0 ${y-direction*.5}L1.1 ${y+direction*.5}`}).join(' ');
          }
          matchup=`<g class="counter-indicator counter-${advantage||disadvantage?hard?'hard':'soft':'even'}" role="img" aria-label="${escape(label)}" transform="translate(${n.x+r+1} ${n.y-r})"><title>${escape(label)}</title><circle r="2.2" fill="var(--card)"/><path d="${paths}" fill="none" stroke="${color}" stroke-width=".55" stroke-linecap="round" stroke-linejoin="round"/></g>`;
        }
        h+=`<circle cx="${n.x}" cy="${n.y}" r="${r+1.7}" fill="none" stroke="${color}" stroke-width=".55" stroke-dasharray="1 1"/>`;
        h+=matchup;
      }
      if(v&&n.shields>0)h+=`<text x="${n.x}" y="${n.y+2}" text-anchor="middle" font-size="10" opacity=".25" pointer-events="none">🛡️</text>`;
      if(v){if(n.shop){const icon=n.shop==='shield'?'🛡️':'⚡',ready=n.abilityReady,cd=n.abilityCd>0,mark=cd?'⌛':ready?'✓':'·';h+=`<text x="${n.x}" y="${n.y+1.1}" text-anchor="middle" font-size="4.2" font-weight="900" fill="${ready?'var(--fg)':'var(--mut)'}" opacity="${ready?1:.55}" pointer-events="none">${icon}</text><circle cx="${n.x}" cy="${n.y}" r="5.3" fill="none" stroke="${ready?'#efc94c':cd?'var(--p2)':'var(--mut)'}" stroke-width=".8" stroke-dasharray="${cd?'2 1':'none'}" class="${cd?'shop-cooldown':''}"/><circle cx="${n.x+3.8}" cy="${n.y-3.8}" r="1.7" fill="var(--card)"/><text x="${n.x+3.8}" y="${n.y-3.1}" text-anchor="middle" font-size="2.5" font-weight="900" fill="${cd?'var(--p2)':ready?'#efc94c':'var(--mut)'}">${mark}</text>`;}else{const fruit=queuedCastle(n)?castleFruit(n):k>=0?k:n.ut,size=n.castle?8:7,flash=n.cd>0&&animated()?.6+.4*(transformationConfig().transformationWave?Math.cos(2*Math.PI*transformationProgress(n)):Math.sin(now/100)):1;if(fruit!=null)h+=`<g opacity="${flash}" transform="translate(${n.x-size/2} ${n.y-size/2-.3}) scale(${size/24})" pointer-events="none">${art(fruit)}</g>`;}
        const productionType=queuedCastle(n)?n.q[0]:n.ut;
        const effect=!n.shop&&n.owner&&!(n.cd>0)?productionEffect(productionType):null;
        const progress=n.cd>0?transformationProgress(n):queuedCastle(n)?(n.q.length?n.tm/CONFIG.castleRate:0):n.owner?n.tm/CONFIG.outpostRate:0;
        if(progress>0)h+=`<circle cx="${n.x}" cy="${n.y}" r="${r-.3}" fill="none" stroke="#fff" opacity=".7" stroke-width=".45" pathLength="100" stroke-dasharray="${Math.min(100,progress*100)} 100" transform="rotate(-90 ${n.x} ${n.y})"/>`;
        if(!n.shop)countLabels+=`<g pointer-events="none"><rect x="${n.x-3.8}" y="${n.y+r-1}" width="7.6" height="3.6" rx="1.8" fill="var(--card)" stroke="${col}" stroke-width=".3"/><text x="${n.x}" y="${n.y+r+1.6}" text-anchor="middle" font-size="2.6" font-weight="800" fill="var(--fg)">${Math.round(tot(n))}</text>${effect?`<g class="node-production node-production-${effect.kind}" transform="translate(${n.x+5.5} ${n.y+r+.8+(effect.kind==='buff'?-.6:.6)})" role="img" aria-label="${effect.label}"><title>${effect.label}</title><path d="${effect.kind==='buff'?'M0 -1.1L1.1 .8H-1.1Z':'M0 1.1L1.1 -.8H-1.1Z'}" fill="${effect.kind==='buff'?'#7ae6aa':'#ff8997'}"/></g>`:''}</g>`;
        if(n.shields>0)h+=`<circle cx="${n.x}" cy="${n.y}" r="${r+3.1}" fill="none" stroke="#55d9ff" stroke-width="1.5" class="shield-ring"/><text x="${n.x-r-1.1}" y="${n.y-r+1}" font-size="3.4" text-anchor="middle" fill="#63e4ff" stroke="var(--card)" stroke-width=".7" paint-order="stroke">🛡️${n.shields>1?`×${n.shields}`:''}</text>`;
        if(n.boost>0)h+=`<circle cx="${n.x}" cy="${n.y}" r="${r+1.5}" fill="none" stroke="#ffd34e" stroke-width="1.5" stroke-dasharray="1 1"/><text x="${n.x+r+1.1}" y="${n.y-r+1}" font-size="3.4" text-anchor="middle" fill="#ffd34e" stroke="var(--card)" stroke-width=".7" paint-order="stroke">⚡${Math.ceil(n.boost)}s</text>`;
      }else h+=`<text x="${n.x}" y="${n.y+1.3}" text-anchor="middle" font-size="4" fill="var(--mut)">?</text>`;
      if(n.castle){
        const seat=Number(n.id.slice(1)),members=typeof lobbyMembers==='undefined'?[]:lobbyMembers;
        const name=members.find(member=>member.seat===seat)?.name||(seat===me?(typeof online==='undefined'?storage.get('fruit-wars-name'):'')||'You':typeof humanPlayers!=='undefined'&&humanPlayers.includes(seat)?`Player ${seat}`:`Bot ${seat}`);
        const shortName=Array.from(name).length>16?Array.from(name).slice(0,15).join('')+'…':name;
        countLabels+=`<text class="castle-player-name" data-castle="${n.id}" x="${n.x}" y="${n.y+r+5.2}" text-anchor="middle" font-size="2.8" font-weight="750" fill="var(--fg)" stroke="var(--card)" stroke-width=".9" paint-order="stroke" pointer-events="none"><title>${escape(name)}</title>${escape(shortName)}</text>`;
      }
      h+=`<circle cx="${n.x}" cy="${n.y}" r="7.4" fill="transparent"/></g>`;
    }
    for(const a of Object.values(N)){
      if(a.owner!==me||a.disabled)continue;
      const routes=[...(a.routes||[])];if(drag?.from===a.id&&drag.to&&!routes.includes(drag.to))routes.push(drag.to);
      for(const to of routes){const b=N[to],angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
        h+=`<g pointer-events="none" transform="translate(${a.x} ${a.y}) rotate(${angle})"><path class="sending-arrow" d="M8 0H13M11 -2L13 0L11 2" fill="none" stroke="${me===1?'var(--p1)':'var(--p2)'}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      }
    }
    if(drag?.moved&&N[drag.from]?.shop&&drag.to){const a=N[drag.from],b=N[drag.to],mx=(a.x+b.x)/2+(b.y-a.y)*.16,my=(a.y+b.y)/2-(b.x-a.x)*.16;h+=`<path d="M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}" fill="none" stroke="${a.shop==='shield'?'#63e4ff':'#ffd34e'}" stroke-width="1.3" stroke-dasharray="2 1" class="ability-arc" pointer-events="none"/>`;}
    for(const g of G){if(g.owner!==me&&!V.has(g.from)&&!V.has(g.to))continue;const a=N[g.from],b=N[g.to],progress=typeof unitProgress==='function'?unitProgress(g,now):g.t,x=a.x+(b.x-a.x)*progress,y=a.y+(b.y-a.y)*progress,t=Math.max(0,progress-.065),color=ownerColor(g.owner);h+=`<g pointer-events="none"><path d="M${a.x+(b.x-a.x)*t} ${a.y+(b.y-a.y)*t}L${x} ${y}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><circle cx="${x}" cy="${y}" r="1.9" fill="var(--card)" stroke="${color}" stroke-width=".35"/><g transform="translate(${x-1.5} ${y-1.5}) scale(.125)">${art(g.type)}</g></g>`;}
    effects=effects.filter(e=>now-e.start<800);
    if(animated())for(const e of effects){const t=(now-e.start)/800;h+=`<g pointer-events="none" opacity="${1-t}"><circle cx="${e.x}" cy="${e.y}" r="${5+t*8}" fill="none" stroke="${e.color}" stroke-width="${.8*(1-t)}"/>`;for(let j=0;j<8;j++){const a=j*Math.PI/4;h+=`<circle cx="${e.x+Math.cos(a)*(5+t*10)}" cy="${e.y+Math.sin(a)*(5+t*10)}" r="${.65*(1-t)}" fill="${e.color}"/>`;}h+='</g>';}
    h+=countLabels;
    const focused=board.contains(document.activeElement)?document.activeElement.dataset.id:null;
    board.innerHTML=h;if(focused)board.querySelector(`[data-id="${focused}"]`)?.focus({preventScroll:true});
    refreshWheel();
    shell.classList.toggle('battle-ended',!!over);
  };
  const button=(i,action,active=false,label='Queue')=>`<button type="button" class="fruit-button ${active?'on':''}" data-act="${action}${i}" aria-label="${label} ${escape(T[i][1])}" title="${escape(T[i][1])}" ${action==='q'?'':`aria-pressed="${active}"`}>${icon(i)}${action==='q'?productionBadge(i):''}<span>${escape(T[i][1])}</span></button>`;
  panel=function(){
    const me=player(), c=N['P'+me];
    const status=over?'':c.disabled?'Your castle fell. Your fruit joined the captor. Spectating the remaining players.':escape(msg||'Choose your next move. Drag from your castle or an outpost to create a route.');
    if(status!==statusHTML){document.getElementById('msg').innerHTML=status;statusHTML=status;}
    let h=c.disabled||noQueueMode()?'':`<div class="queue-strip" aria-label="Queue"><span>${c.q.length?c.q.map((i,index)=>`<button type="button" class="queued-fruit" data-act="dropq${index}" aria-label="Remove queued ${escape(T[i][1])}">${icon(i,'queue-icon')}${productionBadge(i)}</button>`).join(''):'Tap a fruit to queue'}</span></div><div class="fruit-palette">${T.map((_,i)=>button(i,'q')).join('')}</div>`;
    if(sel&&N[sel]?.owner===me&&N[sel].cd>0)h+=`<div class="transform-status">Transforming · ${N[sel].cd.toFixed(1)}s <button data-act="cancel">Cancel</button></div>`;
    document.getElementById('panel').hidden=noQueueMode()&&!h;
    if(h!==panelHTML){const active=document.activeElement,action=document.getElementById('panel').contains(active)?active.dataset.act:null;document.getElementById('panel').innerHTML=h;panelHTML=h;if(action)document.querySelector(`#panel [data-act="${action}"]`)?.focus({preventScroll:true});}
  };
  document.getElementById('msg').setAttribute('aria-live','polite');
  const refreshWheel=()=>{
    if(typeWheel.hidden)return;
    const node=window.boardNodes()[typeWheel.dataset.node];
    if(!node||node.owner!==player()){closeWheel();return;}
    typeWheel.querySelectorAll('button[data-type]').forEach(button=>{
      const i=Number(button.dataset.type),selected=queuedCastle(node)?node.selectedType===i:(node.pend??node.ut)===i;
      button.disabled=queuedCastle(node)&&node.stock[i]<=CONFIG.strengthEpsilon;
      button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-label',queuedCastle(node)?`${T[i][1]}, ${strengthLabel(node.stock[i])} available`:`Produce ${T[i][1]}`);
      button.classList.toggle('on',selected);
      button.innerHTML=icon(i)+(queuedCastle(node)?`<small>${strengthLabel(node.stock[i])}</small>`:'');
    });
  };
  window.refreshTypeWheel=refreshWheel;
  const oldWheel=openWheel;
  openWheel=function(...args){oldWheel(...args);if(!typeWheel.hidden){refreshWheel();vibrate(18)}};
  render();panel();
})();
