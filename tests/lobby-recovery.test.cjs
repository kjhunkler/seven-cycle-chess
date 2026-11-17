const {test}=require('node:test');const assert=require('node:assert/strict');const {lobbyHarness}=require('./lobby-harness.cjs');
async function match(){const hub=lobbyHarness(),host=hub.add('Host'),guest=hub.add('Guest');await hub.pump();await host.run('invitePlayer(lastFriends[0].id)');await hub.pump();await guest.run('acceptInvite([...pendingInvites.values()][0])');await hub.pump();host.match.elements.get('ready-button').onclick();guest.match.elements.get('ready-button').onclick();await hub.pump();return {hub,host,guest}}
test('temporary guest outage hands control to a bot, then restores the same seat and state',async()=>{
 const {hub,host,guest}=await match();host.match.run('N.P1.stock[0]=77');hub.block(guest);hub.advance(25000);await hub.beat();assert.equal(host.match.run('connectedPlayers.includes(2)'),false);assert.equal(host.match.run('gameStarted'),true);
 hub.unblock(guest);await hub.beat();assert.equal(host.match.run('connectedPlayers.includes(2)'),true);assert.equal(guest.run('player'),2);assert.equal(host.match.run('N.P1.stock[0]'),77);
});
test('host outage retains guest board; restoring transport resumes without a new match',async()=>{
 const {hub,host,guest}=await match();host.match.run('N.P2.stock[0]=42;loop(200)');await hub.pump();assert.equal(guest.match.run('N.P2.stock[0]'),42);
 hub.block(host);hub.advance(60000);await hub.beat();assert.equal(guest.run('session'),true);assert.equal(guest.match.run('N.P2.stock[0]'),42);
 hub.unblock(host);await hub.beat();host.match.run('loop(300)');await hub.pump();assert.equal(guest.match.run('N.P2.stock[0]'),42);assert.equal(guest.match.run('gameStarted'),true);
});
test('relay fallback rebinds an established game instead of starting it again',async()=>{
 const {hub,host}=await match();host.match.run('N.P1.stock[0]=77');host.run('const l=[...links.values()][0];l.relay=false;startRelay(l)');await hub.pump();assert.equal(host.match.run('N.P1.stock[0]'),77);assert.equal(host.match.run('gameStarted'),true);
});
test('suspended tab retains the match after a long timer gap',async()=>{const {hub,host,guest}=await match();hub.advance(120000);await hub.beat();assert.equal(host.run('session'),true);assert.equal(guest.run('session'),true)});
