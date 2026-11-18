import { schema, SenderError, table, t } from 'spacetimedb/server';

const player = table({ public: true }, {
  id: t.string().primaryKey(),
  name: t.string(),
  key: t.string(),
});

const session = table({}, {
  identity: t.identity().primaryKey(),
  connection: t.connectionId(),
  id: t.string().unique(),
});

const invitation = table({}, {
  room: t.string().primaryKey(),
  sender: t.identity().index('btree'),
  recipient: t.identity().index('btree'),
  from: t.string(),
  name: t.string(),
  key: t.string(),
  expiresAt: t.u64(),
  delivered: t.bool(),
});

const historyProfile = table({}, {
  id: t.u64().primaryKey().autoInc(),
  credential: t.string().unique(),
});

const historyIdentity = table({}, {
  identity: t.identity().primaryKey(),
  profile: t.u64(),
});

const historyGuest = table({}, {
  room: t.string().primaryKey(),
  host: t.u64().index('btree'),
  guest: t.u64(),
  acceptedAt: t.u64(),
});

const matchRules = t.object('MatchRules', {
  map: t.u8(),
  speed: t.f64(),
  shops: t.bool(),
  fullElimination: t.bool(),
  portionControl: t.bool(),
  productionRotation: t.bool(),
  transformationWave: t.bool(),
  transformationTime: t.f64(),
});

const matchPlayer = t.object('MatchPlayer', { profile: t.u64(), seat: t.u8(), name: t.string() });
const guestSeat = t.object('GuestSeat', { room: t.string(), seat: t.u8(), name: t.string() });
const matchResult = table({}, {
  id: t.string().primaryKey(),
  host: t.u64(),
  finishedAt: t.u64(),
  durationSeconds: t.u32(),
  winner: t.u8(),
  rules: matchRules,
  players: t.array(matchPlayer),
});

const matchEntry = table({}, {
  id: t.u64().primaryKey().autoInc(),
  profile: t.u64().index('btree'),
  matchId: t.string(),
});

const rivalry = table({}, {
  id: t.string().primaryKey(),
  profile: t.u64().index('btree'),
  opponent: t.u64(),
  name: t.string(),
  played: t.u32(),
  wins: t.u32(),
  opponentWins: t.u32(),
});

const lobby = schema({
  player, session, invitation, historyProfile, historyIdentity, historyGuest, matchResult, matchEntry, rivalry,
});
export default lobby;

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const inviteLifetime = 30_000_000n;
const guestLifetime = 86_400_000_000n;
const historyLimit = 30;

export const pendingInvitations = lobby.view(
  { public: true }, t.array(invitation.rowType),
  ctx => [...ctx.db.invitation.recipient.filter(ctx.sender)].filter(row => !row.delivered),
);

export const announce = lobby.reducer(
  { id: t.string(), name: t.string(), key: t.string() },
  (ctx, { id, name, key }) => {
    const displayName = name.trim();
    if (!ctx.connectionId || !uuid.test(id) || !displayName || displayName.length > 32 || key.length > 512) {
      throw new SenderError('Invalid lobby profile.');
    }
    let jwk;
    try {
      jwk = JSON.parse(key);
    } catch {
      throw new SenderError('Invalid lobby public key.');
    }
    if (jwk?.kty !== 'EC' || jwk.crv !== 'P-256' ||
        typeof jwk.x !== 'string' || !/^[\w-]{43}$/.test(jwk.x) ||
        typeof jwk.y !== 'string' || !/^[\w-]{43}$/.test(jwk.y) || 'd' in jwk) {
      throw new SenderError('Invalid lobby public key.');
    }

    const current = ctx.db.session.identity.find(ctx.sender);
    const profile = { id, name: displayName, key };
    if (current) {
      if (current.id !== id || ctx.db.player.id.find(id)?.key !== key) {
        throw new SenderError('This connection already has a lobby profile.');
      }
      ctx.db.session.identity.update({ ...current, connection: ctx.connectionId });
      ctx.db.player.id.update(profile);
      return;
    }
    if (ctx.db.session.id.find(id)) throw new SenderError('That lobby ID is already in use.');
    ctx.db.session.insert({ identity: ctx.sender, connection: ctx.connectionId, id });
    ctx.db.player.insert(profile);
  },
);

export const disconnect = lobby.clientDisconnected(ctx => {
  const current = ctx.db.session.identity.find(ctx.sender);
  if (!ctx.connectionId || !current?.connection.isEqual(ctx.connectionId)) return;

  ctx.db.player.id.delete(current.id);
  ctx.db.session.identity.delete(ctx.sender);
  ctx.db.historyIdentity.identity.delete(ctx.sender);
  for (const row of [...ctx.db.invitation.recipient.filter(ctx.sender), ...ctx.db.invitation.sender.filter(ctx.sender)]) {
    ctx.db.invitation.room.delete(row.room);
  }
});

export const sendInvitation = lobby.reducer(
  { to: t.string(), room: t.string() },
  (ctx, { to, room }) => {
    const current = ctx.db.session.identity.find(ctx.sender);
    const target = ctx.db.session.id.find(to);
    const profile = current && ctx.db.player.id.find(current.id);
    if (!profile || !target || to === profile.id || !uuid.test(room)) {
      throw new SenderError('Choose another online player.');
    }

    const prior = ctx.db.invitation.room.find(room);
    if (prior?.sender.isEqual(ctx.sender) && prior.recipient.isEqual(target.identity)) return;
    if (prior) throw new SenderError('Invalid invitation room.');

    const now = ctx.timestamp.microsSinceUnixEpoch;
    const sent = [...ctx.db.invitation.sender.filter(ctx.sender)];
    const received = [...ctx.db.invitation.recipient.filter(target.identity)];
    const active = (row: typeof sent[number]) => row.expiresAt > now;
    if (sent.filter(active).length >= 8 || received.filter(active).length >= 24) {
      throw new SenderError('Too many pending invitations. Try again shortly.');
    }
    for (const row of [...sent, ...received]) {
      if (!active(row)) ctx.db.invitation.room.delete(row.room);
    }
    ctx.db.invitation.insert({
      room,
      sender: ctx.sender,
      recipient: target.identity,
      from: profile.id,
      name: profile.name,
      key: profile.key,
      expiresAt: now + inviteLifetime,
      delivered: false,
    });
  },
);

export const acknowledgeInvitation = lobby.reducer({ room: t.string() }, (ctx, { room }) => {
  const row = ctx.db.invitation.room.find(room);
  if (row?.recipient.isEqual(ctx.sender) && !row.delivered) {
    ctx.db.invitation.room.update({ ...row, delivered: true });
  }
});

export const myMatches = lobby.view({ public: true }, t.array(matchResult.rowType), ctx => {
  const identity = ctx.db.historyIdentity.identity.find(ctx.sender);
  if (!identity) return [];
  return [...ctx.db.matchEntry.profile.filter(identity.profile)].flatMap(entry => {
    const result = ctx.db.matchResult.id.find(entry.matchId);
    return result ? [result] : [];
  });
});

export const myRivalries = lobby.view({ public: true }, t.array(rivalry.rowType), ctx => {
  const identity = ctx.db.historyIdentity.identity.find(ctx.sender);
  return identity ? [...ctx.db.rivalry.profile.filter(identity.profile)] : [];
});

export const myHistoryProfile = lobby.view(
  { public: true }, t.option(t.object('HistoryProfileReference', { profile: t.u64() })),
  ctx => {
    const identity = ctx.db.historyIdentity.identity.find(ctx.sender);
    return identity ? { profile: identity.profile } : undefined;
  },
);

export const registerHistory = lobby.reducer({ credential: t.string() }, (ctx, { credential }) => {
  if (!uuid.test(credential) || !ctx.db.session.identity.find(ctx.sender)) {
    throw new SenderError('Join the lobby before opening match history.');
  }
  const profile = ctx.db.historyProfile.credential.find(credential)
    ?? ctx.db.historyProfile.insert({ id: 0n, credential });
  const identity = ctx.db.historyIdentity.identity.find(ctx.sender);
  if (identity?.profile === profile.id) return;
  if (identity) throw new SenderError('This connection already has a history profile.');
  ctx.db.historyIdentity.insert({ identity: ctx.sender, profile: profile.id });
});

export const acceptHistoryInvite = lobby.reducer({ room: t.string() }, (ctx, { room }) => {
  const invite = ctx.db.invitation.room.find(room);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (!invite?.recipient.isEqual(ctx.sender) || invite.expiresAt <= now) {
    throw new SenderError('This invitation has expired.');
  }
  const host = ctx.db.historyIdentity.identity.find(invite.sender)?.profile;
  const guest = ctx.db.historyIdentity.identity.find(ctx.sender)?.profile;
  if (host === undefined || guest === undefined) throw new SenderError('Match history is unavailable for this invitation.');
  if (ctx.db.historyGuest.room.find(room)) return;

  const tickets = [...ctx.db.historyGuest.host.filter(host)]
    .sort((a, b) => a.acceptedAt < b.acceptedAt ? -1 : 1);
  for (const [index, ticket] of tickets.entries()) {
    if (now - ticket.acceptedAt >= guestLifetime || index < tickets.length - 31) {
      ctx.db.historyGuest.room.delete(ticket.room);
    }
  }
  ctx.db.historyGuest.insert({ room, host, guest, acceptedAt: now });
});

export const recordMatch = lobby.reducer({
  id: t.string(), hostName: t.string(), guests: t.array(guestSeat), winner: t.u8(),
  rules: matchRules, durationSeconds: t.u32(),
}, (ctx, { id, hostName, guests, winner, rules, durationSeconds }) => {
  const host = ctx.db.historyIdentity.identity.find(ctx.sender)?.profile;
  if (host === undefined || !uuid.test(id)) throw new SenderError('Match history is unavailable.');
  const existing = ctx.db.matchResult.id.find(id);
  if (existing?.host === host) return;
  if (existing) throw new SenderError('That match already exists.');

  const seatCount = rules.map === 4 ? 4 : [3, 6].includes(rules.map) ? 3 : 2;
  if (rules.map < 2 || rules.map > 11 || ![.5, 1, 1.5].includes(rules.speed) ||
      !Number.isFinite(rules.transformationTime) || rules.transformationTime < 1 || rules.transformationTime > 120 ||
      winner < 1 || winner > seatCount || durationSeconds > 86400 || guests.length < 1 || guests.length >= seatCount ||
      !hostName.trim() || hostName.length > 32) {
    throw new SenderError('Invalid match result.');
  }

  const now = ctx.timestamp.microsSinceUnixEpoch;
  const players = [{ profile: host, seat: 1, name: hostName }];
  const rooms = new Set<string>();
  const seats = new Set([1]);
  for (const { room, seat, name } of guests) {
    const ticket = ctx.db.historyGuest.room.find(room);
    if (!ticket || ticket.host !== host || now - ticket.acceptedAt >= guestLifetime ||
        rooms.has(room) || seats.has(seat) || seat < 2 || seat > seatCount || !name.trim() || name.length > 32) {
      throw new SenderError('The match roster could not be verified.');
    }
    rooms.add(room);
    seats.add(seat);
    players.push({ profile: ticket.guest, seat, name });
  }
  players.sort((a, b) => a.seat - b.seat);
  ctx.db.matchResult.insert({ id, host, finishedAt: now, durationSeconds, winner, rules, players });

  const profiles = new Map(players.map(player => [player.profile, player]));
  const winningProfile = players.find(player => player.seat === winner)?.profile;
  for (const player of profiles.values()) {
    const prior = [...ctx.db.matchEntry.profile.filter(player.profile)]
      .sort((a, b) => a.id < b.id ? -1 : 1);
    for (const old of prior.slice(0, Math.max(0, prior.length - historyLimit + 1))) {
      ctx.db.matchEntry.id.delete(old.id);
    }
    ctx.db.matchEntry.insert({ id: 0n, profile: player.profile, matchId: id });
    for (const opponent of profiles.values()) {
      if (opponent.profile === player.profile) continue;
      const key = `${player.profile}:${opponent.profile}`;
      const stats = ctx.db.rivalry.id.find(key)
        ?? { id: key, profile: player.profile, opponent: opponent.profile, name: opponent.name, played: 0, wins: 0, opponentWins: 0 };
      const row = {
        ...stats, name: opponent.name, played: stats.played + 1,
        wins: stats.wins + Number(winningProfile === player.profile),
        opponentWins: stats.opponentWins + Number(winningProfile === opponent.profile),
      };
      if (stats.played) ctx.db.rivalry.id.update(row);
      else ctx.db.rivalry.insert(row);
    }
  }
});
