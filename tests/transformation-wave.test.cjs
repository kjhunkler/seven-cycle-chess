const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
for(const page of ['index.html','match.html']){
 test(page+': transformations and animations follow a shared wave',()=>{
  const h=createGame(page);
  assert.equal(h.run('transformationConfig().transformationWave'),false);
  assert.equal(h.run('transformationPeriod()'),10);
  h.run(page==='index.html'?'botConfig.transformationWave=true;botConfig.noQueue=true;init();aiT=999':'lobbyConfig.transformationWave=true;lobbyConfig.noQueue=true;online=true;gameStarted=true;init();connectedPlayers=[1,2,3,4];botThink=999');
  h.run('N.C1.owner=1;N.C1.ut=0;N.C1.stock=[6,0,0,0,0,0,0];for(let i=0;i<30;i++)step(.1);select("C1");act("p1")');
  assert.ok(Math.abs(h.run('N.C1.cd')-7)<1e-8);
  assert.ok(Math.abs(h.run('transformationProgress(N.C1)')-.3)<1e-8);
  h.run('for(let i=0;i<50;i++)step(.1);select("P1");globalThis.next=(N.P1.ut+1)%7;act("p"+next)');
  assert.ok(Math.abs(h.run('N.P1.cd')-2)<1e-8);
  assert.equal(h.run('N.P1.transformAt'),h.run('N.C1.transformAt'));
  assert.equal(h.run('transformationProgress(N.P1)'),h.run('transformationProgress(N.C1)'));
  h.run('for(let i=0;i<20;i++)step(.1);render()');
  assert.equal(h.run('N.C1.ut'),1);
  assert.equal(h.run('N.P1.ut'),h.run('next'));
  assert.equal(h.run('N.C1.cd+N.P1.cd'),0);
  // A request on the boundary belongs to the next wave, and cancellation clears it.
  h.run('select("C1");act("p2")');
  assert.ok(Math.abs(h.run('N.C1.cd')-10)<1e-8);
  h.run('act("cancel");for(let i=0;i<110;i++)step(.1)');
  assert.equal(h.run('N.C1.ut'),1);
  assert.equal(h.run('N.C1.transformAt'),null);
 });
 test(page+': disabled wave retains the existing five-second transformation',()=>{
  const h=createGame(page);
  h.run('N.C1.owner=1;N.C1.ut=0;beginTransformation(N.C1,1)');
  assert.equal(h.run('N.C1.cd'),5);
  h.run('step(2)');
  assert.equal(h.run('N.C1.cd'),3);
  assert.equal(h.run('transformationProgress(N.C1)'),.4);
 });
}
test('guest can adjust wave interval in lobby; host synchronizes settings, readiness, deadlines, and progress',()=>{
 const host=createGame(),guest=createGame();
 const deliver=(target,data,source)=>{target.context.packet=JSON.parse(JSON.stringify(data));target.run(`matchGame.receive(packet,${source})`)};
 host.context.send=data=>deliver(guest,data,1);
 guest.context.send=data=>deliver(host,data,2);
 host.run('matchGame.start(1,send)');guest.run('matchGame.start(2,send)');host.run('sendLobby();lobbyReady=[true,false]');
 guest.run('variantField("transformationWave").checked=true;variantField("transformationTime").value="12.5"');
 guest.elements.get('variant-form').listeners.get('change')();
 for(const h of [host,guest]){
  assert.equal(h.run('lobbyConfig.transformationWave'),true);
  assert.equal(h.run('lobbyConfig.transformationTime'),12.5);
  assert.equal(h.run('variantField("transformationTime").disabled'),false);
  assert.equal(h.run('lobbyReady.some(Boolean)'),false);
 }
 host.elements.get('ready-button').onclick();guest.elements.get('ready-button').onclick();
 assert.equal(host.run('gameStarted'),true);assert.equal(guest.run('gameStarted'),true);
 host.run('loop(5100)');
 host.run('N.A1.owner=2;N.A1.ut=0;N.A1.stock=[6,0,0,0,0,0,0];connectedPlayers=[1,2,3,4];for(let i=0;i<30;i++)step(.1)');
 guest.run('command({kind:"produce",node:"A1",type:1})');
 host.run('peerSend(snapshot(2),2)');
 assert.ok(Math.abs(host.run('N.A1.cd')-9.5)<1e-8);
 assert.equal(guest.run('N.A1.transformAt'),12.5);
 assert.equal(guest.run('transformationClock'),host.run('transformationClock'));
 assert.equal(guest.run('transformationProgress(N.A1)'),host.run('transformationProgress(N.A1)'));
 host.run('for(let i=0;i<95;i++)step(.1);peerSend(snapshot(2),2)');
 assert.equal(guest.run('N.A1.ut'),1);
 assert.equal(guest.run('N.A1.cd'),0);
 for(const time of [0,-1,121,NaN,Infinity,'10']){
  host.context.invalidTime=time;
  assert.equal(host.run('validConfig({...lobbyConfig,transformationTime:invalidTime})'),false);
 }
});
