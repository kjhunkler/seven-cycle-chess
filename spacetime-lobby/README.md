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

## Email profiles

Enable SpacetimeAuth in the Maincloud dashboard. Use a public web OAuth client with email login enabled and register the site root as its redirect URI, including its trailing slash. Fruit Wars requests Authorization Code with PKCE and the `offline_access` scope. The client ID is public. The static site does not use an OAuth client secret.

Set `FRUIT_WARS_AUTH_CLIENT` to that client ID in the module publish environment. The module uses it to verify the audience of SpacetimeAuth ID tokens before connecting an account. GitHub Pages defaults to the Fruit Wars public client. Set the repository variable `FRUIT_WARS_AUTH_CLIENT` to override it, or set it to `off` to hide the email sign-in controls and keep the guest lobby available.

Account sign-in attaches a private profile to the current lobby connection. An initial sign-in claims the current guest history. Signing into an existing account restores that account's records and leaves a different browser's guest records separate. Match seats still belong to the current tab, so restoring an account does not recreate an in-progress match after closing that tab.

## Community map migration

Set `FRUIT_WARS_DEFAULT_MAP_OWNER` to the confirmed numeric profile ID of an existing signed-in account when publishing the module. Run `spacetime call --server maincloud fruit-wars-kjhunkler-lobby initialize_community` using the same CLI configuration as the publish. The transaction creates all eleven default layouts, assigns ownership, and backfills counts from stored results. Repeating the migration preserves published edits, votes, comments, and counters. On a fresh development database, the client initializes the catalog on first connection. Setting the owner and repeating the migration later assigns any unowned defaults.
