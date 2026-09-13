# LEVEL 38 — Phase 4 implementation report

Completed locally on 2026-09-13. No commit, push, deployment, Twitch account/subscription operation, production migration or Render configuration change was performed. Phase 3 work already in the working tree was preserved. Inventories below cover **only Phase 4**, relative to the files present when this phase began.

## 1. Twitch architecture chosen

Optional server-side EventSub **webhook** transport, `channel.update` v2. Express hosts `/level38/twitch/eventsub`; normal public updates reuse the existing Socket.IO publisher and domain event. There is no Twitch WebSocket transport or second realtime system. Initialization is asynchronous after listening and excluded from readiness.

## 2. Twitch app/token flow

Native Node fetch, Client Credentials, in-memory token cache with expiry margin, concurrent acquisition coalescing, startup/fresh-token validation and hourly validation during use. A Helix 401 triggers one reacquisition/retry. Every network request includes a five-second response-body deadline; shutdown aborts active requests. No new dependencies or browser OAuth were introduced. No token, Client Secret or webhook secret reaches HTML/public state/audit logs.

## 3. EventSub webhook implementation

The callback is mounted before browser Origin validation and JSON parsing, with raw JSON limited to 64 KiB and compressed bodies rejected. It supports verification, notification and revocation. It validates the subscription type/version/broadcaster/callback and required category fields. Verification returns the exact challenge as plain text with byte-correct content length. Callback processing makes no Twitch network requests.

## 4. Signature, replay and deduplication

HMAC-SHA256 uses the exact header ID + timestamp string + raw bytes, with `timingSafeEqual` before parsing JSON. Invalid signatures, stale messages over ten minutes, messages over one minute ahead, unsupported message types and malformed bodies fail without game/audit mutation. Notification/revocation IDs are transactionally stored in `TwitchMessage`, retained 24 hours and preserved across process restarts. Duplicate notifications return 204; challenge retries return the challenge again. Out-of-order observations cannot replace newer state.

## 5. Subscription lifecycle

Serialized background/owner operations page existing subscriptions, retain a valid matching v2 subscription or recent pending verification, remove only invalid/duplicate matches, and create only when needed. Unrelated callbacks/channels survive. HTTP 409 creation conflicts cause reconciliation. The stored secret fingerprint detects rotation for known subscriptions; OWNER Recreate handles an unknown preexisting secret. Revocation status persists; a delayed old revocation cannot revoke its replacement. Maintenance runs every five minutes; failures retry with 15-second to five-minute exponential backoff.

## 6. Initial channel synchronization

Resolve broadcaster login when no ID is supplied, then fetch category ID/name/title through Helix. Initial synchronization, owner Sync, subscription repair and maintenance all reconcile the category. Channel fetch is attempted even if subscription reconciliation fails. The request-start timestamp prevents a slow snapshot from replacing a newer webhook. Existing current game remains available through upstream errors.

## 7. Game mapping model

Nullable `Game.twitchCategoryId` and `twitchCategoryName`, with category ID unique within the event. Only an exact ID match to an enabled existing game is applied. Names are labels. Unknown/empty categories preserve the current game; no game creation or guessed mappings. The control UI shows an unmapped category explicitly.

## 8. Automatic current-game behavior

Default mode is `AUTO_TWITCH`. The event row lock serializes automatic changes with all existing writes. A mapped game change commits latest metadata, game, both revisions, dedupe ID and a `TWITCH` audit atomically, then publishes `game:changed` and sanitized public state. Repeated categories selecting the same game do not add game audits or revisions. Latest private observations still advance.

## 9. Manual override behavior

Moderator/owner manual selection enters `MANUAL_OVERRIDE`, including selecting the already-current game from auto mode. The actor name and mode persist. Twitch observations continue without replacing that game. **Return to Twitch Auto** immediately applies the latest persisted mapped category, or retains the current game if unmapped. A manual undo restores the prior game while preserving manual mode. Twitch/return-to-auto audits are not generically undoable; manual selection is the recovery action.

## 10. Control-panel additions

One scoped Twitch panel: connection/error, broadcaster login/ID, latest category, mapped game, source/override actor, last EventSub update and subscription status. Every operator can use existing manual selection and Return to Auto. Only OWNER sees Sync/Ensure/Recreate and mapping forms. Status refreshes through existing control reads (every 30 seconds and after actions) without public diagnostics or an additional status socket.

## 11. Owner mapping UI

A collapsed section contains one minimal form per existing game: numeric category ID, optional name, Save mapping. Blank ID clears the mapping. Role checks and revision validation happen on the server. Inputs survive unrelated status/gameplay updates. No general owner suite or category search UI was added; the setup guide includes a trusted-server Get Games lookup that prints only IDs/names.

## 12. Database migration

`202609130005_level38_twitch` runs in an explicit transaction. It adds `GameSource`, Event source/actor fields, Game mappings/unique index, `TwitchState` and `TwitchMessage` with a cleanup index. It relaxes `AuditLog.operatorId` to nullable for system-origin audits, retaining its foreign key and every existing row. No column/table/history is removed, no old migration is edited, and no reseed occurs. Phase 3 identity/classes, progress, quests, votes, polls, keys, audit and unlock timestamps/counters survive migration.

Production migration remains `npm run db:migrate` → **`prisma migrate deploy`**. Back up before release. Once system audits exist, a rollback binary must understand nullable audit operators; prefer a compatible forward fix rather than reverting to the Phase 3 Prisma model. Disabling Twitch is a configuration fallback and does not require schema rollback.

## 13. Environment variables

All seven are documented in `.env.example`, the [Twitch guide](level38-twitch.md#environment-variables), and [Render deployment documentation](render-deployment.md#complete-environment-reference): `TWITCH_ENABLED`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_BROADCASTER_LOGIN`, `TWITCH_BROADCASTER_ID`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_EVENTSUB_CALLBACK_URL`. Defaults disable Twitch. Misconfiguration produces a private integration error without preventing the event from starting. `render.yaml`, Node version, dependencies and production commands are unchanged.

## 14. Tests executed and results

| Check | Result |
| --- | --- |
| `npm run build` (including Prisma generation) | Passed |
| `npm test` | 15 passed; zero failed/skipped |
| `npm run test:integration` on disposable PostgreSQL 16 | 35 passed; zero failed/skipped |
| `node --test tests/visual/level38-twitch.cjs` | 1 passed; headless Chrome 152, 1440px and 390px |
| Prisma validate | Passed |
| Actual migration deploy + repeat deploy + schema diff | Passed; no pending migrations / no schema difference |
| JS syntax checks across LEVEL 38 browser scripts, scripts and tests | Passed |
| `git diff --check` and Phase 4 inventory review | Passed |

New coverage: cached/coalesced/expired/401 token behavior, broadcaster resolution, pagination, exact bytes and challenge, invalid/stale/oversized/compressed messages, durable/concurrent dedupe, out-of-order messages and slow snapshots, mapping and duplicate audit prevention, source persistence/undo, owner/moderator/viewer authorization, browser CSRF, unknown categories, pending/expired/duplicate/revoked subscriptions, creation conflicts, rotation, API outage/recovery, disabled/misconfigured operation, preservation of all existing record types and public-state privacy.

Existing creator routes/assets, Phase 1–3 workflows, Socket.IO delivery, polls/votes, secret quest filtering and celebration tests pass. Existing test bodies are unchanged; the shared site-process helper now defaults Twitch to disabled so real credentials in a developer shell cannot accidentally cause network activity.

Browser QA exercised real EJS/JS/HTTP/PostgreSQL/Socket.IO with fake Twitch fetches: owner mapping save, retained draft text, moderator-only controls, webhook observation during override, keyboard Return to Auto and game synchronization. No browser page errors or horizontal overflow were observed. Four screenshots were inspected; artifacts are local/ignored in `dist/phase4-visual-qa/`. This is not a physical-device, Safari/Firefox, accessibility audit or real Twitch production smoke test.

No dependency files changed, so no `npm install` was needed. Every Twitch API test uses mocks; no real Twitch request/subscription was made.

## 15. Failure behavior

Disabled or invalid configuration makes no Twitch calls. Upstream network/credential errors appear only in control status; public pages/gameplay remain usable. Unknown categories keep the current game. Manual mode protects the selected game through all category updates and process restarts. Callback transaction failures return a retryable error with no committed dedupe ID. Revocations remain visible and repairable. Normal database dependency and existing Socket.IO delivery limitations remain.

## 16. Exact files created (14)

```text
docs/level38-phase4.md
docs/level38-twitch.md
prisma/migrations/202609130005_level38_twitch/migration.sql
public/js/level38/twitch-control.js
src/modules/level38/twitch/api.ts
src/modules/level38/twitch/config.ts
src/modules/level38/twitch/integration.ts
src/modules/level38/twitch/store.ts
src/modules/level38/twitch/webhook.ts
tests/integration/phase4.test.cjs
tests/integration/twitch-support.cjs
tests/level38-twitch.test.cjs
tests/twitch-fake.cjs
tests/visual/level38-twitch.cjs
```

## 17. Exact files modified (14)

```text
.env.example
docs/level38.md
docs/render-deployment.md
prisma/schema.prisma
public/css/level38.css
public/js/level38/control.js
src/modules/level38/controller.ts
src/modules/level38/index.ts
src/modules/level38/routes.ts
src/modules/level38/service.ts
src/modules/level38/state.ts
src/modules/level38/undo.ts
src/views/level38/control.ejs
tests/helpers.cjs
```

No files deleted. Public-page Phase 3 EJS/JS/sprites/classes/celebration implementation, creator-site files, package manifests/lockfile, `render.yaml`, `.node-version` and migration files 001–004 were unchanged by Phase 4. The CSS addition is scoped to the Twitch controls.

## 18. Production setup steps required

Follow the [exact production setup checklist](level38-twitch.md#production-setup-checklist) and the Phase 4 upgrade section in [Render deployment documentation](render-deployment.md). In order: review/release authorization, backup, build/migrate with Twitch disabled, verify existing event, register app, store the seven variables privately, configure category mappings, enable Twitch/restart, verify subscription and initial sync, then test a real category event and manual/auto fallback. No operator-key recreation or seed reset. Callback/domain/credentials and actual Twitch delivery still require an owner-run production smoke check.

## 19. Anything requiring approval

No approval is needed to inspect this completed local work. Commit/push, deployment, applying production migrations, production environment edits and actual Twitch subscription creation were explicitly excluded and remain unperformed. Those actions require a later instruction. No secrets need to be supplied in chat.

## 20. Intentionally deferred work

Optional stream.online/offline subscriptions, category lookup UI, Twitch user OAuth, OBS overlays, a general owner suite, online presence, multi-instance subscription coordination/Socket.IO infrastructure, durable realtime outbox and audience load testing. No public visual redesign, inventory, rarity, stats, achievements, abilities or other Phase 5 scope was added. Environment disablement requires a process restart; manual override immediately stops automatic game changes. Observations use millisecond ordering, with future sync resolving equal-time ties. Full setup details, retry behavior and operational limitations are documented in the Twitch guide.
