import { DbConnection, tables } from './bindings/index';

export function createLobbyDirectory(database, host = 'https://maincloud.spacetimedb.com') {
  let connection;
  let token;
  let synced = false;
  let announcedName;

  function open() {
    const builder = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withAutomaticReconnect()
      .onConnect((conn, _identity, authToken) => {
        token = authToken;
        conn.subscriptionBuilder()
          .onApplied(() => { synced = true; })
          .onError(() => conn.disconnect())
          .subscribe([tables.player, tables.pendingInvitations]);
      })
      .onAutomaticReconnect((_conn, _identity, authToken) => {
        token = authToken;
        synced = true;
      })
      .onConnectError(ctx => {
        if (connection === ctx) connection = undefined;
      })
      .onDisconnect((ctx, _error, nextAttempt) => {
        if (connection !== ctx) return;
        synced = false;
        announcedName = undefined;
        if (nextAttempt === undefined) connection = undefined;
      });

    if (token) builder.withToken(token);
    return builder.build();
  }

  function connected() {
    connection ??= open();
    if (!synced) throw new Error('Connecting to the SpacetimeDB lobby.');
    return connection;
  }

  return {
    async poll(profile, receive) {
      const conn = connected();
      if (announcedName !== profile.name) {
        await conn.reducers.announce({ ...profile, key: JSON.stringify(profile.key) });
        if (connection === conn && synced) announcedName = profile.name;
      }

      for (const row of conn.db.pendingInvitations.iter()) {
        const expiresAt = Number(row.expiresAt / 1000n);
        if (expiresAt > Date.now()) {
          await receive({
            id: row.from,
            kind: 'invite',
            room: row.room,
            name: row.name,
            key: JSON.parse(row.key),
            expiresAt,
          }).catch(() => {});
        }
        await conn.reducers.acknowledgeInvitation({ room: row.room });
      }

      return [...conn.db.player.iter()]
        .filter(player => player.id !== profile.id)
        .map(player => ({ id: player.id, name: player.name, key: JSON.parse(player.key) }));
    },
    invite(to, room) {
      return connected().reducers.sendInvitation({ to, room });
    },
  };
}
