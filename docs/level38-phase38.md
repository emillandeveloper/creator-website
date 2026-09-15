# LEVEL 38 — Phase 3.8

Local implementation only. No push, deployment, Render changes, production database/configuration changes, Twitch enablement, translation APIs or audio additions.

## Quest content and authoring

Phase 3.6 already supplied English `Quest.title` / `Quest.description`, nullable Spanish `titleEs` / `descriptionEs`, bilingual DTOs, and live language switching. Its seed returned immediately for an existing event. Older starters therefore never received Spanish content. Parallel title arrays and a generic shared description also made curation awkward.

`src/modules/level38/quest-content.json` is now the authoritative authored catalog. There are **54 complete records**, including all six secret starters, with natural Spanish titles and objective-specific descriptions in both languages. The existing three-game, 18-objective starter structure remains; these are still starter objectives, not a newly invented final event pool.

Each record groups its text explicitly:

```json
{
  "key": "ff5-no-items",
  "number": 2,
  "gameSlug": "ff5",
  "isSecret": false,
  "title": { "en": "Win without using items", "es": "Gana sin usar objetos" },
  "description": {
    "en": "Win a battle without using any items.",
    "es": "Gana un combate sin usar ningún objeto."
  }
}
```

For the future 50–60 real quests, edit/add records in this file, keep keys and numbers unique, select a supported game slug, and author all four text fields together. Descriptions can contain paragraph breaks. Do not put quest copy into UI translations or parallel seed arrays. `quest-content.ts` validates the entire catalog and maps it to the existing database fields. Both `npm run build` and the mandatory unit suite reject missing/blank locale fields, invalid identities, unknown games and duplicate keys/numbers. New-event seeding consumes this same validated data.

Existing-event content is intentionally not overwritten on startup or seed reruns. The scoped starter updater recognizes original English starter title/description, game slug and number; it fills/polishes recognized starter copy, preserves custom edits, and reports skipped quest numbers. It is **not a general importer for replacing an already-running event with a new curated pool**. That future content replacement needs an explicit content-only import/review; keep existing database quest identities and state intact.

With `DATABASE_URL` explicitly targeting the intended local database:

```powershell
npm run build
node dist/modules/level38/commands.js quest-content
# Review updated/skipped numbers from this dry run, then apply locally:
node dist/modules/level38/commands.js quest-content --apply
```

The updater uses an event-row lock and one transaction. It changes quest text and update timestamps only, and increments ordinary event/control revisions once if anything changed. It preserves statuses, completion/reveal timestamps, initial statuses, secrets, games, celebration/reset counters, polls/options/votes, participants/classes, operators and audits. Repeating it makes no further changes. Reload connected pages after a CLI update; the offline command does not publish socket messages. This phase exercised it only against disposable local PostgreSQL fixtures, not a configured hosted event.

The existing fallback remains requested locale → other configured locale → legacy field → localized nonblank placeholder. Development/test state reads log missing field names and quest identifiers once per bounded diagnostic entry, never secret quest prose. Production falls back silently. Runtime resilience does not weaken the strict authored-catalog build check.

Active quests, journal titles/descriptions and quest-derived poll labels switch immediately using cached bilingual state. Both poll locales now derive from the referenced quest; historical option labels remain stored unchanged. Participant identity, session cookies, class and votes do not change. Secret filtering still happens before public serialization in both languages. Custom poll titles/options remain operator-authored prose.

## Shared finale lifecycle

The genuine durable unlock event opens the shared full-screen public/control finale. **There is no finish timer.** Click/tap anywhere on the overlay, its localized continue button, Enter, Escape or Space dismisses it. The button is focused; underlying content is inert, Tab stays in the dialog, and focus/scroll behavior is restored on close.

The shared copy includes `LEVEL UP!`, `LEO REACHED LV.38`, the completed/target total, and `CLICK TO CONTINUE`. Spanish uses `¡SUBIDA DE NIVEL!`, `LEO HA ALCANZADO EL NIVEL 38`, `MISIONES COMPLETADAS`, and `PULSA PARA CONTINUAR`.

Acknowledgement is **per tab/client**, stored in `sessionStorage`:

- A valid new socket sequence is recorded as `level38:pending-unlock`, together with the current reset sequence, before presentation.
- Only explicit genuine dismissal updates `level38:acknowledged-unlock` and clears pending state. No request or server progress mutation occurs.
- Same-tab refresh resumes a pending finale only after the initial server snapshot confirms its unlock/reset sequence. An acknowledged sequence does not replay on refresh/reconnect; a later genuine sequence can play.
- New visitors do not replay historical unlocks. The existing fresh-event/baseline checks remain. The prior `level38:last-unlock` marker is treated as acknowledged legacy history during upgrade.
- Hidden tabs pause animation and preserve genuine pending state; returning resumes it. A fresh genuine arrival while hidden is retained for return. Administrative resets invalidate pending finales as in Phase 3.7.
- Closing the tab ends its storage lifetime. Blocked/unavailable browser storage degrades refresh recovery; in-memory dedupe/dismissal still work. There is no account-wide/device-wide acknowledgement.

The control panel uses the identical markup, lifecycle and renderer. Operators dismiss their own copy without affecting public clients. Preview uses the same persistent renderer with a clear preview label; it has no genuine sequence, does not acknowledge or replace genuine pending state, and retains the existing owner audit behavior. Genuine events take priority. Previews are not persisted across reloads and close when the tab becomes hidden.

The wire protocol remains compatible: `durationMs` is retained for existing consumers but no longer controls this client's dismissal. No server event/progress protocol or schema migration was needed.

## Pixel fireworks, motion and resources

The native Canvas 2D renderer has visible rising rockets with square pixel trails, radial shells, double rings, layered chrysanthemum bursts, five-point spark/star shells and long golden willow trails. Alternating sides/heights, foreground/background sizes and the existing gold/mint/blue/pink/ivory palette give the effect structure. No smooth circles, external renderer dependency or generated bitmap assets were added.

- **0–2 seconds:** short existing emphasis animation and a coordinated three-rocket opening, followed by larger shells.
- **2–7 seconds:** denser overlapping launches and varied shell types.
- **After 7 seconds:** a continuing, quieter launch cadence with periodic foreground shells, until dismissal.

The canvas draws at approximately 30fps, uses roughly half-resolution integer pixels, and caps particles at 420 on narrow phones / 780 on larger viewports. Resize preserves and rescales active shells. The message window keeps a calm opaque background and the rest of the page is darkened.

Each run owns one RAF loop and one resize listener. Cleanup cancels the frame/start timer, empties rocket/particle arrays, clears the canvas and removes the resize listener. Repeated previews reuse the same canvas; lifecycle listeners are installed once per page. Visibility changes stop animation, and page exit also clears notice/progress timers. Reduced-motion users see the same persistent dialog over sparse static pixel stars, with the fireworks canvas hidden and no particle RAF loop. Changing motion preference while open starts/stops the renderer accordingly.

## Validation and visual review

Validation artifacts are kept under ignored `dist/`. No test data or credentials are added to the repository.

- `npm run build`: passes; catalog validation is part of the build.
- `npm test`: 28/28 pass, including persistent acknowledgement, pending refresh, later sequence, keyboard/click dismissal, isolated clients, preview isolation, hidden/reduced-motion behavior and repeated renderer cleanup.
- PostgreSQL: **41/41 pass** with `node --test --test-concurrency=1 tests/integration/*.test.cjs`. The default `npm run test:integration` parallel run passed 40/41 but exposed a readiness-test `ECONNRESET` after its blocking migration command; that test also passed in isolation. Application/readiness behavior was not changed to hide it.
- Chrome Phase 3.8 suite: passes, 46 screenshots and 46 overflow/fit checks; no browser errors or CSP violations.
- Phase 3.6, Phase 3.7 and original browser regression suites: all pass.
- JavaScript syntax: all eight LEVEL 38 browser scripts and four new test files pass.
- Schema/migrations: no changes. Existing additive migration/repeat-deploy/schema verification tests are included in PostgreSQL validation.
- `git diff --check`: passes.
- Final diff: limited to this phase's quest content, shared finale, validation and documentation; no unrelated production/Twitch changes.

Both EN and ES were checked at **1440×1000, 1024×1000, 768×1000, 390×844 and 844×390**. Public/control finales and starter active/journal text were captured. The Spanish heading and instruction fit without clipping; the continue action is visible, readable and touch/keyboard usable. There is no horizontal overflow. Representative final screenshots at every width were inspected, including the denser and quieter fireworks and reduced-motion paths. Existing long-description coverage also passes in the Phase 3.6 suite.

At 390px, a three-second Chrome 152 sample recorded 181 frame intervals, p95 **16.8ms**, maximum **17.6ms**, and zero long tasks. This measures desktop Chrome with a phone-sized viewport, not physical phone hardware. The fireworks intentionally become sparse after the opening; the message occupies much of the available landscape height. Those are the main visual/performance qualifications.

## Files

Created:

- `src/modules/level38/quest-content.json`
- `src/modules/level38/quest-content.ts`
- `src/modules/level38/quest-content-update.ts`
- `public/js/level38/fireworks.js`
- `tests/level38-quest-content.test.cjs`
- `tests/level38-finale.test.cjs`
- `tests/integration/quest-content.test.cjs`
- `tests/visual/level38-phase38.cjs`
- `docs/level38-phase38.md`

Modified:

- `package.json`
- `src/modules/level38/seed.ts`
- `src/modules/level38/commands.ts`
- `src/modules/level38/state.ts`
- `public/js/level38/experience.js`
- `public/js/level38/translations.js`
- `public/css/level38.css`
- `src/views/level38/celebration.ejs`
- `src/views/level38/index.ejs`
- `src/views/level38/control.ejs`
- `tests/level38-effects.test.cjs`
- `tests/level38-owner-tools.test.cjs`

No approval is needed to finish this local phase. Applying content updates to a hosted event, pushing or deploying remains outside this task and has not been performed.
