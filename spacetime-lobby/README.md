# Fruit Wars Maincloud lobby

The module publishes profiles and delivers invitations through a recipient-only view. The browser acknowledges delivery once it has received the invitation. Accepting or declining still uses the existing encrypted match signaling.

Match history uses a private, browser-scoped credential independent of the per-tab lobby connection. The history reducers record which profile accepted each invite and use that association when a host reports a completed round. A match ID makes retries idempotent. Only participating profiles can subscribe to the recent results and head-to-head views. The host supplies the winner and duration for casual records.

To update the hosted module, use Node.js 24.22.3 and SpacetimeDB CLI 2.15.0. From this directory, use the Maincloud CLI profile that owns the database:

```powershell
$cloudConfig = Join-Path $env:LOCALAPPDATA 'SpacetimeDB/config/fruit-wars-maincloud.toml'
npm --prefix module ci
spacetime --config-path $cloudConfig publish --server maincloud --module-path module fruit-wars-kjhunkler-lobby
spacetime generate --lang typescript --out-dir bindings --module-path module
npm ci
npm run build
```

Commit schema and binding changes together. The GitHub Pages workflow builds and stages the client bundle. Keep module changes compatible with the currently deployed client when publishing before the Pages update.
