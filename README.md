# Fruit Wars online lobby

GitHub Pages hosts all game editions and the online lobby. The lobby uses a small, separate Node HTTP service for presence, invitations, and exchanging WebRTC connection descriptions. The inviter runs the game simulation and sends game updates directly to the other browser over a WebRTC data channel.

## Local setup

Run the following in separate terminals from the repository root:

    node lobby-server.mjs
    npx --yes http-server . -p 8000

Open http://localhost:8000/online.html in two separate browser profiles or a normal and a private window. Each browser stores its own free, name-only profile. Everyone currently in the lobby appears in the online friends list.

The public site defaults to the free EMQX public test broker. Display names and presence are public. Connection descriptions are encrypted between browsers. If direct WebRTC setup stalls, the public lobby falls back to encrypted game messages over the same broker. The broker is shared and has no availability guarantee.

## Publishing with a private signaling service

Run `node lobby-server.mjs` on a Node host that exposes HTTPS and honors the `PORT` environment variable. Set `LOBBY_ORIGIN` to the public Pages origin if it differs from the default. Set the GitHub Actions repository variable `FRUIT_WARS_LOBBY` to the hosted HTTPS endpoint including `/lobby`, then dispatch the Pages workflow.

The lobby keeps active presence and invitations in memory. Run one process for this small community. Set `ICE_SERVERS_JSON` to an array of WebRTC ICE server configurations when adding a TURN relay for restrictive networks. The default STUN server supports direct connections where the network allows them. Any TURN credentials in that array are sent to lobby clients.

## Board experience

All four editions load `board-ui.css` and `board-ui.js`, a shared presentation layer over their existing simulation. It includes custom fruit illustrations, route and capture effects, production progress, keyboard commands, and locally saved feedback preferences. The service worker caches both assets.

- Select a node with Enter or Space; focus a connected destination and press Enter to send. Arrow keys cycle through nodes and Escape clears selection.
- Motion can be disabled, and the OS reduced-motion preference always takes priority. Troops and production indicators continue to show actual game progress.
- Haptics are off by default. Enable them on a device/browser that supports `navigator.vibrate`. Desktop and iOS browsers may not provide vibration; API support does not guarantee physical hardware feedback.

Preview the worktree with `npx --yes http-server . -a 127.0.0.1 -p 8037 -c-1`.
