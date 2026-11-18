const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');

function start(page='match.html',seat=1){
  const h=createGame(page);
  if(page==='index.html')h.run('Object.assign(botConfig,{map:4,teams:true});init();aiT=999');
  else h.run('matchGame.start('+seat+',()=>{},[1,2,3,4]);lobbyConfig.teams=true;init();gameStarted=true');
  return h;
}
for(const page of ['index.html','match.html']){
  test(page+' allied routes reinforce a different fruit type without fighting or taking ownership',()=>{
    const h=start(page);
    h.run('N.A1.owner=2;N.A1.ut=3;N.A1.stock=[0,0,0,4,0,0,0];N.A1.shields=2;N.P1.ut=0;N.P1.stock=[6,0,0,0,0,0,0];send("P1","A1");depart(N.P1,.01)');
    assert.equal(h.run('G[0].from==="P1" && G[0].to==="A1"'),true);
    h.run('arrive(G.shift())');
    assert.equal(h.run('N.A1.stock[3]'),5);
    assert.equal(h.run('N.A1.stock[0]'),0);
    assert.equal(h.run('N.A1.owner===2 && N.A1.shields===2'),true);
    h.run('G=[{owner:1,from:"P1",to:"A1",type:0,t:.49,n:1},{owner:2,from:"A1",to:"P1",type:3,t:.49,n:1}];step(.04)');
    assert.equal(h.run('G.filter(g=>g.t>.5).length'),2);
    h.run('N.A1.stock[3]=98;arrive({owner:1,type:4,n:8,to:"A1"})');
    assert.equal(h.run('tot(N.A1)'),99);
  });
  test(page+' a surviving teammate wins for both players',()=>{
    const h=start(page);
    h.run('N.P1.stock.fill(0);arrive({to:"P1",owner:3,type:0,n:1})');
    assert.equal(h.run('isEliminated(1) && over===0 && !vis().has("P3") && vis().has("P2")'),true);
    for(const target of ['P3','P4'])h.run('N.'+target+'.stock.fill(0);arrive({to:"'+target+'",owner:2,type:0,n:1})');
    assert.equal(h.run('over'),2);
    h.run('render()');
    const modal=h.created.find(e=>e.className==='endgame-dialog');
    assert.match(modal.querySelector('.endgame-message').textContent,/Your team won/);
  });
}
test('both partners share their bottom row, vision, and viewer-relative colors on every client',()=>{
  const host=start();
  host.run('N.P3.shields=2;N.P3.routes=["C1"];G=[{owner:3,from:"P3",to:"C1",n:3,type:2,t:.5}]');
  for(const seat of [1,2,3,4]){
    const h=start('match.html',seat),mate=seat%2?seat+1:seat-1;
    h.context.packet=JSON.parse(host.run('JSON.stringify(snapshot('+seat+'))'));
    if(seat!==1)h.run('matchGame.receive(packet,1)');
    h.run('render()');
    const map=h.elements.get('map').innerHTML;
    for(const [p,color] of [[seat,'#62a8ff'],[mate,'#65cd85']]){
      assert.ok(map.split('data-id="P'+p+'"')[1].split('</g>')[0].includes(color));
      assert.equal(h.run('boardViewPoint(N.P'+p+','+seat+').y>50'),true);
    }
    assert.equal(h.run('boardViewPoint(N.P'+seat+','+seat+').x<50'),seat%2===1);
    assert.equal(h.run('JSON.stringify([...vis('+seat+')].sort())===JSON.stringify([...vis('+mate+')].sort())'),true);
    if(seat<=2){
      assert.equal(h.run('packet.nodes.P3.shields===undefined && packet.nodes.P3.owner===0 && packet.units.length===0'),true);
      assert.equal(h.run('packet.nodes.P1.owner===1 && packet.nodes.P2.owner===2'),true);
    }
    h.run('applyCommand('+seat+',{kind:"route",node:"P'+mate+'",to:N.P'+mate+'.adj[0]})');
    assert.equal(h.run('N.P'+mate+'.routes?.length??0'),mate===3?1:0);
  }
});
test('enabling teams selects four seats, clears readiness and rejects smaller maps',()=>{
  const h=createGame();
  h.run('matchGame.start(1,()=>{});lobbyReady=[true,true];variantField("teams").checked=true');
  h.elements.get('variant-form').listeners.get('change')();
  assert.equal(h.run('lobbyConfig.map===4 && lobbyConfig.teams && !lobbyReady.some(Boolean)'),true);
  assert.equal(h.run('validConfig({...lobbyConfig,map:3})'),false);
  assert.equal(h.run('validConfig({...lobbyConfig,map:3,teams:false})'),true);
});
