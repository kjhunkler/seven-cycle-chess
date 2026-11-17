const lobby = document.querySelector("#lobby");
const form = lobby.querySelector("form");
const statusText = lobby.querySelector("[role=status]");
const roster = lobby.querySelector("#friends");
const nameInput = form.elements.namedItem("name");
const endpoint = window.FRUIT_WARS_LOBBY || (location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "http://localhost:8787/lobby" : "");
const turnEndpoint = endpoint ? "" : window.FRUIT_WARS_TURN_ENDPOINT;
const savedName = localStorage.getItem("fruit-wars-name") || ("Player " + crypto.randomUUID().slice(0,6).toUpperCase());
const token = localStorage.getItem("fruit-wars-profile") || crypto.randomUUID();
localStorage.setItem("fruit-wars-profile", token);
nameInput.value = savedName;
document.querySelector("#profile-name").textContent = savedName;
localStorage.setItem("fruit-wars-name",savedName);
function labelProfile(summary,label){if(!summary)return;summary.title=label;summary.setAttribute("aria-label",label+" profile");}
labelProfile(document.querySelector("#friend-summary"),savedName+" · player profile and friends");
let name = savedName, room = "", peer = null, channel = null, iceServers = [], timeout;
let player = 1, frame, editionURL, matchStart, stateChannel, receiveAt, heartbeat;
const pendingInvites = new Map();
let outgoing = Promise.resolve();
let relay = false, relayTimer, lastRelayFrame = 0;
let turnServers = [], turnCacheUntil = 0, turnRequest;
let remoteCandidates = [];

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

function status(message) {
  statusText.textContent = message;
  const display = frame?.contentDocument?.querySelector("#match-status");
  if (display) display.textContent = message;
}
function rename(value) {
  if (typeof value !== "string" || !value.trim()) return;
  name = value.trim().slice(0,32);
  nameInput.value = name;
  document.querySelector("#profile-name").textContent = name;
  labelProfile(document.querySelector("#friend-summary"),name+" · player profile and friends");
  localStorage.setItem("fruit-wars-name",name);
  if(frame)labelProfile(frame.contentDocument.querySelector("#match-profile-name"),name+" · player profile");
}
function showMatch() {
  if (frame) return;
  editionURL = location.href;
  const page = new URL("./match.html",editionURL);
  frame = document.createElement("iframe");
  frame.title = "Fruit Wars multiplayer match";
  frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:100;background:var(--bg)";
  frame.onload = () => {
    status(statusText.textContent);
    frame.contentDocument.querySelector("#match-name").value = name;
    labelProfile(frame.contentDocument.querySelector("#match-profile-name"),name+" · player profile");
    launchGame();
  };
  frame.src = page.href;
  document.querySelector("main").inert = true;
  document.body.append(frame);
  history.pushState({fruitWarsMatch:true},"",page.href);
}
function launchGame() {
  if (!frame || frame.dataset.started || !matchStart || !frame.contentWindow.matchGame) return;
  frame.dataset.started="true";
  frame.contentWindow.matchGame.start(player,matchStart);
}
function startMatch(transmit) {
  showMatch();
  matchStart = transmit;
  if (frame.dataset.started && frame.contentWindow.matchGame) frame.contentWindow.matchGame.start(player,transmit);
  else launchGame();
  receiveAt = Date.now();
  clearInterval(heartbeat);
  heartbeat = setInterval(() => {
    if (Date.now()-receiveAt > 20_000) reset("Your friend stopped responding.");
    else transmit({kind:"heartbeat"});
  },3000);
}
function receiveGame(data) {
  if (!matchStart || !data || typeof data!=="object") return;
  receiveAt = Date.now();
  if (data.kind!=="heartbeat") frame?.contentWindow.matchGame?.receive(data);
}
addEventListener("message",event=>{
  if (event.origin!==location.origin || event.source!==frame?.contentWindow) return;
  if (event.data?.kind==="leave-match") reset("You left the match.");
  if (event.data?.kind==="rename") {rename(event.data.name);status("Name saved.");}
});
addEventListener("popstate",()=>{ if(frame) reset("You left the match."); });

async function request(action, fields = {}) {
  if (!endpoint) return publicLobby(action, name, fields);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ action, name, ...fields }),
    signal: AbortSignal.timeout(7000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

async function acceptInvite(invite) {
  if (room) return;
  await request("accept", { room: invite.room });
  pendingInvites.delete(invite.key);
  reserve(invite.room);
  await connect(false);
  renderInvitations();
  renderRoster(lastFriends);
}
let lastFriends=[];
function renderInvitations() {
  const host = document.querySelector("#invite-toasts");
  host.replaceChildren();
  for (const invite of pendingInvites.values()) {
    const toast = document.createElement("div");
    toast.className = "invite-toast";
    toast.setAttribute("role", "alert");
    toast.append(document.createTextNode(invite.name + " invited you. "));
    toast.append(addAction("Accept", () => acceptInvite(invite)), addAction("Decline", async () => {
      await request("leave", { room: invite.room });
      pendingInvites.delete(invite.key);
      renderInvitations();
      renderRoster(lastFriends);
    }));
    host.append(toast);
  }
}
function renderRoster(friends) {
  lastFriends=friends;
  const signature = JSON.stringify([friends, [...pendingInvites.keys()].sort(), Boolean(room)]);
  if (roster.dataset.signature === signature) return;
  roster.dataset.signature = signature;
  roster.replaceChildren();
  for (const friend of friends) {
    const item = document.createElement("li");
    item.append(document.createTextNode(friend.name + " "));
    const invitation = [...pendingInvites.values()].find(invite => invite.name === friend.name);
    const action = invitation ? addAction("Accept", () => acceptInvite(invitation)) : addAction("Invite", async () => {
      if (room) return;
      void loadTurnServers();
      status("Sending invitation…");
      const result = await request("invite", { to: friend.id });
      reserve(result.room);
      status("Invitation sent to " + friend.name + ".");
    });
    action.disabled = Boolean(room);
    item.append(action);
    roster.append(item);
  }
  if (!friends.length) {
    const empty = document.createElement("li");
    empty.textContent = "No other players online.";
    roster.append(empty);
  }
}

function addAction(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.onclick = async () => {
    button.disabled = true;
    try { await action(); } catch (error) { status(error.message); }
    button.disabled = false;
  };
  return button;
}

function sendGame(data) {
  const connection = data.kind==="state" ? stateChannel : channel;
  if (connection?.readyState==="open" && (data.kind!=="state" || connection.bufferedAmount<32_000)) {
    connection.send(JSON.stringify(data));
  }
}

function closePeer() {
  if (channel) {
    channel.onclose = null;
    channel.onopen = null;
  }
  const connection = peer;
  peer = channel = stateChannel = null;
  remoteCandidates = [];
  connection?.close();
}

function receiveRelayGame(activeRoom, game) {
  if (relay && room === activeRoom) receiveGame(game);
}

function startRelay() {
  if (!room || relay) return;
  clearTimeout(timeout);
  clearTimeout(relayTimer);
  closePeer();
  relay = true;
  lastRelayFrame = 0;
  startMatch(game => {
    const now = performance.now();
    if (game.kind === "state") {
      if (now - lastRelayFrame < 105) return;
      lastRelayFrame = now;
    }
    const activeRoom = room;
    const publish = () => room===activeRoom && request("game",{room:activeRoom,game});
    if (game.kind==="state") Promise.resolve(publish()).catch(()=>{});
    else outgoing=outgoing.then(publish).catch(()=>{});
  });
  status("Match connected through the relay.");
}

function reset(message, notify = true) {
  const previous = room;
  room = "";
  clearTimeout(timeout);
  clearTimeout(relayTimer);
  closePeer();
  relay = false;
  clearInterval(heartbeat);
  matchStart = null;
  if (frame) {
    frame.onload = null;
    frame.remove();
    frame = null;
    document.querySelector("main").inert = false;
    if (history.state?.fruitWarsMatch) history.replaceState(null,"",editionURL);
  }
  lobby.closest("details").open = true;
  if (notify && previous) request("leave", { room: previous }).catch(() => {});
  status(message);
}

function attach(dataChannel) {
  channel = dataChannel;
  channel.onopen = () => {
    clearTimeout(timeout);
    clearTimeout(relayTimer);
    startMatch(sendGame);
    status("Match connected.");
  };
  channel.onmessage = event => {
    try { receiveGame(JSON.parse(event.data)); } catch { reset("The match connection closed."); }
  };
  channel.onclose = () => reset("Your friend disconnected.");
}

async function connect(host) {
  const connectingRoom = room;
  player = host ? 1 : 2;
  showMatch();
  status("Connecting to your friend…");
  const turn = await loadTurnServers();
  if (room !== connectingRoom) return;
  if (!endpoint && host) {
    relayTimer = setTimeout(async () => {
      if (!room || channel?.readyState === "open") return;
      const activeRoom = room;
      closePeer();
      try {
        await request("relay", { room: activeRoom });
        if (room === activeRoom) startRelay();
      } catch {
        if (room === activeRoom) reset("The relay is unavailable. Please try another invitation.");
      }
    }, turnEndpoint ? 15_000 : 8500);
  }
  const connection = new RTCPeerConnection({ iceServers: [...iceServers, ...turn] });
  peer = connection;
  function attachState(state) {
    stateChannel=state;
    state.onmessage=event=>{
      try { receiveGame(JSON.parse(event.data)); } catch {}
    };
  }
  if (host) {
    attach(peer.createDataChannel("match"));
    attachState(peer.createDataChannel("state",{ordered:false,maxRetransmits:0}));
  } else {
    peer.ondatachannel=event=>event.channel.label==="state"?attachState(event.channel):attach(event.channel);
  }
  peer.onconnectionstatechange = () => {
    if (endpoint && peer === connection && connection.connectionState === "failed") reset("Could not connect to your friend.");
  };
}

async function publishDescription() {
  const connection = peer;
  const activeRoom = room;
  let descriptionSent;
  if (turnEndpoint) {
    connection.onicecandidate = ({ candidate }) => {
      if (!candidate || !descriptionSent) return;
      descriptionSent.then(() => {
        if (peer === connection) return request("candidate", { room: activeRoom, candidate: candidate.toJSON() });
      }).catch(() => {});
    };
  }
  await connection.setLocalDescription();
  if (connection.iceGatheringState !== "complete") {
    await new Promise(resolve => {
      const done = () => {
        clearTimeout(deadline);
        connection.removeEventListener("icegatheringstatechange", changed);
        resolve();
      };
      const changed = () => { if (connection.iceGatheringState === "complete") done(); };
      const deadline = setTimeout(done, 4000);
      connection.addEventListener("icegatheringstatechange", changed);
    });
  }
  if (peer === connection) {
    descriptionSent = request("signal", { room: activeRoom, description: connection.localDescription });
    await descriptionSent;
  }
}

function reserve(id) {
  room = id;
  clearTimeout(timeout);
  timeout = setTimeout(() => reset("The invitation or connection timed out. Try sending a new invite."), 35_000);
}

async function poll() {
  try {
    const data = await request("poll");
    iceServers = data.iceServers;
    labelProfile(document.querySelector("#friend-summary"),name+" · "+data.friends.length+" players online");
    for (const event of data.events) {
      if (event.kind === "invite" && !room) {
        const invite={key:event.room,room:event.room,name:event.name};
        pendingInvites.set(invite.key,invite);
        renderInvitations();
        lobby.closest("details").open = true;
      }
      if (event.room !== room) continue;
      if (event.kind === "relay" && !endpoint && player === 2) {
        startRelay();
      } else if (event.kind === "accept" && !peer && !relay) {
        reserve(room);
        await connect(true);
        if (peer) await publishDescription();
      } else if (event.kind === "signal" && peer) {
        const connection = peer;
        await connection.setRemoteDescription(event.description);
        if (peer !== connection) continue;
        for (const candidate of remoteCandidates.splice(0)) {
          await connection.addIceCandidate(candidate).catch(() => {});
        }
        if (peer === connection && event.description.type === "offer") await publishDescription();
      } else if (event.kind === "candidate" && !endpoint && peer && event.candidate) {
        if (peer.remoteDescription) await peer.addIceCandidate(event.candidate).catch(() => {});
        else if (remoteCandidates.length < 64) remoteCandidates.push(event.candidate);
      } else if (event.kind === "leave") {
        reset("Your friend left or declined the match.", false);
      }
    }
    renderRoster(data.friends);
    if (!room && ["Connecting to the lobby…","Lobby is unreachable. Retrying…"].includes(statusText.textContent)) status("You’re online.");
  } catch {
    if (!room) status("Lobby is unreachable. Retrying…");
  } finally {
    setTimeout(poll, 900);
  }
}

form.onsubmit = event => {
  event.preventDefault();
  rename(nameInput.value);
  form.hidden = true;
  status("Name saved.");
};
document.querySelector("#edit-profile-name").onclick=()=>{form.hidden=!form.hidden;if(!form.hidden)nameInput.focus();};
status("Connecting to the lobby…");
poll();
