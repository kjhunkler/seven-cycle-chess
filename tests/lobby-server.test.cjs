const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function server(){let handler,now=100000;const context=vm.createContext({createServer:fn=>{handler=fn;return {listen(){}}},...crypto,process:{env:{}},Date:{now:()=>now},console});let source=fs.readFileSync(require('node:path').join(__dirname,'../lobby-server.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'');vm.runInContext(source,context);
 async function request(token,body){let status,data;const req={method:'POST',url:'/lobby',headers:{authorization:'Bearer '+token},async *[Symbol.asyncIterator](){yield JSON.stringify({name:token.slice(0,4),...body})}};const res={headersSent:false,setHeader(){},writeHead(code){status=code;this.headersSent=true},end(raw){data=JSON.parse(raw)}};await handler(req,res);return {status,data}}
 return {request,advance:ms=>now+=ms};}
test('private lobby supports three host links, relay controls, candidates, and latest snapshots',async()=>{
 const s=server(),tokens=Array.from({length:4},()=>crypto.randomUUID()),ids=[];for(const token of tokens)ids.push((await s.request(token,{action:'poll'})).data.id);
 for(let seat=1;seat<4;seat++){
  s.advance(2001);const invited=await s.request(tokens[0],{action:'invite',to:ids[seat]});assert.equal(invited.status,200);const room=invited.data.room;
  const invitation=(await s.request(tokens[seat],{action:'poll'})).data.events[0];assert.equal(invitation.from,ids[0]);
  assert.equal((await s.request(tokens[seat],{action:'accept',room})).status,200);
  for(const action of ['candidate','relay'])assert.equal((await s.request(tokens[0],{action,room,candidate:{candidate:'candidate'}})).status,200);
  for(let n=0;n<3;n++)await s.request(tokens[0],{action:'game',room,game:{kind:'state',sequence:n}});
  const events=(await s.request(tokens[seat],{action:'poll'})).data.events;assert.ok(events.some(e=>e.kind==='relay'));assert.ok(events.some(e=>e.kind==='candidate'));assert.equal(events.filter(e=>e.kind==='game').length,1);assert.equal(events.find(e=>e.kind==='game').game.sequence,2);
  assert.equal((await s.request(tokens[(seat%3)+1],{action:'game',room,game:{kind:'queue'}})).status,404);
 }
});
test('private lobby preserves accepted rooms across a presence outage and expires pending invites',async()=>{
 const s=server(),a=crypto.randomUUID(),b=crypto.randomUUID();await s.request(a,{action:'poll'});const id=(await s.request(b,{action:'poll'})).data.id;
 const room=(await s.request(a,{action:'invite',to:id})).data.room;await s.request(b,{action:'accept',room});s.advance(120000);assert.equal((await s.request(a,{action:'game',room,game:{kind:'heartbeat'}})).status,200);
 await s.request(b,{action:'poll'});const pending=(await s.request(a,{action:'invite',to:id})).data.room;s.advance(31000);assert.ok((await s.request(b,{action:'poll'})).data.events.some(e=>e.room===pending&&e.kind==='expired'));
});

test('private lobby advertises open games and routes validated entry requests',async()=>{
 const s=server(),host=crypto.randomUUID(),guest=crypto.randomUUID();
 const id=(await s.request(host,{action:'poll',activity:{join:true}})).data.id;
 const directory=(await s.request(guest,{action:'poll'})).data;assert.equal(directory.friends[0].activity.join,true);
 assert.equal((await s.request(guest,{action:'enter',to:id,mode:'invalid'})).status,404);
 assert.equal((await s.request(guest,{action:'enter',to:id,mode:'spectate'})).status,200);
 const entry=(await s.request(host,{action:'poll',activity:{join:false}})).data.events[0];
 assert.equal(entry.kind,'entry-request');assert.equal(entry.from,directory.id);assert.equal(entry.mode,'spectate');
 assert.equal((await s.request(guest,{action:'enter',to:id,mode:'join'})).status,429);
 await s.request(host,{action:'poll',activity:null});s.advance(2000);
 assert.equal((await s.request(guest,{action:'enter',to:id,mode:'join'})).status,404);
});

test('simultaneous entry requests can receive their automatic invitations without the manual invite throttle',async()=>{
 const s=server(),host=crypto.randomUUID(),visitors=[crypto.randomUUID(),crypto.randomUUID()];
 const id=(await s.request(host,{action:'poll',activity:{join:true}})).data.id;
 const ids=[];
 for(const token of visitors){ids.push((await s.request(token,{action:'poll'})).data.id);await s.request(token,{action:'enter',to:id,mode:'join'})}
 for(const to of ids)assert.equal((await s.request(host,{action:'invite',to})).status,200);
 assert.equal((await s.request(host,{action:'invite',to:ids[0]})).status,429,'ordinary repeat invitations remain throttled');
});
