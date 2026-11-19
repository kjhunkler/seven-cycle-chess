# Fruit Wars online lobby

GitHub Pages hosts all game editions and the online lobby. SpacetimeDB handles public presence, game availability, invitations, WebRTC signaling, and encrypted fallback game messages. The host runs the game simulation and connects independently to each guest over WebRTC when possible. A private Node HTTP lobby remains available for local development.

Guests apply their own actions immediately and simulate local production, transformations, departures, friendly arrivals, and visible troop movement between host updates. The host remains authoritative for combat, fog, bots, and victory. Snapshots normally arrive every 250ms, with an earlier update after player actions. They acknowledge processed inputs so guests can restore the host board and replay only pending actions. Round-trip measurements compensate for snapshot travel time, and troop position corrections blend over 120ms. Prediction stops after 1.5 seconds without a snapshot and resumes from the host board on recovery. No hidden opponent state is sent to enable prediction.

## Local setup

Run the following in separate terminals from the repository root:

    node lobby-server.mjs
    npx --yes http-server . -p 8000

Open http://localhost:8000/ in two to nine tabs or browser profiles. Each tab has its own connection identity. Each browser automatically joins with a random name on first visit. The Friends panel lets players change their name and invite other online players. Accepting an invite opens the dedicated match page. The public Friends directory includes every online guest and all signed-in members.

On the public site, SpacetimeDB Maincloud publishes the online player list and running-game availability. Invitations, entry requests, WebRTC descriptions, ICE candidates, and fallback game messages are delivered through recipient-only views. Room membership is enforced by reducers, and signaling and game envelopes remain encrypted between participants. WebRTC carries direct game traffic when possible; Cloudflare TURN remains available for restrictive networks. No public MQTT broker or MQTT library is used.

The Pages workflow builds the SpacetimeDB client from the checked-in TypeScript bindings. Set the repository variable `FRUIT_WARS_SPACETIME_DB` to a different database name to use that Maincloud deployment. The public lobby requires this database; there is no broker fallback. A configured private HTTP lobby takes precedence. See [SpacetimeDB module setup](spacetime-lobby/README.md) for publishing and regenerating the client bindings.

Friends shows multiplayer wins, losses, games played, win rate, and a separate solo record. A green dot marks an online player. Presence refreshes every five seconds and expires after 30 seconds without a heartbeat, even if a disconnect notification is missed. Signed-in profiles remain listed with their last online time after their final active session closes. Guests leave the directory when they disconnect or their heartbeat expires.

Open **Map library** to preview a layout, see its creator, last edit and play count, or copy a link to it. Signed-in players can publish maps, vote, and comment. The creator can edit a published map. Each edit creates a revision so a match keeps the layout it started with. Solo battle settings and multiplayer setup both preview the selected map.

Bot games wait for the play icon in the top-right toolbar before running. The same control shows a pause icon during play. Dragging a node or changing a node's production also resumes a paused bot game. After a bot game ends, **Play again** is available in the toolbar and the result dialog. Opening battle settings pauses a running bot game; resume explicitly when ready. Multiplayer games cannot be paused. New maps and restarts wait for Start again. Paused games are not advertised to friends and cannot be joined.

Ongoing bot games appear in **Friends** with **Spectate** and **Join game** actions. Spectators see the full board without controlling fruit or occupying a player seat, and can join directly from their spectator view. Watching leaves the host's solo game running. Joining transfers the live board into multiplayer without restarting or running a ready countdown; nodes, moving fruit, queued departures, routes, transformations, and settings carry over. In team games, the joining player replaces the host's eligible teammate bot with the most troops. Otherwise, they replace the eligible bot with the most fruit. Totals include garrisons, queued departures, and traveling fruit; ties use seat order. Existing human seats and eliminated players are excluded. After the round, players use the normal shared rematch lobby. Game availability and spectate/join requests use SpacetimeDB on the public site or the private HTTP lobby during local development. When an account has several online tabs, its running game takes precedence over an idle tab in Friends.

Enable **2v2 teams** in solo or multiplayer setup to use a four-seat map. Seats 1 and 2 play together against seats 3 and 4, with bots filling open seats. Both teammates see their homes on the bottom edge. Your troops and nodes are blue and your teammate’s are green. Send troops along a path to an allied regular node to reinforce it in its current fruit type. Teammates share vision and win together when both opponents are eliminated. Head-to-head records count games against opposing players.

The editor supports two to nine seats. Standard maps apply edits to all matching positions. Use **Move spawn** to select a home and place it on an empty spot, or choose a team size under **Spawn arrangement** to group allied seats. Both keep existing paths attached. Custom spawns share one board orientation across players and their paths can be edited individually. Neutral nodes and paths between them still follow map symmetry. Choose the matching team size when starting a team battle. Two-seat boards support top/bottom or both-axis reflection, three-seat boards support rotation with optional reflection, four-seat boards use both axes, and larger boards use rotation with optional reflection. Neutral nodes start at difficulty 5. Every home and neutral node must be reachable before publication.

Multiplayer plays count once when the ready countdown starts. A solo play counts once when the human creates their first route. Completing that solo round records a win or loss. The public database backfills completed multiplayer games recorded before the map library was introduced.

Open **Match history** in the Friends panel to see your 30 most recent completed online rounds and head-to-head totals. History follows your browser profile when you change your display name. Clearing site data or switching browsers starts a separate history. In matches with more than two seats, each pair earns a shared match and only the winning player earns a win. Results are reported by the host, and unfinished matches do not count.

Active matches send heartbeats every three seconds and attempt relay recovery after twelve seconds without incoming traffic. Public matches use the encrypted SpacetimeDB relay; private matches can relay through the HTTP lobby. After twenty seconds without a guest, a bot controls that seat until the same tab reconnects. A host outage retains each guest’s board while waiting to resume. Transport replacement preserves the simulation and ready state. There is no host migration or resume after a page refresh; the host must keep the game tab open. The underlying solo game pauses while multiplayer is open, including production rotation, and its defeat dialog cannot cover the multiplayer board.

## Enabling TURN on GitHub Pages

1. Deploy the updated `smack-town-arena-turn` Worker from the [SmackTown repository](https://github.com/kjhunkler/SmackTown) using `npx wrangler deploy` in an authorized Cloudflare session. The Worker uses its existing `TURN_TOKEN_ID` variable and `TURN_API_TOKEN` secret.
2. Set the Fruit Wars GitHub Actions repository variable `FRUIT_WARS_TURN_ENDPOINT` to `https://smacktownarena.com/api/turn-credentials` and dispatch **Deploy to GitHub Pages**. The Pages build publishes the endpoint URL. The Worker supplies temporary credentials to the browsers.
3. To disable TURN for Fruit Wars, clear the variable and dispatch the workflow again.

## Publishing with a private signaling service

Run `node lobby-server.mjs` on a Node host that exposes HTTPS and honors the `PORT` environment variable. Set `LOBBY_ORIGIN` to the public Pages origin if it differs from the default. Set the GitHub Actions repository variable `FRUIT_WARS_LOBBY` to the hosted HTTPS endpoint including `/lobby`, then dispatch the Pages workflow.

The lobby keeps active presence and invitations in memory. Run one process for this small community. Set `ICE_SERVERS_JSON` to an array of WebRTC ICE server configurations when adding a TURN relay for restrictive networks. The default STUN server supports direct connections where the network allows them. Any TURN credentials in that array are sent to lobby clients.

## Board experience

All four editions load `board-ui.css` and `board-ui.js`, a shared presentation layer over their existing simulation. It includes custom fruit illustrations, route and capture effects, production progress, keyboard commands, and locally saved feedback preferences. The service worker caches both assets. Selected-node matchup markers use one chevron for a soft counter and two for a hard counter: green points up for an advantage, red points down for a disadvantage, and a horizontal line means even. Hover for the combat-strength ratio. Very faint clockwise chevrons between radial-menu fruits show the counter cycle: each fruit hard counters the next fruit and soft counters the one two steps ahead.

- Select a node with Enter or Space; focus a connected destination and press Enter to send. Arrow keys cycle through nodes and Escape clears selection.
- The board fills the browser viewport. Use the top-right controls for playback, the map library, battle settings, and your profile. Bot difficulty is in **Battle settings**. Open **?** in the lower right for fruit counters and territory colors.
- Scroll to zoom up to 4×. Drag empty board space or middle-drag anywhere on the board to pan. On touchscreens, pinch to zoom and move two fingers together to pan.
- Motion can be disabled, and the OS reduced-motion preference always takes priority. Troops and production indicators continue to show actual game progress.
- Haptics are on by default, but work only on a device/browser that supports `navigator.vibrate`. Desktop and iOS browsers may not provide vibration; API support does not guarantee physical hardware feedback.

Preview the worktree with `npx --yes http-server . -a 127.0.0.1 -p 8037 -c-1`.

Gameplay defaults to Standard speed across solo and multiplayer: all node production takes 3s, type changes 5s, and travel takes 2s per 22 map units. Longer connections take proportionally longer, with the same movement speed on every map. UI input and multiplayer synchronization keep their normal cadence.

Multiplayer matches open with a shared setup dialog. The host can invite up to eight friends from this dialog and remove pending or disconnected seats before starting. Any participant can propose the map, speed, and Shop Nodes; the host commits settings and every human must ready up for that configuration. Bots fill unoccupied seats. Named nodes display their player’s lobby name (or a bot label) beneath them, including through fog. Once everyone readies up, a shared five-second countdown runs at real-time speed before production, movement, or commands begin. Settings changes invalidate everyone’s readiness. After a match ends, any player can choose Return to lobby to bring the group back to the same setup lobby without disconnecting. Names, seats, and settings are retained, everyone readies up again, and the next round uses the shared five-second countdown. Delayed packets from completed rounds are ignored. Each seat has shield and boost shops; bots can charge and use them too. Shops charge from ten incoming fruit and grant a one-hit shield or seven seconds of triple production, with a ten-second game-time cooldown.

Each player starts with a normal node bearing their name. Named nodes produce, transform, accept fruit, and cap population just like every other node. By default, capturing the named node eliminates its player: their remaining territory, pending departures, and moving fruit join the captor, and their shops disappear. The captured node and its connections remain in play. Play continues until one player or team survives; eliminated humans can spectate, and an eliminated host continues the simulation.

Full elimination is optional and defaults off. When enabled, capturing a named node moves that player's name to their highest-population remaining regular node (ties use node ID order). No population, routes, or map positions move with the name. A player is eliminated only when their last regular node is captured; shops and moving fruit do not keep them alive. This setting is available in solo and multiplayer, and online changes clear everyone's readiness.

Run the multiplayer and UI checks with `node --test tests/*.test.cjs`. The suite covers up to nine simulated browser sessions, encrypted public signaling, private relay behavior, readiness races, disconnect recovery, command ownership, fog, and player elimination.

Shop Nodes, Production rotation, Transformation penalty, and Full elimination default off. Three groves retains the original 10-node three-player triangle. Expanded three groves is a separate 22-node option with longer paths and symmetric bypasses. Both are available in solo and multiplayer. Five additional two-player maps are available in both modes: Hourglass (13 nodes), Twin rivers (12), Crown lattice (20), Ring road (14), and Crossroads (15). Their nodes, connections, and starting fruit/garrisons mirror across both board axes; shops are supported, and adding a third human automatically selects a three-player map.

The expandable field guide includes a fruit counter wheel. Choose a fruit in its radial diagram to see its strong and weak counters and the fruits that counter it. Solid arrows show hard counters, dashed arrows show soft counters, green shows wins, and red shows losses. The ratios use both sides' actual combat multipliers. The territory legend shows the colors for the current match.

Transformations take five game seconds. Tap a transforming node to open its fruit menu. Select the fruit with the progress ring or the current fruit to cancel, or select a different fruit to start a new transformation. With Transformation penalty enabled, a transformation removes up to 15% of the troops present when it begins, one troop at a time, and shakes the node for each loss.

Portion control adds a battlefield slider for 25%, 50%, 75%, or 100%. Each new arrow records that portion of its source’s total troops and disappears as soon as that many troops depart. Portions round down to whole troops with a minimum of one (or the remaining stock when less than one). Moving the slider, new production, and incoming troops do not change existing arrow budgets. A 100% arrow can empty its source. Each player chooses their own percentage during online play.

Team formats follow the selected player count: four players offer 2v2, six offer 3v3 or 2v2v2, eight offer 4v4 or 2v2v2v2, and nine offer 3v3v3. Adjacent numbered seats form teams. Teammates share vision and victory, with blue, green, light blue, and teal colors relative to the viewer; opponents use warm colors. Six-, eight-, and nine-player orchard maps are included and can also be played free-for-all.

After publishing the updated SpacetimeDB module, run `initialize_community` to register the nine-player orchard for public match history and map statistics. The match rules now preserve an optional team size for history and statistics.
