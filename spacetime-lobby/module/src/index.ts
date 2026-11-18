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

const lobby = schema({ player, session, invitation });
export default lobby;

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const inviteLifetime = 30_000_000n;

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
