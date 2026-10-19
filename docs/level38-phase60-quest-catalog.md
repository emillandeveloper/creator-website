# LEVEL 38 — Phase 6.0: final 60-quest catalog

Implemented locally for Leo's October 24, 2026 event. This phase performs no push, deployment, production database operation, event reset or Twitch enablement. Existing uncommitted Phase 5.1 party work is preserved.

## Catalog and behavior

The definitive source is `src/modules/level38/quest-content.json`: 60 stable `q01-…q60-…` identities, exact approved Spanish/English titles, equivalent bilingual objectives, canonical display numbers and mechanic-specific game associations. `quest-content.ts` validates the source during every build. `game-content.json` describes 35 distinct game/edition candidates; `legacy-quest-content.json` preserves the old 54 starter definitions solely for safe recognition.

| Numbers | Category | Count |
| --- | --- | ---: |
| 01–20 | MULTI_GAME | 20 |
| 21–48 | GAME_SPECIFIC | 28 |
| 49–54 | COOPERATIVE | 6 |
| 55–60 | SECRET | 6 |

The journal displays all 60 numbers, localized objectives/categories and eligible games. Cooperative cards have a small category/edge treatment. Unrevealed cards show `???` and localized mystery text. Existing responsive layouts, animation, language preference, accessibility, job classes, variant sprites, participant/presence behavior, party overlays and OBS URLs remain in use.

The goal stays **38 completed active quests**, including a genuine target-crossing event and the existing finale. Cooperative quests require human players and are optional: 48 public solo quests are available before any secret reveal. Each quest has one lifecycle row and one completion regardless of which eligible game is selected. Secret #58 requires all three generation-specific battles before the operator completes that single quest; changing game context awards nothing.

## Schema and identity

Migration `202610150011_level38_final_catalog` adds:

- `QuestCategory`, `Quest.catalogKey`, `Quest.category`, `Quest.retiredAt`.
- `QuestGame`, a many-to-many eligibility relation with same-event composite foreign keys.
- Optional `Poll.contextQuestId` for quest-scoped NEXT_GAME rounds, validated against the same event by the service.
- Unique `(eventId, catalogKey)` identities and a partial unique `(eventId, number)` index for rows whose `retiredAt IS NULL`. The old unconditional number index is replaced atomically; old numbers remain in historical rows.

The migration does **not** replace content. It backfills each existing quest's single-game eligibility so the old catalog still works before the separate sync. No row, foreign key, vote, progress state or participant is deleted. Runtime queries and controls exclude retired quests; public/control completed counts and the Twitch store's existing count query use the same active-only rule. Twitch configuration and enablement are unchanged.

`Quest.gameId` remains the selected/default game. Snapshots and audit history now preserve that selection, including reversible manual selection. Existing quest lifecycle undo remains available. Eligibility configuration is audited and cannot erase a finished quest's selected game.

## Safe synchronization

`syncQuestCatalog` in `quest-content-update.ts` is dry-run by default and uses one transaction plus the existing event-row lock. It serializes against operator actions and votes. The original `quest-content` CLI remains an alias for the final catalog sync; it no longer runs the obsolete starter-text backfill.

For an untouched recognized 54-quest catalog, apply marks those rows retired, reuses existing game slugs, creates missing game editions and creates the 60 canonical rows and their eligibility links. There will be **114 stored historical/current rows and exactly 60 active event quests**, never 114 active quests. Old row IDs, original numbers, texts, relationships and lifecycle states survive. A sync audit and one revision increment invalidate stale controls.

For an existing canonical quest, sync updates approved prose/category metadata while preserving lifecycle, timestamps, selected game, operator-managed eligibility, poll/vote references and identity. Repeating apply after a successful sync is a true no-op, including event revisions and audits.

By default, apply **fails atomically without changes** if legacy rows have unrecognized/custom content, a noninitial state, a reveal/completion timestamp, poll references or quest audit history. Prior progress/reset actions also require review. Partial legacy catalogs, unknown canonical identities, renumbered/retired canonical rows, conflicting equivalent game titles and a target other than 38 block apply. The dry-run prints each blocker and the intended changes without changing data.

If blocked, the operator must review the historical quest identities and decide how to retain their history. Do not delete rows, clear votes, clear timestamps, edit keys or reset the event to bypass the guard. The explicit historical-retirement procedure below handles recognized legacy quests whose current lifecycle has already returned to its initial state. It does not transfer historical completions to new identities.

## Reviewed historical retirement (October 19 follow-up)

The production schema migration was deployed without running the separate content sync. The real production dry-run found the complete 54-row starter catalog, current initial states and zero completed/revealed timestamps, but blocked retirement because prior progress/reset actions and quest audits remain. This is intentional default protection.

`prepareLegacyHistoryReview(db, backupSha256)` now produces a private review manifest. Before generating it, independently verify the actual full `pg_dump` archive SHA-256, read the entire archive and restore it into an isolated database. The helper and CLI accept the supplied backup digest; they do not open or validate the backup file themselves.

The manifest binds the backup digest and approved source catalog to the event ID, event/control revisions, the exact 54 legacy IDs and all event rows in Event, Quest, Game, QuestGame, Poll, PollOption, Vote and AuditLog. The same event lock protects snapshot validation and application. Any changed scoped content invalidates the review. Every event poll must be closed and archived. Custom quest prose, active/completed/revealed state, unexpected identities or a target other than 38 still block application. Poll-option and context-only poll references are both checked, including archived rounds.

With a matching manifest, sync only marks recognized legacy rows retired and creates the canonical catalog. Historical texts, states, IDs, audit payloads, eligibility links, polls, options and votes survive. Participants, operators, sessions and Twitch data are untouched. The transaction records the backup/catalog/scope digests and preservation policy in one new audit row and increments event/control revisions once. It never resets progress counters or transfers past completions.

After rehearsing the operation on the restored copy, generate the production manifest, run the following dry-run and show the plan to the owner. The owner must explicitly approve this concrete production plan **before** the apply command:

```sh
npm run level38:quest-catalog -- --dry-run --reviewed-history /private/path/reviewed-legacy-history.json
# Only after owner approval and independent verification of the backup archive hash:
npm run level38:quest-catalog -- --apply --reviewed-history /private/path/reviewed-legacy-history.json
```

Supply the production connection through the process environment; keep credentials and manifests outside version control. A stale manifest must be reviewed again, never edited to force acceptance. Repeating the same manifest after success permits an unchanged catalog no-op; it cannot authorize a subsequent content update. A normal, separately reviewed canonical update can use the original dry-run/apply flow without a legacy manifest.

Validation for this follow-up: build/TypeScript passed; the six legacy sync tests and six historical-review integration tests passed in disposable local schemas. The historical-review tests cover zero-write dry-run, atomic refusal of stale or corrupted manifests, closed/archived poll requirements, retention of historical foreign-key references, exact history/participant/session preservation, repeat no-op and CLI argument validation. A separate rehearsal against the restored production backup verified exact bilingual text, 20/28/6/6 counts, six redacted secrets, target 38, unchanged unrelated rows and a no-op reapply. Production remains unchanged until the owner's explicit approval.

## Exact commands and later production procedure

Commands below are documentation for a separately approved deployment. They were not executed against production.

1. Back up the database and pause event control/voting traffic for the deployment window. Keep the operator changes and any secret-bearing documentation private.
2. Deploy the reviewed source and build with `npm run build`.
3. Apply schema migrations with `npm run db:migrate`. Migrations alone retain the existing catalog and progress. Restart the application with the matching build/schema.
4. Run the dry-run and review `canApply`, `blocked`, retirement IDs, created/updated numbers and game editions:

```sh
npm run level38:quest-catalog -- --dry-run
```

The same dry-run is the default with no flag. The direct command is `node dist/modules/level38/commands.js quest-catalog --dry-run`; the historical `quest-content` command remains an alias.

5. If blocked, stop. Obtain the documented operator reconciliation decision before any content apply. If clear, obtain the separate deployment/content-apply approval, then run:

```sh
npm run level38:quest-catalog -- --apply
npm run level38:quest-catalog -- --dry-run
```

The second command must report 60 unchanged quests and no retire/create/update/game-create actions. No `db:seed` is needed for the existing event. For a genuinely new empty installation only, the normal seed creates the final 60 directly and remains a no-op if an event exists.

6. Restart/reload clients after applying content: the offline CLI updates revisions but does not hold a live Socket.IO connection. Verify 60 active numbers, 20/28/6/6 categories, six redacted mysteries, eligible selection and unchanged progress/participants/votes. Keep the target at 38. Refresh the existing OBS source after the deployment; there is no new source URL or overlay setup.

## Games, voting and readiness

The initial 160 eligibility links are deliberate candidates, not every RPG attached to every mission. OWNER and MODERATOR can edit eligible games and select one manually on the quest card. Only enabled eligible games appear in its manual selector. NEXT_GAME supports an optional quest context; the browser filters choices and the server revalidates on draft creation, opening, voting and winner selection. Accepting a scoped result persists the chosen quest game. A global event-game poll is still available. Neither game choice nor quest activation automatically creates a poll, and zero-viewer manual operation works.

HeartGold/SoulSilver, Tombi!, Chrono Trigger and separate FFVII original/Rebirth records are present. Classic two-controller FFIV/V/VI have separate edition records; no native cooperative feature is claimed for PC Pixel Remasters or FFIX PC. Octopath Traveler, FFXIII, Sea of Stars and the discarded cooperative games are excluded.

No game or save is marked prepared. `docs/level38-save-preparation-checklist.md` covers every edition and linked quest, required mechanics/access, Parsec/controller/version details and **NOT CHECKED** status. It contains secret spoilers and belongs in operator documentation. Actual save access, edition compatibility, Prinny/Geo mechanics, Twincast encounter setup, minigame targets, controller assignment and Parsec behavior require Leo's later manual verification. No save paths, installed editions or Steam-playtime readiness are invented. Quest success remains human-confirmed; the website does not inspect gameplay footage or saves.

Browser-source regression checks ran in Chrome; physical OBS/CEF and live Parsec performance were not tested in this phase.

## Secret security

All six secrets start SECRET with no reveal timestamp. The same authorized reveal/undo lifecycle controls visibility. Public HTML, API and Socket.IO serialize an explicit redacted DTO: `???` titles in both languages, empty descriptions, no selected game, no eligibility links and no canonical key. Operators receive full details. A secret-exclusive game's roster entry is omitted until it is public through a revealed quest, the manually selected event game or an intentionally published global game poll. Draft polls disclose nothing publicly; a poll referencing a hidden or retired quest/context is not published. Server mutations reject hidden quest poll references and retired quests.

Content JSON lives under `src`, outside the static public directory, with no public catalog-file endpoint. Public socket broadcasts use the redacted state, including after operator changes. Authorized reveal is the only normal quest workflow that publishes secret titles/objectives/targets.

## Local validation

Validation uses generated Prisma code, disposable random schemas in a new local `level38_test` PostgreSQL database, existing test fixtures and installed Chrome. `DATABASE_URL` for production is never read or used for these fixtures. PostgreSQL binaries and QA artifacts live only in ignored `dist/phase60-*`; no dependency or lockfile change is needed.

Final results:

- `npm run build`: passed, including Prisma generation, TypeScript and mandatory catalog validation.
- `npm test`: 45/45 unit tests passed (final build and suite).
- `node --test --test-concurrency=2 tests/integration/*.test.cjs`: 54/54 PostgreSQL/HTTP/Socket.IO tests passed, no skipped/canceled tests. This includes all five final synchronization/CLI tests and the existing upgrade, voting, participant, party and owner-tool suites.
- `node --test --test-concurrency=1 tests/visual/level38.cjs tests/visual/level38-phase38.cjs tests/visual/level38-phase51.cjs tests/visual/level38-phase60.cjs`: 5/5 Chrome tests passed. Includes original public-page interaction/overflow/fallback checks, bilingual persistent finale, both existing party-overlay polish/performance tests and final-catalog browser checks.
- `git diff --check`: passed; new untracked text files also passed trailing-whitespace checks. Delivery documentation lists every changed/untracked path, distinguishing the pre-existing Phase 5.1 work.

The old regression assertions were updated from 54 starters/absent secret rows to 60 canonical rows/redacted numbered mysteries, and from the old first Spanish title to the approved title. Dedicated tests verify the full hidden DTO, secret text and targets across HTML/API/sockets. The foreign-key deletion assertion also accepts PostgreSQL 18's SQLSTATE 23001 for the exact existing PollOption RESTRICT constraint, which Prisma 6 can return without the usual P2003 wrapper; the database still rejects the deletion. No application constraint was weakened.

The content suite independently checks every exact approved title, numbers/keys, bilingual fields, category counts, key restrictions, mechanic-sensitive rules and safe candidate editions. Sync tests exercise zero-write dry-run, 54-to-60 retirement, atomic rejection of progress/customization/reveal/poll/vote/audit activity, no-op repeat apply and preservation of operator changes. Runtime tests cover OWNER/MODERATOR access, HTML/API/socket redaction, eligibility and stale-draft validation, optional polls/manual choice, one completion and the genuine 38-completion crossing. Browser checks cover EN/ES at 1440px and 390px, mystery/cooperative cards, operator editing, zero-poll manual choice and overflow/errors. Screenshots/results are in ignored `dist/phase60-visual-qa`.

## Phase 6.0 file list

Added:

- `prisma/migrations/202610150011_level38_final_catalog/migration.sql`
- `src/modules/level38/game-content.json`
- `src/modules/level38/legacy-quest-content.json`
- `tests/level38-catalog-ui.test.cjs`
- `tests/integration/catalog-runtime.test.cjs`
- `tests/visual/level38-phase60.cjs`
- `docs/level38-phase60-quest-catalog.md`
- `docs/level38-save-preparation-checklist.md`

Modified:

- `package.json`
- `prisma/schema.prisma` (preserving the existing Phase 5.1 default)
- `src/modules/level38/commands.ts`
- `src/modules/level38/controller.ts`
- `src/modules/level38/index.ts`
- `src/modules/level38/owner-tools.ts` (retired rows excluded from existing reset capability; no reset executed outside disposable tests)
- `src/modules/level38/poll-domain.ts`
- `src/modules/level38/quest-content-update.ts`
- `src/modules/level38/quest-content.json`
- `src/modules/level38/quest-content.ts`
- `src/modules/level38/quest-domain.ts`
- `src/modules/level38/routes.ts`
- `src/modules/level38/seed.ts`
- `src/modules/level38/service.ts`
- `src/modules/level38/state.ts`
- `src/modules/level38/twitch/store.ts` (active-only count; no integration behavior/enablement change)
- `src/modules/level38/undo.ts`
- `src/modules/level38/validation.ts`
- `src/views/level38/control.ejs`
- `src/views/level38/index.ejs`
- `src/views/level38/quest-card.ejs`
- `public/css/level38.css`
- `public/js/level38/common.js`
- `public/js/level38/control.js`
- `public/js/level38/translations.js` (preserving existing party translations)
- `tests/level38-quest-content.test.cjs`
- `tests/integration/level38.test.cjs`
- `tests/integration/localization.test.cjs` (preserving the existing migration-test time budget)
- `tests/integration/owner-tools.test.cjs` (preserving the existing migration-test time budget)
- `tests/integration/phase2.test.cjs`
- `tests/integration/quest-content.test.cjs`

Other changes already present when this phase began are Phase 5.1 work: `public/css/level38-party.css`, `public/js/level38/party-overlay.js`, `public/js/level38/party-fireworks.js`, `src/modules/level38/party-runtime.ts`, `src/views/level38/party-overlay.ejs`, `tests/integration/party.test.cjs`, `tests/integration/party-polish.test.cjs`, `tests/level38-phase3.test.cjs`, `tests/level38-party-polish.test.cjs`, `tests/visual/level38-phase50.cjs`, `tests/visual/level38-phase51.cjs`, `prisma/migrations/202609150010_level38_party_polish/migration.sql` and `docs/level38-phase51-overlay-polish.md`. These were preserved, not reimplemented as part of this catalog phase.
