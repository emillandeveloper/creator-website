# LEVEL 38 Twitch setup and operation

Twitch category synchronization is optional. Keep `TWITCH_ENABLED=false` to operate quests and games manually without Twitch credentials or network access. New polls use native Twitch voting exclusively and require the native-poll configuration below; there is no website-voting fallback. Twitch does not participate in `/healthz`. Real poll creation is an operator action, not part of automated tests.

## Architecture and protocol

The server reuses **EventSub webhook transport**: `channel.update` **version 2** for categories and `channel.poll.begin`, `channel.poll.progress`, `channel.poll.end` **version 1** for native polls. Subscription management uses an app access token. Poll API calls use a separately validated broadcaster user token with `channel:manage:polls`; a bot grant cannot substitute for it. No second Twitch WebSocket transport is needed. [Twitch subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)

Client Credentials runs entirely on the server. Concurrent token requests share one promise; cached tokens have a 60-second expiry margin. Fresh tokens are validated, then revalidated hourly when used. A Helix 401 invalidates the cache and retries once with a new token. Every HTTP request, including response body consumption, has a five-second deadline. Raw upstream errors and credentials are excluded from control errors and logs. [Client Credentials](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow), [token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/)

Initialization starts after HTTP listening and runs in the background. It resolves the broadcaster if needed, initializes persisted channel state, reconciles each subscription, and fetches Channel Information. A subscription error does not prevent attempting the initial channel fetch. Maintenance repeats every 15 seconds when native polls are enabled, otherwise every five minutes; failed cycles back off to five minutes. Client Credentials failures share a separate cooldown, and their safe HTTP status/reason is shown independently of broadcaster authorization. Owner sync also reads Channel Information. Recovery updates the category without defeating manual override. [Get Channel Information](https://dev.twitch.tv/docs/api/reference/#get-channel-information)

The existing poll runtime independently reads Helix Get Polls with the broadcaster user token every five seconds while a native round is open. It coalesces requests, respects rate-limit resets and backs off temporary failures. It resumes from persisted state after restart and stops after closing/cancelling; it never depends on App Access Token acquisition or category synchronization succeeding. The panel reports each poll EventSub subscription, receipt timestamps and backup health separately. A successful `channel.update` subscription is not evidence of working poll progress. Details and the real-channel verification procedure: [native Twitch polls](level38-native-twitch-polls.txt).

## Production setup checklist

These are actions for the owner during a separately authorized release.

1. Review the release, back up the existing database, build, and apply pending migrations with **`npm run db:migrate` (`prisma migrate deploy`)**. Keep Render's existing pre-deploy migration command. Include migrations 004 and 005 if either is pending. Do not run `db push`, reset migrations, reseed the event, or recreate existing operator keys. First verify the event with `TWITCH_ENABLED=false`.
2. Reuse the existing Twitch application configured for Hebe. Obtain that application's Client Secret securely from its owner; do not create another application or rotate a shared secret merely for this release. Never change Hebe's files. The broadcaster grant and application Client ID must match. [Twitch application configuration](https://dev.twitch.tv/docs/authentication/register-app/)
3. **OAuth Redirect URL:** LEVEL 38 does not add a browser OAuth callback. If a replacement authorization is needed, use the existing application's authorization-code flow and its registered redirect URL, authorizing as the broadcaster with `channel:manage:polls`. Keep the resulting access/refresh tokens private. **EventSub callback:** `https://leonifelheim.tv/level38/twitch/eventsub`; this is a signed notification endpoint, not an OAuth redirect. [Authorization code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow)
4. Verify the canonical public domain resolves to the running service and accepts HTTPS on port 443, without redirects, login walls or request-body rewriting at the callback. `LEVEL38_ORIGIN` must be `https://leonifelheim.tv` for that example callback. Do not use the example domain if the actual service uses another origin. Twitch requires an HTTPS callback on port 443. [Webhook requirements](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/)
5. Generate a separate webhook signing secret on a trusted local machine:

   ```sh
   node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Store the resulting 64 hex characters directly in a password manager and Render's secret environment settings. Do not paste it, the Client Secret, operator keys or app tokens into chat, issues, public logs or screenshots.
6. Set the variables in the table below in the existing Render service's environment. Keep `TWITCH_ENABLED=false` until credentials, mappings and release checks are ready. The repository's `render.yaml` is unchanged; no Blueprint changes are required by this implementation.
7. As OWNER, open `/level38/control` → **Configure Twitch category mappings**. Map existing games to real category IDs; save each mapping. No Twitch IDs are seeded, and no arbitrary Twitch categories create new games. The same category ID cannot belong to two games in this event. Disabled games are excluded from automatic selection.
8. Set `TWITCH_ENABLED=true` and restart/release the service through your normal Render process. The first background pass lists subscriptions before creating anything and fetches the current channel. If the event is in auto mode and the category is mapped, this can immediately change the current game. To hold the current game during setup, Isma should select it manually first, activating override even when the same game was already selected.
9. As OWNER, use **Ensure subscription** if setup needs retrying. Expect `webhook callback verification pending`, then `enabled` / **Connected**. The callback returns Twitch's challenge exactly. Status is reconciled on the next maintenance pass or immediately through Ensure; the control display refreshes at most every 30 seconds and after actions.
10. Use **Sync now** to verify category ID/name and mapped game. Change the channel's category on Twitch to a mapped game during an appropriate test window. Verify **Last EventSub update** changes and the public current game updates in auto mode. Then test Isma's manual override, another Twitch category change, and **Return to Twitch Auto**. This real account/domain smoke check remains unperformed locally.

## Environment variables

These category-integration variables belong to the server environment. Native polls additionally require the variables described below. No new package dependencies are required.

| Variable | Default / requirement |
| --- | --- |
| `TWITCH_ENABLED` | `false`; only exact `true` enables initialization and callback processing. LEVEL 38 must also be enabled. |
| `TWITCH_CLIENT_ID` | Required when enabled; existing Hebe developer application Client ID, matching the broadcaster grant. |
| `TWITCH_CLIENT_SECRET` | Required when enabled; secret, never returned to any client. |
| `TWITCH_BROADCASTER_LOGIN` | Defaults to `leonifelheim`; resolved with Helix Get Users if no ID is configured. |
| `TWITCH_BROADCASTER_ID` | Optional numeric ID, authoritative when supplied. A wrong explicit ID is not silently replaced by the login. |
| `TWITCH_EVENTSUB_SECRET` | Required when enabled; 10–100 printable ASCII characters, preferably 64 random hex characters. Separate from Client Secret. |
| `TWITCH_EVENTSUB_CALLBACK_URL` | Required when enabled; exact `LEVEL38_ORIGIN` + `/level38/twitch/eventsub`, HTTPS port 443, no credentials, query or fragment. |

Native polls additionally use `TWITCH_POLLS_ENABLED=true`, `TWITCH_USER_ACCESS_TOKEN` (the broadcaster grant with `channel:manage:polls`), optional `TWITCH_USER_REFRESH_TOKEN`, and a separate stable `TWITCH_POLL_TOKEN_KEY` containing 64 hexadecimal characters. The token must validate against both the configured broadcaster and the same application Client ID. Rotated tokens are stored in PostgreSQL using AES-256-GCM authenticated encryption and reloaded after restart. The seed grant remains in secret environment configuration; replacing it explicitly supersedes the saved authorization. No token, Client Secret or encrypted envelope is returned in public/control JSON.

The read-only Hebe configuration audit for the 22 October 2026 release found a working broadcaster token with the required scope, an unrelated bot token, and no Client Secret or Refresh Token. Get Users and Get Polls succeeded without creating a real poll. Complete the server's Render configuration with the existing application's owner; a new OAuth grant is only needed if the current one becomes invalid and cannot be refreshed. Full variable mapping, history handling and operation: [native Twitch polls](level38-native-twitch-polls.txt).

Missing/invalid enabled configuration produces a private control error and makes no Twitch calls. It does not throw during LEVEL 38 startup. The resolved broadcaster ID is cached for this process and saved with integration state; login resolution is repeated on the next process initialization so a changed login is respected. Changing broadcaster clears old channel diagnostics/category/subscription references; current game and manual mode remain intact. If an explicit ID is configured, the displayed ID is authoritative even if the configured login label is stale.

## Obtain category IDs

The control status shows the latest received category and its numeric ID. The owner can copy that ID into the matching existing game's mapping. Category names are descriptive labels only.

For another category, use [Helix Get Games](https://dev.twitch.tv/docs/api/reference/#get-games) by exact name. A trusted administrator can run the following in Render Shell after the built code and server environment are available. Edit only the category name. It prints category IDs/names, never the token or credentials:

```sh
node <<'NODE'
const { TwitchApi } = require('./dist/modules/level38/twitch/api');
const { readTwitchConfig } = require('./dist/modules/level38/twitch/config');
const api = new TwitchApi(readTwitchConfig());
api.request('games?name=' + encodeURIComponent('Final Fantasy V'))
  .then(result => console.log(result.data.map(({ id, name }) => ({ id, name }))))
  .catch(() => { console.error('Twitch category lookup failed. Check server configuration.'); process.exitCode = 1; })
  .finally(() => api.close());
NODE
```

An empty list means the exact name did not match. After mapping changes, use **Sync now** in auto mode. Saving a mapping itself preserves the current game; the next notification, sync or maintenance pass applies it.

## Isma's manual fallback

1. Choose the actual current game in the existing game control and press **Change game**. Selecting the already-current game also enters manual mode when the source was auto.
2. Confirm **Game source: Manual Override by Isma**. This immediately prevents Twitch from changing the game and persists across restarts. Twitch category observations continue to appear privately.
3. Keep operating quests, games and celebrations normally through Twitch outages or unmapped categories. Native polls require Twitch availability and do not revert to local website votes.
4. Once ready, press **Return to Twitch Auto**. It immediately applies the latest known category if mapped and enabled. An unmapped/empty category preserves the current game while enabling future auto updates. This action uses persisted state and does not wait for a fresh channel fetch; OWNER can use Sync now first if the known category is old.

Undoing a manual game change restores the previous game while retaining manual mode. Twitch-origin and return-to-auto changes cannot be undone into an ambiguous source state; use manual selection instead. Other undo behavior is preserved.

For an immediate stop to automatic game changes, use manual override. To disable the integration itself, set `TWITCH_ENABLED=false` and restart/release the process. Environment changes are not hot-reloaded: disabling takes effect when the new process starts. Disabled mode makes no Twitch calls and rejects callbacks with 503. It leaves existing subscriptions and diagnostics intact; Twitch may eventually revoke a subscription whose disabled callback keeps rejecting delivery. Re-enabling reconciles it safely. Disabling Twitch never clears the manual/current game state.

## Subscription lifecycle and recovery

The app pages through its `channel.update` subscriptions and matches the broadcaster and exact webhook callback. It keeps one enabled v2 subscription (or a recent pending verification), removes only obsolete/duplicate matches for that same channel/callback, and creates only when no usable match remains. A creation conflict triggers a fresh listing instead of repeated blind creation. Unrelated channels/callbacks are untouched. This follows Twitch's list/create/delete lifecycle. [Subscription management](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/)

The secret's SHA-256 fingerprint is stored privately with subscriptions created by this app, so a later secret rotation replaces them. Twitch does not return subscription secrets. An existing subscription from another setup with an unknown fingerprint is reused; if signatures fail, OWNER must **Recreate subscription** once using the configured secret. Do not run competing instances with different webhook secrets. This phase retains the existing one-instance architecture; no distributed subscription coordinator is added.

Revocations are durably deduplicated and update the matching subscription's status. A delayed revocation for a replaced subscription cannot revoke the replacement. OWNER can repair immediately with Ensure/Recreate; maintenance also repairs absent/invalid subscriptions. The status can remain pending until a listing confirms enablement. Status changes alone do not add game/audit revisions or publish private diagnostics to viewers.

| Symptom | Recovery |
| --- | --- |
| Disabled | Check `TWITCH_ENABLED`, then restart when enabling is intended. Keep manual control while disabled. |
| Configuration error | Check required variables, numeric ID/login and the exact HTTPS callback/origin. No event reset is needed. |
| HTTP 401 / token acquisition error | Check Client ID/Secret belong to the same app. Update a rotated secret in the service environment and restart. Never add a browser token. |
| HTTP 403 from Twitch API | Confirm the app is valid and this is v2 channel.update with an app token. Recheck Twitch application settings. |
| API outage / HTTP 429 | Current game stays available. Retries back off; use manual override and retry Sync later. Raw upstream diagnostics are intentionally omitted. |
| Verification pending/failed | Check domain, HTTPS/443, callback path, request size/body preservation and signing secret. Use Ensure; use Recreate for a mismatched or rotated secret. |
| Callback 403 | Signature, timestamp or raw-body mismatch. Check clock synchronization and signing secret; do not weaken HMAC checks. |
| Unmapped category | Owner maps that numeric ID to an enabled existing game. Isma can immediately select the real game manually. |
| Category received but game unchanged | Check manual override, mapping and enabled game. Repeat categories intentionally produce no duplicate game audit. |
| Callback 503 / database busy | Twitch can retry because message ID and game change commit atomically. Check DB availability/latency and maintenance recovery. |
| Revoked subscription | Read subscription status, fix the underlying cause, then Ensure/Recreate. The event remains usable. |

## Security and data behavior

Only `/level38/twitch/eventsub` bypasses browser Origin/custom-header checks. It accepts raw JSON up to 64 KiB and rejects compression. HMAC-SHA256 covers message ID + original timestamp string + exact body bytes; constant-time comparison precedes JSON parsing. Unsupported messages/subscriptions/broadcasters/callbacks are rejected. Signed verification returns plain challenge text with the correct content length. [Webhook signing and challenge protocol](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/)

Our replay window rejects messages older than ten minutes or more than one minute ahead. Notification/revocation IDs are stored transactionally in PostgreSQL and survive restarts; cleanup removes IDs older than 24 hours. Duplicate notifications return 204 without repeated mutations. Repeated signed challenges return the challenge again, since verification retries must work. [Twitch replay guidance](https://dev.twitch.tv/docs/eventsub/)

Event-row locking serializes category changes against moderator actions, votes and undo. A mapped automatic change increments public/control revisions, writes a `TWITCH` audit with no human operator, and publishes the existing `game:changed` and public snapshot after commit. Same category/current-game repeats, unmapped categories and observations during override produce no duplicate game audits. Observations and stream title are stored privately; payloads, tokens and secrets are never stored in audit logs. Public snapshots remain unchanged in shape for Twitch.

Older observations are ignored, using persisted millisecond timestamps. Helix snapshots use request-start time so a slow response cannot overwrite a newer webhook. Equal millisecond timestamps retain the first observation; a later sync reconciles any unresolved tie. There is no durable realtime outbox: a crash after DB commit but before Socket.IO emit is recovered by existing snapshot refresh. A short DB transaction budget (1 second lock wait, 2 second transaction) avoids holding the callback indefinitely. No Twitch network calls occur inside webhook processing or event transactions.

## Local validation and limits

Leave Twitch disabled for ordinary local HTTP development. The Twitch tests inject a fake fetch implementation that recognizes only Twitch API URLs; no real credentials, developer app or network subscription is needed. The site-process test helper explicitly disables Twitch by default even if the developer's shell enables it.

```powershell
$env:LEVEL38_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55438/level38_test?schema=public'
npm test
npm run test:integration
# Optional, with the separately installed Playwright described in tests/visual/level38.cjs:
node --test tests/visual/level38-twitch.cjs
```

Use only a disposable database whose name contains `test`. The tests apply real migrations to isolated schemas and cover token caching/expiry/401, signatures/challenges/replay/dedupe, mapping, auto/manual transitions, private state, subscription recovery, migration preservation and browser controls. Actual Twitch delivery, production domain/certificates and real credentials must be verified by the owner after release. Stream live/offline subscriptions, user OAuth, category search UI, OBS and a general owner suite are deferred.
