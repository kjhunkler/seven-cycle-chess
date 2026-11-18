const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
function network(seat=2){
 const host=createGame(),guest=createGame(),outbox=[];let now=100;
 for(const h of [host,guest])h.context.performance.now=()=>now;
 host.run('matchGame.start(1,()=>{},[1,2,3,4])');
 guest.context.send=packet=>outbox.push(JSON.parse(JSON.stringify(packet)));
 guest.run(`matchGame.start(${seat},send,[1,2,3,4])`);
 host.run(`init();gameStarted=true;countdownRemaining=0`);
 const deliver=(h,packet,source)=>{h.context.packet=JSON.parse(JSON.stringify(packet));h.run(`matchGame.receive(packet,${source})`)};
 const snapshot=()=>JSON.parse(host.run(`JSON.stringify(snapshot(${seat}))`));
 const sync=()=>deliver(guest,snapshot(),1);
 const flush=()=>{for(const packet of outbox.splice(0))deliver(host,packet,seat)};
 const advance=ms=>{now+=ms;guest.run(`loop(${now})`)};
 sync();return {host,guest,outbox,deliver,snapshot,sync,flush,advance,setTime:time=>{now=time}};
}
for(const seat of [2,3,4])test(`seat ${seat} predicts input and simulates departures before a delayed host reply`,()=>{
 const n=network(seat),{host,guest}=n;
 guest.run(`command({kind:'route',node:'P${seat}',to:N.P${seat}.adj[0]})`);
 assert.equal(guest.run(`N.P${seat}.routes.length`),1);
 assert.equal(host.run(`N.P${seat}.routes.length`),0);
 n.advance(20);assert.ok(guest.run('G.length')>0);
 const progress=guest.run('G[0].t');n.advance(20);assert.ok(guest.run('G[0].t')>progress);
 n.sync();assert.equal(guest.run(`N.P${seat}.routes.length`),1,'old snapshot retains pending route');
 n.flush();n.sync();assert.equal(guest.run('pendingCommands.length'),0);
 assert.equal(host.run(`N.P${seat}.routes.length`),1);
});
test('rollback replays ordered route inputs and acknowledges each command once',()=>{
 const n=network(),{guest}=n,stale=n.snapshot();
 guest.run("command({kind:'route',node:'P2',to:N.P2.adj[0]});command({kind:'stop',node:'P2'});command({kind:'route',node:'P2',to:N.P2.adj[1]})");
 const routes=guest.run('JSON.stringify(N.P2.routes)');
 n.deliver(guest,stale,1);assert.equal(guest.run('JSON.stringify(N.P2.routes)'),routes);
 n.flush();n.sync();n.sync();
 assert.equal(guest.run('JSON.stringify(N.P2.routes)'),routes);
 assert.equal(guest.run('pendingCommands.length'),0);
 n.deliver(guest,stale,1);assert.equal(guest.run('JSON.stringify(N.P2.routes)'),routes);
});

test('host rejection corrects predicted actions without bypassing ownership',()=>{
 const n=network(),{host,guest}=n;
 host.run('N.P2.owner=1');guest.run("command({kind:'route',node:'P2',to:N.P2.adj[0]})");
 assert.equal(guest.run('N.P2.routes.length'),1);
 n.flush();n.sync();assert.equal(guest.run('N.P2.routes.length'),0);
 assert.equal(host.run('N.P2.routes.length'),0);
 assert.equal(guest.run('pendingCommands.length'),0);
});
test('guest production and transformations advance locally while hostile production stays frozen',()=>{
 const n=network(),{host,guest}=n;
 host.run('N.P2.tm=CONFIG.outpostRate-.01;N.P1.tm=CONFIG.outpostRate-.01');n.sync();
 const stock=guest.run('tot(N.P2)');guest.run('step(.02)');
 assert.equal(guest.run('tot(N.P2)'),stock+1);
 assert.equal(guest.run('tot(N.P1)'),0);
 guest.run("command({kind:'produce',node:'P2',type:(N.P2.ut+1)%7})");
 const deadline=guest.run('N.P2.cd');guest.run('step(.1)');
 assert.ok(guest.run('N.P2.cd')<deadline);
 n.flush();n.sync();assert.equal(guest.run('pendingCommands.length'),0);
 assert.equal(guest.run('N.P2.pend'),host.run('N.P2.pend'));
});
test('prediction freezes during an outage, drops expired inputs, and resumes from host state',()=>{
 const n=network(),{guest}=n;
 guest.run("command({kind:'route',node:'P2',to:N.P2.adj[0]})");
 n.advance(1600);const before=guest.run('JSON.stringify({N,G,transformationClock})');
 n.advance(100);guest.run("command({kind:'produce',node:'P2',type:3})");
 assert.equal(guest.run('JSON.stringify({N,G,transformationClock})'),before);
 n.sync();assert.equal(guest.run('pendingCommands.length'),0);
 assert.equal(guest.run('N.P2.routes.length'),0);
 n.advance(20);assert.ok(guest.run('transformationClock')>0);
});
test('guest prediction never simulates bots, hostile production, hidden stock or castle capture',()=>{
 const n=network(),{host,guest}=n;
 host.run("connectedPlayers=[1,2];N.P1.tm=2.99;G=[{id:'attack',from:'A1',to:'P1',owner:2,type:0,n:999,t:.999}]");
 n.sync();guest.run('step(.1)');
 assert.equal(guest.run('over'),0);
 assert.equal(guest.run('N.P1.owner'),0,'castle remains hidden');
 assert.equal(guest.run('tot(N.P1)'),0);
 assert.equal(guest.run('botThink'),0);
 assert.equal(guest.run('G.some(g=>g.owner===3||g.owner===4)'),false);
});
test('RTT compensates snapshot age, corrections blend visually, and fresh matches clear prediction',()=>{
 const n=network(),{host,guest}=n;
 host.run("G=[{id:'visible',from:'P2',to:N.P2.adj[0],owner:2,type:0,n:1,t:.3}]");
 n.sync();n.advance(20);const old=guest.run('unitProgress(G[0])');
 n.setTime(320);n.deliver(guest,{kind:'pong',token:guest.run('pingToken')},1);
 assert.equal(guest.run('roundTrip'),200);
 n.sync();assert.ok(guest.run('G[0].t')>.3,'snapshot is advanced by half the measured RTT at game speed');
 assert.ok(Math.abs(guest.run('unitProgress(G[0])')-old)<1e-8,'no visual teleport');
 n.setTime(440);assert.equal(guest.run('unitProgress(G[0])'),guest.run('G[0].t'));
 guest.run('matchGame.start(2,send)');
 assert.equal(guest.run('pendingCommands.length+unitCorrections.size+roundTrip'),0);
});
