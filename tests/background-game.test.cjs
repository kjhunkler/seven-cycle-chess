const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
const {lobbyHarness}=require('./lobby-harness.cjs');

test('multiplayer pauses the solo game and its defeat popup until returning to solo',()=>{
 const solo=createGame('index.html'),match=createGame();
 match.run('matchGame.start(1,()=>{});gameStarted=true');
 const dialog=solo.context.document.body.children.find(el=>el.className==='endgame-dialog');
 solo.run('botConfig.map=2;init();botGame.start();aiT=999;N.P1.stock.fill(0);G=[{from:"C2",to:"P1",owner:2,type:0,n:10,t:.99}];productionCycle={active:{buff:0,debuff:1},next:{buff:1,debuff:2},endsAt:45100,remaining:45000};document.querySelector("main").inert=true;last=100;loop(200);loop(1000)');
 assert.equal(solo.run('over'),0);
 assert.equal(solo.run('G[0].t'),.99,'background troops do not arrive');
 assert.equal(solo.run('N.P1.tm'),0,'background production pauses');
 assert.equal(solo.run('productionCycle.endsAt'),46000,'production rotation pauses too');
 assert.equal(!!dialog.open,false);
 assert.equal(match.run('over'),0);
 solo.run('document.querySelector("main").inert=false;loop(1100)');
 assert.equal(solo.run('over'),2,'solo simulation resumes on return');
 assert.equal(dialog.open,true,'a real solo defeat still opens its dialog');
});

test('covered solo board suppresses a defeat dialog even when explicitly rendered',()=>{
 const h=createGame('index.html');
 const dialog=h.context.document.body.children.find(el=>el.className==='endgame-dialog');
 h.run('over=2;render()');assert.equal(dialog.open,true);
 h.run('document.querySelector("main").inert=true;render()');
 assert.equal(dialog.open,false);
});

test('opening multiplayer closes an existing solo defeat dialog',async()=>{
 const hub=lobbyHarness(),host=hub.add('Host');hub.add('Guest');await hub.pump();
 host.run('document.querySelector(".endgame-dialog").showModal()');
 await host.run('invitePlayer(lastFriends[0].id)');await hub.pump();
 assert.equal(host.run('document.querySelector("main").inert'),true);
 assert.equal(host.run('document.querySelector(".endgame-dialog").open'),false);
});

test('an actual multiplayer castle capture still shows victory and defeat',()=>{
 const host=createGame(),guest=createGame();
 host.run('matchGame.start(1,()=>{});gameStarted=true;N.P2.stock.fill(0);arrive({to:"P2",owner:1,type:0,n:1});render()');
 guest.run('matchGame.start(2,()=>{})');
 guest.context.packet=JSON.parse(host.run('JSON.stringify(snapshot(2))'));
 guest.run('matchGame.receive(packet,1);render()');
 for(const [game,message]of [[host,'Victory. The orchard is yours.'],[guest,'Your named node was captured.']]){
  const dialog=game.context.document.body.children.find(el=>el.className==='endgame-dialog');
  assert.equal(dialog.open,true);
  assert.equal(dialog.querySelector('.endgame-message').textContent,message);
 }
});
