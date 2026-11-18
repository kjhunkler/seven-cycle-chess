import { DbConnection, tables } from './bindings/index';

const historyCredentialKey = 'fruit-wars-history-profile';
const pendingMatchPrefix = 'fruit-wars-pending-match:';

export function createLobbyDirectory(database, host = 'https://maincloud.spacetimedb.com') {
  let connection;
  let token;
  let synced = false;
  let announcedName;
  let historyRegistered = false;
  let saving;
  let saveError;

  const credentialKey = historyCredentialKey + ':' + host + '/' + database;
  const queuePrefix = pendingMatchPrefix + host + '/' + database + ':';
  const credential = localStorage.getItem(credentialKey) || crypto.randomUUID();
  localStorage.setItem(credentialKey, credential);

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
          .subscribe([tables.player, tables.pendingInvitations, tables.myMatches, tables.myRivalries, tables.myHistoryProfile]);
      })
      .onAutomaticReconnect((_conn, _identity, authToken) => {
        token = authToken;
      })
      .onConnectError(ctx => {
        if (connection === ctx) connection = undefined;
      })
      .onDisconnect((ctx, _error, nextAttempt) => {
        if (connection !== ctx) return;
        synced = false;
        announcedName = undefined;
        historyRegistered = false;
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

  async function savePending(conn) {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(queuePrefix));
    for (const key of keys) {
      if (!synced || conn !== connection || !historyRegistered) return;
      const data = localStorage.getItem(key);
      if (!data) continue;
      try {
        await conn.reducers.recordMatch(JSON.parse(data));
      } catch (error) {
        if (error.name !== 'SenderError' && !(error instanceof SyntaxError)) return;
        saveError = 'A match result could not be saved.';
      }
      localStorage.removeItem(key);
    }
  }

  return {
    async poll(profile, receive) {
      const conn = connected();
      if (announcedName !== profile.name) {
        await conn.reducers.announce({ ...profile, key: JSON.stringify(profile.key) });
        if (connection === conn && synced) announcedName = profile.name;
      }
      if (!historyRegistered) {
        try {
          await conn.reducers.registerHistory({ credential });
          if (connection === conn && synced) historyRegistered = true;
        } catch {
          // Presence and invitations can continue without history.
        }
      }
      if (historyRegistered) {
        saving ??= savePending(conn).finally(() => { saving = undefined; });
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
    async accept(room) {
      if (historyRegistered) await connected().reducers.acceptHistoryInvite({ room });
    },
    record(result) {
      localStorage.setItem(queuePrefix + result.id, JSON.stringify(result));
    },
    history() {
      if (!synced || !historyRegistered) return undefined;
      const profile = [...connection.db.myHistoryProfile.iter()][0]?.profile;
      if (profile === undefined) return undefined;
      return {
        profile,
        matches: [...connection.db.myMatches.iter()],
        rivalries: [...connection.db.myRivalries.iter()],
        pending: Object.keys(localStorage).some(key => key.startsWith(queuePrefix)),
        saveError,
      };
    },
  };
}
