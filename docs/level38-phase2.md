# Phase 2 implementation report

## 1. Database/schema

Two additive migrations extend the original schema and backfill compatible state. They add `LOCKED`/`SECRET`, poll types, stable poll numbers, winner/override references, vote revisions, operator control revisions, game enablement/image/order configuration, structured audit metadata, and an undo link. Constraints enforce one open poll per event, one vote per participant/round, correct option/winner ownership, and a single quest/game reference kind. Phase 1 records are preserved; the original migration is unchanged.

## 2. Backend/domain

The existing module now separates quest rules (`quest-domain.ts`), poll validation/snapshots (`poll-domain.ts`), public/private projections (`state.ts`), explicit reversal logic (`undo.ts`), and transactional orchestration (`service.ts`). All mutations serialize through the event row. Operator compare-and-swap uses a separate control revision, so concurrent votes do not invalidate ordinary moderator requests. Completion count is derived from persisted status.

## 3. Moderator controls

Activation, completion, failure, skip, reveal, make available, manual game changes, draft poll creation/editing, choice add/remove, four poll types, open/close, live totals, tie-aware winner acceptance, reasoned overrides, new rounds copied into a fresh draft, readable audit activity, and an undo control with disabled explanations. Owner configuration is not exposed in the moderator UI.

## 4. Public functionality

Progress, current game, lifecycle quest groups, secret filtering, published polls/history, live totals/results, nickname/session status, and vote/change-vote actions. Clicking Vote prompts for a nickname only when necessary and resumes that pending vote after joining. Existing creator pages remain untouched.

## 5. Voting behavior

Drafts remain private. Opening validates 2–8 options, available/revealed quests, enabled games, and the one-open-round rule. A named anonymous session upserts one choice per round. Closing and voting are serialized: a racing vote either commits before closure or is rejected. History survives closure, new rounds, safe undo-close, and restart. Result acceptance does not automatically activate quests or change games. Ties require selecting a leader; zero votes or a nonleading choice require an explicit override.

## 6. Undo behavior and limitations

Single-step undo applies only to the latest operator action, with explicit handlers for the requested quest/game/poll transitions. It restores statuses/timestamps, retains votes and original audit entries, appends an `action:undone` record, and broadcasts state. Opening cannot be undone after voting; closing cannot be undone after result selection or dependent state. Non-reversible/latest-undo/legacy entries block older history. There is no generic rollback, redo, arbitrary history rewind, or guarantee that viewers forget a previously revealed secret.

## 7. Realtime

The existing sanitized `level38:state` snapshot remains authoritative. Added domain notifications: `quest:failed`, `quest:skipped`, `quest:revealed`, `quest:available`, `poll:created`, `poll:edited`, `poll:opened`, `poll:vote-updated`, `poll:closed`, `poll:winner`, `action:undone`, and `game:configured`; activation/completion/game-change also emit named notifications now. Domain payloads contain revision only. Audit details stay on authenticated HTTP responses. No animation/OBS/Twitch events were added.

## 8. Security/authorization

Existing hashed-key and HTTP-only session authentication is retained. Every HTTP control checks the server session; services recheck the current persisted role. Viewers can only view/join/vote. Moderators operate normal event actions. The existing-game configuration endpoint is owner-only and has no management UI; disabling a game in use is rejected. Origin/custom-header/JSON checks, CSP, input bounds, and throttling apply. Secret data is filtered from HTML, APIs, sockets, and referenced public polls. Public voting exposes aggregates, never participant identities or private override reasons.

## Prisma advisory

Prisma/client remain at **6.19.3**; no newer Prisma 6 patch was available at review time. The affected path was `prisma → @prisma/config@6.19.3 → deepmerge-ts@7.1.5`. The [advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) covers stack exhaustion from cyclic object graphs and identifies 8.0.0 as patched.

This change pins a scoped override to **deepmerge-ts 8.0.2**, after reviewing the [8.0.0 breaking changes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0): changed Map merging, renamed type helpers, and corrected `deepmergeInto` behavior. Prisma's installed configuration loader imports only `deepmerge`; this project uses ordinary configuration records, not Map merging or those renamed helpers. The ordinary merge, cyclic-input regression, actual Prisma configuration loader, client generation, migrations (fresh and upgrade), and database implementation are tested with the override. This is a deliberate transitive compatibility decision, not a Prisma major upgrade.

Exposure was tooling/configuration loading rather than an application request-handler call, although Prisma can be installed via the client's optional peer in production installs. Only trusted repository configuration should be loaded. At validation, `npm audit` reports **zero vulnerabilities**. Keep the scoped pin under review when upgrading Prisma; it is not a claim of compatibility with arbitrary future Prisma configurations.

## 10. Validation

Commands: dependency installation, Prisma format/generate, `npm run build`, `npm test`, `npm run test:integration`, syntax checks for all three browser scripts, `npm audit`, and `git diff --check`.

Final results: build passed; `npm test` reported 7 passing tests; the PostgreSQL integration run reported 25 passing tests (including parent workflow tests); JavaScript syntax and whitespace checks passed; `npm audit` reported zero vulnerabilities. No existing test was removed or changed.

All existing tests are retained. New tests cover lifecycle, terminal-state rules, secret non-disclosure, explicit undo/history safety, owner restrictions, all poll types, leader/tie/zero-vote behavior, overrides/new rounds, simultaneous votes, rapid choice changes, vote-close races, completion-undo races, and preservation of Phase 1 data during migration. A simulated DOM integration test exercises the EJS/browser code with the real server and real Socket.IO; visual browser QA remains separate.

## 11. Exact Phase 2 file inventory

This inventory is relative to the locally completed Phase 1 baseline, not to the repository's last commit (Phase 1 was already uncommitted).

Created:

```text
docs/level38-phase2.md
prisma/migrations/202609130002_level38_live_control/migration.sql
prisma/migrations/202609130003_level38_state_backfill/migration.sql
src/modules/level38/poll-domain.ts
src/modules/level38/quest-domain.ts
src/modules/level38/state.ts
src/modules/level38/undo.ts
tests/fixtures/prisma.config.cjs
tests/integration/browser-scripts.test.cjs
tests/integration/phase2.test.cjs
tests/integration/support.cjs
tests/integration/upgrade.test.cjs
tests/level38-phase2.test.cjs
```

Modified:

```text
docs/level38.md
package.json
package-lock.json
prisma/schema.prisma
public/css/level38.css
public/js/level38/common.js
public/js/level38/control.js
public/js/level38/public.js
src/modules/level38/auth.ts
src/modules/level38/controller.ts
src/modules/level38/index.ts
src/modules/level38/routes.ts
src/modules/level38/seed.ts
src/modules/level38/service.ts
src/modules/level38/validation.ts
src/views/level38/control.ejs
src/views/level38/index.ejs
```

No Phase 2 changes to existing creator-site routes/controllers/models/views/styles/navigation, `src/server.ts`, `render.yaml`, `.env.example`, or existing tests. `jsdom` is a development-only test dependency; no frontend application framework was introduced.

## 12. Phase 3

Twitch/category synchronization, OBS browser sources, final pixel-art styling, synchronized celebration, owner-management UI, broader quest/event configuration, durable domain-event/outbox delivery, multi-instance support, retention/abuse controls, and audience load testing remain. Phase 2 still uses one instance and snapshots with periodic reconciliation.

## 13. Decisions/approval

No approval is needed to review or run this local implementation. Product choices are explicit: one open poll, 2–8 options, ties selected by the moderator, zero-vote winners requiring overrides, manual execution of winning quest/game choices, and conservative single-step undo. Production provisioning/rollout and final event content remain outside this task. Nothing has been pushed or deployed.
