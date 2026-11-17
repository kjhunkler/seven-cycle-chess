import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";

const players = new Map();
const matches = new Map();
const onlineFor = 15_000;
const origins = new Set((process.env.LOBBY_ORIGIN || "https://kjhunkler.github.io,http://localhost:8000").split(","));
const iceServers = JSON.parse(process.env.ICE_SERVERS_JSON || '[{"urls":"stun:stun.l.google.com:19302"}]');

createServer(async (req, res) => {
  if (origins.has(req.headers.origin)) res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  const reply = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (req.method === "OPTIONS") return reply(204);
  if (req.method !== "POST" || req.url !== "/lobby") return reply(404, { error: "Unknown route" });
  const token = req.headers.authorization?.match(/^Bearer ([a-f0-9-]{36})$/)?.[1];
  if (!token) return reply(401, { error: "Missing profile token" });
  const id = createHash("sha256").update(token).digest("hex").slice(0, 32);
  let raw = "";
  try {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 48_000) return reply(413, { error: "Message too large" });
    }
    const body = JSON.parse(raw);
    const now = Date.now();
    for (const [key, player] of players) if (now - player.seen > onlineFor) players.delete(key);
    for (const [key, match] of matches) {
      if (!players.has(match.from) || !players.has(match.to) || (!match.accepted && now - match.created > 30_000)) matches.delete(key);
    }
    const name = typeof body.name === "string" && body.name.trim().slice(0, 32);
    if (!name) return reply(400, { error: "Enter a display name" });
    if (!players.has(id) && players.size >= 100) return reply(503, { error: "Lobby is full" });
    const player = players.get(id) || { id, inbox: [] };
    Object.assign(player, { name, seen: now });
    players.set(id, player);

    if (body.action === "poll") {
      return reply(200, { id, iceServers, friends: [...players.values()].filter(p => p.id !== id)
        .map(p => ({ id: p.id, name: p.name })), events: player.inbox.splice(0) });
    }

    if (body.action === "invite") {
      const friend = players.get(body.to);
      if (!friend || friend.id === id) return reply(404, { error: "Friend is offline" });
      if (player.lastInvite && now - player.lastInvite < 2000) return reply(429, { error: "Wait before inviting again" });
      if (friend.inbox.length >= 40) return reply(429, { error: "Friend inbox is full" });
      const room = randomUUID();
      player.lastInvite = now;
      matches.set(room, { from: id, to: friend.id, created: now, accepted: false });
      friend.inbox.push({ kind: "invite", room, name });
      return reply(200, { room });
    }

    const match = matches.get(body.room);
    if (!match || (id !== match.from && id !== match.to)) return reply(404, { error: "Invite expired" });
    const other = players.get(id === match.from ? match.to : match.from);
    if (other.inbox.length >= 40) return reply(429, { error: "Friend inbox is full" });
    if (body.action === "accept" && id === match.to && !match.accepted) {
      match.accepted = true;
      other.inbox.push({ kind: "accept", room: body.room, name });
    } else if (body.action === "signal" && match.accepted && body.description &&
      body.description.type === (id === match.from ? "offer" : "answer") &&
      typeof body.description.sdp === "string") {
      other.inbox.push({ kind: "signal", room: body.room, description: body.description });
    } else if (body.action === "leave") {
      other.inbox.push({ kind: "leave", room: body.room });
      matches.delete(body.room);
    } else {
      return reply(400, { error: "Invalid lobby action" });
    }
    reply(200, {});
  } catch {
    if (!res.headersSent) reply(400, { error: "Invalid request" });
  }
}).listen(Number(process.env.PORT || 8787), () => console.log("Fruit Wars lobby listening"));
