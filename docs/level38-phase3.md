# LEVEL 38 — Phase 3 implementation report

Implemented locally on top of commit `1fda735`. Nothing was pushed or deployed. Render configuration, environment settings, existing migrations, and creator-site routes/content/design remain unchanged.

## 1. Visual design

The public page now uses a navy/slate RPG menu palette, square inset borders, gold progression accents, green success states, blue voting/current-game accents, locally hosted Silkscreen headings, and readable system-font body text. An original pixel landscape depicts a moonlit hilltop keep and the path toward it. There is no commercial-game UI clone, extracted game art, glass effect, or new frontend framework.

## 2. Public page

The hero introduces the birthday adventure. A 38-segment progress bar anchors the page, with remaining-quest count and target-reached state. Current game and active objectives are prominent, followed by live game-choice polls and a personal party panel. The quest journal supports game/current-game, status, and text filters without disturbing them during realtime updates. A highlighted “Vote now” navigation link appears while a poll is open. Closed rounds retain totals, selection, winner, and expandable earlier history. All seven statuses have text and visual treatment; secret placeholders contain only safe aggregate information.

## 3. Moderator panel

The Phase 2 operating layout and controls are preserved. The shared skin adds clearer state colors, square menu panels, pixel headings, visible focus, and distinct failure/skip buttons. Isma retains the same large actions, confirmations, draft editor, live totals, game selection, audit history, and conservative undo. No owner-management UI was added.

## 4. Class architecture

`classes.ts` contains the only class roster, stable IDs, display names, enabled pool, sprite keys, and sprite metadata. `crypto.randomInt` chooses an index from the enabled pool, so the 16 initial entries each have probability 1/16. Per-entry `enabled` and `sprite` properties override defaults. Retired classes can remain resolvable with `enabled: false`; missing historical entries display a generic Adventurer without rewriting the saved assignment.

`participants.ts` performs server-controlled assignment using a transaction and a `classId IS NULL` compare-and-set. Concurrent requests can persist only one first assignment. Client-submitted `classId`, class objects, and role fields are ignored. Class data never enters vote weighting, permission checks, rate limits, operator authentication, or control revisions.

## 5. Initial roster

Knight, Dark Knight, Dragoon, Monk, Thief, Ninja, Samurai, Ranger, Black Mage, White Mage, Red Mage, Blue Mage, Summoner, Bard, Dancer, Beastmaster.

## 6. Sprite pipeline

Each class has an original, clearly documented demo sheet at `public/img/level38/classes/<id>/idle.svg`. Sheets use four horizontal 32 × 32 frames at 4fps, displayed at integer scale with CSS `steps()` and `image-rendering: pixelated`. Each entry can override path/dimensions/frame count/fps centrally; paths are not stored on participants. Failed or missing images display a geometric fallback while the class name remains visible. Reduced motion keeps the first frame static.

The [asset guide](../public/img/level38/README.md) describes replacing sheets and regenerating the original demos. `scripts/level38-demo-assets.cjs` reads the compiled catalog instead of duplicating class names. Final supplied sprites can replace the demos later. Silkscreen's SIL Open Font License is included; all font/visual requests are same-origin.

## 7. Participant/database changes

`Participant.classId` is nullable text. A new anonymous browser session initially has no class. Saving a valid nickname assigns one. Existing named Phase 2 identities receive their first class lazily on their next valid session read or join request. Existing unnamed identities remain unassigned until joining. The original row ID, token hash, expiry, votes, and nickname are retained. Name changes, reloads, reconnects, and later visits with the same valid cookie keep the assignment. Cookie deletion/expiry still creates a new anonymous identity, as in Phase 2.

`Event.unlockSequence` is a durable, monotonic integer starting at zero; `Event.lastUnlockedAt` stores the most recent threshold crossing time. Existing events are not retrospectively celebrated.

## 8. Join-party behavior

Visitors can browse without naming themselves. Join or the first vote opens an inline player-name prompt, moves keyboard focus to the input, and returns focus on completion/cancel. A pending vote resumes after joining. The private response's `classAssigned: true` means this request actually persisted a first class, and triggers a short “NEW PARTY MEMBER” presentation. Ordinary session reads and nickname edits return false and do not replay it. Returning viewers see their name, class, and sprite. Session requests coalesce to avoid competing first-session creation; identity/vote generations protect against stale client responses.

## 9. Presence

Online presence is **deferred**, as permitted by the scope. The personal party panel and safe class metadata provide the foundation, but no online count or public roster is fabricated. A later presence feature needs explicit public-name participation, authenticated socket-to-session association, reconnect/multiple-tab handling, heartbeat expiry, and cleanup. Core viewing/voting never depends on presence.

## 10. Realtime visual events

The public browser reacts to the existing revision-only `quest:completed`, `quest:activated`, `quest:revealed`, `poll:opened`, `poll:winner`, and `game:changed` notifications. Bursts coalesce into a single short message; historical/duplicate revisions and hidden-tab notices are ignored. Progress increases receive a small brightness pulse. Poll votes update totals/percentages/selection in place instead of rebuilding quest cards or poll controls. The public socket still receives no operator audits, override reasons, participants, tokens, or hidden quest metadata.

## 11. LEVEL 38 finale

Inside the existing event-row-serialized transaction, the server compares completion count before and after the mutation. Only a crossing from below the target to at least the target increments `unlockSequence` and records its timestamp. The quest transition, audit entry, counter, and timestamp commit together. Only then is `level38:unlocked` emitted.

Public event fields: `version: 1`, `id: level38:unlock:<sequence>`, `sequence`, `revision`, `occurredAt`, `completed`, `target`, `startsAt`, and `durationMs`. `startsAt` schedules approximately 400ms ahead; the normal presentation lasts 6.5 seconds. The adjacent snapshot includes server time for device-clock calibration. The protocol can be reused by a future OBS client without adding an overlay route now.

Connected viewers see screen emphasis, seven pixel rocket bursts, “LEVEL UP!”, “LEO REACHED LV.38”, and the completion count. Canvas runs at about 30fps, at reduced pixel resolution, with no more than 100 live particles; phones use fewer particles. It stops when dismissed, hidden, or complete. The panel does not capture keyboard focus or block underlying pointer interaction; Escape and a dismiss button are available. Reduced motion displays a static panel with no fireworks or progress pulse.

Each connection takes its initial sequence from the server snapshot. Snapshots never trigger the celebration. Live events are sequence-deduplicated, remembered in session storage when available, and discarded when stale or received in a hidden tab. Opening/reloading/reconnecting at 38 is silent. Duplicate completion and 38 → 39 emit no new unlock. A valid undo below 38 leaves the sequence unchanged; reaching 38 again increments it and celebrates again.

Delivery remains best effort on the existing single-instance Socket.IO architecture. The ID/counter are durable; network delivery is not an outbox. A crash between commit and emit can miss the visual celebration, and reconnect intentionally restores state without replaying old fireworks. No exactly-once delivery guarantee is claimed.

## 12. Responsive/accessibility decisions

Desktop uses main-content/party columns and a three-column journal. Tablet uses two journal columns; phone uses a single practical flow with a compact landscape, large vote targets and two-column filters plus full-width search. Phone landscape has a shorter celebration layout. Semantic buttons/forms, native selects, text status labels, pressed vote states, a skip link, visible focus, polite status regions, and Escape behavior remain available. Descriptions use system typography, not a pixel font. Motion preferences are respected, including a runtime change to reduced motion. No sound, autoplay video, or strobing effect was introduced.

## 13. Migration

New file: `prisma/migrations/202609130004_level38_party_and_unlock/migration.sql`. It is an additive PostgreSQL transaction with three new fields and no deletes/resets. The original three migrations and migration lock file are unchanged. Apply locally with `npm run db:migrate` (`prisma migrate deploy`) after building. No seed rerun is needed on an existing event. Production migration/deployment awaits a separate release instruction.

Verification includes fresh migration deployment, a Phase 2 schema/identity upgrade, repeat deployment, preserved legacy Phase 1 history, `prisma validate`, `prisma migrate status`, and database-to-schema `prisma migrate diff --exit-code` with no difference detected. All database work used a disposable PostgreSQL 16 container, never production.

## 14. Tests/results

Final results: build passed; **11 unit tests passed**, **31 PostgreSQL integration tests passed** (including parent workflow tests), and **1 real Chrome visual/interaction test passed**, with no failures or skips. All four browser scripts passed syntax checks. Prisma validation, fresh/upgrade/repeat migrations, migration status, and schema comparison passed. `git diff --check`, full changed-file whitespace review, exact-inventory review, and unrelated-change checks passed. Existing creator routes and assets remain covered by the regression suite.

No existing tests were removed or edited. The new tests cover catalog/assets, one-time/concurrent assignment, cosmetic role safety, legacy identity migration, safe payloads, post-commit unlock broadcasts, duplicate completion, no connection replay, undo/re-reaching, client deduplication, reduced motion, clock skew, and notification coalescing.

No application dependency or lockfile changes were needed. Playwright was installed only under ignored `dist/phase3-qa-tools` for optional local browser QA; it is not a production dependency. The existing TypeScript/Express/EJS/Prisma/Socket.IO stack is preserved.

## 15. Visual QA

Real headless **Chrome 152.0.7977.84** was exercised at **1440, 1024, 768, and 390px**, plus **844 × 390 landscape**. The runner uses the actual EJS, browser scripts, HTTP API, Socket.IO, and isolated PostgreSQL data. It checks horizontal overflow, keyboard voting, first join, nickname change/reload class persistence, all quest statuses, safe secret placeholders, live and closed polls, real server-triggered fireworks, reduced motion, refresh suppression, sprite-load failure, and the moderator panel. It records browser/CSP errors and produces screenshots for human inspection.

Screenshots were inspected locally; the hero-link contrast, mobile header height/image crop, and feedback duration were refined from those captures. Evidence is under ignored `dist/phase3-visual-qa/` (23 PNGs plus `results.json`). This is real Chrome viewport QA, not testing on physical phones or Safari/Firefox, and not a full screen-reader conformance audit.

Reproduce after building:

```sh
npm install --prefix dist/phase3-qa-tools --no-save --no-package-lock playwright
# Set LEVEL38_TEST_DATABASE_URL to a disposable PostgreSQL database containing "test" in its name.
node --test tests/visual/level38.cjs
```

The optional runner expects local Google Chrome and writes only its isolated fixture data and ignored screenshots.

## 16. Exact files created

```text
docs/level38-phase3.md
prisma/migrations/202609130004_level38_party_and_unlock/migration.sql
public/fonts/level38/OFL.txt
public/fonts/level38/Silkscreen-Regular.ttf
public/img/level38/README.md
public/img/level38/classes/bard/idle.svg
public/img/level38/classes/beastmaster/idle.svg
public/img/level38/classes/black-mage/idle.svg
public/img/level38/classes/blue-mage/idle.svg
public/img/level38/classes/dancer/idle.svg
public/img/level38/classes/dark-knight/idle.svg
public/img/level38/classes/dragoon/idle.svg
public/img/level38/classes/knight/idle.svg
public/img/level38/classes/monk/idle.svg
public/img/level38/classes/ninja/idle.svg
public/img/level38/classes/ranger/idle.svg
public/img/level38/classes/red-mage/idle.svg
public/img/level38/classes/samurai/idle.svg
public/img/level38/classes/summoner/idle.svg
public/img/level38/classes/thief/idle.svg
public/img/level38/classes/white-mage/idle.svg
public/img/level38/world.svg
public/js/level38/experience.js
scripts/level38-demo-assets.cjs
src/modules/level38/celebration.ts
src/modules/level38/classes.ts
src/modules/level38/participants.ts
src/views/level38/quest-card.ejs
tests/integration/phase3.test.cjs
tests/level38-effects.test.cjs
tests/level38-phase3.test.cjs
tests/visual/level38.cjs
```

## 17. Exact files modified

```text
docs/level38.md
prisma/schema.prisma
public/css/level38.css
public/js/level38/common.js
public/js/level38/public.js
src/modules/level38/controller.ts
src/modules/level38/index.ts
src/modules/level38/service.ts
src/modules/level38/state.ts
src/views/level38/control.ejs
src/views/level38/index.ejs
```

## 18. Approval/remaining choices

No approval is needed to inspect or run this local implementation. The documented product choices are equal class probability, one class per anonymous identity, repeat celebration on a new below-to-target crossing, and deferral of public presence. Final class sprites and curated event content can be supplied/reviewed separately. No production configuration was changed. Push/deployment are explicitly outside this phase and were not performed.

## 19. Phase 4 and explicit deferrals

Twitch API, EventSub, OAuth/config UI, automatic category detection, and verified Twitch identity remain unimplemented. The current game is still moderator-controlled. OBS Browser Source routes, owner-management UI, horizontal scaling, reliable event outbox/replay, public presence, class abilities/stats, rarity, inventory, currency, and achievements are also outside this phase. Nothing relies on Twitch to work.
