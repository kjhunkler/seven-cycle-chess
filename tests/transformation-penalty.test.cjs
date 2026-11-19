const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');

for(const page of ['index.html','match.html']){
 test(page+': transformation penalty removes at most 15% gradually and shakes on each loss',()=>{
  const h=createGame(page);
  h.run(page==='index.html'
    ? 'botConfig.transformationPenalty=true;init();aiT=999'
    : 'lobbyConfig.transformationPenalty=true;online=true;gameStarted=true;init();connectedPlayers=[1,2,3,4];botThink=999');
  h.run('N.C1.owner=1;N.C1.ut=0;N.C1.stock=[99,0,0,0,0,0,0];beginTransformation(N.C1,1)');
  assert.equal(h.run('N.C1.transformationPenaltyTotal'),14);
  h.run('step(1)');
  assert.equal(h.run('tot(N.C1)'),97,'the loss is spread over the countdown');
  assert.ok(h.run('N.C1.shake')>0,'a troop loss shakes the node');
  h.run('step(4)');
  assert.equal(h.run('tot(N.C1)'),85,'the completed transformation loses no more than 15%');
  assert.equal(h.run('N.C1.ut'),1);
  assert.equal(h.run('N.C1.transformationPenaltyTotal'),undefined,'the penalty bookkeeping is cleared');
 });

 test(page+': disabled transformation penalty keeps all troops',()=>{
  const h=createGame(page);
  h.run('N.C1.owner=1;N.C1.ut=0;N.C1.stock=[20,0,0,0,0,0,0];beginTransformation(N.C1,1);step(5)');
  assert.equal(h.run('tot(N.C1)'),20);
 });
}

test('online transformation penalty is validated and sent in match configuration',()=>{
 const h=createGame();
 h.run('matchGame.start(1,()=>{});lobbyReady=[true,true];lobbyAction(2,{action:"config",config:{...lobbyConfig,transformationPenalty:true}})');
 assert.equal(h.run('lobbyConfig.transformationPenalty'),true);
 assert.equal(h.run('lobbyReady.some(Boolean)'),false);
 assert.equal(h.run('snapshot(1).config.transformationPenalty'),true);
 assert.equal(h.run('validConfig({...lobbyConfig,transformationPenalty:"yes"})'),false);
});
