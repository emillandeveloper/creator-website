# LEVEL 38 — Phase 3.5 visual completion

Completed locally on 2026-09-15. No push, deployment, production configuration change, or Twitch implementation/configuration change. The public browser fixture runs with Twitch disabled. All database verification used a dedicated disposable PostgreSQL 16 container on localhost:55438, with a separate temporary schema per test.

## What was non-cohesive

Inspection of the Phase 3 source and its real Chrome baseline found:

- The pixel landscape and headings sat above an otherwise conventional website navigation and thin panel borders.
- Progress and current-game headings used large system type; the game emblem was a platform-rendered sword character.
- Quest cards had thin outlines, small plain status badges, inconsistent inset treatment and dense 13px prose. Paragraph breaks were collapsed.
- Poll options used full-row percentage fills and flat buttons; earlier rounds and server-rendered options looked like ordinary web content.
- The journal was an unframed section with a generic filter toolbar. The guide, secret note and footer did not share the main panels' visual hierarchy.
- The identity sprite appeared in an isolated avatar slot. Joining exposed a form separated by one rule, and the class reveal had no character portrait.
- The tablet layout squeezed the content beside a persistent party sidebar; the phone layout omitted the guide.

## Changes

A public-only stylesheet applies one consistent menu-window frame: two-pixel borders, inset trim, hard offset shadows, recessed surfaces and related gold, blue, green and violet accents. Navigation links and action buttons use command styling with visible keyboard focus and at least 44px targets. The moderator page does not load this stylesheet.

Progress has a stronger segmented meter and a compact pixel heading. The current-game panel uses an original 20px-grid sword SVG rendered at 2×. Section dividers, journal enclosure, filter fields, quest status tabs, guide markers, secret placeholders, notifications and celebration frame now use the same visual rules.

Quest titles, poll questions/options, descriptions, names and explanatory text retain system typography. Quest descriptions are 14px with 1.8 line-height, preserve paragraph breaks, wrap long words, and never truncate or acquire internal scrolling. Pixel type is reserved for headings, metadata and commands. Poll percentages have a separate segmented strip below each option, with green selected/winner frames. Public metadata reads `ROUND 02 · OPEN`; moderator metadata retains its original detail. Server-rendered polls also use framed options and segmented meters without inline styles or CSP changes.

The party panel is a character sheet with explicit PLAYER/CLASS labels and a framed sprite standing on a small platform. The existing inline join flow becomes a gold registration window; the class reveal repeats the same portrait treatment with the actual assigned sprite. Assignment, vote resumption, focus return, Escape handling and reveal timing remain intact. The nickname field and hint now match the existing server limit of 2–24 characters (the previous HTML field allowed 48).

At 1024px the journal uses two columns. At 768px, the main adventure spans the width and the party/guide sit below it. At 390px, content follows one column, filters use two columns plus a full-width search field, and the guide remains available. Phone-landscape artwork and celebration height are adapted to the short viewport.

## Remaining visual compromises

- Class artwork is still the original demo sprite set. Its framing is integrated; final commissioned sprites are outside this phase.
- Select popup menus remain native browser controls. Their closed fields match the page, while the open menu retains platform appearance and keyboard behavior.
- Exceptionally long quests determine their grid row's height, leaving space beneath adjacent shorter cards. This preserves source order and full descriptions.
- Joining remains inline and can require scrolling on short screens. This phase deliberately preserves the existing interaction model.
- Server-rendered poll strips use 20 segments (5% visual increments); the printed percentages retain their actual rounded values.

## Validation and visual QA

- `npm run build`: passed (also run by both npm test scripts).
- `npm test`: 15 passed, 0 failed, 0 skipped.
- `npm run test:integration`: 35 passed, 0 failed, 0 skipped, including the repository's existing regression suites. Production-named readiness/migration tests operated only on disposable local fixtures.
- `node --test tests/visual/level38.cjs`: 1 expanded real-Chrome workflow passed, 0 failed, 0 skipped.
- Browser: Chrome 152.0.7977.84, headless Windows. No browser page errors or CSP violations in the public workflow.
- `node --check` passed for both changed browser scripts and the visual runner. `git diff --check` passed; the final changed-file inventory was reviewed for unrelated changes.

| Viewport | Reviewed layout | Horizontal overflow |
| --- | --- | --- |
| 1440 × 1000 | Main/party columns, three-column journal, join, polls, footer | None |
| 1024 × 1000 | Narrower sidebar, two-column journal, wrapped identity, join | None |
| 768 × 1000 | Full-width adventure, party/guide below, two-column journal | None |
| 390 × 844 | Single-column flow, filters, vote targets, join, class reveal, footer | None |
| 844 × 390 | Landscape hero, scrolling join, journal, polls and empty states | None |

The runner captures objectives, polls, party, join form, journal, long descriptions and footer at every requested viewport. It also checks long poll options, a 24-character unbroken nickname, all public quest status/filter presentations, secret privacy, closed rounds/history, empty states, keyboard voting, join cancellation/focus return, pending-vote resumption, class persistence, sprite failure, real server-triggered celebration, reduced motion, reload suppression, no-JavaScript rendering, and the functional moderator panel at desktop and phone sizes.

There are 69 PNGs plus `results.json` under ignored `dist/phase35-visual-qa/`. Twenty-two logged document/body overflow measurements equal the viewport width; overview, landscape, no-JavaScript and moderator assertions also pass. Screenshots were visually inspected across all requested sizes. This is browser viewport QA, not physical-phone, virtual-keyboard, Safari/Firefox or screen-reader certification.

During verification, simultaneous builds initially hit the Windows Prisma DLL lock; sequential runs passed. The long-name fixture was corrected to respect the existing 24-character server rule. Browser QA caught an inline-style CSP violation in an intermediate server-rendered meter; the final meter uses ordinary markup and external CSS, with the original security policy retained.

Reproduce after building with the existing ignored Playwright installation:

```powershell
$env:LEVEL38_TEST_DATABASE_URL = '<disposable PostgreSQL test database URL>'
$env:LEVEL38_VISUAL_OUTPUT = 'dist/phase35-visual-qa'
node --test tests/visual/level38.cjs
```

Replace the placeholder with the URL of a disposable test database before rerunning; never substitute a production database. The existing visual-runner header documents installation of its optional Playwright tooling into ignored `dist/phase3-qa-tools`.

## Files changed

- `public/css/level38-public.css` — new public component styling and responsive rules.
- `public/img/level38/sword.svg` — original pixel menu emblem.
- `public/js/level38/common.js` — public round-label presentation only.
- `public/js/level38/public.js` — render the assigned sprite in the welcome window.
- `src/views/level38/index.ejs` — public stylesheet, icon, character/registration/reveal markup, server-rendered poll styling, nickname field limit/hint.
- `tests/visual/level38.cjs` — expanded viewport, content, fallback and interaction QA.
- `docs/level38-phase35.md` — this report.

No dependencies, lockfile, schema, migrations, server logic, shared moderator stylesheet, production settings or Twitch files were changed.
