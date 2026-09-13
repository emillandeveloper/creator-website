# LEVEL 38 — first Render production deployment

Originally prepared for Phase 2 and extended locally for Phase 4. No Render resources were created or changed during Phase 4, and nothing was pushed or deployed in this phase. The repository configuration was inspected; live Dashboard settings, credentials, domain ownership, billing, and database contents were not inspected. Follow the appropriate checklist yourself when ready.

## Phase 4 release on the existing production service

Phases 1?3 are already complete. For the next reviewed release, keep the existing Render build, pre-deploy (`npm run db:migrate` / `prisma migrate deploy`), start, health, plan and instance settings. **No production Render configuration was changed during Phase 4.** Do not repeat first-event seeding or recreate operator keys.

- [ ] Review the Phase 3 and Phase 4 release together if Phase 3 is still uncommitted locally; include all five migration directories.
- [ ] Back up the existing event database before applying the reviewed release.
- [ ] Keep `TWITCH_ENABLED=false` for the first release of this code. Check the migration log applies any pending Phase 3 migration followed by `202609130005_level38_twitch`.
- [ ] Verify existing routes, health, progress, classes, quests, polls, votes and manual controls with Twitch disabled.
- [ ] Register/configure the Twitch application and seven variables below using the [exact Twitch setup checklist](level38-twitch.md#production-setup-checklist).
- [ ] Configure real category mappings as OWNER. No example category IDs are seeded.
- [ ] Enable Twitch only when ready to create the application subscription and perform initial synchronization. Verify subscription status, a real category update, manual override and return-to-auto.

The rest of this document preserves the original first-deployment procedure for a new service. For the existing live event, use this upgrade checklist. Commit, push, migration and production deployment remain actions for a separately authorized release; none were performed for Phase 4.

## What changed in the deployment setup

The previous `render.yaml` used the Free web plan, `npm install && npm run build`, and `npm start`, without migrations, environment configuration, or a health check. The prepared configuration keeps the existing `leo-nifelheim-site` service name and adds:

| Render setting | Exact value |
| --- | --- |
| Service type / runtime | Web Service / Node |
| Repository | `emillandeveloper/creator-website` |
| Root Directory | Empty: the directory containing `package.json`, `src`, `public`, and `prisma` is the Git repository root |
| Branch | Select the branch containing the reviewed Phase 2 release; the Blueprint otherwise uses the repository default |
| Compute plan | `starter` (paid); one instance, no autoscaling |
| Node version | Major `24`, selected by `.node-version`; Render resolves its available patch release |
| Build Command | `npm ci --include=dev && npm run build` |
| Pre-Deploy Command | `npm run db:migrate` — exactly `prisma migrate deploy` |
| Start Command | `npm start` — exactly `node dist/server.js` |
| Health Check Path | `/healthz` |
| Auto-Deploy | Off (`autoDeployTrigger: "off"`) |
| Region | Keep the existing service's region; provision PostgreSQL in the same account and region |
| Persistent disk | None required; persistent event data is in PostgreSQL |

`npm ci` uses the committed lockfile. `--include=dev` is intentional: TypeScript and the pinned Prisma CLI are development dependencies required during build and pre-deploy. Do not prune them before pre-deploy. The build generates Prisma Client through `prebuild`; `migrate deploy` does not generate it. Views in `src/views`, static files in `public`, and all of `prisma/migrations` must be present alongside `dist` at runtime/deployment.

Render runs pre-deploy after a successful build and before replacing the running application. A failed pre-deploy stops that release. Pre-deploy is available on paid web services. Selecting/applying this prepared plan can incur charges; no paid resources have been provisioned by this work. [Render deployment lifecycle](https://render.com/docs/deploys)

Use a paid PostgreSQL plan with backups for production. Free web services sleep, and Free Render PostgreSQL expires after 30 days and has no managed backups; those are unsuitable for persistent live-event operation. [Free plan limitations](https://render.com/docs/free)

If the existing service was created manually, editing `render.yaml` does not configure that service: copy these settings into its Dashboard. If it is Blueprint-managed, review the sync before applying it. `sync: false` values are prompted only on initial Blueprint creation; add them manually to existing services. Turning Auto-Deploy off does not prevent initial creation, manual deployment, or a Blueprint configuration sync from deploying. [Blueprint configuration](https://render.com/docs/blueprint-spec)

## Complete environment reference

These are all application variables read by this repository, plus the relevant Render runtime selector and test-only variable. Do not upload `.env.example` or a local `.env` to production.

| Variable | Required / secret | First deployment value | After initialization / details |
| --- | --- | --- | --- |
| `NODE_ENV` | Required production setting; not secret | `production` | Keep `production`. Enabled LEVEL 38 rejects an HTTP origin in production. |
| `DATABASE_URL` | Required for every pre-deploy, seed/operator command, and enabled runtime; **secret** | Direct **internal** Render PostgreSQL URL for the production database | Keep the same database on redeploy. Use `schema=public`, URL-encoded credentials, and TLS as described below. Required even while `LEVEL38_ENABLED=false`, because pre-deploy always runs. |
| `LEVEL38_ENABLED` | Explicit operating switch; not secret | `false` | Set exactly `true` and redeploy only after migrations, seed/content review, and operator provisioning. Missing/other values disable the module. Dashboard-managed in the Blueprint. |
| `LEVEL38_ORIGIN` | Required when enabled; not secret | Actual public HTTPS origin, e.g. `https://YOUR-ACTUAL-SERVICE.onrender.com` | Exact scheme + host + optional port, with **no trailing slash, path, query, fragment, or credentials**. Never include `/level38`. Choose one canonical host; mutation/socket origin checks do not allow alternate hosts automatically. |
| `LEVEL38_TRUST_PROXY_HOPS` | Required production setting; not secret | `1` | Assumes direct browser → Render routing. Reassess before adding a CDN/proxy; never use unrestricted trust. |
| `PORT` | Required platform-provided setting; not secret | **Let Render supply it** | The server already reads it and listens on all interfaces. Local default is `3000`; do not copy the example's local port to Render. |
| `NODE_VERSION` | Optional Render build/runtime override; not secret | **Unset** | `.node-version` selects Node 24. Remove an old Dashboard override; if one is necessary, keep it on a tested Node 24 release. It takes precedence over the file. |
| `LEVEL38_TEST_DATABASE_URL` | Test-only; secret if it has credentials | **Do not set in production** | Integration tests require a disposable database whose name contains `test`; never point this at production or run integration tests from the production service. |

Optional Twitch variables, added manually to the existing service's environment when enabling Phase 4 (not to `render.yaml`):

| Variable | Required / secret | Value or behavior |
| --- | --- | --- |
| `TWITCH_ENABLED` | Optional switch; not secret | `false` initially; exactly `true` enables background initialization and the signed callback. |
| `TWITCH_CLIENT_ID` | Required when enabled; identifier | Client ID of the dedicated Twitch developer app. |
| `TWITCH_CLIENT_SECRET` | Required when enabled; **secret** | App Client Secret, stored only in Render environment settings. |
| `TWITCH_BROADCASTER_LOGIN` | Default `leonifelheim`; not secret | Used to resolve the ID when no explicit ID is supplied. |
| `TWITCH_BROADCASTER_ID` | Optional numeric identifier | Takes precedence over login; leave empty to resolve with Get Users. |
| `TWITCH_EVENTSUB_SECRET` | Required when enabled; **secret** | Separate random 64-character hex string. Rotation replaces the matching subscription. |
| `TWITCH_EVENTSUB_CALLBACK_URL` | Required when enabled; not secret | `https://leonifelheim.tv/level38/twitch/eventsub` if that is the canonical production domain. Must exactly match `LEVEL38_ORIGIN` plus this path, HTTPS port 443. |

See [Twitch setup, verification and fallback](level38-twitch.md) for secret generation, app registration, callback details and owner/moderator instructions. App tokens are obtained by the server and are never configured as an environment variable. Invalid Twitch configuration affects only Twitch status, not LEVEL 38 readiness or manual operation.

There is no `SESSION_SECRET`, owner password environment variable, manually supplied Twitch access token, OBS variable, separate `DIRECT_URL`, or shadow database URL in this implementation. Anonymous/operator cookies contain random tokens; PostgreSQL stores their hashes and expiry. Operator access keys are provisioned explicitly, not placed in the repository, Blueprint, or build logs.

The Node file prevents an unexpected major-version change; it does not freeze patch releases. Review the resolved version in each build log. [Render Node version selection](https://render.com/docs/node-version)

Use the database's **direct internal connection URL**, not a transaction-pool endpoint, for this first deployment because the same `DATABASE_URL` is used by both the application and Prisma migrations. Append `?schema=public&sslmode=require` if the URL has no query string; otherwise merge those parameters without adding a second `?` or duplicating keys. Example shape only:

```text
postgresql://USER:URL_ENCODED_PASSWORD@INTERNAL_HOST:5432/DATABASE?schema=public&sslmode=require
```

Internal access requires the same Render account and region. Current Render PostgreSQL supports internal TLS with self-signed certificates; `sslmode=require` prevents plaintext fallback. External access is for administrator tooling outside Render and also requires TLS. Restrict or disable external database access when it is unnecessary. Never disable Node's TLS verification globally. [Render PostgreSQL connection guidance](https://render.com/docs/postgresql-creating-connecting)

## Exact deployment checklist

### 1. Review and provision

- [ ] Confirm the paid web/database plans, the existing service's region, and the canonical HTTPS origin. The Blueprint does not provision a database automatically.
- [ ] In the existing Render service, turn Auto-Deploy **Off before you push**. A local YAML edit cannot change the live service's current auto-deploy setting. For a Blueprint-managed service, also review/disable automatic Blueprint sync during preparation; applying a sync may deploy.
- [ ] Review all Phase 1 + Phase 2 + deployment-preparation files. Earlier phase work was already uncommitted; do not release only the latest deployment-file edits. Include the lockfile, `.node-version`, Prisma schema, all five migration directories, and `migration_lock.toml`. Exclude `.env`, credentials, `node_modules`, `dist`, and local test artifacts.
- [ ] Run the local release checks below. Then **you** commit/push the reviewed release and record its commit SHA. No push has been performed here.
- [ ] Create or select paid Render PostgreSQL **16** in the same account/region as the web service (16 is the tested version). Use a fresh empty production database for the first event. If importing existing Phase 1/2 data, follow the preservation notes below before continuing.
- [ ] Confirm backup/recovery availability and external access restrictions. Take a backup before migrations on any database containing records you need to keep. Render provides recovery and logical exports on paid plans. [PostgreSQL backups](https://render.com/docs/postgresql-backups)
- [ ] Configure all settings in the first table and set the environment values above, with `LEVEL38_ENABLED=false`. Keep the direct production `DATABASE_URL` only in Render's secret environment settings. Use the actual assigned domain rather than guessing it from the service name.

### 2. First deployment with LEVEL 38 disabled

- [ ] In Render, manually deploy the reviewed commit SHA. A new service/Blueprint begins its first deploy as part of creation; review everything before confirming creation.
- [ ] Confirm the build installs the lockfile, generates Prisma Client **6.19.3**, and completes TypeScript compilation. No migration or seed should appear in the build command.
- [ ] Confirm pre-deploy runs `npm run db:migrate`. On a fresh database it must apply, in order:

```text
202609130001_level38_foundation
202609130002_level38_live_control
202609130003_level38_state_backfill
202609130004_level38_party_and_unlock
202609130005_level38_twitch
```

- [ ] Confirm `npm start` starts successfully. `/healthz` must return HTTP 200 with `{"status":"ok"}`. `/` and `/portfolio` must work; `/level38` should return its preparation page with HTTP 503 while disabled.
- [ ] Open the service's trusted **Render Shell** and run:

```sh
npm run db:status
npm run db:seed
npm run level38:operator -- create Leo OWNER
npm run level38:operator -- create Isma MODERATOR
```

- [ ] `db:status` must report that the schema is up to date. Save each generated operator key directly to a password manager and provide Isma only the moderator key through your chosen private channel. These commands print credentials once; do not run them as build/pre-deploy commands, paste them into logs/issues, or share screenshots. Skip creation when restoring operators that already exist; their existing keys remain valid. Use the documented `rotate NAME` command only when rotation is intended.
- [ ] Review the seeded content before opening the event. The seed creates **54 illustrative quests, including 6 secrets**, across FFV/FFVI/FFIX. This makes a functional first deployment; it is not a curated final event pool. Rerunning the seed is a no-op when the event exists and never refreshes objectives or resets progress. Content replacement requires a separately reviewed data change; no global reset is provided.

### 3. Enable and verify

- [ ] Set `LEVEL38_ENABLED=true`, verify the exact HTTPS `LEVEL38_ORIGIN` and proxy-hop value, and deploy the same reviewed commit with the updated environment. Use a deployment that applies the new environment; a restart alone is not a substitute for deploying changed settings.
- [ ] Confirm pre-deploy now reports **no pending migrations** and `/healthz` returns HTTP 200. When enabled, readiness checks PostgreSQL, the Phase 2 event column, and the seeded `level38` event. Missing schema/seed or a database error gives generic HTTP 503, with no credentials, identities, or secret quest details. This small query is not a full schema-drift audit.
- [ ] Check `/`, `/portfolio`, `/level38`, and `/level38/control` on the canonical HTTPS host. Public browsing must work without a nickname; control actions must require an operator key. Inspect session cookies after joining/signing in for `Secure`, `HttpOnly`, and `SameSite=Lax`.
- [ ] Sign in as Isma in one browser and view the public page in another. Change the current game and use a reversible quest action followed immediately by undo. Confirm instant public updates and readable audit history. Avoid revealing a real secret during smoke checks.
- [ ] Create a clearly named **Deployment smoke test** YES/NO poll, open it, join as a viewer, vote, and change that vote. Verify one total vote, live updates, close rejection of further votes, and result acceptance. Keep this round/audit history; do not delete records to clean up the test. Alternatively run the full workflow in a separate staging database and keep production checks read-only.
- [ ] Confirm Socket.IO connects at `/level38/socket.io` with namespace `/level38`, reconnects after a page reload, and public state has no unrevealed quest data or audit metadata. No separate port or Socket.IO service is required.
- [ ] Re-deploy the same commit during a quiet test window. Confirm no pending migrations, retained progress/poll/votes/audit, valid existing keys, and reconnecting clients. Do not run seed or operator creation on every release.
- [ ] Keep one instance and Auto-Deploy Off for the first event. Record the release SHA, environment settings without secrets, backup location/recovery procedure, and smoke-check results. Audience load testing and visual browser QA remain release checks for the real livestream.

Schedule deployments outside active voting. Render can briefly overlap old and new processes during a rolling replacement even with one configured instance; this implementation's Socket.IO fan-out and throttles are process-local. Clients reconnect and reconcile snapshots, but uninterrupted cross-process broadcast delivery is not guaranteed during that overlap.

## Migration safety and existing data

`npm run db:migrate` already resolves to the pinned local `prisma migrate deploy`; this preparation wires it into Render pre-deploy. It applies committed SQL migrations without generating migrations, resetting data, generating Prisma Client, or using a shadow database. It also does **not** detect arbitrary schema drift. `npm run db:status` checks migration history and must succeed after deployment. On a fresh/pending database, a nonzero status before deploy is expected. [Prisma CLI migration behavior](https://docs.prisma.io/docs/orm/reference/prisma-cli-reference)

The migration files were inspected and are **unchanged**:

| Migration | Safety characteristics |
| --- | --- |
| Foundation | Creates tables/enums/indexes/foreign keys for an empty schema. It has no explicit encompassing SQL transaction; an interrupted/failed first application can leave partial objects and requires inspection. Never assume a retry can repair it automatically. |
| Live control | Explicit `BEGIN`/`COMMIT`, additive columns/types/constraints and a nullable option reference. Creates the partial unique index allowing one open poll per event. PostgreSQL 16 rolls this migration back if a constraint fails. |
| State backfill | Separate explicit transaction: copies revisions and converts unrevealed legacy `AVAILABLE` secrets to `SECRET`. The separate migration commits the new enum values before use. It does not remove poll/vote/audit/session history. |

For an imported or already-used database, preserve `_prisma_migrations` with the data, verify the database/schema/backup, stop event writes, and inspect `npm run db:status` before releasing. Do not copy tables without migration history and then assume `migrate deploy` will baseline them. Baselining or restoring into a populated/conflicting schema requires a reviewed plan. Application rollback to Phase 1 is unsafe after the new `SECRET`/`LOCKED` values are used.

For a Phase 1 import only, this read-only SQL must return zero rows before the Phase 2 migration:

```sql
SELECT "eventId", COUNT(*) AS open_polls
FROM "Poll"
WHERE "status" = 'OPEN'
GROUP BY "eventId"
HAVING COUNT(*) > 1;
```

If it returns rows, choose explicitly which rounds to close while preserving their history; do not auto-delete them. Additive DDL/index creation and the backfill can lock tables, so schedule upgrades of an active database in a maintenance window. Prisma migration locking does not replace backups or application compatibility review. Keep migrations serialized and do not disable migration advisory locking.

Prisma 6 can report `current transaction is aborted` for a failure inside the explicit Phase 2 transaction instead of showing the original constraint error. Inspect the preflight query and migration history rather than interpreting that message as permission to retry or reset.

Never run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push` against production. Never edit an applied migration, automatically drop a schema, or automatically mark a failed migration as applied. A failed pre-deploy blocks the release but does not promise to reverse every previously committed migration in that attempt. Preserve the logs, inspect `_prisma_migrations` and actual database state, and prepare a fix/restore plan. `prisma migrate resolve` is an administrator recovery tool only after the correct recovery action is established, not part of the normal checklist.

## Failure and rollback checklist

- Failed install/build: fix the code/configuration and deploy a reviewed commit; the pre-deploy migration step has not run for that failed build.
- Failed migration: leave the existing release in place, stop further deploy attempts, and inspect the failure as above. The new release must not start against a partial migration.
- Failed enabled readiness: check `db:status`, database connectivity/TLS, and whether the seed exists. Do not repeatedly reseed or recreate the database.
- Incorrect origin: use the exact canonical HTTPS origin and deploy the corrected environment. Alternate domains can render a page yet fail mutation/socket origin checks.
- Need to keep the creator site available while investigating: deploy this same compatible code with `LEVEL38_ENABLED=false`. Its health check no longer queries PostgreSQL. The normal pre-deploy still requires a reachable/migratable database; if the database is completely unavailable, an operator can temporarily clear **only this maintenance deployment's** pre-deploy command, deploy the same code disabled, and restore the migration command before any re-enable/new release. This is an emergency Dashboard action, not automated behavior.
- Database outage while enabled: because `/healthz` includes the database, Render can withhold traffic/restart the entire service, including the creator pages. This is intentional readiness behavior; monitor the database and use the disabled maintenance path if needed. [Render health checks](https://render.com/docs/health-checks)
- Application rollback does not roll back PostgreSQL. Prefer a forward fix or the disabled Phase 2 release. Restore a backup only under an explicit recovery plan that accounts for losing writes after the backup.

## Local release validation

From the repository root, with Node 24 and a disposable PostgreSQL 16 database:

```sh
npm ci --include=dev
npm test
# Set LEVEL38_TEST_DATABASE_URL in this shell to the disposable test database.
npm run test:integration
node --check public/js/level38/common.js
node --check public/js/level38/control.js
node --check public/js/level38/public.js
git diff --check
```

The integration suite applies migrations using `migrate deploy` against isolated test schemas. Deployment-specific tests cover disabled bootstrap, missing schema/seed readiness, migration status, rerunning deploy against live records without changing votes/audit/migration checksums, and atomic failure/retry blocking for conflicting legacy open polls. Existing Phase 1 preservation, authorization, concurrency, undo, secret filtering, and simulated browser/Socket.IO tests remain in the suite.

Verified locally on 2026-09-13 with Node **24.11.1**, npm **11.6.2**, and disposable PostgreSQL **16**:

- Clean `npm ci --include=dev` with `NODE_ENV=production`: passed; zero audit vulnerabilities.
- Prisma generation and TypeScript build: passed.
- `npm test`: **7 passed**, no failures or skips.
- `npm run test:integration`: **28 passed** (including parent workflow tests), no failures or skips.
- All three browser scripts and the new test file: JavaScript syntax checks passed.
- YAML parsed locally and the deployment command/setting values were checked against the current Render documentation.
- `git diff --check` and whitespace checks for every deployment-preparation file: passed.

Live Render settings, Linux build/runtime execution on Render, TLS/proxy behavior on the actual domain, paid resource sizing, and the production smoke checklist still require your deployment run. No Render API/Dashboard validation or production database mutation was performed.

## Files changed for deployment preparation

Created: `.node-version`, `docs/render-deployment.md`, `tests/integration/production.test.cjs`.

Modified: `render.yaml`, `package.json` (read-only `db:status` command), `.env.example`, `README.md`, `docs/level38.md`, `src/server.ts` (health route), and `src/modules/level38/index.ts` (readiness query).

No dependency versions, lockfile contents, migration SQL, database schema, quest/poll behavior, creator-page design, or existing tests were changed in this preparation step. Phase 1 and Phase 2 changes remain local and uncommitted with these additions.
