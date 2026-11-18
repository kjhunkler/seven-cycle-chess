# Fruit Wars SpacetimeDB lobby prototype

This local experiment uses SpacetimeDB for online presence and invitations. It runs separately from the Fruit Wars site and doesn't require a SpacetimeDB account. Accepting an invitation records the response in both browsers. The prototype ends there, before WebRTC signaling or starting a match.

## Start locally on Windows

Install the [SpacetimeDB CLI](https://spacetimedb.com/docs/) (this prototype uses 2.15.0) and a supported Node.js release such as 24.22.3. Run the following commands from the repository root in a new PowerShell window:

```powershell
cd experiments/spacetime-lobby
npm ci
npm --prefix spacetimedb ci
spacetime start --listen-addr 127.0.0.1:3107 --data-dir .spacetime-data
```

Leave the database server running. In another PowerShell window, from the repository root:

```powershell
cd experiments/spacetime-lobby
spacetime --config-path .spacetime-data/cli.toml publish --server http://127.0.0.1:3107 --module-path spacetimedb --yes fruit-wars-lobby-demo
spacetime generate --lang typescript --out-dir bindings --module-path spacetimedb
npm run dev
```

The publish command stores a server-issued identity in the ignored local data folder. Keep that folder to reuse the same local database between runs.

Open [the local lobby](http://127.0.0.1:5179/) in two tabs. Enter different names, join in each tab, and send an invitation. Accept or decline from the recipient tab and watch the response appear in the sender tab. A third tab can see the online players. Only the two participants can read their invitation.

Use **Disconnect** and **Join lobby** to reconnect with the same identity in the same tab. SpacetimeDB removes presence and invitations when it detects a disconnect. An abrupt network interruption may take longer to detect than pressing the button. Reloading the page starts a new identity.

Run `npm run build` after generating the bindings to verify the browser bundle.
