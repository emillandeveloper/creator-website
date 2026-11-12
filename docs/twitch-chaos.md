# Twitch Chaos — foundation (13 Nov 2026)

This module is **independent of the LEVEL 38 birthday event**. It lives in the existing creator website and shares the owner's existing operator key, protected database session, and `/admin` entry point. It is deliberately **laboratory-only** for now: no Twitch Channel Points are charged, no game memory is accessed, and no live EventSub subscriptions are created by this code.

## Implemented

- A discreet, accessible `⚙ Admin` link in the footer of the main website, challenge detail pages and portfolio, linking to `/admin`.
- A combined owner navigation for **Juegos** and **Twitch Chaos**. Chaos panel: `/admin/chaos`, requiring the existing `OWNER` session; unauthenticated browsers are redirected to `/admin` to sign in.
- Five starter reward definitions. Owner can edit cost, cooldown, and preparation state, stored in `ChaosReward` without changing Twitch's actual rewards.
- A **Probar overlay** action that logs a clearly labeled `TEST`/`SIMULATED` event. It does not contact Twitch and cannot touch the game.
- Public, read-only OBS overlay `/chaos/overlay` (transparent 1920×1080 browser source), which polls `/chaos/api/latest` for the most recent test event. An event disappears after 10 seconds and is not replayed indefinitely on reconnect.
- Additive Prisma migration `202611130015_twitch_chaos_foundation` for `ChaosReward` and `ChaosActivity`. The `redemptionId` column is reserved for future Twitch event deduplication.

## Deployment

The website is already hosted on Render. No new service, login, or database is required. Review the new code and database backup before deploying. The existing Render `preDeployCommand: npm run db:migrate` must apply the new additive migration **before** the new web process starts. Never reset the existing database or re-run LEVEL 38 seed commands.

The site remains safe if `LEVEL38_ENABLED=false`. The Chaos prototype deliberately does not depend on the event's active/disabled state. The public read-only overlay has no operator or Twitch credentials. Admin endpoints reuse the existing origin check, authenticated owner session, JSON checks and rate limits.

## Next phase (not yet implemented)

1. Decide which Final Fantasy and version to support. Implement a local Windows agent that connects *outbound* to Render; never expose the game process or open a router port to the internet. Authenticate the agent separately from browser admin sessions.
2. Add a dedicated Twitch Channel Points EventSub subscription and an app-created reward flow. This requires the broadcaster's `channel:manage:redemptions` OAuth scope. The existing LEVEL 38 polling scope alone is insufficient. Do not alter Hebe's credentials without an explicitly authorized credential rotation.
3. Persist unique redemption IDs, command acknowledgements and expiration timestamps; guarantee no double application on Twitch retries, and cancel/refund unfulfillable redemptions where permitted.
4. Enable a real reward only when the local agent is authenticated, a compatible game adapter is active, and the stream owner has armed that reward. Explicitly disable or expire pending effects on disconnect; do not surprise the next stream with old sabotages.
5. Wire the live acknowledgement state into the overlay. The current overlay displays only simulations.

## Local checks

```sh
npm ci --include=dev
npm run build
node --test tests/twitch-chaos.test.cjs
```
