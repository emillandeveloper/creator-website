# LEVEL 38 — Phase 3.7 completion report

Completed locally on 2026-09-15, preserving the uncommitted Phase 3.6 work. Nothing committed, pushed or deployed. No production configuration or Twitch integration changes. All reset operations and migrations exercised during this phase targeted disposable local PostgreSQL test schemas.

## 1. Why control did not show the finale

The public page loaded `experience.js`, rendered the celebration markup, observed socket snapshots and subscribed to `level38:unlocked`. Control only refreshed its operational state; it had neither the celebration markup nor that subscription.

## 2. Shared celebration implementation

Both pages now include `celebration.ejs` and use the existing `experience.js` implementation for timing, fireworks, dismissal, reduced motion, language changes and durable-sequence deduplication. Control observes the public socket snapshots before refreshing its private control state. Ordinary quest/poll toasts remain public-only so they do not clutter live operation.

Initial/reconnected snapshots establish the sequence baseline without playing effects. Genuine events must advance both the baseline revision and durable unlock sequence. Refreshing an already-completed event does not replay it. A progress reset dismisses any current finale and establishes a new revision boundary. The next genuine crossing still uses the next durable sequence.

## 3. Preview-finale behavior

The owner confirms **TEST · PREVIEW LEVEL 38 FINALE**. The server broadcasts `level38:celebration-preview` to all currently connected LEVEL 38 public and authenticated control pages. This audience is stated in the panel and confirmation prompt; there is no individual-client picker.

The payload contains a random preview ID, timing and target, but no unlock sequence, completed-count claim or fake event state. It uses an explicit TEST/PREVIEW banner and an unchanged-progress message. Preview deduplication is separate from durable unlock tracking; it never writes the client's last-unlock storage. A genuine finale supersedes a preview, and a preview cannot interrupt a pending/visible genuine finale. Hidden/stale clients do not replay it later.

Preview is audited and advances the ordinary event/control revision for duplicate protection. It does not change quests, progress, `unlockSequence`, `lastUnlockedAt` or reset state. Like other audited non-reversible owner actions, it becomes the latest action and prevents undoing an earlier action across it.

## 4. Owner reset panel

A collapsed, warning-colored owner area contains four actions, with ES/EN labels and explanations:

- Preview finale: visual test for connected pages.
- Reset event progress: restore playable starting state and archive polls, retaining participants.
- Clear test participants: expire and anonymize viewer identities and archive polls, retaining progress.
- Prepare clean event: combine progress reset and participant cleanup atomically.

The area also exposes archived rounds as read-only questions, choices, totals and accepted winners. It is omitted entirely from moderator HTML. Existing moderator controls remain available.

## 5. Exact event-progress reset semantics

- Non-secret quests restore their persisted `initialStatus`: AVAILABLE, LOCKED or SECRET. Active/completed/failed/skipped runtime state is removed.
- Secret quests return to SECRET. Every quest's `completedAt` and `revealedAt` becomes null. Completed progress becomes zero.
- Titles, descriptions, translations, numbering, game references, secret definitions and configured starting states are not edited by reset.
- The current game becomes the first enabled game ordered by `sortOrder`, then title; if none are enabled it becomes null. Source becomes MANUAL_OVERRIDE with cleared operator attribution. This avoids automatically handing control to Twitch.
- `lastUnlockedAt` is cleared and `resetSequence` increments to dismiss stale presentation. `unlockSequence` is never reduced; the next genuine crossing increments it normally.
- Event/control revisions remain monotonic. Operator accounts, keys and sessions are untouched.

Migration `202609150007_level38_owner_tools` adds `Quest.initialStatus`, `Poll.archivedAt` and `Event.resetSequence`. Existing secret definitions become initial SECRET; currently locked quests become initial LOCKED; other existing quests default to AVAILABLE. An older quest's lost historical starting state cannot be inferred if it has already transitioned, so import/configuration should explicitly supply `initialStatus` when needed. Seeded starter quests now supply it. A database constraint permits only the three starting states.

## 6. Poll-history behavior

Every non-archived round is archived during progress reset, participant cleanup or clean-event preparation. Draft/open rounds become CLOSED with a reset-time close timestamp; already-closed rounds retain their existing close timestamp. All receive `archivedAt`.

No poll, option, winner, override reason or vote row is deleted. Archived rounds are excluded from the public page/API, current control rounds and viewer vote lists. Server mutation lookups reject archived rounds, and a database constraint prevents an archived round being open. Old secret references cannot leak onto the reset public page or prevent a new reveal/undo cycle. Poll numbers are not reused or restarted. The archive remains inspectable through private control state and the owner's read-only panel.

## 7. Participant cleanup behavior

Cleanup affects all LEVEL 38 viewer identities, not just a nickname-based subset. It clears nickname/class and sets expiry to the epoch. Participant rows remain as expired anonymous tombstones so historical vote foreign keys and totals survive. Token hashes are retained but cannot authenticate because the rows are expired.

Progress reset alone preserves participant identity/class. Separate cleanup preserves quest progress but archives current polls so new identities cannot revote into retained test rounds. Operators and their access keys/sessions are separate records and survive both operations.

Old viewer cookies receive an unauthenticated response from authenticated viewer actions. The existing session endpoint issues a new cookie/identity. The browser now recovers an expired name submission by acquiring a session and retrying the explicitly entered name; an expired vote opens registration instead of silently restoring the old vote. This was tested using an already-open viewer page.

## 8. Pre-event reset behavior

**PREPARE CLEAN EVENT** combines progress reset, archival and participant cleanup within one transaction. The owner must type exactly `RESET LEVEL 38`. Both native form validation and the server enforce that confirmation; wrong or missing text cannot mutate the event. Definitions, translations, game configuration, operator credentials, historical polls/votes and the audit trail remain intact.

“Clean” means a new playable run with no active viewer sessions or current polls, not physical deletion of historical records.

## 9. Audit behavior

The shared transaction writes `owner:progress`, `owner:participants`, `owner:prepare` or `owner:preview`, with operator identity, revision, progress before/after and structured metadata. Reset entries include counts of archived/closed polls and cleared participants. ES/EN rendering uses semantic action templates. Existing audit rows are retained. Reset operations are deliberately non-reversible, and the existing latest-action rule prevents undo from crossing the reset boundary.

## 10. Authorization and safety

All four endpoints require a valid owner session; the service rechecks enabled owner status inside the transaction. Role fields supplied by clients confer no permission. Existing same-origin, JSON and request-header checks apply, with a shared 12-requests-per-minute limiter for owner tools.

Every action uses the existing event-row serialization and `controlRevision` comparison. Concurrent duplicate submissions at the same revision yield one success and one conflict; only one reset audit entry is written. Errors roll back the revision, archival and reset together. UI controls lock while requests run. Preview/progress/participant actions require explicit confirmation dialogs; preparation requires typed confirmation. No operator account/key is part of a reset query.

## 11. Validation results

- `npm run build`: passed.
- `npm test`: 24/24 passed, including two new shared-preview/localization tests.
- `npm run test:integration`: 40/40 passed, including three owner authorization/reset/migration tests.
- Additive migration verification: prior quest content/runtime fields and sequence retained, initial-state inference verified, repeat deploy/status/schema diff passed.
- Browser JavaScript and new test syntax checks: passed.
- `git diff --check` and final diff review: passed; only LEVEL 38 implementation, tests and documentation are involved. Existing Phase 3.6 changes remain present.

Real Chrome 152.0.7977.84 visual/workflow QA passed for public, owner and moderator finale delivery; preview isolation; refresh suppression; reset/cleanup/preparation; stale viewer recovery; and a second genuine finale with reduced motion. ES/EN finale and owner-tool layouts were checked at 1440×1000, 1024×1000, 768×1000, 390×844 and 844×390. No horizontal overflow or clipped finale window was found.

The new suite produced 45 screenshots and 45 width checks in ignored `dist/phase37-visual-qa/`. Both earlier browser suites also passed: Phase 3.6 produced 138 screenshots/135 width checks, and the earlier visual regression suite produced 69 screenshots/22 width checks. All three reported zero browser errors and CSP violations. The earlier English-only suite used the same ignored English-browser preload documented in Phase 3.6; existing test source/assertions were preserved.

An initial combined authorization/workflow test exhausted the owner-route rate limit. Authorization cases were separated into their own fixture; the security limit was not loosened. Final tests all pass. Browser QA is Chrome viewport testing, not physical-device Safari/Firefox certification.

## 12. Files created/modified in Phase 3.7

Created:

- `docs/level38-phase37.md`
- `prisma/migrations/202609150007_level38_owner_tools/migration.sql`
- `src/modules/level38/owner-tools.ts`
- `src/views/level38/celebration.ejs`
- `src/views/level38/owner-tools.ejs`
- `tests/integration/owner-tools.test.cjs`
- `tests/level38-owner-tools.test.cjs`
- `tests/visual/level38-phase37.cjs`

Modified, including files first created during the still-uncommitted Phase 3.6:

- `prisma/schema.prisma`
- `public/css/level38-control.css`
- `public/css/level38-locale.css`
- `public/js/level38/common.js`
- `public/js/level38/control.js`
- `public/js/level38/experience.js`
- `public/js/level38/public.js`
- `public/js/level38/translations.js`
- `src/modules/level38/celebration.ts`
- `src/modules/level38/controller.ts`
- `src/modules/level38/index.ts`
- `src/modules/level38/poll-domain.ts`
- `src/modules/level38/routes.ts`
- `src/modules/level38/seed.ts`
- `src/modules/level38/service.ts`
- `src/modules/level38/state.ts`
- `src/modules/level38/undo.ts`
- `src/views/level38/control.ejs`
- `src/views/level38/index.ejs`

Earlier Phase 3.6-only edits remain documented in `docs/level38-phase36.md`. Generated builds, screenshots and logs remain ignored under `dist/`.

## 13. Approval / operational follow-up

No further approval was needed to implement or test the requested local work. No real event data was reset. The migration was verified only in disposable local test schemas; applying pending migrations to an actual event database and using these tools there remain deliberate operational steps. Nothing has been pushed, deployed or enabled on Twitch.
