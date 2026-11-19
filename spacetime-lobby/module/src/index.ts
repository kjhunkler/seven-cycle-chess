import { schema, type ReducerCtx, SenderError, table, t } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

import { defaultMaps, mapLayout, sameSide, teamSizes } from '../../../duel-maps.js';

const totals = table({}, {
  profile: t.u64().primaryKey(), played: t.u32(), wins: t.u32(),
});
const member = table({public:true}, {
  profile: t.u64().primaryKey(), name:t.string(), lastOnline:t.u64(), played:t.u32(), wins:t.u32(),
});
const liveProfile = table({public:true}, {
  id:t.string().primaryKey(), member:t.option(t.u64()), played:t.u32(), wins:t.u32(),
});
const communityMap = table({public:true}, {
  id:t.u32().primaryKey().autoInc(), name:t.string(), owner:t.option(t.u64()), players:t.u8(),
  revision:t.u32(), updatedAt:t.u64(), plays:t.u32(),
});
const mapVersion = table({public:true}, {
  key:t.string().primaryKey(), mapId:t.u32(), revision:t.u32(), layout:t.string(),
});
const mapVote = table({public:true}, {
  key:t.string().primaryKey(), mapId:t.u32(), profile:t.u64(), value:t.i8(),
});
const mapComment = table({public:true}, {
  id:t.u64().primaryKey().autoInc(), mapId:t.u32(), profile:t.u64(), body:t.string(), postedAt:t.u64(),
});
const chatMessage = table({}, {
  id: t.u64().primaryKey().autoInc(), room: t.u8().index('btree'),
  name: t.string(), body: t.string(), postedAt: t.u64(),
});
const soloRound = table({}, {id:t.string().primaryKey(), profile:t.u64(), mapId:t.u32(), win:t.bool()});
const soloTotals = table({}, {profile:t.u64().primaryKey(), played:t.u32(), wins:t.u32()});
// Directory keys are transient lobby IDs for guests and stable profile keys for members.
const soloStanding = table({public:true}, {id:t.string().primaryKey(), played:t.u32(), wins:t.u32()});
const mapPlay = table({}, { id:t.string().primaryKey(), mapId:t.u32() });
const teamMatch = table({}, {id:t.string().primaryKey()});
const matchTeamSize = table({}, {id:t.string().primaryKey(), size:t.u8()});
const playedMap = table({}, { id:t.string().primaryKey(), mapId:t.u32(), name:t.string() });
const migration = table({}, { version:t.u8().primaryKey() });

const player = table({ public: true }, {
  id: t.string().primaryKey(),
  name: t.string(),
  key: t.string(),
  lastSeen: t.option(t.u64()).default(undefined),
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

// Separate tables keep the existing presence and match-history schemas intact.
const gameActivity = table({public:true}, {
  id:t.string().primaryKey(), join:t.bool(), updatedAt:t.u64(),
});
const lobbyRoom = table({}, {
  room:t.string().primaryKey(), host:t.identity().index('btree'), guest:t.identity().index('btree'),
  hostId:t.string(), guestId:t.string(), accepted:t.bool(), expiresAt:t.u64(),
});
const lobbyMessage = table({}, {
  id:t.u64().primaryKey().autoInc(), sender:t.identity().index('btree'), recipient:t.identity().index('btree'),
  from:t.string(), room:t.string().index('btree'), kind:t.string(), iv:t.string(), payload:t.string(), expiresAt:t.u64(),
});
const lobbyCleanup = table({}, {id:t.u64().primaryKey(), scheduledAt:t.scheduleAt()});

const historyProfile = table({}, {
  id: t.u64().primaryKey().autoInc(),
  credential: t.string().unique(),
});

const historyIdentity = table({}, {
  identity: t.identity().primaryKey(),
  profile: t.u64(),
});

const account = table({}, {
  identity: t.identity().primaryKey(),
  profile: t.u64().unique(),
  name: t.string(),
});

const accountSession = table({}, {
  lobbyIdentity: t.identity().primaryKey(),
  accountIdentity: t.identity(),
});

const accountLink = table({}, {
  lobbyIdentity: t.identity().primaryKey(),
  nonce: t.string().unique(),
  expiresAt: t.u64(),
});

const historyGuest = table({}, {
  room: t.string().primaryKey(),
  host: t.u64().index('btree'),
  guest: t.u64(),
  acceptedAt: t.u64(),
});

// Preserve the stored layout so existing match history can migrate without data loss.
const storedMatchRules = t.object('StoredMatchRules', {
  map: t.u8(),
  speed: t.f64(),
  shops: t.bool(),
  fullElimination: t.bool(),
  portionControl: t.bool(),
  productionRotation: t.bool(),
  transformationWave: t.bool(),
  transformationTime: t.f64(),
});
const matchRules = t.object('MatchRules', {
  map: t.u8(), teamSize: t.option(t.u8()), speed:t.f64(), shops:t.bool(),
  fullElimination:t.bool(), portionControl:t.bool(), productionRotation:t.bool(), transformationPenalty:t.bool(),
  transformationWave:t.bool(), transformationTime:t.f64(),
});

const matchPlayer = t.object('MatchPlayer', { profile: t.u64(), seat: t.u8(), name: t.string() });
const guestSeat = t.object('GuestSeat', { room: t.string(), seat: t.u8(), name: t.string() });
const matchResult = table({}, {
  id: t.string().primaryKey(),
  host: t.u64(),
  finishedAt: t.u64(),
  durationSeconds: t.u32(),
  winner: t.u8(),
  rules: storedMatchRules,
  players: t.array(matchPlayer),
  transformationPenalty: t.bool().default(false),
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
  gameActivity, lobbyRoom, lobbyMessage, lobbyCleanup, chatMessage,
  player, session, invitation, historyProfile, historyIdentity, historyGuest, matchResult, matchEntry, rivalry,
  account, accountSession, accountLink, totals, member, liveProfile, communityMap, mapVersion, mapVote, mapComment, mapPlay, playedMap, teamMatch, matchTeamSize, migration, soloRound, soloTotals, soloStanding,
}, { env: { FRUIT_WARS_AUTH_CLIENT: t.option(t.string()), FRUIT_WARS_DEFAULT_MAP_OWNER:t.option(t.string()) } });
export default lobby;

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const inviteLifetime = 30_000_000n;
const guestLifetime = 86_400_000_000n;
const historyLimit = 30;

type Context = ReducerCtx<typeof lobby.schemaType>;
function accountFor(ctx:Context) {
  const link=ctx.db.accountSession.lobbyIdentity.find(ctx.sender);
  return link && ctx.db.account.identity.find(link.accountIdentity);
}
function signedIn(ctx:Context) {
  const user=accountFor(ctx);
  if(!user)throw new SenderError('Sign in to publish, vote, or comment.');
  return user;
}
function refreshProfile(ctx:Context, profile:bigint, seen?:bigint) {
  const stats=ctx.db.totals.profile.find(profile) ?? {profile,played:0,wins:0};
  const solo=ctx.db.soloTotals.profile.find(profile);
  function showSolo(id:string){
    if(!solo){ctx.db.soloStanding.id.delete(id);return}
    const row={id,played:solo.played,wins:solo.wins};
    if(ctx.db.soloStanding.id.find(id))ctx.db.soloStanding.id.update(row);else ctx.db.soloStanding.insert(row);
  }
  const user=ctx.db.account.profile.find(profile);
  if(user){
    showSolo('member-'+profile);
    const prev=ctx.db.member.profile.find(profile);
    const row={...stats,name:user.name,lastOnline:seen ?? prev?.lastOnline ?? 0n};
    if(prev)ctx.db.member.profile.update(row); else ctx.db.member.insert(row);
  }
  for(const identity of ctx.db.historyIdentity.iter()){
    if(identity.profile!==profile)continue;
    const session=ctx.db.session.identity.find(identity.identity);
    if(!session)continue;
    showSolo(session.id);
    const linked=ctx.db.accountSession.lobbyIdentity.find(identity.identity);
    const row={id:session.id,member:linked?profile:undefined,played:stats.played,wins:stats.wins};
    if(ctx.db.liveProfile.id.find(row.id))ctx.db.liveProfile.id.update(row);else ctx.db.liveProfile.insert(row);
  }
}
function winningProfiles(players:{profile:bigint,seat:number}[],winner:number,teams:boolean|number){
  return new Set(players.filter(p=>sameSide(p.seat,winner,teams)).map(p=>p.profile));
}
function addResult(ctx:Context, players:{profile:bigint,seat:number}[],winner:number,teams:boolean|number=false) {
  const winning=winningProfiles(players,winner,teams);
  for(const profile of new Set(players.map(p=>p.profile))){
    const old=ctx.db.totals.profile.find(profile);
    const row={profile,played:(old?.played??0)+1,wins:(old?.wins??0)+Number(winning.has(profile))};
    if(old)ctx.db.totals.profile.update(row);else ctx.db.totals.insert(row);
    refreshProfile(ctx,profile);
  }
}
function countPlay(ctx:Context,id:string,mapId:number) {
  if(ctx.db.mapPlay.id.find(id))return;
  const row=ctx.db.communityMap.id.find(mapId);
  if(!row)throw new SenderError('Unknown map.');
  ctx.db.mapPlay.insert({id,mapId});
  ctx.db.communityMap.id.update({...row,plays:row.plays+1});
}
// Idempotent both on a fresh database and on an existing lobby with match history.
export const initializeCommunity = lobby.reducer(ctx=>{
  const configured=ctx.env.FRUIT_WARS_DEFAULT_MAP_OWNER;
  const owner=configured ? ctx.db.account.profile.find(BigInt(configured))?.profile : undefined;
  if(configured && owner===undefined)throw new SenderError('The configured default map owner must have an existing account.');
  for(const m of Object.values(defaultMaps) as {id:number,name:string,players:number,mirror:boolean,nodes:object,edges:string[][]}[]){
    if(m.id<2147483640 || ctx.db.communityMap.id.find(m.id))continue;
    const {id,name,players,mirror,nodes,edges}=m;
    if(ctx.db.communityMap.id.find(id))continue;
    ctx.db.communityMap.insert({id,name,players,owner,revision:1,updatedAt:ctx.timestamp.microsSinceUnixEpoch,plays:0});
    ctx.db.mapVersion.insert({key:id+'/1',mapId:id,revision:1,layout:JSON.stringify({players,mirror,nodes,edges,difficulty:{}})});
  }
  if(ctx.db.migration.version.find(1)){
    if(owner!==undefined)for(const m of ctx.db.communityMap.iter())if(m.id<=11 && m.owner===undefined)
      ctx.db.communityMap.id.update({...m,owner});
    return;
  }
  for(const m of Object.values(defaultMaps) as {id:number,name:string,players:number,mirror:boolean,nodes:object,edges:string[][]}[]){
    const {id,name,players,mirror,nodes,edges}=m;
    ctx.db.communityMap.insert({id,name,players,owner,revision:1,updatedAt:ctx.timestamp.microsSinceUnixEpoch,plays:0});
    ctx.db.mapVersion.insert({key:id+'/1',mapId:id,revision:1,layout:JSON.stringify({players,mirror,nodes,edges,difficulty:{}})});
  }
  const lastPlayed=new Map<bigint,bigint>();
  for(const match of ctx.db.matchResult.iter()){
    for(const p of match.players)if(match.finishedAt>(lastPlayed.get(p.profile)??0n))lastPlayed.set(p.profile,match.finishedAt);
    addResult(ctx,match.players,match.winner,ctx.db.teamMatch.id.find(match.id)?ctx.db.matchTeamSize.id.find(match.id)?.size??2:false);
    countPlay(ctx,match.id,match.rules.map);
  }
  for(const user of ctx.db.account.iter())refreshProfile(ctx,user.profile,lastPlayed.get(user.profile));
  ctx.db.migration.insert({version:1});
});
export const saveMap = lobby.reducer({mapId:t.u32(),revision:t.u32(),name:t.string(),layout:t.string()},(ctx,{mapId,revision,name,layout})=>{
  const user=signedIn(ctx);
  name=name.trim();
  if(!name||name.length>64||layout.length>24576)throw new SenderError('Give the map a name of up to 64 characters and a valid layout.');
  const old=ctx.db.communityMap.id.find(mapId);
  if(mapId && old?.owner!==user.profile)throw new SenderError('Only the creator can update this map.');
  if((old?.revision??0)!==revision)throw new SenderError('This map has changed. Reopen the editor for its latest version.');
  let board;
  try{board=mapLayout(JSON.parse(layout))}catch(error){throw new SenderError(error instanceof Error?error.message:'Invalid map.')}
  if(old && old.players!==board.players)throw new SenderError('Create a new map to change its seat count.');
  const row={id:mapId,owner:user.profile,name,players:board.players,revision:revision+1,updatedAt:ctx.timestamp.microsSinceUnixEpoch,plays:old?.plays??0};
  // Explicit seed keys do not advance SpacetimeDB's auto-increment sequence.
  if(!mapId)row.id=Math.max(11,...Array.from(ctx.db.communityMap.iter(),m=>m.id))+1;
  const saved=old?ctx.db.communityMap.id.update(row):ctx.db.communityMap.insert(row);
  const {players,mirror,nodes,edges,difficulty,customHomes}=board;
  ctx.db.mapVersion.insert({key:saved.id+'/'+row.revision,mapId:saved.id,revision:row.revision,layout:JSON.stringify({players,mirror,nodes,edges,difficulty,customHomes})});
});
export const voteMap=lobby.reducer({mapId:t.u32(),value:t.i8()},(ctx,{mapId,value})=>{
  const {profile}=signedIn(ctx);
  if(!ctx.db.communityMap.id.find(mapId)||![-1,0,1].includes(value))throw new SenderError('Invalid vote.');
  const key=mapId+'/'+profile;
  ctx.db.mapVote.key.delete(key);
  if(value)ctx.db.mapVote.insert({key,mapId,profile,value});
});
const globalChatLimit = 100;
export const globalChat = lobby.view({ public: true }, t.array(chatMessage.rowType), ctx => {
  if (!ctx.db.accountSession.lobbyIdentity.find(ctx.sender)) return [];
  return [...ctx.db.chatMessage.room.filter(0)];
});

export const postChat = lobby.reducer({ body: t.string() }, (ctx, { body }) => {
  const user = accountFor(ctx);
  if (!user) throw new SenderError('Sign in to chat.');
  body = body.trim();
  if (!body || body.length > 280) throw new SenderError('Enter a message of up to 280 characters.');
  const messages = ctx.db.chatMessage;
  if (messages.count() >= BigInt(globalChatLimit)) {
    let oldest: bigint | undefined;
    for (const message of messages.iter()) {
      if (oldest === undefined || message.id < oldest) oldest = message.id;
    }
    if (oldest !== undefined) messages.id.delete(oldest);
  }
  messages.insert({ id: 0n, room: 0, name: user.name, body, postedAt: ctx.timestamp.microsSinceUnixEpoch });
});

export const commentMap=lobby.reducer({mapId:t.u32(),body:t.string()},(ctx,{mapId,body})=>{
  const {profile}=signedIn(ctx);body=body.trim();
  if(!ctx.db.communityMap.id.find(mapId)||!body||body.length>1000)throw new SenderError('Enter a comment of up to 1,000 characters.');
  ctx.db.mapComment.insert({id:0n,mapId,profile,body,postedAt:ctx.timestamp.microsSinceUnixEpoch});
});
export const startMapPlay=lobby.reducer({id:t.string(),mapId:t.u32()},(ctx,{id,mapId})=>{
  if(!uuid.test(id)||!ctx.db.session.identity.find(ctx.sender))throw new SenderError('Join the lobby to record a play.');
  countPlay(ctx,id,mapId);
});
export const finishSoloMatch=lobby.reducer({id:t.string(),mapId:t.u32(),win:t.bool()},(ctx,{id,mapId,win})=>{
  const profile=ctx.db.historyIdentity.identity.find(ctx.sender)?.profile;
  if(profile===undefined||!uuid.test(id)||!ctx.db.communityMap.id.find(mapId))throw new SenderError('A game profile and map are required.');
  const existing=ctx.db.soloRound.id.find(id);
  if(existing?.profile===profile)return;
  if(existing)throw new SenderError('That round has already been recorded.');
  ctx.db.soloRound.insert({id,profile,mapId,win});
  countPlay(ctx,id,mapId);
  const prior=ctx.db.soloTotals.profile.find(profile);
  const row={profile,played:(prior?.played??0)+1,wins:(prior?.wins??0)+Number(win)};
  if(prior)ctx.db.soloTotals.profile.update(row);else ctx.db.soloTotals.insert(row);
  refreshProfile(ctx,profile);
});
export const pendingInvitations = lobby.view(
  { public: true }, t.array(invitation.rowType),
  ctx => [...ctx.db.invitation.recipient.filter(ctx.sender)].filter(row => !row.delivered),
);

export const myLobbyMessages = lobby.view(
  {public:true}, t.array(lobbyMessage.rowType),
  ctx => [...ctx.db.lobbyMessage.recipient.filter(ctx.sender)],
);

export const setGameActivity = lobby.reducer({active:t.bool(), join:t.bool()}, (ctx,{active,join}) => {
  const current=ctx.db.session.identity.find(ctx.sender);
  if(!current)throw new SenderError('Join the lobby first.');
  const now=ctx.timestamp.microsSinceUnixEpoch;
  if(active){
    const row={id:current.id,join,updatedAt:now};
    if(ctx.db.gameActivity.id.find(current.id))ctx.db.gameActivity.id.update(row);
    else ctx.db.gameActivity.insert(row);
  }else ctx.db.gameActivity.id.delete(current.id);
  for(const room of [...ctx.db.lobbyRoom.host.filter(ctx.sender),...ctx.db.lobbyRoom.guest.filter(ctx.sender)]){
    const peer=ctx.db.player.id.find(room.host.isEqual(ctx.sender)?room.guestId:room.hostId);
    if(room.accepted&&peer?.lastSeen!==undefined&&now-peer.lastSeen<120_000_000n)
      ctx.db.lobbyRoom.room.update({...room,expiresAt:now+120_000_000n});
  }
  if(!ctx.db.lobbyCleanup.id.find(1n))ctx.db.lobbyCleanup.insert({id:1n,scheduledAt:ScheduleAt.interval(10_000_000n)});
});

export const requestGameEntry = lobby.reducer({to:t.string(),mode:t.string()},(ctx,{to,mode})=>{
  const current=ctx.db.session.identity.find(ctx.sender), target=ctx.db.session.id.find(to);
  const profile=current&&ctx.db.player.id.find(current.id), activity=ctx.db.gameActivity.id.find(to);
  const now=ctx.timestamp.microsSinceUnixEpoch;
  if(!profile||!target||to===profile.id||!['join','spectate'].includes(mode)||!activity||
      now-activity.updatedAt>30_000_000n||(mode==='join'&&!activity.join))throw new SenderError('Game is unavailable.');
  const sent=[...ctx.db.lobbyMessage.sender.filter(ctx.sender)].filter(m=>m.kind==='entry-request');
  for(const m of sent)if(m.expiresAt<=now)ctx.db.lobbyMessage.id.delete(m.id);
  if(sent.some(m=>m.recipient.isEqual(target.identity)&&m.expiresAt>now))return;
  if(sent.filter(m=>m.expiresAt>now).length>=16||[...ctx.db.lobbyMessage.recipient.filter(target.identity)].length>=128)
    throw new SenderError('Too many pending requests. Try again shortly.');
  ctx.db.lobbyMessage.insert({id:0n,sender:ctx.sender,recipient:target.identity,from:profile.id,room:'',kind:'entry-request',
    iv:'',payload:JSON.stringify({name:profile.name,mode}),expiresAt:now+30_000_000n});
});

export const acceptLobbyRoom = lobby.reducer({room:t.string()},(ctx,{room})=>{
  const row=ctx.db.lobbyRoom.room.find(room), now=ctx.timestamp.microsSinceUnixEpoch;
  if(!row||!row.guest.isEqual(ctx.sender)||row.expiresAt<=now)throw new SenderError('Invitation expired.');
  ctx.db.lobbyRoom.room.update({...row,accepted:true,expiresAt:now+120_000_000n});
});

export const sendLobbyMessage = lobby.reducer(
  {room:t.string(),iv:t.string(),payload:t.string(),state:t.bool()},(ctx,{room,iv,payload,state})=>{
    const row=ctx.db.lobbyRoom.room.find(room), now=ctx.timestamp.microsSinceUnixEpoch;
    const isHost=row?.host.isEqual(ctx.sender), isGuest=row?.guest.isEqual(ctx.sender);
    if(!row||(!isHost&&!isGuest)||row.expiresAt<=now)throw new SenderError('Room is unavailable.');
    if(!/^[A-Za-z0-9+/]{16}$/.test(iv)||payload.length<24||payload.length>1_500_000||! /^[A-Za-z0-9+/]+={0,2}$/.test(payload))
      throw new SenderError('Invalid lobby message.');
    if(state&&!row.accepted)throw new SenderError('Accept the invitation first.');
    const pending=[...ctx.db.lobbyMessage.room.filter(room)].filter(m=>m.sender.isEqual(ctx.sender));
    for(const m of pending)if(m.expiresAt<=now||(state&&m.kind==='state'))ctx.db.lobbyMessage.id.delete(m.id);
    if(!state&&pending.filter(m=>m.expiresAt>now&&m.kind!=='state').length>=128)
      throw new SenderError('Too many pending messages.');
    ctx.db.lobbyMessage.insert({id:0n,sender:ctx.sender,recipient:isHost?row.guest:row.host,
      from:isHost?row.hostId:row.guestId,room,kind:state?'state':'envelope',iv,payload,
      expiresAt:now+(state?5_000_000n:30_000_000n)});
  },
);

export const acknowledgeLobbyMessages = lobby.reducer({ids:t.array(t.u64())},(ctx,{ids})=>{
  if(ids.length>256)throw new SenderError('Too many acknowledgements.');
  for(const id of ids){const row=ctx.db.lobbyMessage.id.find(id);if(row?.recipient.isEqual(ctx.sender))ctx.db.lobbyMessage.id.delete(id)}
});

export const closeLobbyRoom = lobby.reducer({room:t.string()},(ctx,{room})=>{
  const row=ctx.db.lobbyRoom.room.find(room);
  if(!row||(!row.host.isEqual(ctx.sender)&&!row.guest.isEqual(ctx.sender)))return;
  // Keep the last encrypted leave notification until the other participant receives it.
  ctx.db.lobbyRoom.room.update({...row,expiresAt:ctx.timestamp.microsSinceUnixEpoch+30_000_000n,accepted:false});
});

export const expireLobbyTraffic = lobby.reducer({onSchedule:lobbyCleanup},{arg:lobbyCleanup.rowType},ctx=>{
  const now=ctx.timestamp.microsSinceUnixEpoch;
  for(const m of ctx.db.lobbyMessage.iter())if(m.expiresAt<=now)ctx.db.lobbyMessage.id.delete(m.id);
  for(const activity of ctx.db.gameActivity.iter())if(now-activity.updatedAt>30_000_000n)ctx.db.gameActivity.id.delete(activity.id);
  for(const invite of ctx.db.invitation.iter())if(invite.expiresAt<=now)ctx.db.invitation.room.delete(invite.room);
  for(const room of ctx.db.lobbyRoom.iter())if(room.expiresAt<=now){
    for(const m of ctx.db.lobbyMessage.room.filter(room.room))ctx.db.lobbyMessage.id.delete(m.id);
    ctx.db.lobbyRoom.room.delete(room.room);
  }
});

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
    const profile = { id, name: displayName, key, lastSeen: ctx.timestamp.microsSinceUnixEpoch };
    const user = accountFor(ctx);
    if (user) refreshProfile(ctx,user.profile,profile.lastSeen);
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

  const leaving=accountFor(ctx);
  if(leaving)refreshProfile(ctx,leaving.profile,ctx.timestamp.microsSinceUnixEpoch);
  ctx.db.soloStanding.id.delete(current.id);
  ctx.db.liveProfile.id.delete(current.id);
  ctx.db.player.id.delete(current.id);
  ctx.db.gameActivity.id.delete(current.id);
  ctx.db.session.identity.delete(ctx.sender);
  ctx.db.historyIdentity.identity.delete(ctx.sender);
  ctx.db.accountSession.lobbyIdentity.delete(ctx.sender);
  ctx.db.accountLink.lobbyIdentity.delete(ctx.sender);
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
    ctx.db.lobbyRoom.insert({room,host:ctx.sender,guest:target.identity,hostId:profile.id,guestId:to,
      accepted:false,expiresAt:now+inviteLifetime});
  },
);

export const acknowledgeInvitation = lobby.reducer({ room: t.string() }, (ctx, { room }) => {
  const row = ctx.db.invitation.room.find(room);
  if (row?.recipient.isEqual(ctx.sender) && !row.delivered) {
    ctx.db.invitation.room.update({ ...row, delivered: true });
  }
});

const matchSummary = t.object('MatchSummary', {
  id:t.string(), host:t.u64(), finishedAt:t.u64(), durationSeconds:t.u32(),
  winner:t.u8(), rules:matchRules, players:t.array(matchPlayer),
});
export const myMatches = lobby.view({ public: true }, t.array(matchSummary), ctx => {
  const identity = ctx.db.historyIdentity.identity.find(ctx.sender);
  if (!identity) return [];
  return [...ctx.db.matchEntry.profile.filter(identity.profile)].flatMap(entry => {
    const result = ctx.db.matchResult.id.find(entry.matchId);
    return result ? [{...result, rules:{...result.rules, transformationPenalty:result.transformationPenalty, teamSize:ctx.db.matchTeamSize.id.find(result.id)?.size}}] : [];
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
  if (ctx.db.account.profile.find(profile.id)) {
    throw new SenderError('This browser history is linked to an account.');
  }
  const identity = ctx.db.historyIdentity.identity.find(ctx.sender);
  if (identity?.profile === profile.id) return;
  if (identity) throw new SenderError('This connection already has a history profile.');
  ctx.db.historyIdentity.insert({ identity: ctx.sender, profile: profile.id });
  refreshProfile(ctx,profile.id);
});

export const myAccount = lobby.view(
  { public: true }, t.option(t.object('AccountSummary', { name: t.string(), profile: t.u64() })),
  ctx => {
    const link = ctx.db.accountSession.lobbyIdentity.find(ctx.sender);
    const row = link && ctx.db.account.identity.find(link.accountIdentity);
    return row ? { name: row.name, profile: row.profile } : undefined;
  },
);

export const requestAccountLink = lobby.reducer({ nonce: t.string() }, (ctx, { nonce }) => {
  if (!ctx.db.session.identity.find(ctx.sender) || !uuid.test(nonce)) {
    throw new SenderError('Join the lobby before signing in.');
  }
  ctx.db.accountLink.lobbyIdentity.delete(ctx.sender);
  ctx.db.accountLink.insert({
    lobbyIdentity: ctx.sender, nonce, expiresAt: ctx.timestamp.microsSinceUnixEpoch + 60_000_000n,
  });
});

export const connectAccount = lobby.reducer({ nonce: t.string() }, (ctx, { nonce }) => {
  const jwt = ctx.senderAuth.jwt;
  const client = ctx.env.FRUIT_WARS_AUTH_CLIENT;
  if (!client || jwt?.issuer !== 'https://auth.spacetimedb.com/oidc' ||
      !jwt.audience.includes(client) || jwt.fullPayload.email_verified !== true) {
    throw new SenderError('A verified Fruit Wars sign-in is required.');
  }
  const link = ctx.db.accountLink.nonce.find(nonce);
  const session = link && ctx.db.session.identity.find(link.lobbyIdentity);
  const player = session && ctx.db.player.id.find(session.id);
  if (!link || !player || link.expiresAt <= ctx.timestamp.microsSinceUnixEpoch) {
    throw new SenderError('This sign-in request has expired.');
  }
  const current = ctx.db.historyIdentity.identity.find(link.lobbyIdentity);
  let profile = ctx.db.account.identity.find(ctx.sender);
  if (!profile) {
    if (!current || ctx.db.account.profile.find(current.profile)) {
      throw new SenderError('Open your guest profile before creating an account.');
    }
    profile = ctx.db.account.insert({ identity: ctx.sender, profile: current.profile, name: player.name });
  }
  ctx.db.accountLink.lobbyIdentity.delete(link.lobbyIdentity);
  ctx.db.accountSession.lobbyIdentity.delete(link.lobbyIdentity);
  ctx.db.accountSession.insert({ lobbyIdentity: link.lobbyIdentity, accountIdentity: ctx.sender });
  ctx.db.historyIdentity.identity.delete(link.lobbyIdentity);
  ctx.db.historyIdentity.insert({ identity: link.lobbyIdentity, profile: profile.profile });
  ctx.db.player.id.update({ ...player, name: profile.name });
  refreshProfile(ctx,profile.profile,ctx.timestamp.microsSinceUnixEpoch);
});

export const renameAccount = lobby.reducer({ name: t.string() }, (ctx, { name }) => {
  const link = ctx.db.accountSession.lobbyIdentity.find(ctx.sender);
  const profile = link && ctx.db.account.identity.find(link.accountIdentity);
  const displayName = name.trim();
  if (!profile || !displayName || displayName.length > 32) {
    throw new SenderError('Enter a display name between 1 and 32 characters.');
  }
  ctx.db.account.identity.update({ ...profile, name: displayName });
  refreshProfile(ctx,profile.profile);
});

export const signOutAccount = lobby.reducer(ctx => {
  ctx.db.accountLink.lobbyIdentity.delete(ctx.sender);
  const leaving=accountFor(ctx);
  if(leaving)refreshProfile(ctx,leaving.profile,ctx.timestamp.microsSinceUnixEpoch);
  if (ctx.db.accountSession.lobbyIdentity.delete(ctx.sender)) {
    const session=ctx.db.session.identity.find(ctx.sender);
    if(session){ctx.db.liveProfile.id.delete(session.id);ctx.db.soloStanding.id.delete(session.id)}
    ctx.db.historyIdentity.identity.delete(ctx.sender);
  }
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

const resultFields = {
  id: t.string(), hostName: t.string(), guests: t.array(guestSeat), winner: t.u8(),
  rules: matchRules, durationSeconds: t.u32(),
};
type Result = { id:string,hostName:string,guests:{room:string,seat:number,name:string}[],winner:number,rules:typeof matchRules.type,durationSeconds:number };
function storeResult(ctx:Context,{id,hostName,guests,winner,rules,durationSeconds}:Result,mapId:number,revision?:number,teams:boolean|number=false) {
  const host = ctx.db.historyIdentity.identity.find(ctx.sender)?.profile;
  if (host === undefined || !uuid.test(id)) throw new SenderError('Match history is unavailable.');
  const existing = ctx.db.matchResult.id.find(id);
  if (existing?.host === host) return;
  if (existing) throw new SenderError('That match already exists.');

  const entry=ctx.db.communityMap.id.find(mapId);
  const version=revision && ctx.db.mapVersion.key.find(mapId+'/'+revision);
  const seatCount = entry?.players ?? (rules.map === 4 ? 4 : [3,6].includes(rules.map) ? 3 : 2);
  if ((teams && (!teamSizes(seatCount).includes(Number(teams)) || !entry || rules.map!==(mapId<=11?mapId:0))) || (revision!==undefined ? !version || !entry : !entry && (rules.map < 2 || rules.map > 11)) || ![.5, 1, 1.5].includes(rules.speed) ||
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
  ctx.db.matchResult.insert({ id, host, finishedAt: now, durationSeconds, winner, rules, players, transformationPenalty:rules.transformationPenalty });

  if(teams)ctx.db.teamMatch.insert({id});
  if(teams)ctx.db.matchTeamSize.insert({id,size:Number(teams)});
  if(ctx.db.migration.version.find(1)){
    addResult(ctx,players,winner,teams);
    countPlay(ctx,id,mapId);
  }
  if(entry && (revision || mapId>11))ctx.db.playedMap.insert({id,mapId,name:entry.name});
  const profiles = new Map(players.map(player => [player.profile, player]));
  const winning = winningProfiles(players,winner,teams);
  for (const player of profiles.values()) {
    const prior = [...ctx.db.matchEntry.profile.filter(player.profile)]
      .sort((a, b) => a.id < b.id ? -1 : 1);
    for (const old of prior.slice(0, Math.max(0, prior.length - historyLimit + 1))) {
      ctx.db.matchEntry.id.delete(old.id);
    }
    ctx.db.matchEntry.insert({ id: 0n, profile: player.profile, matchId: id });
    for (const opponent of profiles.values()) {
      if (opponent.profile === player.profile || sameSide(player.seat,opponent.seat,teams)) continue;
      const key = `${player.profile}:${opponent.profile}`;
      const stats = ctx.db.rivalry.id.find(key)
        ?? { id: key, profile: player.profile, opponent: opponent.profile, name: opponent.name, played: 0, wins: 0, opponentWins: 0 };
      const row = {
        ...stats, name: opponent.name, played: stats.played + 1,
        wins: stats.wins + Number(winning.has(player.profile)),
        opponentWins: stats.opponentWins + Number(winning.has(opponent.profile)),
      };
      if (stats.played) ctx.db.rivalry.id.update(row);
      else ctx.db.rivalry.insert(row);
    }
  }
}
export const recordMatch=lobby.reducer(resultFields,(ctx,result)=>storeResult(ctx,result,result.rules.map));
export const recordCatalogMatch=lobby.reducer({...resultFields,mapId:t.u32(),revision:t.u32()},(ctx,result)=>{
  const {mapId,revision}=result;
  if(!revision && (mapId<=11 || !defaultMaps[mapId] || result.rules.map!==0))
    throw new SenderError('Invalid catalog map.');
  storeResult(ctx,result,mapId,revision||undefined);
});
export const recordTeamMatch=lobby.reducer({...resultFields,mapId:t.u32(),revision:t.u32()},(ctx,result)=>
  storeResult(ctx,result,result.mapId,result.revision||undefined,result.rules.teamSize??2));
export const myTeamMatches=lobby.view({public:true},t.array(teamMatch.rowType),ctx=>{
  const profile=ctx.db.historyIdentity.identity.find(ctx.sender)?.profile;
  if(profile===undefined)return [];
  return [...ctx.db.matchEntry.profile.filter(profile)].flatMap(entry=>{
    const row=ctx.db.teamMatch.id.find(entry.matchId);
    return row?[row]:[];
  });
});
export const myPlayedMaps=lobby.view({public:true},t.array(playedMap.rowType),ctx=>{
  const profile=ctx.db.historyIdentity.identity.find(ctx.sender)?.profile;
  if(profile===undefined)return [];
  return [...ctx.db.matchEntry.profile.filter(profile)].flatMap(entry=>{
    const row=ctx.db.playedMap.id.find(entry.matchId);
    return row?[row]:[];
  });
});
