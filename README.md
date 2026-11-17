# Fruit Wars online lobby

GitHub Pages hosts all game editions and the online lobby. The lobby uses a small, separate Node HTTP service for presence, invitations, and exchanging WebRTC connection descriptions. The inviter runs the game simulation and sends game updates directly to the other browser over a WebRTC data channel.

## Local setup

Run the following in separate terminals from the repository root:

    node lobby-server.mjs
    npx --yes http-server . -p 8000

Open http://localhost:8000/ in two separate browser profiles or a normal and a private window. Each browser automatically joins with a random name on first visit. The Friends panel lets players change their name and invite other online players. Accepting an invite opens the dedicated match page. Everyone currently in the lobby appears in the online friends list.

The public site defaults to the free EMQX public test broker. Display names and presence are public. Connection descriptions and ICE candidates are encrypted between browsers. When TURN is configured, WebRTC can connect directly or through Cloudflare. If WebRTC setup stalls, the public lobby falls back to encrypted game messages over the same broker. The broker is shared and has no availability guarantee.

## Enabling TURN on GitHub Pages

1. Deploy the updated `simple-rain-games-turn` Worker from the [SmackTown repository](https://github.com/kjhunkler/SmackTown) using `npx wrangler deploy` in an authorized Cloudflare session. The Worker uses its existing `TURN_TOKEN_ID` and `TURN_API_TOKEN` secrets.
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

Multiplayer matches open with a shared setup dialog. Either player can choose the expanded two-player map, a three-player map, a large four-player map, game speed, and Shop Nodes; both players must ready up before the match starts. The three- and four-player maps fill open seats with bots. Shop Nodes charge from ten incoming fruit, then can apply a one-hit shield or a seven-second triple-production boost to an owned node. Each shop ability has a ten-second game-time cooldown.
