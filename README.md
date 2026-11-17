# Fruit Wars online lobby

GitHub Pages hosts all game editions and the online lobby. The lobby uses a small, separate Node HTTP service for presence, invitations, and exchanging WebRTC connection descriptions. The host runs the game simulation and connects independently to each guest over WebRTC, with a relay fallback. Rooms support two, three, or four human players.

## Local setup

Run the following in separate terminals from the repository root:

    node lobby-server.mjs
    npx --yes http-server . -p 8000

Open http://localhost:8000/ in two to four tabs or browser profiles. Each tab has its own connection identity. Each browser automatically joins with a random name on first visit. The Friends panel lets players change their name and invite other online players. Accepting an invite opens the dedicated match page. Everyone currently in the lobby appears in the online friends list.

The public site defaults to the free EMQX public test broker. Display names and presence are public. Connection descriptions and ICE candidates are encrypted between browsers. When TURN is configured, WebRTC can connect directly or through Cloudflare. If WebRTC setup stalls, the public lobby falls back to encrypted game messages over the same broker. The broker is shared and has no availability guarantee.

Active matches send heartbeats every three seconds and attempt relay recovery after twelve seconds without incoming traffic. Public matches use the encrypted broker relay; private matches can relay through the HTTP lobby. After twenty seconds without a guest, a bot controls that seat until the same tab reconnects. A host outage retains each guest’s board while waiting to resume. Transport replacement preserves the simulation and ready state. There is no host migration or resume after a page refresh; the host must keep the game tab open.

## Enabling TURN on GitHub Pages

1. Deploy the updated `smack-town-arena-turn` Worker from the [SmackTown repository](https://github.com/kjhunkler/SmackTown) using `npx wrangler deploy` in an authorized Cloudflare session. The Worker uses its existing `TURN_TOKEN_ID` variable and `TURN_API_TOKEN` secret.
2. Set the Fruit Wars GitHub Actions repository variable `FRUIT_WARS_TURN_ENDPOINT` to `https://smacktownarena.com/api/turn-credentials` and dispatch **Deploy to GitHub Pages**. The Pages build publishes the endpoint URL. The Worker supplies temporary credentials to the browsers.
3. To disable TURN for Fruit Wars, clear the variable and dispatch the workflow again.

## Publishing with a private signaling service

Run `node lobby-server.mjs` on a Node host that exposes HTTPS and honors the `PORT` environment variable. Set `LOBBY_ORIGIN` to the public Pages origin if it differs from the default. Set the GitHub Actions repository variable `FRUIT_WARS_LOBBY` to the hosted HTTPS endpoint including `/lobby`, then dispatch the Pages workflow.

The lobby keeps active presence and invitations in memory. Run one process for this small community. Set `ICE_SERVERS_JSON` to an array of WebRTC ICE server configurations when adding a TURN relay for restrictive networks. The default STUN server supports direct connections where the network allows them. Any TURN credentials in that array are sent to lobby clients.

## Board experience

All four editions load `board-ui.css` and `board-ui.js`, a shared presentation layer over their existing simulation. It includes custom fruit illustrations, route and capture effects, production progress, keyboard commands, and locally saved feedback preferences. The service worker caches both assets.

- Select a node with Enter or Space; focus a connected destination and press Enter to send. Arrow keys cycle through nodes and Escape clears selection.
- Motion can be disabled, and the OS reduced-motion preference always takes priority. Troops and production indicators continue to show actual game progress.
- Haptics are off by default. Enable them on a device/browser that supports `navigator.vibrate`. Desktop and iOS browsers may not provide vibration; API support does not guarantee physical hardware feedback.

Preview the worktree with `npx --yes http-server . -a 127.0.0.1 -p 8037 -c-1`.

Gameplay runs at half speed across solo and multiplayer: castle production takes 4s, outpost production 6s, type changes 10s, and travel 4s. UI input and multiplayer synchronization keep their normal cadence. Desktop boards expand with the viewport up to a 1800px page width.

Multiplayer matches open with a shared setup dialog. The host can invite up to three friends from this dialog and remove pending or disconnected seats before starting. Any participant can propose the map, speed, and Shop Nodes; the host commits settings and every human must ready up for that configuration. Open seats on a three- or four-player map are bots. Settings changes invalidate everyone’s readiness. Each seat has shield and boost shops; bots can charge and use them too. Shops charge from ten incoming fruit and grant a one-hit shield or seven seconds of triple production, with a ten-second game-time cooldown.

Two-player matches end when a castle falls. In three- and four-player matches, a defeated player’s remaining territory, shops, queued departures, and moving fruit join the captor. Their castle is disabled and removed from the board along with its connections and routes. Play continues until only one castle survives. Eliminated humans can spectate; an eliminated host continues running the simulation.

Run the multiplayer and UI checks with `node --test tests/*.test.cjs`. The suite covers two to four simulated browser sessions, encrypted public signaling, private relay behavior, readiness races, disconnect recovery, command ownership, fog, and castle elimination.
