const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../lobby.js'),'utf8');
function harness(endpoint = '') {
  let now = 100000;
  const sent = [], requests = [], messages = [];
  const context = vm.createContext({Date:{now:()=>now}, endpoint, room:'room', matchStart:data=>sent.push(data),
    receiveAt:now, relay:false, status:message=>messages.push(message),
    request:(action, fields)=>{requests.push([action,fields]);return Promise.resolve()},
    startRelay:()=>{context.relay=true}, reset:message=>{context.room='';messages.push(message)},
    frame:null, addEventListener(){}, document:{addEventListener(){}}});
  vm.runInContext(source.slice(source.indexOf('let recovering ='),source.indexOf('function loadTurnServers()')),context);
  vm.runInContext(source.slice(source.indexOf('function receiveGame('),source.indexOf('addEventListener("message"')),context);
  return {context,sent,requests,messages, advance:ms=>{now+=ms}, run:code=>vm.runInContext(code,context)};
}
test('watchdog retries relay and ends an unresponsive match after recovery grace', async()=>{
  const h=harness();
  for(let i=0;i<4;i++){h.advance(3000);h.run('watchConnection()')}
  assert.equal(h.requests.length,1);
  assert.equal(h.context.room,'room');
  await Promise.resolve();
  assert.equal(h.context.relay,true);
  for(let i=0;i<16;i++){h.advance(3000);h.run('watchConnection()')}
  assert.equal(h.context.room,'');
});
test('received heartbeat acknowledges once and clears recovery',()=>{
  const h=harness();
  h.run('recoverConnection();receiveGame({kind:"heartbeat"})');
  assert.equal(h.run('recovering'),false);
  assert.equal(h.sent.length,1);
  assert.equal(h.sent[0].reply,true);
  h.run('receiveGame({kind:"heartbeat",reply:true})');
  assert.equal(h.sent.length,1);
});
test('sleeping tab receives fresh grace instead of immediately losing its match',()=>{
  const h=harness('https://private.example/lobby');
  h.run('watchConnection();recoverConnection()');
  h.advance(120000);
  h.run('watchConnection()');
  assert.equal(h.context.room,'room');
  assert.equal(h.requests.length,0);
});
test('transport replacement preserves game state instead of starting a new game',()=>{
  const start=source.slice(source.indexOf('function startMatch('),source.indexOf('function receiveGame('));
  assert.match(start,/matchGame\.reconnect\(transmit\)/);
  assert.doesNotMatch(start,/matchGame\.start\(/);
});
