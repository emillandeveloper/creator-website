# LEVEL 38 — Phase 5.1 Party Overlay Polish

Local implementation following the user-confirmed Phase 5.0 OBS preview. No push, deployment, production migration, Twitch enablement, quest edit or public-page finale change was performed.

## 1. Nickname presentation

The old layout limited most labels to 64 pixels, even for small crowds. Labels now have up to 124 pixels, a 13px bold readable face, dark outline/shadow, a compact translucent background and a two-pixel gold underline. Silkscreen remains reserved for the celebration banner and existing pixel UI accents. No giant opaque name boxes were introduced.

Each label is centered on the sprite's normalized anchor. Its vertical position uses the manifest's `visibleStandingHeight`, so shorter appearances keep their name close to the actual head. The 72px horizontal safe area keeps wider labels in bounds. Lane spacing considers name width, with smaller limits in dense crowds; names ellipsize without changing stored nicknames. Rendering still uses `textContent`, never nickname HTML.

OFF hides names; ENTRY shows names for five seconds on entry and again on personal reactions; ALWAYS keeps names visible. The existing moderator control still selects any of the three modes.

## 2. Default name mode and migration

The default is now **ALWAYS**, in Prisma, the database column default, the runtime fallback and isolated preview. Migration `202609150010_level38_party_polish` upgrades existing ENTRY rows only when that event has no `party:configured` audit entry. An operator's previously saved settings are preserved, including a deliberately selected ENTRY or OFF. This avoids silently overwriting an explicit choice.

The migration changes no participant, nickname, class, variant, vote, quest, progress or audit row. It changes no event revision or unlock sequence. If Leo previously saved ENTRY, select ALWAYS in Party Overlay controls after a separately approved deployment.

Future rollout uses the existing build → `npm run db:migrate` → start sequence. No reset, reseed or participant backfill is needed. No production action was run here.

## 3. Genuine LEVEL 38 overlay celebration

`PartyRuntime` continues to forward the existing committed `level38:unlocked` event. The overlay validates its version, sequence and `level38:unlock:<sequence>` identifier. It uses that durable sequence for deduplication, keeping the highest observed value in page memory and, when available, overlay-specific session storage. It does not derive progress from quests or invent an unlock state machine.

A live genuine unlock triggers the existing 1.5-second party victory plus a ten-second fireworks display and a compact LEVEL 38 banner. The subtitle is localized: **ADVENTURE COMPLETE / AVENTURA COMPLETADA**. Language uses the existing cookie/browser-language selection. Ordinary quest completion remains the existing all-party victory and does not start fireworks.

Snapshots contain no replayed unlock history. Reconnect or refresh after an ended celebration does not replay it. A duplicate or older sequence is ignored. The overlay records received sequences even when hidden or disabled, avoiding deferred surprise replays. If session storage is unavailable, in-page deduplication still works and server snapshots still contain no historical replay.

The public `/level38` finale, its dismissal behavior, public fireworks renderer and event schema are unchanged.

## 4. Fireworks lifecycle and performance design

`party-fireworks.js` is an overlay-only finite visual effect, separate from the indefinitely displayed public-page effect. It has no socket, network call, timer or independent RAF. The existing party scheduler calls `paint`, including when the party is empty and only fireworks need to run.

The effect opens with three layered radial bursts, followed by at most 18 staggered rockets and varied double-ring, star and falling-gold bursts. Small integer squares, spark cores and bounded trails keep the pixel presentation. The transparent canvas is half resolution, capped at 960×540, displayed with pixelated sampling. It clears with `clearRect`; it never fills the whole viewport with an opaque background.

Limits: 900 active particles, a roughly 30fps canvas drawing budget and a ten-second total lifetime. Delayed frames never enqueue an unlimited catch-up storm. The final 700ms fade the compact banner. Completion releases particle/rocket arrays, hides the layers and reduces the canvas backing store to 1×1. With no avatars or effect, the shared RAF stops.

Disconnect, document hiding, global disable and page destruction cancel the effect immediately. Reconnect restores normal avatars but does not restart the canceled celebration. Resize uses normalized burst origins and updates canvas dimensions. Repeated preview clicks replace the previous effect instead of stacking renderers.

## 5. Reduced motion

Reduced motion shows the same localized banner with a static, sparse constellation of 18 pixel stars for four seconds. No rockets, radial expansion or continuous particle motion occurs. The existing reduced-motion avatar behavior remains idle. Turning reduced motion on during a running effect clears moving particles and switches to the quiet version; turning it off does not restart that celebration.

## 6. OWNER preview and OBS preparation

Use the existing OWNER-authenticated 1/5/15/30 links in `/level38/control` → Party Overlay. Each isolated preview now includes **Preview LEVEL 38 fireworks / Probar fuegos de LEVEL 38**, alongside the existing vote and party-victory buttons. Preview controls and name-mode options are localized.

The button calls only the local visual effect and local preview avatars. Preview mode opens no presence socket, writes no progress or participant records, emits no genuine event and does not acknowledge a genuine unlock. Public and MODERATOR requests still cannot open OWNER preview mode.

For a future approved deployment, the public OBS URL remains `https://leonifelheim.tv/level38/overlay/party`. Existing 1920×1080 or 1280×720 Browser Source settings need no custom CSS or plugin. Refresh that source after deployment to load the new JS/CSS. Test the isolated owner preview in an ordinary authenticated browser first, then test the real source in OBS preview. Do not put operator keys in source URLs. No new public production test-event endpoint was added.

## 7. Automated tests

New unit tests cover all name modes, safe nickname text, same-avatar updates, genuine-versus-quest reaction paths, malformed/duplicate/older event rejection, refresh/reconnect deduplication, empty-party scheduling, preview isolation, finite particle budget, reduced-motion switching, resizing and idempotent cleanup.

The migration test upgrades a real disposable PostgreSQL schema from Phase 5.0, verifies untouched defaults become ALWAYS, preserves explicitly saved modes and all participant/audit data, checks the SQL insert default and HTTP state, and verifies an idempotent second migration deployment. The historical Phase 5 upgrade assertion now expects the latest ALWAYS default. Its browser ENTRY test explicitly selects ENTRY instead of depending on the old default.

A pre-existing class-catalog test compared a fresh random draw on every `some` iteration and could fail despite correct class assignment. Its smoke assertion now samples once and checks that result. Production class/variant assignment is unchanged.

The older localization and owner-tool migration tests exceeded their 90-second setup deadlines on this Windows machine (98–125 seconds). Those two timeout budgets are now 180 seconds; their assertions are unchanged. The new migration test uses the same budget. Test-process-only `CHECKPOINT_DISABLE=1` disables Prisma background update checks; no environment file or application configuration changed.

- `npm run build`: passed.
- `npm test`: all 39 unit tests passed.
- Serial PostgreSQL suite: 47 passed and two hit their former 90-second deadlines. Both reran successfully with the 180-second limits (approximately 122 seconds each), verifying all 49 distinct integration checks, including the new migration. There were no remaining assertion failures or canceled checks after those reruns.
- Existing Chrome suites: all eight tests passed, including the Phase 5.0 three-minute, 30-avatar stress regression (one RAF and 197 document elements at every sample).
- Both Phase 5.1 Chrome tests passed: visual/interaction coverage and isolated repeated-effect performance. Together with the existing suites, ten Chrome tests passed.
- All 11 new/modified JS/CJS files pass syntax checks. `git diff --check` and whitespace checks including untracked files pass. Final review found the intended 17 files only; the three test-maintenance changes are explained above.

## 8. Browser QA

Installed Chrome 152.0.7977.84 passed the Phase 5.1 interaction/visual case. It captures 1/5/15/30 real presences at 1920×1080 and 1280×720, then isolated OWNER fireworks previews for the same matrix: 16 crowd/viewport captures, plus genuine opening/rocket and reduced-motion captures. Assertions check centered labels, placement above the head, safe literal nickname text, ellipsis, no same-lane label overlap and no document overflow. Representative small/dense crowds and both-language fireworks were inspected visually.

The genuine finale starts through the real server quest-completion transaction. Normal quest completion does not trigger fireworks; completed effects do not replay on reconnect or reload. OWNER previews preserve the complete event and participant records. Reduced-motion canvas pixels stay static and the effect finishes automatically. Page errors and CSP violations: zero. PNG alpha and canvas-pixel sampling confirm surrounding transparency; no full-page white/opaque layer was observed.

The capture-inclusive finale recorded a 17.1ms p95 frame interval, a 99.9ms maximum interval and no JavaScript long tasks. Because screenshots and pixel reads occur in that sample, a separate capture-free benchmark below measures repeated effects after warm-up. These are Chrome measurements, not OBS FPS claims.

Capture-free results used the same effect in a 30-avatar OWNER preview, with one full warm-up celebration followed by one measured celebration at each size. Each sample lasts approximately 10.3 seconds:

| Measurement | 1920×1080 | 1280×720 |
| --- | --- | --- |
| Animation callbacks | 619 | 618 |
| Frame interval, p95 / maximum | 17.0 / 17.6 ms | 17.0 / 17.6 ms |
| JavaScript long tasks | 0 | 0 |
| Peak particles / hard cap | 642 / 900 | 642 / 900 |
| Particles after completion | 0 | 0 |
| CDP DOM nodes before → after GC | 325 → 325 | 325 → 325 |
| Event listeners before → after | 96 → 96 | 96 → 96 |
| Retained JS heap before → after GC | 2,530,280 → 2,560,008 bytes | 2,561,824 → 2,561,760 bytes |

The canvas returned to 1×1 after each run. One RAF remained for normal avatar movement; fireworks added no independent scheduler. Heap measurements include the QA frame recorder and browser caches. The repeated runs show no accumulating DOM/listener resources and no major animation degradation in this Chrome test, but do not establish indefinite leak freedom or physical OBS performance. Raw measurements are in `dist/phase51-visual-qa/performance.json`.

Ignored local artifacts live under `dist/phase51-*`. Chrome captures use a transparent PNG background; image viewers may show it against black. The new browser case uses real cookie-authenticated participant fixtures and actual server quest/unlock commands in disposable schemas. Preview checks compare database state before/after.

## 9. Remaining limitations

- Phase 5.1 was tested in Chrome; actual OBS/CEF verification on Leo's machine remains a post-deployment check. User-confirmed Phase 5.0 OBS validation does not establish Phase 5.1 performance.
- At 30 avatars in 1280×720, available lane width still requires long-name truncation. Full nicknames remain stored and available as browser label titles. Dense crowds pause/turn more often to keep labels separated.
- A hidden/disconnected source misses or cancels the transient celebration; it does not replay an old finale later. Normal avatars reconnect as before.
- Existing single-Node presence limitation and prior sprite-asset permission status are unchanged. No sprite assets were added or edited.
- A finite Chrome run can detect obvious resource growth or stalls; it is not an indefinite memory-leak guarantee or an OBS FPS claim.

## 10. Files added/modified

Added:

- `prisma/migrations/202609150010_level38_party_polish/migration.sql`
- `public/js/level38/party-fireworks.js`
- `tests/level38-party-polish.test.cjs`
- `tests/integration/party-polish.test.cjs`
- `tests/visual/level38-phase51.cjs`
- `docs/level38-phase51-overlay-polish.md`

Modified:

- `prisma/schema.prisma`
- `src/modules/level38/party-runtime.ts`
- `public/js/level38/party-overlay.js`
- `public/css/level38-party.css`
- `public/js/level38/translations.js`
- `src/views/level38/party-overlay.ejs`
- `tests/integration/party.test.cjs`
- `tests/visual/level38-phase50.cjs`
- `tests/level38-phase3.test.cjs` (test-only random-sampling fix)
- `tests/integration/localization.test.cjs` (migration-test time budget only)
- `tests/integration/owner-tools.test.cjs` (migration-test time budget only)

No public finale implementation, quest content, sprite manifest/PNG, Twitch implementation, dependency/lockfile, environment file or production configuration was changed.
