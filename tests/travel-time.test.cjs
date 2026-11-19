const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');

for(const mode of ['solo','host','guest'])test(mode+': distance determines movement and arrival time',()=>{
 const h=createGame(mode==='solo'?'index.html':'match.html');
 h.run(`CONFIG.outpostRate=Infinity;
  ${mode==='solo'?'aiT=Infinity;':'online=true;localPlayer='+ (mode==='guest'?2:1)+';botThink=Infinity;'}
  N.A1.x=0;N.A1.y=0;N.A2.x=22;N.A2.y=0;N.A3.x=0;N.A3.y=44;
  for(const id of ['A1','A2','A3']){N[id].owner=${mode==='guest'?2:1};N[id].ut=0;N[id].stock.fill(0);N[id].orders=[];N[id].routes=[];}
  G=[{from:'A1',to:'A2',owner:N.A1.owner,type:0,n:1,t:0},{from:'A1',to:'A3',owner:N.A1.owner,type:0,n:1,t:0}];
  step(CONFIG.travel/2);`);
 assert.equal(h.run('G[0].t'),.5);
 assert.equal(h.run('G[1].t'),.25);
 h.run('step(CONFIG.travel/2)');
 assert.equal(h.run('N.A2.stock[0]'),1);
 assert.equal(h.run('N.A3.stock[0]'),0);
 assert.equal(h.run('G[0].t'),.5);
 h.run('step(CONFIG.travel)');
 assert.equal(h.run('N.A3.stock[0]'),1);
 assert.equal(h.run('G.length'),0);
});
