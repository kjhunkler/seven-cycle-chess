const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('email sign-in waits for the lobby profile after the account link succeeds', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../spacetime-lobby/client.js'), 'utf8');
  const sync = source.slice(source.indexOf('  async function syncAccount('), source.indexOf('\n  return {\n    disconnect()'));
  const rows = [];
  const writes = new Map();
  let links = 0;
  let confirmed = 0;
  const connection = {
    db: {
      myAccount: { iter: () => rows },
      myHistoryProfile: { iter: () => [{ profile: 17n }] },
    },
    reducers: { requestAccountLink: async () => { links++; } },
  };
  const context = vm.createContext({
    connection, synced: true, accountSubject: undefined, pendingAccount: undefined,
    nextAccountAttempt: 0, historyRegistered: true, accountError: '',
    credentialKey: 'history', credential: 'guest-credential',
    auth: {
      user: async () => ({ profile: { sub: 'player' }, id_token: 'test-token' }),
      profileConnected: () => { confirmed++; },
    },
    crypto: { randomUUID: () => 'nonce' },
    localStorage: { setItem: (key, value) => writes.set(key, value) },
    URL, AbortSignal, database: 'test-db', host: 'https://example.com',
    fetch: async () => ({ ok: true }),
  });
  vm.runInContext(sync, context);
  const poll = () => vm.runInContext('syncAccount(connection)', context);

  await poll();
  assert.equal(context.accountSubject, undefined);
  assert.equal(confirmed, 0);
  await poll();
  assert.equal(links, 1);

  rows.push({ profile: 17n });
  await poll();
  assert.equal(context.accountSubject, 'player');
  assert.equal(confirmed, 1);
  assert.equal(writes.get('history:linked'), 'guest-credential');
  assert.equal(links, 1);
});
