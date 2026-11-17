const lobby = document.querySelector("#lobby");
const form = lobby.querySelector("form");
const statusText = lobby.querySelector("[role=status]");
const roster = lobby.querySelector("#friends");
const nameInput = form.elements.namedItem("name");
const endpoint = window.FRUIT_WARS_LOBBY || (location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "http://localhost:8787/lobby" : "");
const savedName = localStorage.getItem("fruit-wars-name") || ("Player " + crypto.randomUUID().slice(0,6).toUpperCase());
const token = localStorage.getItem("fruit-wars-profile") || crypto.randomUUID();
localStorage.setItem("fruit-wars-profile", token);
nameInput.value = savedName;
localStorage.setItem("fruit-wars-name",savedName);
function labelProfile(summary,label){if(!summary)return;summary.title=label;summary.setAttribute("aria-label",label+" profile");}
labelProfile(document.querySelector("#friend-summary"),savedName+" · player profile and friends");
let name = savedName, room = "", peer = null, channel = null, iceServers = [], timeout;
let player = 1, frame, editionURL, matchStart, stateChannel, receiveAt, heartbeat;
let outgoing = Promise.resolve();
let relay = false, relayTimer, lastRelayFrame = 0;

function status(message) {
  statusText.textContent = message;
  const display = frame?.contentDocument?.querySelector("#match-status");
  if (display) display.textContent = message;
}
function rename(value) {
  if (typeof value !== "string" || !value.trim()) return;
  name = value.trim().slice(0,32);
  nameInput.value = name;
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

function connect(host) {
  player = host ? 1 : 2;
  showMatch();
  if (!endpoint && host) {
    relayTimer = setTimeout(async () => {
      if (!room || channel?.readyState === "open") return;
      const activeRoom = room;
      try {
        await request("relay", { room: activeRoom });
        if (room === activeRoom) startRelay();
      } catch {
        if (room === activeRoom) reset("The relay is unavailable. Please try another invitation.");
      }
    }, 8500);
  }
  const connection = new RTCPeerConnection({ iceServers });
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
  status("Connecting to your friend…");
}

async function publishDescription() {
  const connection = peer;
  const activeRoom = room;
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
  if (peer === connection) await request("signal", { room: activeRoom, description: connection.localDescription });
}

function reserve(id) {
  room = id;

  timeout = setTimeout(() => reset("The invitation or connection timed out. Try sending a new invite."), 35_000);
}

async function poll() {
  try {
    const data = await request("poll");
    iceServers = data.iceServers;
    labelProfile(document.querySelector("#friend-summary"),name+" · "+data.friends.length+" players online");
    const signature = JSON.stringify([data.friends, Boolean(room)]);
    if (roster.dataset.signature !== signature) {
      roster.dataset.signature = signature;
      roster.replaceChildren();
      for (const friend of data.friends) {
        const item = document.createElement("li");
        item.append(document.createTextNode(friend.name + " "));
        const invite = addAction("Invite", async () => {
          if (room) return;
          status("Sending invitation…");
          const result = await request("invite", { to: friend.id });
          reserve(result.room);
          status("Invitation sent to " + friend.name + ".");
        });
        invite.disabled = Boolean(room);
        item.append(invite);
        roster.append(item);
      }
      if (!data.friends.length) {
        const empty = document.createElement("li");
        empty.textContent = "No other players online.";
        roster.append(empty);
      }
    }
    for (const event of data.events) {
      if (event.kind === "invite" && !room) {
        const invitation = document.createElement("p");
        invitation.textContent = event.name + " invited you. ";
        const dismiss = () => invitation.remove();
        invitation.append(addAction("Accept", async () => {
          if (room) return;
          await request("accept", { room: event.room });
          reserve(event.room);
          connect(false);
          dismiss();
        }), addAction("Decline", async () => {
          await request("leave", { room: event.room });
          dismiss();
        }));
        lobby.querySelector("#invitations").append(invitation);
        lobby.closest("details").open = true;
        setTimeout(dismiss, 30_000);
      }
      if (event.room !== room) continue;
      if (event.kind === "relay" && !endpoint && player === 2) {
        startRelay();
      } else if (event.kind === "accept" && !peer && !relay) {
        connect(true);
        await publishDescription();
      } else if (event.kind === "signal" && peer) {
        await peer.setRemoteDescription(event.description);
        if (event.description.type === "offer") await publishDescription();
      } else if (event.kind === "leave") {
        reset("Your friend left or declined the match.", false);
      }
    }
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
  status("Name saved.");
};
status("Connecting to the lobby…");
poll();
