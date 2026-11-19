const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../spacetime-lobby/client.js'),'utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('export function directoryRoster'),source.indexOf('export function createLobbyDirectory')).replace('export ',''),context);
const now=100000;
const player=(id,seen=now)=>({id,name:id,key:'{}',lastSeen:BigInt(seen)*1000n});
function roster(players,live=[],members=[],activities,gameActivities=[]){
  const table=rows=>({iter:()=>rows,id:{find:id=>rows.find(row=>row.id===id)}});
  return context.directoryRoster({player:table(players),gameActivity:table(gameActivities),liveProfile:table(live),member:table(members),soloStanding:table([])},'self',now,activities);
}
const member={profile:1n,name:'Member',played:4,wins:2,lastOnline:70000000n};

test('guests disappear after their heartbeat expires, and return on a fresh heartbeat',()=>{
  assert.equal(roster([player('guest',now-30000)]).length,1);
  assert.equal(roster([player('guest',now-30001)]).length,0);
  assert.equal(roster([player('guest')])[0].online,true);
  assert.equal(roster([{id:'legacy',name:'Legacy',key:'{}'}]).length,0);
});

test('expired member sessions become one offline profile with last-seen time',()=>{
  const rows=roster([player('tab',now-30001)],[{id:'tab',member:1n}],[member]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].online,false);
  assert.equal(rows[0].lastOnline,70000);
  assert.equal(rows[0].name,'Member');
});

test('any fresh member tab keeps the account online, even when another tab is stale',()=>{
  const live=[{id:'old',member:1n},{id:'fresh',member:1n},{id:'other',member:1n}];
  const rows=roster([player('old',0),player('fresh'),player('other')],live,[member]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].online,true);
  assert.equal(rows[0].id,'fresh');
  assert.equal(roster([],[],[member])[0].online,false);
});

test('the current account and its other tabs stay out of its own directory',()=>{
  assert.equal(roster([player('self'),player('other')],[{id:'self',member:1n},{id:'other',member:1n}],[member]).length,0);
});

test('a running game represents a member instead of an earlier idle tab',()=>{
  const live=[{id:'idle',member:1n},{id:'playing',member:1n}];
  const activities=new Map([['playing',{activity:{join:true},seen:now}]]);
  const rows=roster([player('idle'),player('playing')],live,[member],activities);
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,'playing');
  activities.clear();
  assert.equal(roster([player('idle'),player('playing')],live,[member],activities)[0].id,'idle');
  assert.equal(roster([player('idle'),player('playing',now-30001)],live,[member],new Map([['playing',{activity:{join:true}}]]))[0].id,'idle');
});

test('database activity selects the playing tab and stale advertisements disappear',()=>{
  const live=[{id:'idle',member:1n},{id:'playing',member:1n}];
  const active=[{id:'playing',join:true,updatedAt:BigInt(now)*1000n}];
  const rows=roster([player('idle'),player('playing')],live,[member],undefined,active);
  assert.equal(rows[0].id,'playing');
  assert.equal(rows[0].activity.join,true);
  active[0].updatedAt=BigInt(now-30001)*1000n;
  const expired=roster([player('idle'),player('playing')],live,[member],undefined,active);
  assert.equal(expired[0].id,'idle');assert.equal(expired[0].activity,null);
});
