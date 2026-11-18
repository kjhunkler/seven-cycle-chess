const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
function setup(count=2,speed=.5){
 const host=createGame(),guest=createGame();
 const deliver=(target,data,source)=>{target.context.packet=JSON.parse(JSON.stringify(data));target.run(`matchGame.receive(packet,${source})`)};
 host.context.send=data=>deliver(guest,data,1);guest.context.send=data=>deliver(host,data,2);
 const humans=JSON.stringify(Array.from({length:count},(_,i)=>i+1));
 host.run(`matchGame.start(1,send,${humans})`);guest.run(`matchGame.start(2,send,${humans})`);
 host.run(`lobbyConfig.speed=${speed};lobbyReady=humanPlayers.map(()=>true);beginMatch()`);
 return {host,guest};
}
const overlay=h=>h.created.find(el=>el.className==='match-countdown');
for(const count of [2,3,4])for(const speed of [.5,1.5])test(`${count} players at speed ${speed}: shared five-second countdown freezes play`,()=>{
 const {host,guest}=setup(count,speed);
 for(const h of [host,guest]){
  h.run('render()');assert.equal(h.run('countdownRemaining'),5000);
  assert.equal(overlay(h).textContent,'Starting in 5');assert.equal(overlay(h).hidden,false);
 }
 host.run('globalThis.before=JSON.stringify({N,G});command({kind:"route",node:"P1",to:N.P1.adj[0]})');
 guest.run('command({kind:"route",node:"P2",to:N.P2.adj[0]})');
 host.run('applyCommand(2,{kind:"produce",node:"P2",type:(N.P2.ut+1)%7});loop(1100)');
 assert.equal(host.run('JSON.stringify({N,G})===before'),true);
 assert.equal(host.run('transformationClock'),0);
 assert.equal(overlay(host).textContent,'Starting in 4');
 guest.run('render()');assert.equal(overlay(guest).textContent,'Starting in 4');
 host.run('loop(5100)');guest.run('render()');
 for(const h of [host,guest]){assert.equal(h.run('countdownRemaining'),0);assert.equal(overlay(h).hidden,true)}
 assert.equal(host.run('JSON.stringify({N,G})===before'),true,'no catch-up simulation at countdown boundary');
 guest.run('command({kind:"route",node:"P2",to:N.P2.adj[0]})');
 assert.equal(host.run('N.P2.routes.length'),1,'commands work after countdown');
 host.run('loop(5200)');assert.ok(host.run('transformationClock')>0);
 host.run('matchGame.rebind(send)');assert.equal(guest.run('countdownRemaining'),0,'rebind does not restart countdown');
});
test('reconnecting guest receives remaining countdown and names from a snapshot',()=>{
 const {host}=setup();host.run('lobbyMembers=[{seat:1,name:"Ada"},{seat:2,name:"Lin"}];loop(2100)');
 const guest=createGame();guest.run('matchGame.start(2,()=>{})');
 guest.context.packet=JSON.parse(host.run('JSON.stringify(snapshot(2))'));
 guest.run('matchGame.receive(packet,1);render()');
 assert.equal(overlay(guest).textContent,'Starting in 3');
 assert.match(guest.elements.get('map').innerHTML,/>Ada<\/text>/);
 assert.match(guest.elements.get('map').innerHTML,/>Lin<\/text>/);
});
for(const viewer of [1,2,3,4])test(`castle names follow player ${viewer}'s rotated board and remain visible through fog`,()=>{
 const h=createGame();h.run(`matchGame.start(${viewer},()=>{},[1,2,3,4]);lobbyConfig.map=4;init();lobbyMembers=[{seat:1,name:'Ada <&"'},{seat:2,name:'Lin'},{seat:3,name:'Mira'},{seat:4,name:'Sol'}];render()`);
 const html=h.elements.get('map').innerHTML;
 assert.equal((html.match(/class="player-node-name"/g)||[]).length,4);
 assert.match(html,/Ada &lt;&amp;&quot;/);assert.doesNotMatch(html,/Ada <&"/);
 assert.match(html,/>Lin<\/text>/);assert.match(html,/>Mira<\/text>/);assert.match(html,/>Sol<\/text>/);
 h.run('N.P3.disabled=true;render()');
 assert.doesNotMatch(h.elements.get('map').innerHTML,/data-home="P3"/);
});
test('solo names use saved player name and bots with no countdown',()=>{
 const h=createGame('index.html');h.run('localStorage.getItem=()=>"Ada";render()');
 assert.match(h.elements.get('map').innerHTML,/>Ada<\/text>/);
 assert.match(h.elements.get('map').innerHTML,/>Bot 2<\/text>/);
 assert.equal(overlay(h).hidden,true);
});
