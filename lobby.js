const lobby = document.querySelector("#lobby");
const form = lobby.querySelector("form");
const statusText = lobby.querySelector("[role=status]");
const roster = lobby.querySelector("#friends");
const nameInput = form.elements.namedItem("name");
const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const endpoint = window.FRUIT_WARS_LOBBY || (local && !window.FRUIT_WARS_SPACETIME_DB ? "http://localhost:8787/lobby" : "");
const turnEndpoint = endpoint ? "" : window.FRUIT_WARS_TURN_ENDPOINT;
const historyPanel = !endpoint && window.FRUIT_WARS_SPACETIME_DB && document.querySelector("#match-history");
if(historyPanel)historyPanel.hidden=false;
const accountPanel = historyPanel && window.FRUIT_WARS_AUTH_CLIENT && document.querySelector("#profile-account");
const accountButton = accountPanel && accountPanel.querySelector("#account-action");
const accountStatus = accountPanel && accountPanel.querySelector("#account-status");
let signedInAccount, currentCatalog;
if(accountPanel)accountPanel.hidden=false;
const savedName = localStorage.getItem("fruit-wars-name") || ("Player " + crypto.randomUUID().slice(0,6).toUpperCase());
// Connections are per tab, so two tabs in one browser can occupy different seats.
const token = crypto.randomUUID();
nameInput.value = savedName;
document.querySelector("#profile-name").textContent = savedName;
localStorage.setItem("fruit-wars-name",savedName);
function labelProfile(summary,label){if(!summary)return;summary.title=label;summary.setAttribute("aria-label",label+" profile");}
labelProfile(document.querySelector("#friend-summary"),savedName+" · player profile and friends");
let name=savedName, player=1, frame, editionURL, session=false, leaving=false, inviting=false;
let iceServers=[], lastFriends=[], incoming=[], turnServers=[],turnCacheUntil=0,turnRequest;
const links=new Map(),pendingInvites=new Map();
let historyRound,historyNotice="";
let pendingEntry, handoff, convertedPlayId, openSequence=0, adopting=false;
const deferredEntries=[];
function openActivity(){
  if(player!==1||adopting)return null;
  const active=frame?game()?.active:window.botGame?.active;
  if(!active)return null;
  return {join:!!(frame?game()?.bestBot():window.botGame?.bestBot())};
}
function nextBot(){return frame?game()?.bestBot():window.botGame?.bestBot()}
function loadTurnServers() {
  if (!turnEndpoint || Date.now() < turnCacheUntil) return Promise.resolve(turnServers);
  turnRequest ??= fetch(turnEndpoint, { cache: "no-store", signal: AbortSignal.timeout(2500) })
    .then(async response => {
      if (!response.ok) throw new Error("TURN credentials unavailable");
      const { iceServers: servers, ttl } = await response.json();
      turnServers = servers.flatMap(server => {
        const urls = [server?.urls].flat().filter(url =>
          typeof url === "string" && /^turns?:[^\s]+$/.test(url) && !/:53(?:\?|$)/.test(url));
        if (!urls.length || typeof server.username !== "string" || !server.username ||
          typeof server.credential !== "string" || !server.credential) return [];
        return [{ urls, username: server.username, credential: server.credential }];
      });
      if (!turnServers.length || !Number.isFinite(ttl) || ttl < 60) throw new Error("Invalid TURN configuration");
      turnCacheUntil = Date.now() + Math.min(ttl * 1000 - 30_000, 20 * 60 * 60 * 1000);
      return turnServers;
    })
    .catch(() => {
      turnServers = [];
      turnCacheUntil = Date.now() + 60_000;
      return turnServers;
    })
    .finally(() => { turnRequest = null; });
  return turnRequest;
}

const pendingSoloPlays=new Map();
function recordSoloPlay(mapId){
  if(!historyPanel)return;
  const id=crypto.randomUUID();pendingSoloPlays.set(id,mapId);
  return id;
}
function finishSoloPlay(id,mapId,win){
  if(id && historyPanel)void request('record-solo',{id,mapId,win}).catch(()=>status('Could not save this solo result.'));
}
function game(){return frame?.contentWindow?.matchGame}
function status(message){statusText.textContent=message;const display=frame?.contentDocument?.querySelector("#match-status");if(display)display.textContent=message}
function rename(value){
  if(typeof value!=="string"||!value.trim())return;
  name=value.trim().slice(0,32);nameInput.value=name;localStorage.setItem("fruit-wars-name",name);
  document.querySelector("#profile-name").textContent=name;labelProfile(document.querySelector("#friend-summary"),name+" · player profile and friends");
  if(frame?.contentDocument){const field=frame.contentDocument.querySelector("#match-name");if(field)field.value=name}
  updateMembers();
}

async function saveName(value){
  rename(value);
  try{
    if(signedInAccount?.profile!==undefined)await request("rename-account");
    status("Name saved.");
  }catch{
    status("Could not sync your display name. Try again.");
  }
}
async function request(action,fields={}){
  if(!endpoint)return publicLobby(action,name,fields);
  const response=await fetch(endpoint,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({action,name,...fields}),signal:AbortSignal.timeout(7000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
}
function availableFriends(){return lastFriends.filter(f=>f.online!==false&&![...links.values()].some(l=>l.id===f.id))}
function updateMembers(){
  if(!game()||!frame.dataset.started)return;
  if(player===1){
    game().setMembers([{seat:1,name,connected:true},...[...links.values()].filter(l=>l.seat>0).map(l=>({seat:l.seat,name:l.name,connected:l.connected&&!l.left}))]);
    game().setSpectators([...links.values()].some(l=>l.seat===0&&!l.left));
  }
  game().setFriends(availableFriends());
}
function launchGame(){
  if(!game()||!session||player===null)return;
  if(!frame.dataset.started){frame.dataset.started="true";if(currentCatalog)game().setCatalog(currentCatalog);
    if(handoff){convertedPlayId=handoff.soloPlayId;game().adopt(handoff,transmit);handoff=null;adopting=false;window.botGame?.retire()}
    else game().start(player,transmit,player===1?[1,...[...links.values()].filter(l=>l.seat>0).map(l=>l.seat)]:player===0?[1]:[1,player]);
  }
  updateMembers();
  if(player===1&&[...links.values()].some(l=>l.seat>0&&l.connected))game().reportParticipants();
  for(const [link,data]of incoming.splice(0))if(links.get(link.room)===link)game().receive(data,player===1?link.seat:1);
  if(player===1&&!adopting)for(const entry of deferredEntries.splice(0)){
    if(entry.link){if(links.get(entry.link.room)===entry.link)joinSpectatedGame(entry.link)}
    else void admitEntry(entry);
  }
}
function showMatch(){
  if(frame)return;
  document.querySelector('.endgame-dialog')?.close();
  editionURL=location.href;const page=new URL("./match.html",editionURL);frame=document.createElement("iframe");frame.title="Fruit Wars multiplayer match";
  frame.allowFullscreen=true;
  frame.style.cssText="position:fixed;inset:0;width:100%;height:100%;border:0;z-index:100;background:var(--bg)";
  frame.onload=()=>{status(statusText.textContent);frame.contentDocument.querySelector("#match-name").value=name;launchGame()};frame.src=page.href;
  document.querySelector("main").inert=true;document.body.append(frame);history.pushState({fruitWarsMatch:true},"",page.href);
}
function addAction(label,action){const button=document.createElement("button");button.type="button";button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await action()}catch(error){status(error.message)}finally{button.disabled=false}};return button}
function renderInvitations(){
  const host=document.querySelector("#invite-toasts");host.replaceChildren();
  for(const invite of pendingInvites.values()){
    const toast=document.createElement("div");toast.className="invite-toast";toast.setAttribute("role","alert");toast.append(document.createTextNode(invite.name+" invited you. "));
    toast.append(addAction("Accept",()=>acceptInvite(invite)),addAction("Decline",async()=>{pendingInvites.delete(invite.room);renderInvitations();await request("leave",{room:invite.room})}));host.append(toast);
  }
}
function statsLine({wins,played},solo) {
  return 'Multiplayer · '+wins+' wins · '+(played-wins)+' losses · '+played+' games · '+(played?Math.round(wins*100/played):0)+'% wins'+
    ' / Solo · '+(solo?.wins??0)+' wins in '+(solo?.played??0)+' games';
}
function renderRoster(friends){
  lastFriends=friends;roster.replaceChildren();
  const ordered=[...friends].sort((a,b)=>Number(a.online===false)-Number(b.online===false)||a.name.localeCompare(b.name));
  document.querySelector("#online-count").textContent=friends.filter(friend=>friend.online!==false).length+" online";
  for(const friend of ordered){const row=document.createElement("li");const dot=document.createElement("span");dot.className="presence-dot"+(friend.online===false?" offline":"");
    const identity=document.createElement("strong");identity.textContent=friend.name;
    const detail=document.createElement("small");
    detail.textContent=friend.online===false
      ? (friend.lastOnline?"Last online "+new Date(friend.lastOnline).toLocaleString():"Offline")
      : (friend.activity?(friend.activity.join?"In game · Open to join":"In game"):"Online");
    const info=document.createElement("div");
    info.append(identity,detail);
    row.append(dot,info);
    roster.append(row);
    if(friend.online===false)continue;

    const actions=document.createElement("div");
    actions.className="friend-actions";
    actions.setAttribute("role","group");
    actions.setAttribute("aria-label","Actions for "+friend.name);
    row.append(actions);
    if(friend.activity){
      const watch=addAction("Spectate",()=>enterGame(friend.id,"spectate"));watch.disabled=session;actions.append(watch);
      if(friend.activity.join){const join=addAction("Join",()=>enterGame(friend.id,"join"));join.disabled=session;actions.append(join)}
    }
    const invite=[...pendingInvites.values()].find(i=>i.from===friend.id);
    const button=invite?addAction("Accept",()=>acceptInvite(invite)):addAction("Invite",()=>invitePlayer(friend.id));
    button.disabled=session&&(player!==1||[...links.values()].filter(l=>l.seat>0).length>=7||game()?.started||[...links.values()].some(l=>l.id===friend.id));actions.append(button);
  }
  if(!friends.length){const row=document.createElement("li");row.textContent="No other players yet.";roster.append(row)}
  game()?.setFriends(availableFriends());
}
function makeLink(room,seat,id,name){const link={room,seat,id,name,created:Date.now(),seen:Date.now(),connected:false,accepted:false,relay:false,pc:null,channel:null,state:null,candidates:[],outgoing:Promise.resolve(),lastState:0};links.set(room,link);return link}
async function enterGame(id,mode){
  if(session||pendingEntry||inviting)return;
  pendingEntry={id,mode,at:Date.now()};
  try{await request("enter",{to:id,mode});status(mode==="join"?"Joining the game…":"Opening spectator view…")}
  catch(error){pendingEntry=null;throw error}
}
async function admitEntry(event){
  if(player!==1)return;
  if(adopting){if(deferredEntries.length<100)deferredEntries.push(event);return}
  if(!openActivity()||!["join","spectate"].includes(event.mode)||[...links.values()].some(l=>l.id===event.from&&!l.left))return;
  const seat=event.mode==="join"?nextBot():0;
  if(seat===null||seat===undefined)return;
  // Reserve synchronously before signaling; concurrent joins cannot claim the same bot.
  const reservation=makeLink("pending:"+crypto.randomUUID(),seat,event.from,event.name);
  session=true;
  if(seat>0&&!frame){handoff=window.botGame.exportState();handoff.sequence=openSequence;adopting=true;showMatch();launchGame()}
  updateMembers();
  try{
    const {room}=await request("invite",{to:event.from});
    if(links.get(reservation.room)!==reservation){void request("leave",{room}).catch(()=>{});return}
    links.delete(reservation.room);reservation.room=room;links.set(room,reservation);
  }catch(error){removeLink(reservation,error.message)}
}
function joinSpectatedGame(link){
  if(player!==1||link.seat!==0)return;
  if(adopting){if(deferredEntries.length<100)deferredEntries.push({link});return}
  if(!openActivity())return;
  const seat=nextBot();if(!seat){sendLink(link,{kind:"join-unavailable"});return}
  link.seat=seat;link.welcomed=false;
  if(!frame){handoff=window.botGame.exportState();handoff.sequence=openSequence;adopting=true;showMatch();launchGame()}
  updateMembers();sendLink(link,{kind:"welcome",seat});game()?.rebind(transmit);game()?.reportParticipants();
}
async function invitePlayer(id){
  if(inviting||player!==1||[...links.values()].filter(l=>l.seat>0).length>=7||game()?.started)return;
  const friend=lastFriends.find(f=>f.id===id);if(!friend||friend.online===false||[...links.values()].some(l=>l.id===id))return;
  inviting=true;let reservation;
  try{
    const seat=[2,3,4,5,6,7,8].find(p=>![...links.values()].some(l=>l.seat===p));
    // Reserve the seat before awaiting the service so ready-up cannot race an invite.
    reservation=makeLink("pending:"+crypto.randomUUID(),seat,id,friend.name);session=true;showMatch();launchGame();updateMembers();
    const result=await request("invite",{to:id});
    if(links.get(reservation.room)!==reservation){void request("leave",{room:result.room}).catch(()=>{});return}
    links.delete(reservation.room);reservation.room=result.room;links.set(result.room,reservation);status("Invitation sent to "+friend.name+".");
  }catch(error){if(reservation)removeLink(reservation,"Invitation failed.");throw error}
  finally{inviting=false}
}
async function acceptInvite(invite){
  if(session||inviting)return;inviting=true;
  try{
    await request("accept",{room:invite.room});
    player=null;session=true;const link=makeLink(invite.room,1,invite.from,invite.name);link.accepted=true;
    for(const other of pendingInvites.values())if(other.room!==invite.room)void request("leave",{room:other.room}).catch(()=>{});
    pendingInvites.clear();renderInvitations();showMatch();status("Connecting to the host…");await connect(link,false);
  }finally{inviting=false}
}
function closePeer(link){const pc=link.pc;link.pc=null;if(link.channel){link.channel.onclose=null;link.channel.onopen=null}link.channel=link.state=null;pc?.close()}
function removeLink(link,message){
  if(!links.has(link.room))return;clearTimeout(link.timer);closePeer(link);links.delete(link.room);incoming=incoming.filter(([l])=>l!==link);
  if(player===1){if(!frame&&!links.size)session=false;updateMembers();status(message)}else reset(message,false);
}
function reset(message,notify=true){
  leaving=true;
  historyRound=undefined;
  pendingEntry=null;handoff=null;convertedPlayId=null;adopting=false;
  deferredEntries.length=0;
  for(const link of links.values()){clearTimeout(link.timer);closePeer(link);if(notify)void request("leave",{room:link.room}).catch(()=>{})}
  links.clear();incoming=[];session=false;player=1;
  if(frame){frame.onload=null;frame.remove();frame=null;document.querySelector("main").inert=false;if(history.state?.fruitWarsMatch)history.replaceState(null,"",editionURL)}
  pendingInvites.clear();renderInvitations();lobby.closest("details").open=true;status(message);leaving=false;
}
function sendLink(link,data){
  if(!link.accepted||link.left)return;
  if(!link.relay){const channel=data.kind==="state"?link.state:link.channel;if(channel?.readyState==="open"){
    if(data.kind==="state"&&channel.bufferedAmount>=32000)return;
    try{
      const raw=JSON.stringify(data);
      if(raw.length<=8000)channel.send(raw);
      else{const id=crypto.randomUUID(),total=Math.ceil(raw.length/8000);if(total>128)return;for(let part=0;part<total;part++)channel.send(JSON.stringify({kind:"fragment",id,part,total,text:raw.slice(part*8000,(part+1)*8000)}))}
    }catch{void fallback(link)}
    return;
  }}
  if(!link.relay)return;
  if(data.kind==="state"){
    if(performance.now()-link.lastState<120||link.statePending)return;link.lastState=performance.now();link.statePending=true;
    request("game",{room:link.room,game:data}).catch(()=>{}).finally(()=>{link.statePending=false});
  }else{
    // Keep controls ordered, but never replay expired commands after a long outage.
    const expires=Date.now()+10000;
    link.outgoing=link.outgoing.then(()=>links.get(link.room)===link&&Date.now()<expires?request("game",{room:link.room,game:data}):undefined).catch(()=>{});
  }
}
function transmit(data,target){
  for(const link of links.values())if(player!==1||target===undefined||link.seat===target)sendLink(link,data);
}
function linkOpened(link){
  if(links.get(link.room)!==link)return;
  const reconnect=!link.connected;link.connected=true;link.seen=Date.now();
  if(player===1){sendLink(link,{kind:"welcome",seat:link.seat});updateMembers();if(reconnect){game()?.rebind(transmit);if(link.seat>0)game()?.reportParticipants()}}
  status(player===0?"Spectating the game.":"Match connected.");
}
function receiveRelayGame(room,data){const link=links.get(room);if(link?.accepted){if(!link.relay)startRelay(link);receiveGame(link,data)}}
function receiveGame(link,data){
  if(!data||typeof data!=="object"||links.get(link.room)!==link||link.left)return;
  if(data.kind==="fragment"){
    if(typeof data.id!=="string"||!Number.isInteger(data.total)||data.total<1||data.total>128||!Number.isInteger(data.part)||data.part<0||data.part>=data.total||typeof data.text!=="string"||data.text.length>8000)return;
    link.fragments??=new Map();for(const [id,entry]of link.fragments)if(Date.now()-entry.created>5000)link.fragments.delete(id);
    if(!link.fragments.has(data.id)){if(link.fragments.size>=3)link.fragments.delete(link.fragments.keys().next().value);link.fragments.set(data.id,{created:Date.now(),total:data.total,parts:new Map()})}
    const entry=link.fragments.get(data.id);if(entry.total!==data.total)return;entry.parts.set(data.part,data.text);
    if(entry.parts.size===entry.total){link.fragments.delete(data.id);try{receiveGame(link,JSON.parse(Array.from({length:entry.total},(_,part)=>entry.parts.get(part)).join("")))}catch{}}
    return;
  }
  link.seen=Date.now();
  if(data.kind==="join-game"&&player===1){joinSpectatedGame(link);return}
  if(data.kind==="join-unavailable"){status("No eligible teammate or bot is available to join.");return}
  if(data.kind==="welcome"&&player!==1){
    if(!Number.isInteger(data.seat)||data.seat<0||data.seat===1||data.seat>8||(player!==null&&player!==0&&player!==data.seat))return;
    if(player===0&&data.seat>0)game()?.takeSeat(data.seat);
    player=data.seat;link.connected=true;launchGame();sendLink(link,{kind:"welcome-ack"});return;
  }
  if(data.kind==="welcome-ack"&&player===1){link.welcomed=true;game()?.rebind(transmit);return}
  if(!link.connected){link.connected=true;updateMembers();if(player===1){sendLink(link,{kind:"welcome",seat:link.seat});game()?.rebind(transmit)}}
  if(data.kind==="heartbeat")return;
  if(player===1&&link.seat===0&&!frame){if(data.kind==="ping"&&Number.isSafeInteger(data.token))sendLink(link,{kind:"pong",token:data.token});return}
  if(player===null||!game()||!frame.dataset.started){if(incoming.length<100)incoming.push([link,data]);return}
  game().receive(data,player===1?link.seat:1);
}
function startRelay(link){if(links.get(link.room)!==link||link.relay)return;clearTimeout(link.timer);closePeer(link);link.relay=true;linkOpened(link)}
async function fallback(link){
  if(links.get(link.room)!==link||link.relay)return;
  try{await request("relay",{room:link.room});startRelay(link)}catch{status("Reconnecting to the relay…")}
}
function attach(link,channel){
  if(channel.label==="state")link.state=channel;else link.channel=channel;
  channel.onopen=()=>{if(channel.label!=="state"){clearTimeout(link.timer);linkOpened(link)}};
  channel.onmessage=event=>{try{receiveGame(link,JSON.parse(event.data))}catch{status("Ignored an invalid match message.")}};
  channel.onclose=()=>{if(!leaving&&links.get(link.room)===link)void fallback(link)};
}
async function connect(link,host){
  try{
    const turn=await loadTurnServers();if(links.get(link.room)!==link||link.relay)return;
    const pc=new RTCPeerConnection({iceServers:[...iceServers,...turn]});link.pc=pc;
    // Every candidate is sent; no dependency on timing of SDP publication.
    pc.onicecandidate=({candidate})=>{if(candidate&&link.pc===pc)void request("candidate",{room:link.room,candidate:candidate.toJSON()}).catch(()=>{})};
    pc.onconnectionstatechange=()=>{if(link.pc===pc&&pc.connectionState==="failed")void fallback(link)};
    if(host){attach(link,pc.createDataChannel("match"));attach(link,pc.createDataChannel("state",{ordered:false,maxRetransmits:0}))}
    else pc.ondatachannel=event=>attach(link,event.channel);
    link.timer=setTimeout(()=>void fallback(link),turn.length?15000:8500);
    if(host){await pc.setLocalDescription();if(link.pc===pc)await request("signal",{room:link.room,description:pc.localDescription})}
    for(const description of (link.descriptions||[]))await receiveSignal(link,description);link.descriptions=[];
  }catch{void fallback(link)}
}
async function receiveSignal(link,description){
  const pc=link.pc;if(!pc){(link.descriptions??=[]).push(description);return}
  if(link.relay)return;
  try{
    await pc.setRemoteDescription(description);
    for(const candidate of link.candidates.splice(0))await pc.addIceCandidate(candidate).catch(()=>{});
    if(description.type==="offer"){await pc.setLocalDescription();if(link.pc===pc)await request("signal",{room:link.room,description:pc.localDescription})}
  }catch{void fallback(link)}
}
async function handleEvent(event){
  if(event.kind==="entry-request"){await admitEntry(event);return}
  if(event.kind==="invite"){
    if(pendingEntry?.id===event.from){pendingEntry=null;await acceptInvite(event);return}
    if(session){void request("leave",{room:event.room}).catch(()=>{});return}
    pendingInvites.set(event.room,{...event,expiresAt:event.expiresAt||Date.now()+30000});renderInvitations();lobby.closest("details").open=true;return;
  }
  if(event.kind==="leave"||event.kind==="expired"){pendingInvites.delete(event.room);renderInvitations()}
  const link=links.get(event.room);if(!link)return;
  if(event.kind==="accept"&&!link.accepted){link.accepted=true;link.seen=Date.now();void connect(link,true)}
  else if(event.kind==="signal")await receiveSignal(link,event.description);
  else if(event.kind==="candidate"&&event.candidate){if(link.pc?.remoteDescription)await link.pc.addIceCandidate(event.candidate).catch(()=>{});else if(link.candidates.length<128)link.candidates.push(event.candidate)}
  else if(event.kind==="relay")startRelay(link);
  else if(event.kind==="game")receiveRelayGame(link.room,event.game);
  else if(event.kind==="leave"||event.kind==="expired"){
    if(player===1&&link.seat>0&&game()?.started){link.left=true;link.connected=false;closePeer(link);updateMembers();status(link.name+" left. A bot now controls their fruit.")}
    else removeLink(link,"A player left or declined the match.");
  }
}

function renderMatchHistory(data) {
  if(!historyPanel)return;
  const historyStatus=historyPanel.querySelector("#history-status");
  historyStatus.textContent=historyNotice||(data?.saveError??(data?.pending?"Saving match result…":data?"":"Connecting to match history…"));
  const recent=historyPanel.querySelector("#recent-matches");
  const rivalries=historyPanel.querySelector("#head-to-head");
  if(!data){
    recent.replaceChildren();
    rivalries.replaceChildren();
    return;
  }
  if(!historyPanel.open)return;

  const dateFormat=new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"});
  const item=(label,detail)=>{
    const li=document.createElement("li");
    li.textContent=label;
    if(detail){
      const small=document.createElement("small");
      small.textContent=detail;
      li.append(small);
    }
    return li;
  };

  const matches=data.matches.sort((a,b)=>a.finishedAt>b.finishedAt?-1:1).map(match=>{
    const winner=match.players.find(player=>player.seat===match.winner);
    const map=data.maps?.get(match.id) || defaultMaps[match.rules.map]?.name || "Community map";
    const teams=data.teamMatches?.has(match.id)?match.rules.teamSize??2:false;
    const seats=match.players.filter(p=>p.profile===data.profile);
    const won=seats.some(p=>sameSide(p.seat,match.winner,teams));
    const outcome=won?"Won":"Lost";
    const opponents=match.players.filter(player=>player.profile!==data.profile && (!teams || !seats.some(p=>sameSide(p.seat,player.seat,teams)))).map(player=>player.name);
    const players=opponents.length?" vs "+opponents.join(", "):" · shared browser";
    const duration=Math.floor(match.durationSeconds/60)+":"+String(match.durationSeconds%60).padStart(2,"0");
    const rules=match.rules;
    const speed=rules.speed===.5?"Relaxed":rules.speed===1?"Standard":"Fast";
    const extras=[
      teams&&"Teams of "+teams,rules.shops&&"Shop Nodes",rules.fullElimination&&"Full elimination",rules.portionControl&&"Portion control",
      rules.productionRotation&&"Production rotation",rules.transformationPenalty&&"Transformation penalty",rules.transformationWave&&("Transformation Wave ("+rules.transformationTime+"s)"),
    ].filter(Boolean);
    const date=dateFormat.format(Number(match.finishedAt/1000n));
    const winnerLabel=won?"":teams?"Team "+teamNumber(match.winner,teams||2)+" won":(winner?.name||"Bot "+match.winner)+" won";
    return item(outcome+players,[winnerLabel,map,duration,date,speed,...extras].filter(Boolean).join(" · "));
  });
  recent.replaceChildren(...(matches.length?matches:[item("No completed online matches yet.")]));

  const records=data.rivalries.sort((a,b)=>b.played-a.played||a.name.localeCompare(b.name)).map(record=>
    item(record.name,record.played+(record.played===1?" match":" matches")+" · "+record.wins+" your wins · "+record.opponentWins+" their wins"));
  rivalries.replaceChildren(...(records.length?records:[item("No head-to-head records yet.")]));
}

function renderAccount(data) {
  if(!accountPanel||!data)return;
  const previous=signedInAccount;
  signedInAccount=data;
  const signedIn=data.profile!==undefined;
  accountButton.textContent=signedIn?"Sign out":"Sign in with email";
  accountStatus.textContent=data.message||(signedIn?"Profile synced.":"");
  historyPanel.querySelector("#history-owner").textContent=signedIn
    ?"Casual results reported by the host. Your history follows your signed-in profile."
    :"Casual results reported by the host. Your history is linked to this browser.";
  const stats=document.querySelector("#player-stats");
  stats.hidden=!data.stats;
  if(data.stats)stats.textContent=statsLine(data.stats,data.solo);
  if(signedIn&&data.name!==previous?.name)rename(data.name);
}

async function poll(){
  try{
    const data=await request("poll",{activity:openActivity()});iceServers=data.iceServers||[];
    if(pendingEntry&&Date.now()-pendingEntry.at>15000){pendingEntry=null;status("That game is no longer available. Try another game.")}
    for(const event of data.events)await handleEvent(event);
    const now=Date.now();for(const [room,invite]of pendingInvites)if(invite.expiresAt<=now)pendingInvites.delete(room);
    renderInvitations();renderRoster(data.friends);labelProfile(document.querySelector("#friend-summary"),name+" · "+data.friends.filter(f=>f.online!==false).length+" players online");
    renderAccount(data.account);
    if(data.community){
      if(currentCatalog!==data.community){
        currentCatalog=data.community;
        loadMapCatalog(currentCatalog);
        dispatchEvent(new Event("map-catalog"));
        game()?.setCatalog(currentCatalog);
      }
      mapLibrary.sync(currentCatalog,data.account?.profile);
      for(const [id,mapId] of pendingSoloPlays){
        await request('start-map-play',{id,mapId});
        pendingSoloPlays.delete(id);
      }
    }
    renderMatchHistory(data.matchHistory);
    if(!session)status(data.directoryUnavailable?"Lobby is unreachable. Retrying…":"You’re online.");
  }catch{status(session?"Lobby unavailable. Retrying; your match is retained.":"Lobby is unreachable. Retrying…")}
  finally{setTimeout(poll,endpoint&&session?180:900)}
}
setInterval(()=>{
  const now=Date.now();
  for(const link of links.values()){
    if(link.left)continue;
    if(!link.accepted&&now-link.created>30000){void request("leave",{room:link.room}).catch(()=>{});removeLink(link,"An invitation expired.");continue}
    if(link.accepted){
      sendLink(link,{kind:"heartbeat"});
      if(now-link.seen>12000&&!link.relay)void fallback(link);
      if(now-link.seen>20000&&link.connected){link.connected=false;updateMembers();status(player===1?link.name+(link.seat===0?" stopped spectating.":" disconnected. A bot controls their fruit until they reconnect."):"Host disconnected. Waiting to resume; you can leave from your profile.")}
      if(player===1&&!link.welcomed)sendLink(link,{kind:"welcome",seat:link.seat});
    }
  }
},3000);
setInterval(()=>{
  if(player!==1||frame||!window.botGame||![...links.values()].some(l=>l.seat===0&&l.accepted&&!l.left))return;
  const state=window.botGame.exportState();if(!state)return;
  transmit({...state,kind:"state",round:0,sequence:openSequence++,ack:-1,gameStarted:true,countdownRemaining:0,
    humans:[1],connected:[1],members:[{seat:1,name,connected:true}]},0);
},250);
addEventListener("message",event=>{
  if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
  if(historyPanel&&player===1&&event.data?.kind==="match-history-start"){
    const {round,rules,seats}=event.data;
    const guests=[...links.values()].filter(link=>link.accepted&&link.seat>0&&seats.includes(link.seat))
      .map(({room,seat,name})=>({room,seat,name}));
    const existing=historyRound?.round===round;
    historyRound={round,id:existing?historyRound.id:convertedPlayId||crypto.randomUUID(),hostName:name,guests,rules};convertedPlayId=null;
    if(currentCatalog&&!existing)void request("start-map-play",{id:historyRound.id,mapId:rules.map}).catch(()=>{});
  }
  if(historyPanel&&player===1&&event.data?.kind==="match-history-finish"&&historyRound?.round===event.data.round){
    const {round,...result}=historyRound;
    historyRound=undefined;
    const {winner,durationSeconds}=event.data;
    void request("record-match",{...result,winner,durationSeconds}).catch(()=>{historyNotice="A match result could not be saved."});
  }
  if(event.data?.kind==="leave-match")reset("You left the match.");
  if(event.data?.kind==="join-game"&&player===0)transmit({kind:"join-game"});
  if(event.data?.kind==="rename")void saveName(event.data.name);
  if(event.data?.kind==="invite-player")void invitePlayer(event.data.to).catch(error=>status(error.message));
  if(event.data?.kind==="remove-player"&&player===1&&!game()?.started){const link=[...links.values()].find(l=>l.seat===event.data.seat);if(link){void request("leave",{room:link.room}).catch(()=>{});removeLink(link,"Player removed from setup.")}}
});
addEventListener("popstate",()=>{if(frame)reset("You left the match.")});
form.onsubmit=event=>{
  event.preventDefault();
  form.hidden=true;
  void saveName(nameInput.value);
};
if(accountButton)accountButton.onclick=async()=>{
  accountButton.disabled=true;
  try {
    await request(signedInAccount?.profile!==undefined?"sign-out":"sign-in");
  } catch {
    accountStatus.textContent="Could not change sign-in status. Try again.";
  } finally {
    accountButton.disabled=false;
  }
};
document.querySelector("#edit-profile-name").onclick=()=>{form.hidden=!form.hidden;if(!form.hidden)nameInput.focus()};
status("Connecting to the lobby…");poll();
