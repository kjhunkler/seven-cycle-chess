const lobby = document.querySelector("#lobby");
const form = lobby.querySelector("form");
const statusText = lobby.querySelector("[role=status]");
const roster = lobby.querySelector("#friends");
const nameInput = form.elements.namedItem("name");
const endpoint = window.FRUIT_WARS_LOBBY || (location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "http://localhost:8787/lobby" : "");
const savedName = localStorage.getItem("fruit-wars-name") || "";
const token = localStorage.getItem("fruit-wars-profile") || crypto.randomUUID();
localStorage.setItem("fruit-wars-profile", token);
nameInput.value = savedName;
let name = "", room = "", peer = null, channel = null, iceServers = [], timeout;
let timer, player = 1;

function status(message) { statusText.textContent = message; }

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

function send(data) {
  if (channel?.readyState === "open" && channel.bufferedAmount < 128_000) {
    channel.send(JSON.stringify(data));
  }
}

function reset(message, notify = true) {
  const previous = room;
  room = "";
  clearTimeout(timeout);
  if (channel) channel.onclose = null;
  peer?.close();
  peer = channel = null;
  window.matchGame.stop();
  lobby.querySelector("#leave").disabled = true;
  if (notify && previous) request("leave", { room: previous }).catch(() => {});
  status(message);
}

function attach(dataChannel) {
  channel = dataChannel;
  channel.onopen = () => {
    clearTimeout(timeout);
    window.matchGame.start(player, send);
    status("Match connected.");
  };
  channel.onmessage = event => {
    try { window.matchGame.receive(JSON.parse(event.data)); } catch { reset("The match connection closed."); }
  };
  channel.onclose = () => reset("Your friend disconnected.");
}

function connect(host) {
  player = host ? 1 : 2;
  const connection = new RTCPeerConnection({ iceServers });
  peer = connection;
  if (host) attach(peer.createDataChannel("match"));
  else peer.ondatachannel = event => attach(event.channel);
  peer.onconnectionstatechange = () => {
    if (peer === connection && connection.connectionState === "failed") reset("Could not connect to your friend.");
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
  lobby.querySelector("#leave").disabled = false;
  timeout = setTimeout(() => reset("The invitation or connection timed out."), 35_000);
}

async function poll() {
  try {
    const data = await request("poll");
    iceServers = data.iceServers;
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
        empty.textContent = "No other friends online.";
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
        setTimeout(dismiss, 30_000);
      }
      if (event.room !== room) continue;
      if (event.kind === "accept" && !peer) {
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
    timer = setTimeout(poll, 1500);
  }
}

form.onsubmit = event => {
  event.preventDefault();
  if (name) return;
  name = nameInput.value.trim();
  if (!name) return;
  localStorage.setItem("fruit-wars-name", name);
  for (const control of form.elements) control.disabled = true;
  status("Connecting to the lobby…");
  clearTimeout(timer);
  poll();
};
lobby.querySelector("#leave").onclick = () => reset("You left the match.");
