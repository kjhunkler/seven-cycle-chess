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
      if (raw.length > 1_100_000) return reply(413, { error: "Message too large" });
    }
    const body = JSON.parse(raw);
    const now = Date.now();
    const participants=new Set([...matches.values()].filter(m=>m.accepted&&now-m.created<86_400_000).flatMap(m=>[m.from,m.to]));
    for (const [key, player] of players) if (now-player.seen>onlineFor&&!participants.has(key))players.delete(key);
    for (const [key, match] of matches) {
      if (!players.has(match.from) || !players.has(match.to) || now-match.created>86_400_000 || (!match.accepted && now - match.created > 30_000)) {
        for(const member of [match.from,match.to])players.get(member)?.inbox.push({kind:"expired",room:key});
        matches.delete(key);
      }
    }
    const name = typeof body.name === "string" && body.name.trim().slice(0, 32);
    if (!name) return reply(400, { error: "Enter a display name" });
    if (!players.has(id) && players.size >= 100) return reply(503, { error: "Lobby is full" });
    const player = players.get(id) || { id, inbox: [], states: new Map() };
    Object.assign(player, { name, seen: now });
    players.set(id, player);

    if (body.action === "poll") {
      player.activity=body.activity&&typeof body.activity.join==="boolean"?{join:body.activity.join}:null;
      const events=[...player.inbox.splice(0),...player.states.values()];player.states.clear();
      return reply(200, { id, iceServers, friends: [...players.values()].filter(p => p.id !== id && now-p.seen<=onlineFor)
        .map(p => ({ id: p.id, name: p.name, activity:p.activity })), events });
    }

    if(body.action==="enter"){
      const host=players.get(body.to);
      if(!host||host.id===id||now-host.seen>onlineFor||!host.activity||!["join","spectate"].includes(body.mode))return reply(404,{error:"Game is unavailable"});
      if(host.inbox.length>=40||player.lastEntry&&now-player.lastEntry<1000)return reply(429,{error:"Wait before joining again"});
      player.lastEntry=now;
      host.entries??=new Map();for(const [visitor,expires]of host.entries)if(expires<now)host.entries.delete(visitor);
      host.entries.set(id,now+15000);
      host.inbox.push({kind:"entry-request",from:id,name,mode:body.mode});return reply(200,{});
    }

    if (body.action === "invite") {
      const friend = players.get(body.to);
      if (!friend || friend.id === id || now-friend.seen>onlineFor) return reply(404, { error: "Friend is offline" });
      const entry=player.entries?.get(friend.id)>now;
      if (!entry && player.lastInvite && now - player.lastInvite < 2000) return reply(429, { error: "Wait before inviting again" });
      if (friend.inbox.length >= 40) return reply(429, { error: "Friend inbox is full" });
      const room = randomUUID();
      player.lastInvite = now;
      player.entries?.delete(friend.id);
      matches.set(room, { from: id, to: friend.id, created: now, accepted: false });
      friend.inbox.push({ kind: "invite", room, name, from:id, expiresAt:now+30_000 });
      return reply(200, { room });
    }

    const match = matches.get(body.room);
    if (!match || (id !== match.from && id !== match.to)) return reply(404, { error: "Invite expired" });
    const other = players.get(id === match.from ? match.to : match.from);
    if (other.inbox.length >= 256 && body.action!=="leave" && !(body.action==="game"&&body.game?.kind==="state")) return reply(429, { error: "Friend inbox is full" });
    if (body.action === "accept" && id === match.to && !match.accepted) {
      match.accepted = true;
      other.inbox.push({ kind: "accept", room: body.room, name });
    } else if (body.action === "signal" && match.accepted && body.description &&
      body.description.type === (id === match.from ? "offer" : "answer") &&
      typeof body.description.sdp === "string") {
      other.inbox.push({ kind: "signal", room: body.room, description: body.description });
    } else if(body.action==="candidate"&&match.accepted&&body.candidate&&typeof body.candidate.candidate==="string"){
      other.inbox.push({kind:"candidate",room:body.room,candidate:body.candidate});
    } else if(body.action==="relay"&&match.accepted){
      other.inbox.push({kind:"relay",room:body.room});
    } else if(body.action==="game"&&match.accepted&&body.game&&typeof body.game==="object"){
      const event={kind:"game",room:body.room,game:body.game};
      if(body.game.kind==="state")other.states.set(body.room,event);
      else other.inbox.push(event);
    } else if (body.action === "leave") {
      other.states.delete(body.room);player.states.delete(body.room);
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
