# LEVEL 38 — Phase 3.6 completion report

Completed locally on 2026-09-15. Nothing committed, pushed or deployed in this phase. Production configuration is unchanged. Twitch remains disabled in the public/control browser fixtures; the only change to its existing control script is presentation translation. Existing integration tests use their local mocks, not a live Twitch connection.

## 1. Control-panel visual changes

Before this phase, the control page retained generic thin panels, plain forms, a native progress bar and a largely undifferentiated stack of quest/poll/configuration sections. It lacked the public page's RPG framing and command hierarchy.

The control page now uses matching double/inset window frames, hard shadows, gold command buttons, recessed inputs, status tabs and segmented progress. The top desk groups operator identity, current progress/game, source status, active count and undo availability. Jump links lead directly to quests, polls and history. Active quests remain exposed; other quest states have expandable sections, with available/secret quests initially expanded. Completed polls with an accepted winner move into expandable history; closed polls awaiting a decision remain in the primary workspace. Configuration is secondary and collapsed. Fail/skip/override actions retain their warning colors and existing confirmation/authorization behavior.

Pixel typography is limited to headings, short labels and commands. Quest descriptions, poll prose, identity and audit text retain readable system typography. Long descriptions preserve paragraphs and wrap instead of truncating. Secondary quest lists and audit history scroll within their panels; active quest descriptions have no internal height limit.

## 2. Localization architecture

`public/js/level38/translations.js` exposes centralized `en`/`es` catalogs, interpolation, count-sensitive labels, language selection and quest fallback helpers. English source keys follow a gettext-style convention. Express/EJS and browser scripts consume the same module. No language-specific template copies or machine-translation service were added.

`localization.ts` chooses the initial server language and supplies template helpers. `locale.js` translates marked static text/attributes and dispatches one local language-change event. Public and control renderers redraw cached semantic data in response. Existing API errors retain their contract and are translated for display using known messages/templates. Database enums, IDs and API action values stay canonical.

## 3. Public language behavior

A visible ES | EN selector uses Spanish for an initial Spanish browser language and English otherwise. Explicit preference persists in localStorage and a path-scoped locale cookie, which also informs server rendering on reload. Switching changes text, labels, quest content, class names, notices and celebration copy without reloading, fetching state/session, changing identity, rerolling class or modifying votes. Browser tests verify both request counts and unchanged database participant/vote records.

## 4. Control-panel language behavior

The control page defaults to Spanish, including for an English browser, unless an explicit shared preference exists. Sign-in, live controls, errors, confirmations, undo explanations, history and existing configuration labels support both languages. Switching preserves unsaved poll questions/options, selected game, winner selection and override reason. It performs no control-state request. Operator authentication and owner-only permissions remain unchanged.

## 5. Quest schema changes

`Quest.title` and `Quest.description` retain existing English/legacy content. Nullable `titleEs` and `descriptionEs` are additive Spanish fields. Visible quest DTOs expose `translations.en` and `translations.es`. Secret filtering occurs before public serialization, including translated fields and referenced poll choices.

## 6. Quest fallback behavior

Each title/description resolves independently: requested language, other configured language, legacy field, then localized nonblank placeholder. Null, empty and whitespace-only translations count as missing. Starter seeding supplies Spanish equivalents for all 18 challenge patterns across the existing games, but still only seeds a new event. Rerunning seed never overwrites a live event.

## 7. Poll localization

Poll types, states, commands, counts, results and YES_NO choices are localized. Persisted YES_NO labels remain `Yes`/`No`; Spanish input cannot change voting semantics. NEXT_QUEST choices use quest translations and NEXT_GAME titles remain proper names. Custom moderator questions/options remain exactly as written, including words such as `Yes`. Optional separately authored bilingual custom poll fields are deferred.

## 8. Audit localization

Existing semantic actions, before/after snapshots and metadata drive localized audit sentences, progress changes and undo descriptions. Quest references resolve their current translated titles where available; poll winner references localize system choices. Date/time display uses the selected language. No historical record is rewritten. Unknown legacy entries fall back to stored descriptions.

## 9. Class-name localization

The central class catalog includes English/Spanish display names for all 16 stable class IDs. Examples include Caballero, Caballero oscuro, Ladrón, Mago negro and Samurái. Dragoon and Ninja remain canonical names. The public class API contract, assignments and sprites are unchanged; templates supply an inert display-name catalog for local rendering.

## 10. Responsive changes needed for Spanish

Language controls retain 44px targets. Navigation wraps, phone poll labels receive their own row, identity content can wrap, and longer celebration headings scale to fit. Phone journal filters now stack because two columns clipped Spanish select labels. The control workspace stacks at 800px and below; commands wrap without clipping. A specificity conflict on the visually hidden native progress element was corrected after overflow testing identified it. Audit text wraps long words.

## 11. Migration

New migration: `202609150006_level38_quest_localization`.

It transactionally adds the two nullable text columns without updates, deletes, resets or enum changes. A disposable PostgreSQL 16 test schema was first built using all earlier migrations and populated with legacy state. Applying this migration preserved every original quest field and event revisions; both new fields were null. Repeat application reported no pending migrations, status was up to date, and schema diff exited successfully. No migration ran against production.

## 12. Tests and results

- `npm run build`: passed, including Prisma client generation and TypeScript compilation.
- `npm test`: 22/22 passed, including seven new localization tests.
- `npm run test:integration`: 37/37 passed, including two new localization/migration tests.
- `prisma validate`: passed.
- JavaScript syntax checks: all seven public LEVEL 38 scripts and the new browser QA runner passed.
- `git diff --check`: passed. Final tracked/untracked file review found no unrelated application, dependency, production configuration or environment-file changes.

An intermediate integration run encountered an ECONNRESET in the existing readiness test; its focused rerun and the complete final integration run both passed without changing that test. The initial new localization test used the wrong mutation-response shape; it now reads the resulting poll/control revision through the existing contracts.

## 13. Visual QA results

Real headless Chrome 152.0.7977.84, with visual inspection of screenshots and automated document/body width checks:

| Viewport | Public ES / EN | Control ES / EN | Horizontal overflow |
| --- | --- | --- | --- |
| 1440 × 1000 | Pass | Pass | None |
| 1024 × 1000 | Pass | Pass | None |
| 768 × 1000 | Pass | Pass | None |
| 390 × 844 | Pass | Pass | None |
| 844 × 390 landscape | Pass | Pass | None |

Coverage includes navigation, progress, current game, long active quest descriptions, quest journal/filters, voting, identity/sprites, inline registration, poll editor, audit/configuration, sign-in, live notices, and ES/EN celebrations. Spanish server rendering without JavaScript was also checked. Final bilingual artifacts contain 138 screenshots and 135 overflow checks, with zero browser errors or CSP violations, under ignored `dist/phase36-visual-qa/`.

The unchanged earlier visual/interaction suite also passed, producing 69 screenshots and 22 overflow checks under ignored `dist/phase36-regression-qa/`. It checks long unbroken descriptions/names, nickname edits, vote changes, poll history, focus/Escape behavior, actual threshold celebrations, replay suppression, reduced motion and sprite failure. Because that older suite assumes English text, its run used an ignored Playwright preload setting browser contexts to `en-US`; its test source and assertions were preserved. Running it with the local browser's Spanish default had timed out on its English `connected` text check.

These are Chrome viewport checks, not physical-device Safari/Firefox certification.

## 14. Exact files created

- `docs/level38-phase36.md`
- `prisma/migrations/202609150006_level38_quest_localization/migration.sql`
- `public/css/level38-control.css`
- `public/css/level38-locale.css`
- `public/js/level38/locale.js`
- `public/js/level38/translations.js`
- `src/modules/level38/localization.ts`
- `src/views/level38/language.ejs`
- `tests/integration/localization.test.cjs`
- `tests/level38-localization.test.cjs`
- `tests/visual/level38-phase36.cjs`

## 15. Exact files modified

- `prisma/schema.prisma`
- `public/js/level38/common.js`
- `public/js/level38/control.js`
- `public/js/level38/experience.js`
- `public/js/level38/public.js`
- `public/js/level38/twitch-control.js`
- `src/modules/level38/classes.ts`
- `src/modules/level38/index.ts`
- `src/modules/level38/routes.ts`
- `src/modules/level38/seed.ts`
- `src/modules/level38/state.ts`
- `src/views/level38/control.ejs`
- `src/views/level38/index.ejs`
- `src/views/level38/quest-card.ejs`
- `src/views/level38/unavailable.ejs`

Generated builds, test logs, local QA helpers and screenshots remain ignored under `dist/`; they are not source changes.

## 16. Known localization and visual limitations

- Existing live quests are not automatically backfilled with Spanish. Until authored/imported, they use the other-language fallback. Starter content is illustrative, not the final curated quest pool.
- Custom poll questions/options and user names are intentionally unchanged. Separately authored bilingual custom poll content is future work.
- Legacy audit descriptions and missing historical title translations may remain in their stored language. Recognized audit references use current translated quest content rather than inventing historical translations.
- Native selects, browser validation messages and confirmation chrome retain browser/OS rendering; application labels and confirmation prompts are translated. Native selects retain their normal scrolling/picker behavior for long choices.
- Preference switching requires JavaScript; without it, the public page remains readable in the server-selected language. If browser storage is blocked, persistence is best effort.
- The dense control desk uses bounded scrolling for secondary lists/history. It intentionally retains fewer decorative elements than the public page. Existing demo sprites remain the asset compromise from Phase 3.
