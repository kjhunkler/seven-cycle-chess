import { DbConnection, tables } from './bindings/index';
import { createProfileAuth } from './profile-auth.js';

const historyCredentialKey = 'fruit-wars-history-profile';
const pendingMatchPrefix = 'fruit-wars-pending-match:';

export function createLobbyDirectory(database, host = 'https://maincloud.spacetimedb.com', authClient) {
  let connection, catalog, selfId;
  let catalogRevision = 0;
  let token;
  let synced = false;
  let announcedName;
  let historyRegistered = false;
  let saving;
  let saveError;
  let accountSubject;
  let accountSync;
  let accountError = '';
  let nextAccountAttempt = 0;
  let guestLinked = false;
  const auth = authClient ? createProfileAuth(authClient) : undefined;

  const credentialKey = historyCredentialKey + ':' + host + '/' + database;
  const queuePrefix = pendingMatchPrefix + host + '/' + database + ':';
  let credential = localStorage.getItem(credentialKey) || crypto.randomUUID();
  localStorage.setItem(credentialKey, credential);

  function open() {
    const builder = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withAutomaticReconnect()
      .onConnect((conn, _identity, authToken) => {
        token = authToken;
        const invalidate = () => { catalog = undefined; };
        for (const table of [conn.db.communityMap, conn.db.mapVersion, conn.db.mapVote, conn.db.mapComment, conn.db.member]) {
          table.onInsert(invalidate);
          table.onUpdate(invalidate);
          table.onDelete(invalidate);
        }
        invalidate();
        conn.subscriptionBuilder()
          .onApplied(() => { synced = true; })
          .onError(() => conn.disconnect())
          .subscribe([
            tables.player, tables.soloStanding, tables.member, tables.liveProfile, tables.communityMap, tables.mapVersion, tables.mapVote, tables.mapComment, tables.myPlayedMaps, tables.myTeamMatches, tables.pendingInvitations, tables.myMatches, tables.myRivalries, tables.myHistoryProfile,
            ...(auth ? [tables.myAccount] : []),
          ]);
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
        accountSubject = undefined;
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
        const entry = JSON.parse(data);
        const active = [...conn.db.myHistoryProfile.iter()][0]?.profile?.toString();
        if (entry.profile && entry.profile !== active) continue;
        const result = entry.result ?? entry;
        if (entry.solo) await conn.reducers.finishSoloMatch(result);
        else {
          const {teams,mapRevision,map,...settings}=result.rules;
          const rules={portionControl:false,transformationWave:false,transformationTime:10,...settings,map:map<=11?map:0};
          const payload={...result,rules};
          if(teams)await conn.reducers.recordTeamMatch({...payload,mapId:map,revision:mapRevision??0});
          else if(mapRevision)await conn.reducers.recordCatalogMatch({...payload,mapId:map,revision:mapRevision});
          else await conn.reducers.recordMatch(payload);
        }
      } catch (error) {
        if (error.name !== 'SenderError' && !(error instanceof SyntaxError)) return;
        saveError = 'A match result could not be saved.';
      }
      localStorage.removeItem(key);
    }
  }

  async function syncAccount(conn) {
    const user = await auth.user();
    if (!synced || conn !== connection) return;
    if (!user) {
      if (accountSubject) {
        await conn.reducers.signOutAccount();
        accountSubject = undefined;
        historyRegistered = false;
      }
      if (guestLinked) {
        credential = localStorage.getItem(credentialKey);
        if (!credential || credential === localStorage.getItem(credentialKey + ':linked')) {
          credential = crypto.randomUUID();
          localStorage.setItem(credentialKey, credential);
        }
        guestLinked = false;
      }
      return;
    }
    if (accountSubject === user.profile.sub || Date.now() < nextAccountAttempt) return;
    nextAccountAttempt = Date.now() + 5000;
    const previous = [...conn.db.myHistoryProfile.iter()][0]?.profile;
    const nonce = crypto.randomUUID();
    await conn.reducers.requestAccountLink({ nonce });
    const response = await fetch(new URL('/v1/database/' + encodeURIComponent(database) + '/call/connect_account', host), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + user.id_token, 'Content-Type': 'application/json' },
      body: JSON.stringify([nonce]),
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error('Could not reconnect your account. Retrying…');
    if (!synced || conn !== connection) return;
    const account = [...conn.db.myAccount.iter()][0];
    if (previous !== undefined && account?.profile === previous) {
      localStorage.setItem(credentialKey + ':linked', credential);
    }
    accountSubject = user.profile.sub;
    accountError = '';
    historyRegistered = true;
  }

  return {
    async poll(profile, receive) {
      const conn = connected();
      selfId = profile.id;
      if (conn.db.communityMap.count()===0n) await conn.reducers.initializeCommunity();
      if (announcedName !== profile.name) {
        await conn.reducers.announce({ ...profile, key: JSON.stringify(profile.key) });
        if (connection === conn && synced) announcedName = profile.name;
      }
      if (!historyRegistered && !guestLinked) {
        try {
          await conn.reducers.registerHistory({ credential });
          if (connection === conn && synced) historyRegistered = true;
        } catch (error) {
          if (auth && error.message === 'This browser history is linked to an account.') {
            guestLinked = true;
            localStorage.setItem(credentialKey + ':linked', credential);
          }
          // Presence and invitations can continue without history.
        }
      }
      if (auth) {
        accountSync ??= syncAccount(conn)
          .catch(() => { accountError = 'Could not reconnect your account. Retrying…'; })
          .finally(() => { accountSync = undefined; });
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

      const members = new Map([...conn.db.member.iter()].map(m => [m.profile,m]));
      const self = conn.db.liveProfile.id.find(profile.id)?.member;
      const represented = new Set([self]);
      const people = [];
      for (const player of conn.db.player.iter()) {
        if (player.id === profile.id) continue;
        const live = conn.db.liveProfile.id.find(player.id);
        const account = members.get(live?.member);
        if (account && represented.has(account.profile)) continue;
        if (account) represented.add(account.profile);
        people.push({id:player.id,solo:conn.db.soloStanding.id.find(player.id),name:account?.name ?? player.name,key:JSON.parse(player.key),online:true,
          played:live?.played ?? 0,wins:live?.wins ?? 0});
      }
      for (const account of members.values()) if (!represented.has(account.profile)) {
        people.push({id:'member-'+account.profile,solo:conn.db.soloStanding.id.find('member-'+account.profile),name:account.name,online:false,
          lastOnline:Number(account.lastOnline/1000n),wins:account.wins,played:account.played});
      }
      return people.sort((a,b)=>Number(b.online)-Number(a.online)||a.name.localeCompare(b.name));
    },
    community() {
      if (!synced) return;
      if (!catalog) {
        const db=connection.db;
        catalog={revision:++catalogRevision,maps:[...db.communityMap.iter()],versions:[...db.mapVersion.iter()],
          votes:[...db.mapVote.iter()],comments:[...db.mapComment.iter()],names:new Map([...db.member.iter()].map(m=>[m.profile,m.name]))};
      }
      return catalog;
    },
    mapAction(action, fields) {
      const reducers=connected().reducers;
      if(action==='save-map')return reducers.saveMap(fields);
      if(action==='vote-map')return reducers.voteMap(fields);
      if(action==='comment-map')return reducers.commentMap(fields);
      if(action==='start-map-play')return reducers.startMapPlay(fields);
    },
    invite(to, room) {
      return connected().reducers.sendInvitation({ to, room });
    },
    async accept(room) {
      if (historyRegistered) await connected().reducers.acceptHistoryInvite({ room });
    },
    record(result,solo=false) {
      const profile = connection && [...connection.db.myHistoryProfile.iter()][0]?.profile?.toString();
      localStorage.setItem(queuePrefix + result.id, JSON.stringify({ profile, result, solo }));
    },
    async accountAction(action, name) {
      if (action === 'sign-in') return auth.signIn();
      if (action === 'sign-out') {
        await auth.signOut();
        const conn = connected();
        await conn.reducers.signOutAccount();
        accountSubject = undefined;
        historyRegistered = false;
        accountError = '';
        return;
      }
      return connected().reducers.renameAccount({ name });
    },
    account() {
      if (!auth) return undefined;
      const row = synced && [...connection.db.myAccount.iter()][0];
      return { solo:synced && connection.db.soloStanding.id.find(selfId), stats:synced && connection.db.liveProfile.id.find(selfId), profile: row?.profile, name: row?.name, message: auth.message() || accountError };
    },
    history() {
      if (!synced || !historyRegistered) return undefined;
      const profile = [...connection.db.myHistoryProfile.iter()][0]?.profile;
      if (profile === undefined) return undefined;
      return {
        profile,
        matches: [...connection.db.myMatches.iter()],
        teamMatches:new Set([...connection.db.myTeamMatches.iter()].map(row=>row.id)),
        maps:new Map([...connection.db.myPlayedMaps.iter()].map(m=>[m.id,m.name])),
        rivalries: [...connection.db.myRivalries.iter()],
        pending: Object.keys(localStorage).some(key => key.startsWith(queuePrefix)),
        saveError,
      };
    },
  };
}
