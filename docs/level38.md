# LEVEL 38 — development and operation

LEVEL 38 is an isolated Express/EJS module for the birthday livestream. Phase 2 adds a complete moderator workflow to the Phase 1 foundation. The creator site's existing routes, content, views, styles, and navigation are unchanged. The module remains disabled by default.

See [the Phase 2 implementation report](level38-phase2.md) for changes, verification, and the exact file inventory.

## Local setup

Use Node 22 or 24 LTS and PostgreSQL (validated with Node 24 and PostgreSQL 16). Run commands from the repository root:

1. Run `npm install`.
2. Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell).
3. Set your `DATABASE_URL`, `LEVEL38_ENABLED=true`, and `LEVEL38_ORIGIN=http://localhost:3000`.
4. Build, apply migrations, seed a new event, and provision operators:

```sh
npm run build
npm run db:migrate
npm run db:seed
npm run level38:operator -- create Leo OWNER
npm run level38:operator -- create Isma MODERATOR
npm run dev
```

Each operator command prints a new access key once. Store it securely and give each operator their own key. Sign in at `http://localhost:3000/level38/control`; open `http://localhost:3000/level38` in a separate browser to watch and vote. Use the exact host and port configured in `LEVEL38_ORIGIN`.

The seed creates 54 illustrative quests across Final Fantasy V, VI, and IX, including 6 secrets. Replace these starter objectives with your curated game/save-specific pool before the event. Rerunning the seed against an existing event is a no-op; it never resets progress or replaces history. Existing owner/moderator keys remain valid after upgrading. Skip operator creation if those names already exist.

`npm run build` still runs TypeScript, preceded by Prisma Client generation. `npm start` still runs `dist/server.js`. On Windows, stop running Prisma/server processes before rebuilding or generating the client: the native engine DLL may otherwise be locked (`EPERM`). For local HTTP leave `NODE_ENV=development`; production mode requires an HTTPS origin.

## Upgrading from Phase 1

Stop local servers, run `npm install`, `npm run build`, then `npm run db:migrate` against the existing development database. Do not reset or recreate the database.

The two additive Phase 2 migrations add lifecycle/poll/configuration fields and constraints, copy `Event.revision` to `controlRevision`, and convert unrevealed `AVAILABLE` secret quests to `SECRET`. Completed quests, anonymous sessions, operator keys, voting records, and audit history remain intact. Legacy audit entries are visible but cannot be undone because they lack complete reversal snapshots.

A new database constraint allows only one open poll per event. Phase 1 had no polling endpoints, so normal Phase 1 databases have none. If you manually inserted multiple open polls, resolve that condition explicitly before applying the migration; the migration will fail rather than silently close or delete historical rounds.

## Environment

| Variable | Purpose |
| --- | --- |
| `LEVEL38_ENABLED` | `true` enables the module; missing/false leaves it disabled. |
| `DATABASE_URL` | PostgreSQL URL, required when enabled and for database commands. URL-encode credentials; use the provider's TLS parameters. |
| `LEVEL38_ORIGIN` | Exact origin without trailing slash, e.g. `https://your-site.onrender.com`. Used for origin checks and Secure cookie configuration. |
| `LEVEL38_TRUST_PROXY_HOPS` | `0` locally; normally `1` behind Render's known reverse proxy. Do not trust arbitrary forwarded IPs. |
| `NODE_ENV` | `development` locally; `production` on Render. Production requires HTTPS. |
| `PORT` | Existing server port, normally `3000` locally; supplied by Render. |
| `LEVEL38_TEST_DATABASE_URL` | Disposable PostgreSQL database whose name contains `test`. Integration tests never fall back to `DATABASE_URL`. |

`dotenv` loads `.env` locally; existing environment variables take precedence. Local environment files are ignored. No session-signing secret is needed: opaque random cookie tokens are checked against hashes and expiry in PostgreSQL.

Disabled LEVEL 38 returns a preparation page/503 and does not need PostgreSQL. An enabled but unseeded or unavailable database produces a friendly module-level 503; the existing `/` and `/portfolio` pages remain available. Invalid enabled configuration fails startup with a configuration error.

## Isma's live workflow

1. Sign in with the moderator key. The session lasts 12 hours; sign in again if it expires.
2. Choose the current game manually. Quest activation does not automatically switch games.
3. Activate an available quest. Complete it when successful, or fail/skip it as needed. Destructive-looking normal transitions ask for confirmation. Progress counts only quests in `COMPLETED`.
4. To let viewers choose, create a draft poll. Pick its type, question, and 2–8 options. Save it, edit as needed, then open it. Only one poll can be open at once.
5. Watch live totals. Close voting before accepting a leading option. A tie allows selecting either leader. A different result requires an override reason. A poll with zero votes also requires an explicit override.
6. The chosen result is published. For a next-quest/game poll, use the normal quest/game controls to carry it out; accepting a winner does not automatically activate a quest or switch games.
7. Use **New round from this poll** to prefill a new draft. Replace unavailable choices if necessary, save, and open it. The previous round's votes and result stay in history.
8. For an accidental reversible action, use **Undo latest action**. Review its description and any disabled reason.

Live vote updates preserve typed poll questions, option-editor inputs, and winner selections. Operator commands use `controlRevision`, which changes only for operator actions; votes advance the public snapshot revision without constantly invalidating the control panel. A competing operator change returns 409 and asks you to review fresh state. Editing an existing draft keeps the revision from when you loaded it, preventing silent overwrites.

## Quest lifecycle

| Current state | Moderator actions |
| --- | --- |
| `LOCKED` | Make available |
| `AVAILABLE` | Activate, skip |
| `ACTIVE` | Complete, fail, skip, make available |
| `SECRET` / unrevealed legacy secret | Reveal into available |
| `COMPLETED`, `FAILED`, `SKIPPED` | No ordinary transition; undo the latest action if safe |

Unrevealed secrets are excluded from public EJS, API, and socket snapshots. A secret's title/description/ID is not published before reveal. Secret count is public. Referenced quest options must be available, revealed, and belong to enabled games. Quests included in an open poll are frozen until it closes, so voters' choices remain consistent.

Multiple quests may be active. Completed progress is calculated from persisted quest status rather than incrementing a separate counter. Duplicate/stale completion requests cannot count twice. Reversing completion restores its prior status and timestamp and adjusts the derived count.

## Polls and voting

| Type | Options |
| --- | --- |
| `NEXT_QUEST` | Available, revealed quests in enabled games; labels derived on the server |
| `NEXT_GAME` | Enabled configured games; labels derived on the server |
| `YES_NO` | Fixed Yes / No |
| `CUSTOM` | Distinct free-text labels |

Drafts are private to operators and can have 0–8 options while being prepared. Opening requires 2–8 valid options. Titles, options, and type cannot be edited after opening, except after a safe undo of an opening with no votes. Removing/replacing options deletes only vote-free draft-option rows; no poll or vote history is deleted. Audit snapshots retain the draft edits.

Visitors can view without choosing a nickname. Clicking Vote prompts for one if needed, then submits that pending choice. A participant's persistent browser identity is independent of their display name. One `(pollId, participantId)` row is upserted for each choice; a changed vote replaces the option on that row. Repeated choices never create extra votes. For requests sent concurrently, the last database-serialized request wins; there is no promise of network-send ordering.

Votes, poll closure, and all operator changes serialize on the event row within transactions. A vote racing closure either commits before closure and appears in the result, or is rejected after closure. Votes never advance the operator revision or create operator audit entries. Private `/api/session` responses include only that participant's own choices; public totals never include participant IDs/nicknames.

Closing preserves all votes. The moderator accepts a vote leader (ties are explicit) or chooses an override with a reason. The original accepted winner and the effective override are stored separately; the audit records each change. Public clients see the effective winner and override indicator, but not the operator's reason or audit data.

## Undo contract

Undo is an explicit inverse of a supported action, never a generic database rollback. Supported actions: activation, completion, failure, skip, reveal, make available, current-game change, and safe poll open/close.

- Only the latest operator audit entry can be undone. The request includes its audit ID and current control revision.
- A non-reversible action (poll creation/edit, winner selection/override, owner game configuration) blocks reaching back into earlier history.
- After one undo, further historical undo is disabled until another reversible operator action occurs. This is intentionally single-step undo, with no redo or arbitrary history rewind.
- Undo opening is rejected once any vote has arrived. Undo closing reopens the same round with every vote preserved, only if no result has been selected and no other poll is open.
- State snapshots must still match. Open-poll dependencies and published secret-quest references prevent unsafe reversals.
- Undoing reveal can hide the quest again, but cannot make viewers forget information already revealed.
- Every undo appends an audit entry linked to the original. The original entry and all votes remain.

The UI shows the reason whenever undo is unavailable, and the server repeats the safety checks inside the mutation transaction. Older Phase 1 audit entries cannot be undone.

## Authentication and owner configuration

Viewer cookies are HTTP-only, SameSite=Lax, scoped to `/level38`, with a one-year absolute lifetime. Operator cookies are separate, HTTP-only, SameSite=Strict, with a 12-hour lifetime. Both use Secure over HTTPS. Hashes, not raw credentials, are stored. Clearing cookies or using another browser creates a new anonymous identity; this is not verified-person anti-abuse protection.

Every control endpoint checks the current operator session/role server-side. Services also recheck the persisted role before committing. All writes require the exact Origin, a custom header, JSON content type, and bounded input. Rate limits and module-scoped CSP remain in place. No browser nickname, role field, or socket command grants privileges.

Owner/moderator management remains outside the UI. Repository/database administrators can use:

```sh
npm run level38:operator -- rotate Isma
npm run level38:operator -- disable Isma
```

Rotation revokes sessions, prints a replacement key, and re-enables a disabled operator. Disable revokes sessions and prevents login. Shell/database access is an owner responsibility.

A minimal owner-only API configures existing games: `POST /level38/api/owner/games/:id`. It accepts `displayName`, `enabled`, `sortOrder` (0–10000), `imagePath` (null or a local `/img/` path), and `controlRevision`. The existing database `Game.title` is the persistent display name; snapshots expose both `title` and `displayName` for compatibility. Disabling a game currently selected, with active quests, or referenced by an open poll is rejected. Slugs remain stable. This endpoint has no UI and is audited; moderator access returns 403. There is no global-reset endpoint or owner-management UI.

## API and realtime

All paths below are relative to `/level38/api`; POST requests require `Origin`, `Content-Type: application/json`, and `X-Level38-Request: 1`.

| Method/path | Purpose |
| --- | --- |
| GET `state` | Sanitized public snapshot |
| GET `session` | Establish/read anonymous cookie, nickname and own votes |
| POST `join` | Set display nickname |
| POST `polls/:id/vote` | `{ optionId }`; named viewer required |
| POST `control/login`, `control/logout` | Operator session lifecycle |
| GET `control/state` | Private quests, drafts, history, undo eligibility |
| POST `control/quests/:id` | `{ action, controlRevision }` |
| POST `control/game` | `{ gameId: string or null, controlRevision }` |
| POST `control/polls` | `{ title, type, options, controlRevision }`; create draft |
| POST `control/polls/:id/edit` | Replace vote-free draft configuration |
| POST `control/polls/:id/status` | `{ action: "open" or "close", controlRevision }` |
| POST `control/polls/:id/winner` | `{ optionId, overrideReason?: string, controlRevision }` |
| POST `control/undo` | `{ auditId, controlRevision }` |
| POST `owner/games/:id` | Owner-only existing game configuration |

Quest/game endpoints retain the `revision` field as a compatibility alias for `controlRevision`; new callers must use the operator revision, not the vote-updated snapshot revision.

Socket.IO uses namespace `/level38`, transport `/level38/socket.io`, and the same HTTP server as Express. `level38:state` carries sanitized state; `level38:unavailable` signals temporary unavailability. Domain notifications carry only `{ revision }`:

`quest:activated`, `quest:completed`, `quest:failed`, `quest:skipped`, `quest:revealed`, `quest:available`, `poll:created`, `poll:edited`, `poll:opened`, `poll:vote-updated`, `poll:closed`, `poll:winner`, `game:changed`, `game:configured`, `action:undone`.

No participant, operator, audit, draft-option, or secret-quest metadata is included in domain notifications. They are emitted after commit. Reconnection fetches current state; periodic reconciliation runs every 30 seconds to cover missed broadcasts. Domain notifications are not durable animation events. See Socket.IO's [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).

## Render and operating limits

The prepared `render.yaml` uses a single paid Starter instance, Node 24, `npm ci --include=dev && npm run build`, pre-deploy `npm run db:migrate` (`prisma migrate deploy`), `npm start`, and `/healthz`. Auto-deploy is off in the proposed configuration. See [the exact first-production checklist and full environment reference](render-deployment.md) before applying these settings. The first release keeps LEVEL 38 disabled until database initialization and operator provisioning are complete. Seeding and operator provisioning remain explicit commands, never startup side effects.

`/healthz` returns 200 while the module is deliberately disabled. Once enabled, it requires a reachable database with the Phase 2 event column and a seeded event; failure returns a generic 503. Render may withhold traffic to the entire service during a database outage, so the deployment guide includes a maintenance path for keeping the creator site available.

Phase 2 still targets one Node process / one Render instance. Database concurrency is safe across connections, but live fan-out and rate limits are process-local. Multi-instance deployment needs a shared Socket.IO adapter, shared throttling, and suitable load balancing. There is no durable outbox yet; crashes between commit and emit recover through snapshots. Load-test for the expected audience before the real event, including the cost of full snapshots and history. Sleeping hosting is unsuitable for uninterrupted livestream operation.

## Tests and tooling

```sh
npm test
```

For integration tests, use a disposable PostgreSQL database whose name contains `test`. Optional local-only Docker setup:

```sh
docker run --name level38-tests -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=level38_test -p 127.0.0.1:55438:5432 -d postgres:16
```

The trust-authentication example is only for local disposable tests. In PowerShell:

```powershell
$env:LEVEL38_TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55438/level38_test'
npm run test:integration
```

Tests use random schemas, run committed migrations, and remove only their own schemas. Coverage includes existing routes, lifecycle/undo, permissions, secrets, poll types/results, simultaneous/rapid votes, poll-close races, completion/undo races, restart persistence, Phase 1 upgrade preservation, and operator commands. The jsdom integration test executes actual EJS/browser scripts with real HTTP and Socket.IO to exercise nickname voting, draft preservation, live totals, results, and undo. It is not a visual browser/layout test.

For schema development use `npm run db:migrate:dev -- --name description` against a development database. Also run JavaScript syntax checks and `git diff --check` before review.

The Prisma advisory is resolved through a scoped `@prisma/config → deepmerge-ts@8.0.2` override; Prisma/client remain pinned at 6.19.3. See the [advisory outcome and compatibility evidence](level38-phase2.md#prisma-advisory).

## Later work

Phase 3 may add Twitch/EventSub, OBS overlays, pixel-art presentation and synchronized celebrations. Owner-management UI, richer event/quest configuration, verified-person/abuse controls, retention/cleanup, durable event delivery, multi-instance scaling, and audience load testing also remain. No Twitch, OBS, final styling, global reset, or special level-38 unlock celebration is implemented here.
