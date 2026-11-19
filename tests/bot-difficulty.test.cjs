const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');

for(const page of ['index.html','match.html']){
  test(page+' defaults to Normal and Hard combines two individually insufficient garrisons',()=>{
    const h=createGame(page);
    assert.equal(h.run('transformationConfig().botDifficulty'),'normal');
    h.run(`
      const base=N.P2;
      function garrison(id,owner,home,count,adj){
        return {...base,id,owner,home,adj,ut:0,stock:[count,0,0,0,0,0,0],orders:[],routes:[]};
      }
      N={P2:garrison('P2',2,2,6,['P1']),A:garrison('A',2,0,6,['P1']),
         P1:garrison('P1',1,1,8,['P2','A'])};
      G=[];runBotTurns([1]);
    `);
    assert.equal(h.run('N.P2.orders.length+N.A.orders.length'),0);
    h.run('transformationConfig().botDifficulty="hard";runBotTurns([1])');
    assert.equal(h.run('N.P2.orders[0]?.to==="P1"&&N.A.orders[0]?.to==="P1"'),true);
    assert.equal(h.run('N.P1.orders.length'),0);
  });
}

test('Hard reinforces a threatened home before spending its reserves',()=>{
  const h=createGame('index.html');
  h.run(`
    botConfig.botDifficulty='hard';
    const home=N.P2,donor=N[home.adj[0]];
    donor.owner=2;donor.ut=home.ut;donor.stock.fill(0);donor.stock[home.ut]=8;
    home.stock.fill(0);home.stock[home.ut]=3;
    G=[{from:'P1',to:'P2',type:home.ut,n:7,owner:1,t:.5}];
    ai();
  `);
  assert.equal(h.run('donor.orders[0].to'),'P2');
  assert.equal(h.run('donor.orders[0].count'),5);
  assert.equal(h.run('tot(home)'),3);
});

test('online settings accept all levels and older games without the field',()=>{
  const h=createGame();
  assert.equal(h.run('["easy","normal","hard",undefined].every(botDifficulty=>validConfig({...lobbyConfig,botDifficulty}))'),true);
  assert.equal(h.run('validConfig({...lobbyConfig,botDifficulty:"extreme"})'),false);
});
