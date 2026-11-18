import { schema, SenderError, table, t } from 'spacetimedb/server';

const player = table({ public: true }, {
  identity: t.identity().primaryKey(),
  connection: t.connectionId(),
  name: t.string(),
});

const invitation = table({}, {
  id: t.u64().primaryKey().autoInc(),
  sender: t.identity().index('btree'),
  recipient: t.identity().index('btree'),
  senderName: t.string(),
  recipientName: t.string(),
  status: t.string(),
});

const lobby = schema({ player, invitation });
export default lobby;

export const incoming = lobby.view(
  { public: true }, t.array(invitation.rowType),
  ctx => [...ctx.db.invitation.recipient.filter(ctx.sender)],
);

export const outgoing = lobby.view(
  { public: true }, t.array(invitation.rowType),
  ctx => [...ctx.db.invitation.sender.filter(ctx.sender)],
);

export const join = lobby.reducer({ name: t.string() }, (ctx, { name }) => {
  const displayName = name.trim();
  if (!displayName || displayName.length > 24 || !ctx.connectionId) {
    throw new SenderError('Enter a name between 1 and 24 characters.');
  }

  const row = { identity: ctx.sender, connection: ctx.connectionId, name: displayName };
  if (ctx.db.player.identity.find(ctx.sender)) {
    ctx.db.player.identity.update(row);
  } else {
    ctx.db.player.insert(row);
  }
});

export const leave = lobby.clientDisconnected(ctx => {
  const row = ctx.db.player.identity.find(ctx.sender);
  if (!row || !ctx.connectionId || row.connection.toHexString() !== ctx.connectionId.toHexString()) return;

  ctx.db.player.identity.delete(ctx.sender);
  for (const invite of [...ctx.db.invitation.sender.filter(ctx.sender), ...ctx.db.invitation.recipient.filter(ctx.sender)]) {
    ctx.db.invitation.id.delete(invite.id);
  }
});

export const invite = lobby.reducer({ to: t.identity() }, (ctx, { to }) => {
  const sender = ctx.db.player.identity.find(ctx.sender);
  const recipient = ctx.db.player.identity.find(to);
  if (!sender || !recipient || ctx.sender.toHexString() === to.toHexString()) {
    throw new SenderError('Choose another online player.');
  }

  for (const prior of ctx.db.invitation.sender.filter(ctx.sender)) {
    if (prior.recipient.toHexString() !== to.toHexString()) continue;
    if (prior.status === 'pending') throw new SenderError('An invitation is already pending.');
    ctx.db.invitation.id.delete(prior.id);
  }

  ctx.db.invitation.insert({
    id: 0n,
    sender: ctx.sender,
    recipient: to,
    senderName: sender.name,
    recipientName: recipient.name,
    status: 'pending',
  });
});

export const respond = lobby.reducer({ id: t.u64(), accept: t.bool() }, (ctx, { id, accept }) => {
  const row = ctx.db.invitation.id.find(id);
  if (!row || row.recipient.toHexString() !== ctx.sender.toHexString() || row.status !== 'pending') {
    throw new SenderError('This invitation is no longer available.');
  }
  ctx.db.invitation.id.update({ ...row, status: accept ? 'accepted' : 'declined' });
});
