# LEVEL 38 — Phase 3.9 final class and variant integration

Implemented locally on 2026-09-15 against the approved Phase 3.9A audit. No commit, push, deployment, Render configuration change, live Twitch enablement or OBS overlay was performed. Production data was not accessed. Database validation used a separate disposable PostgreSQL 16 container and randomly isolated test schemas.

## 1. Final 24-class roster

| Stable ID | English | Spanish | Variants |
| --- | --- | --- | --- |
| knight | Knight | Caballero | FFV five |
| paladin | Paladin | Paladín | cecil |
| dark-knight | Dark Knight | Caballero oscuro | cecil |
| dragoon | Dragoon | Dragoon | FFV five |
| monk | Monk | Monje | FFV five |
| berserker | Berserker | Berserker | FFV five |
| thief | Thief | Ladrón | FFV five |
| ninja | Ninja | Ninja | FFV five |
| samurai | Samurai | Samurái | FFV five |
| ranger | Ranger | Explorador | FFV five |
| mystic-knight | Mystic Knight | Caballero místico | FFV five |
| black-mage | Black Mage | Mago negro | FFV five |
| white-mage | White Mage | Mago blanco | FFV five |
| red-mage | Red Mage | Mago rojo | FFV five |
| blue-mage | Blue Mage | Mago azul | FFV five |
| time-mage | Time Mage | Mago del tiempo | FFV five |
| summoner | Summoner | Invocador | FFV five |
| sage | Sage | Sabio | tellah |
| bard | Bard | Bardo | FFV five |
| dancer | Dancer | Bailarín | FFV five |
| beastmaster | Beastmaster | Domador | FFV five |
| machinist | Machinist | Maquinista | cid |
| geomancer | Geomancer | Geomante | FFV five |
| chemist | Chemist | Químico | FFV five |

The original 16 IDs and their translations remain intact. Exactly eight additions: berserker, mystic-knight, time-mage, geomancer, chemist, paladin, sage and machinist. Necromancer is absent.

## 2. Final 104-appearance model

Twenty FFV classes each support `bartz`, `lenna`, `galuf`, `faris`, `krile`: 100 appearances. The four FFIV classes each have their fixed variant: four appearances. Class IDs never contain a variant suffix. `classId` and `variantId` remain independent stored fields.

## 3. Schema migration

`prisma/migrations/202609150008_level38_variants/migration.sql` adds nullable `Participant.variantId TEXT` with no default and no data rewrite. Existing rows receive NULL. No table, index, relation or existing column is removed. The new client requires this migration before it serves participant requests; the additive column is compatible with the previous application.

## 4. Existing-participant preservation

Variant assignment changes only a supported participant's NULL `variantId`. It preserves `id`, `classId`, `nickname`, `tokenHash`, `createdAt`, `expiresAt`, votes, poll rounds, event state, quest progress and audit history. No session is renewed or replaced by this backfill. Both expired and active rows are included by the explicit CLI; expired rows remain expired.

The existing intentional owner participant-reset operation now clears `variantId` alongside nickname/class and expiration. This keeps that previously authorized reset behavior consistent; ordinary migration, join, refresh and backfill never invoke it.

## 5. Variant assignment

New named participants draw one of the 24 enabled classes with `crypto.randomInt(24)`, then draw from that class's valid variants with `crypto.randomInt(5)` or its single fixed slot. Both IDs are saved in the same transaction and conditional update. Each class has probability 1/24, independent of its number of appearances; each FFV appearance has conditional probability 1/5 within its class. There is no flattened 104-entry random pool.

## 6. Backfill semantics

`backfillParticipantVariants` defaults to dry-run. It scans supported non-null classes with NULL variants in pages of 250. Apply uses one short transaction per participant; it can resume safely after interruption. Unknown classes are counted and left untouched. Every non-null variant, including an unknown historical value, remains untouched. Unassigned anonymous participants remain unassigned.

Dry-run counts eligible, already assigned and unknown-class rows without drawing or storing variants. Apply also reports the number actually assigned. Counts are observational rather than a global database snapshot: live requests or another backfill may win first, making `assigned` smaller than `eligible`. Rerunning fills only remaining supported NULL values.

## 7. Concurrency behavior

The conditional update requires the participant ID, the observed class ID and `variantId: null`. PostgreSQL serializes conflicting row updates and rechecks that predicate. Only one variant wins. Request handlers reread the row after the conditional update and return the stored winner, never the discarded random candidate. First class assignment similarly compares against a NULL class and saves both identifiers together.

Real PostgreSQL coverage races 12 first joins, 12 lazy session backfills and two full 270-row backfills. All request responses agree with the persisted winner; combined backfill writes equal the eligible row count, and reruns make zero changes.

## 8. Runtime asset layout

`public/level38/classes/<classId>/<variantId>/{idle,walk,victory}/NN.png` contains 516 approved normalized PNGs. There are 520 runtime frame references because the four Thief exception sequences reuse their own standing frame. Only PNGs and the manifest were added to this runtime directory. Raw GIFs, source HTML, audit imagery, measurement fixtures, attack and cast frames remain outside the application.

All frames retain the audited pixels: 16×24 canvas, foot anchor (8,24), integer render scale 2, displayed canvas 32×48, binary alpha and nearest-neighbor rendering. Twelve appearances retain a naturally shorter 23-pixel standing height, displayed as 46 visible pixels with one transparent top row. Lenna Berserker and Lenna Geomancer retain the audited horizontal padding. No scaling, drawing or pixel reconstruction occurs during import.

## 9. Manifest structure

The single source is `public/level38/classes/manifest.json`, version `level38-sprites-3.9.0`. `/level38/api/classes` returns that same manifest. It contains global canvas/anchor/scale, localized class names, enabled flags, variant IDs, visible height, mirror policy and idle/walk/celebration metadata. Each animation records local frame paths, timing, looping/cycles, source frame count/cycle duration, source completeness and runtime assembly.

The backend catalog is derived from this manifest. The server uses the browser-compatible resolver in `public/js/level38/sprites.js`; participant responses contain that resolver's presentation DTO. Filesystem paths, source URLs, credentials and internal provenance are absent from the public manifest. Participant-supplied IDs are looked up; they are never interpolated into asset paths.

## 10. Website integration

The participant identity card and join/class reveal now show the real stored appearance. The old 32×32 animated SVG-strip implementation is replaced by the shared normalized-frame renderer. Idle stays at frame zero. The reveal plays a two-frame celebration at 250 ms per frame, three cycles, then idle. Reduced-motion users receive idle. The existing reveal dismissal and nickname workflow remain intact.

Public UI prominently labels the class in the selected language. Protagonist names are absent from the viewer presentation. No public gallery, new walk movement or owner/debug panel was added. The 104-appearance gallery exists only inside the browser QA harness and ignored screenshots.

## 11. Faris/Krile Thief handling

For `thief/faris` and `thief/krile`, the source walk and victory GIFs each supply one action pose. Runtime walk is their own idle frame followed by their supplied stride; runtime celebration is their own idle frame followed by their supplied raised-arm pose. Metadata truthfully retains `sourceFrameCount: 1`, incomplete source-cycle status and the explicit assembly explanation. No attack frame, invented pose or borrowed protagonist pixel is used.

## 12. Localization

ES/EN names come from the same class manifest through the existing localization layer. The original 16 translations are preserved and the eight additions match the approved audit. Unknown classes use the localized Adventurer/Aventurero fallback; missing variants on a known class retain its proper localized name. Language switching does not rewrite or reroll an identity.

## 13. Fallback behavior

Unknown classes, absent/unknown variants and failed PNG requests use the original owned `public/img/level38/placeholder.svg`. A further placeholder failure leaves the existing text-symbol fallback. Class/variant IDs and visible class labels survive errors unchanged. Asset requests are local and constrained to manifest-approved paths; path-like unknown variant strings resolve to no sprite.

## 14. OBS reuse boundary

No OBS overlay was built. Future clients must consume the same manifest and `Level38Sprites.resolve`, `frameAt`, timing and normalized metadata. `render` is the reusable DOM renderer; `dispose` releases an animation timer. `frameAt` supports repeating two-frame walk at 200 ms/frame and the finite celebration, allowing future canvas/overlay presentation to use the same frame clock rather than implementing another one.

## 15. Provenance and replaceability

`docs/level38-sprite-provenance.json` records all 104 appearances: game/site/page attribution, source URLs and hashes, normalized file/pixel hashes, native dimensions, padding, normalization notes and audit status. Permission status remains **UNKNOWN**. Audit approval is not represented as rightsholder permission.

`scripts/level38-import-sprites.py` reproducibly imports an approved external audit manifest; `scripts/level38-validate-sprites.py` checks the shipped result. Pillow is required for these local tooling commands, not production. Replacing an appearance means updating its approved pixels/metadata and asset version while preserving its class/variant IDs. No participant rewrite is needed.

## 16. Tests

| Validation | Result |
| --- | --- |
| `npm run build` | Pass, including Prisma generation and TypeScript |
| `npm test` | 31/31 pass |
| `node --test --test-concurrency=1 tests/integration/*.test.cjs` | 44/44 pass against disposable PostgreSQL 16 |
| Additional Phase 3.9 preservation/CLI assertions, targeted serial rerun | 3/3 pass |
| Real Chrome suites: original, Phase 3.6, 3.7, 3.8, 3.9, existing Twitch mock | All six pass, including targeted reruns of corrected legacy harnesses |
| Migration upgrades | Pass from original foundation, Phase 2/3/4 and immediately pre-3.9 schema |
| `python scripts/level38-validate-sprites.py` | 516 PNGs, 520 references, 104 appearances, 12 shorter idle sprites; hashes, alpha, dimensions and baseline pass |
| JavaScript syntax and `git diff --check` | Pass |

Coverage includes exact roster/additions, separate uniform class and variant slots, fixed FFIV assignments, all manifest references, unsafe IDs, fallback errors, Thief assembly, finite animation timing, nickname/session preservation, real database races, dry-run/apply CLI, retained historical votes/polls/audits, quest/poll/finale regressions and localization.

Two older Chrome harnesses assumed English and an already-open configuration panel. Their test setup now chooses English explicitly and opens the existing disclosure. The original sprite assertion now allows the reveal to finish before comparing it to idle and aborts the new PNG paths for fallback testing. No Twitch application code changed; its tests use the existing fake API only. A transient Windows Prisma DLL lock occurred when attempting regeneration while browser/database tests were running; the build and unit suite passed after those processes finished.

## 17. Browser QA

Real headless installed Chrome rendered every class in the actual participant card and all 104 appearances using the production resolver, renderer and styles. The responsive matrix specifically includes Faris Thief, Krile Thief and Cid at 1440×1000, 1024×1000, 768×1000, 390×844 and 844×390, in ES and EN. All five FFV protagonists are represented. The Phase 3.9 suite records 54 identity/layout checks, plus the 104-image gallery.

Every checked sprite loaded at native 16×24 and displayed at 32×48 with `image-rendering: pixelated`, inside its slot without clipping. Document/body widths stayed within the viewport. Refresh, offline/reconnect and locale changes preserved stored identity and cookies. Deliberately blocked PNGs used the owned fallback without changing the participant. No page errors or CSP violations were recorded by this suite.

The appearance contact sheet and representative screenshots at all five widths were visually inspected: crisp pixels, shared foot baseline, preserved short-character padding, clean class labels and coherent portrait/landscape layout. Existing browser suites also cover join modal/reveal, long descriptions, live polls, public/control finale, reduced motion and owner controls.

Artifacts are ignored under `dist/phase39-visual-qa/`, including `all-104-appearances.png`, per-class/per-viewport screenshots and `results.json`. Regression artifacts remain in the existing Phase 3/3.6/3.7/3.8/4 QA folders. These are local evidence, not production assets.

## 18. Exact production commands for a later approved rollout

From the deployed application root, using the environment's existing database connection, after building this revision and ensuring the additive migration has run:

```sh
# Dry-run: counts only; no participant writes
node dist/modules/level38/commands.js participant-variants

# Apply: fill supported NULL variants only
node dist/modules/level38/commands.js participant-variants --apply
```

If the approved deployment procedure has not applied migrations, its prerequisite is:

```sh
npm run db:migrate
```

Run the dry-run, review eligible/unknown-class counts, then apply; a subsequent apply should report zero newly assigned rows unless more eligible legacy rows arrived. The application also fills a logged-in legacy participant's missing variant on their next session/join request. Verify a retained identity and `/level38/api/classes` after rollout. Do not reset participants, reseed the event or rotate keys for this phase. No Render/Twitch setting change is required. Neither production backfill command nor a production migration was executed in this work.

## 19. Files added/modified

Added:

- `prisma/migrations/202609150008_level38_variants/migration.sql`
- `src/modules/level38/variants.ts`
- `public/js/level38/sprites.js`
- `public/img/level38/placeholder.svg`
- `public/level38/classes/manifest.json` and 516 PNGs below that directory; exact frame paths are indexed in the manifest and internal provenance register
- `scripts/level38-import-sprites.py`
- `scripts/level38-validate-sprites.py`
- `tests/integration/phase39.test.cjs`
- `tests/visual/level38-phase39.cjs`
- `docs/level38-sprite-provenance.json`
- `docs/level38-phase39.md`

Modified:

- `prisma/schema.prisma`
- `src/modules/level38/{classes,commands,controller,owner-tools,participants,routes}.ts`
- `src/views/level38/{index,control}.ejs`
- `public/js/level38/{common,locale,public}.js`
- `public/css/level38.css`
- `public/img/level38/README.md`
- `tests/level38-{phase3,localization}.test.cjs`
- `tests/integration/{browser-scripts,phase3}.test.cjs`
- `tests/visual/{level38,level38-twitch}.cjs`

The three existing untracked research/audit reports (`level38-sprite-research.md`, `level38-sprite-audit.md`, `level38-sprite-variants-audit.md`) were present before this task and remain untouched. Final diff review found no unrelated application, environment, dependency, lockfile, production configuration or Twitch implementation changes.

## 20. Remaining limitations

- Permission status remains UNKNOWN; no new legal claim is made.
- FFV and FFIV retain their original stylistic differences and naturally shorter characters. Pixel edits or stretching were intentionally unnecessary.
- Thief Faris/Krile use the approved one-pose source-backed assembly; this is not a newly discovered complete source cycle.
- QA uses real desktop Chrome with responsive viewports, not physical phones, Safari, Firefox or an OBS browser source.
- The old 16 owned demo SVG strips remain in their original directory for compatibility/reference, but the public class renderer no longer uses them.
- A failed image stays on the fallback for that rendered identity until a fresh render/page load. It never triggers reassignment.
- No OBS implementation or optional owner variant inspector is included. Those can reuse the delivered presentation contract in a future phase.
