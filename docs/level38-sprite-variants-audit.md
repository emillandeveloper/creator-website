# LEVEL 38 — Phase 3.9A cosmetic variant expansion audit

Audit date: 2026-09-15. Research and local fixtures only. The approved design remains **24 classes**, with separate cosmetic `variantId` values. No production class IDs, participant records, random assignment behavior, pages, control panel, quests, polls, finale, Twitch integration or configuration were modified. No OBS overlay was built. No commit, push or deployment was performed.

## 1. Result and total audited combinations

**104/104 appearances retrieved and audited:** 100 FFV combinations (20 jobs × Bartz/Lenna/Galuf/Faris/Krile), plus Cecil/Paladin, Cecil/Dark Knight, Tellah/Sage and Cid/Machinist. All 104 normalized standing bitmaps are distinct.

- **80 new FFV appearances / 240 newly retrieved GIFs.**
- **24 prior appearances / 72 main-animation GIFs** reused with verified hashes from the earlier audit.
- **312 GIFs / 516 actual decoded frames** measured independently, rather than assuming Bartz's properties apply to everyone.
- **102 appearances have complete two-frame source walk/victory GIFs. Two have source-format exceptions**, with explicitly assembled runtime sequences described below.
- All appearances fit the normalized 16×24 contract without cropping or stretching.

The five-variant model is technically viable as a **proposal**. The two assembled Thief sequences and continuous playback still deserve review before Phase 3.9 integration. “Audited” means files, pixels, poses, metadata and assignment models were examined; it does not mean publication permission or live browser playback was approved.

The [expanded manifest](../../level38-sprite-audit-local/variants/proposed-expanded-manifest.json) represents all 104 combinations as nested variants under 24 class IDs. The [local review page](../../level38-sprite-audit-local/variants/index.html) and all assets remain outside the repository. A browser surface was unavailable, so real-time playback and performance are **not verified**. All 100 FFV combinations were inspected in static source-order/mirrored frame sheets; the four fixed FFIV donors retain the prior visual audit and were technically rechecked here.

## 2. Missing/broken source combinations and the two exceptions

No required source file is missing or unreadable. However, four files are single poses despite their animation names:

| Class / variant | Source files | Raw finding | Proposed runtime sequence |
| --- | --- | --- | --- |
| Thief / Faris | [Walk](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Thief4%20-%20Walk.gif), [Victory](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Thief4%20-%20Victory.gif), [source page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Thief.html) | Each is one distinct action pose, stored with a 200 ms delay. Walk is a stride; victory has a raised arm. | Supplied standing pose → supplied stride, repeating; standing → supplied raised-arm pose for celebration. |
| Thief / Krile | [Walk](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Thief5%20-%20Walk.gif), [Victory](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Thief5%20-%20Victory.gif), [source page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Thief.html) | Same single-pose situation; native height is 23 pixels. | The same source-backed assembly, with one transparent row above the shorter art. |

These links are provenance references, not hotlinked images. The test page reads local files only.

The [Thief review sheet](../../level38-sprite-audit-local/variants/class-thief-review.png) shows the assembled sequences alongside the three complete source cycles. They use the same standing/stride pattern as the other Thieves. **No walk frame was taken from an attack; no pixels, limbs or new poses were fabricated.** The raw files remain unchanged. Source metadata continues to report one frame; `runtimeAnimations` explicitly references the existing idle frame and labelled action frame as separate sources.

Walk timing of 200 ms per assembled frame and victory timing of 250 ms per assembled frame are **proposals**, not recovered source-cycle timing. A single GIF pose with a delay does not establish the intended original game loop. The alternative Faris sheet page in the earlier research returned HTTP 403 during this phase; no unverified replacement sheet was silently substituted.

Thus: **102 complete source-cycle appearances + 2 appearances with plausible source-backed assembly**, not a claim of 104 complete animated source GIF sets. If assembled cycles are not accepted, retain both IDs in the proposal and defer their runtime eligibility; do not silently change the promised five-way distribution to three Thief variants.

## 3. Dimensions, normalization, baseline and clipping

Every decoded frame consists of exact repeated **2×2 pixel blocks**. Reducing those blocks and re-enlarging reproduces the decoded source RGBA data exactly. This establishes the effective recovered grid, not independently authenticated ROM dimensions. Downloaded canvases are 32×48, 32×46 or 30×48; recovered canvases are 16×24, 16×23 or 15×24.

All runtime canvases are **16×24**, anchor **(8,24)** in pixel-edge coordinates, integer render scale **2×**. The baseline lies just below the final pixel row. All 516 normalized source frames reach that baseline. The anchor is a stable registration convention, not anatomical foot-contact tracking.

| Difference | Affected combinations | Treatment and evidence |
| --- | --- | --- |
| 16×23, one pixel shorter | Krile: Knight, Thief, Ninja, Samurai, Mystic Knight, Red Mage, Time Mage, Summoner, Bard, Beastmaster, Chemist; plus fixed Cid/Machinist | One transparent row **above** each frame. Preserve visible 23-pixel height: 46 px at 2×. Source foot anchor (8,23) becomes (8,24). |
| 15×24 narrow crop | Lenna/Berserker: idle and both walk frames | Add one transparent column **on the left**, not the right. The padded idle exactly matches the full-width standing pose supplied in its victory animation. Right padding differs at 222 RGBA pixels and produces a horizontal registration error. |
| 15×24 narrow crop | Lenna/Geomancer: idle only | Add one transparent column **on the left**. This exactly matches the full-width first walk pose. Right padding differs at 200 RGBA pixels. |
| 16×24 | All other main source frames | No canvas padding needed. Preserve original proportions and frame order. |

The four narrow source frames and 58 short source frames were counted separately; the remaining 454 source frames are 16×24. Across standing appearances, **92 are 24 px high and 12 are 23 px high**. Render them at 48/46 px, rather than forcing identical visible height. There is no normalization crop or stretch; validation compares every opaque pixel and counts opaque pixels before/after padding.

### All 100 FFV combinations: native standing canvas

Each class link opens the full five-variant pose/facing sheet. “Assembled” flags the source exceptions; “left pad” identifies a narrower idle canvas. All table entries resolve to normalized 16×24 canvases and anchor (8,24).

| Class | Bartz | Lenna | Galuf | Faris | Krile |
| --- | --- | --- | --- | --- | --- |
| [Knight](../../level38-sprite-audit-local/variants/class-knight-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×23 |
| [Dragoon](../../level38-sprite-audit-local/variants/class-dragoon-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×24 |
| [Monk](../../level38-sprite-audit-local/variants/class-monk-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×24 |
| [Berserker](../../level38-sprite-audit-local/variants/class-berserker-review.png) | 16×24 | 15×24; left pad | 16×24 | 16×24 | 16×24 |
| [Thief](../../level38-sprite-audit-local/variants/class-thief-review.png) | 16×24 | 16×24 | 16×24 | 16×24; assembled | 16×23; assembled |
| [Ninja](../../level38-sprite-audit-local/variants/class-ninja-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×23 |
| [Samurai](../../level38-sprite-audit-local/variants/class-samurai-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×23 |
| [Ranger](../../level38-sprite-audit-local/variants/class-ranger-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×24 |
| [Mystic Knight](../../level38-sprite-audit-local/variants/class-mystic-knight-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×23 |
| [Black Mage](../../level38-sprite-audit-local/variants/class-black-mage-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×24 |
| [White Mage](../../level38-sprite-audit-local/variants/class-white-mage-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×24 |
| [Red Mage](../../level38-sprite-audit-local/variants/class-red-mage-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×23 |
| [Blue Mage](../../level38-sprite-audit-local/variants/class-blue-mage-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×24 |
| [Time Mage](../../level38-sprite-audit-local/variants/class-time-mage-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×23 |
| [Summoner](../../level38-sprite-audit-local/variants/class-summoner-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×23 |
| [Bard](../../level38-sprite-audit-local/variants/class-bard-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×23 |
| [Dancer](../../level38-sprite-audit-local/variants/class-dancer-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×24 |
| [Beastmaster](../../level38-sprite-audit-local/variants/class-beastmaster-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×23 |
| [Geomancer](../../level38-sprite-audit-local/variants/class-geomancer-review.png) | 16×24 | 15×24; left pad | 16×24 | 16×24 | 16×24 |
| [Chemist](../../level38-sprite-audit-local/variants/class-chemist-review.png) | 16×24 | 16×24 | 16×24 | 16×24 | 16×23 |

The fixed FFIV trio Cecil/Paladin, Cecil/Dark Knight and Tellah/Sage are 16×24; Cid/Machinist is 16×23. Per-frame source dimensions, padding offsets, alpha bounds, hashes and durations are preserved in the expanded manifest, including differences between actions within a single appearance.

## 4. Transparency results

**516/516 source frames and normalized frames have binary alpha, values 0 and 255 only.** No opaque rectangular background, chroma-key operation or anti-aliased edge processing was introduced. Transparent palette entries are respected when decoding GIF frames, including disposal/compositing.

Normalization preserves every opaque pixel's color and position after the recorded offset. Transparent padding adds no artwork. No matte rectangle or obvious edge artifact appeared on the dark comparison sheets. The local HTML offers white, magenta and checkerboard backgrounds for further playback review. These controls are provided, but they are not represented as a completed live-browser QA pass.

Permission and transparency are separate facts: alpha passing does not establish permission to publish the art.

## 5. Walk results

For **98 FFV appearances**, the source walk GIF contains two distinct frames in source order 0→1, at 200 ms each: 400 ms per loop. The four fixed FFIV walks contain two frames at 170 ms each. The remaining two FFV Thieves supply a separate stride pose, assembled with their own standing pose as described in section 2.

After documented padding and explicit Thief assembly, **every proposed runtime walk starts with its own normalized standing pose** and alternates with a distinct supplied stride. This invariant is checked for all 104. No frame-dependent baseline shift is introduced. The two Lenna left-padding corrections are necessary for that invariant.

All local runtime tests use the requested **200 ms walk-frame cadence**, while source timings remain available as evidence. Seeded pseudo-random phase offsets are stored in `phase-offsets.json`; mixed participants have independently sampled offsets in `simulated-crowds.json`. The HTML also samples display phases independently. A display-phase offset may change without changing participant identity or `variantId`.

Local animated artifacts include `animated-<classId>-walk.gif` for all 20 jobs: each shows all five variants and both facings. The HTML supports all classes, individual protagonist reviews and mixed crowds. Travel is deliberately simple, bounded horizontal movement in a research fixture; it is not an implemented OBS movement system.

These remain two-pose battle advance cycles. Robes conceal foot motion, and translation is not foot-locked, so a shuffling/gliding impression is possible. Continuous motion, turn cadence and speed suitability are **not live-playback verified**. Static pose and timing analysis support testing at a restrained 24 rendered px/s; they do not justify a claim of naturalistic gait.

## 6. Victory results

For 98 FFV appearances, source victory loops have two frames at 250 ms each (500 ms/cycle). The four FFIV donors use 200 ms each (400 ms/cycle). Faris/Thief and Krile/Thief each supply one raised-arm pose, paired with their existing standing pose in the proposal.

Use the same per-appearance art for a **250 ms/frame** celebration presentation. Three two-frame cycles would take 1.5 seconds, followed by standing. No new art, attack substitution, generated jump or standing bounce is required by the proposed set. Preserve the one-frame source metadata on the two exceptions rather than claiming their timing was recovered.

`animated-<classId>-victory.gif` files show all five variants in both facings with staggered phases. GIF previews sample the presentation timeline; the HTML uses elapsed-time frame selection. Neither artifact is a claim of observed real-time playback during this session.

## 7. Mirroring, hats and accessories

**All 100 FFV combinations were inspected in original and horizontally flipped walk poses. No combination was rejected for an obvious mirrored visual defect.** The four fixed FFIV donors retain the prior cosmetic-facing finding and were revalidated for dimensions, alpha and reversible flipping.

No independent authored right-walk cycle is claimed. The manifest explicitly records left-facing sources plus a cosmetic flip policy. Hair partings, ponytails, capes, robe overlaps, hat decoration and implied equipment handedness reverse. This is acceptable for cosmetic travel; it does not establish canonical combat handedness.

Notable examples: Lenna/Faris White Mage hoods, Galuf's beard and turban, Krile's animal-like hoods and large hair bow, Faris Dragoon's red helmet, and the broad Black/Red Mage hats. They remain inside the normalized canvas without distortion. No lettering needed special reversal handling. The selected frames do not constitute a complete weapon/shield equipment layer; future separately rendered weapons need their own bounds and handedness audit.

The crop check proves **normalization introduces no clipping**. It cannot prove the source archive itself includes every pixel or pose from the original game.

## 8. Visual coherence and review matrices

The expansion improves variety while maintaining one compact FFV pixel family. Protagonist differences include hair, face, beard, clothing silhouette and palette, not just small tint changes. All 104 normalized standing images have different hashes; that is evidence of distinct pixels, not a promise that every silhouette is uniquely recognizable at stream size.

| Review artifact | Finding |
| --- | --- |
| `class-matrix-1.png` through `class-matrix-5.png` | Every class is shown with Bartz, Lenna, Galuf, Faris and Krile side by side; the 20 detailed class sheets add both walk poses/facings and victories. |
| [Bartz / 20 jobs](../../level38-sprite-audit-local/variants/protagonist-bartz-20-jobs.png), [Lenna](../../level38-sprite-audit-local/variants/protagonist-lenna-20-jobs.png), [Galuf](../../level38-sprite-audit-local/variants/protagonist-galuf-20-jobs.png), [Faris](../../level38-sprite-audit-local/variants/protagonist-faris-20-jobs.png), [Krile](../../level38-sprite-audit-local/variants/protagonist-krile-20-jobs.png) | Protagonist appearance stays recognizable across jobs. Krile's naturally smaller bodies and larger headwear remain coherent when padded rather than stretched. |
| [5-person mixed scene](../../level38-sprite-audit-local/variants/mixed-crowd-5-1080p.png) | Four classes, five different class/variant appearances; the two Ninjas visibly differ. |
| [15-person mixed scene](../../level38-sprite-audit-local/variants/mixed-crowd-15-1080p.png) | Fourteen classes, fifteen different appearances; one row remains visually separated at the test spacing. |
| [30-person mixed scene](../../level38-sprite-audit-local/variants/mixed-crowd-30-1080p.png) | Twenty classes, twenty-seven different appearances. Two rows preserve body separation while showing useful same-class variety. |

Mixed scene assignments were generated by selecting a class first, then one of that class's variants. They are reproducible examples, not hand-selected distributions. Repeated appearances are allowed; do not force uniqueness or reroll participants to make a crowd look more diverse.

Some recognizable motifs change between variants: a Knight need not always be red, and a Dragoon need not always be blue. Lenna/Faris White Mage supply the hooded silhouette absent from Bartz's version. Bard/Summoner and other light green clothing still overlap in some silhouettes. Keep readable public class text and do not depend solely on palette. Protagonist names belong in this audit/debug UI; public titles remain, for example, **BLACK MAGE / MAGO NEGRO**.

## 9. Recommended future persistence model

Use an additive **nullable `variantId` string field on `Participant`**, without a random or character-specific database default. Keep `classId` and `variantId` separate. A string avoids a schema migration for every future presentation variant; validate compatibility through the shared class/variant catalogue. This is a design proposal only; no schema or records were changed.

The current model has `id`, `tokenHash`, nullable `nickname`, nullable `classId`, and `expiresAt`, with no `variantId`. `joinParticipant()` already uses a transaction and conditional class assignment. Extend that concurrency discipline in Phase 3.9 rather than adding random appearance selection to response serialization.

Recommended future sequence:

1. Add nullable `variantId` through an additive migration. Existing class assignments remain intact and old code can ignore the extra nullable field during a staged rollout.
2. For a new assignment, choose class and compatible variant once and persist both in the same transaction. Emit the public/socket update only after commit.
3. For an existing non-null `classId` with null `variantId`, choose only from that class's compatible variants. Write with a compare-and-set condition on participant ID, expected `classId`, null `variantId` and the application's existing eligibility/expiry rules.
4. Reread the stored row and return the winning value. A concurrent request that loses the write must never return its discarded random candidate.
5. Use a one-time idempotent backfill, with the same conditional write as a lazy fallback. Rerunning it only handles still-null variants; it must not rewrite non-null values or change `classId`, nickname, session lifetime or existing votes.
6. Refresh, reconnect and nickname changes read the persisted pair. Do not choose a variant from nickname, request time, array position or a new random draw on every request.

For fixed FFIV classes, persist `cecil`, `cecil`, `tellah` or `cid` as appropriate. The same `cecil` variant ID can exist under two different class IDs because the pair determines presentation. Unknown/retired classes or unavailable variant assets should retain their stored identity and use an owned placeholder with an owner/debug diagnostic; do not silently reroll or rewrite them.

Separate **assignment eligibility** from **renderability**. Retired variants can be excluded from new choices while remaining resolvable for existing participants. Adding a future variant does not alter any persisted assignment. Do not introduce the architectural example Vivi or source other characters in this phase.

### Identity-lifetime boundary

The current anonymous viewer identity uses a cookie/token and a **365-day** participant expiry in `auth.ts`. Explicit `variantId` persistence preserves appearance across the stated actions **while the same participant identity is recovered**. Clearing cookies, changing devices without identity recovery, or returning after that identity expires can create a different participant. No nullable field can establish that two anonymous rows belong to the same person.

If “future visits” means indefinite continuity beyond the current identity lifetime, a separate approved durable-identity/recovery design is required. Do not silently extend expiry, link people by nickname, or claim this audit solves that identity problem. No authentication semantics were changed here.

## 10. Random-assignment model and test results

Choose uniformly from enabled **classes**, then uniformly from the selected class's valid **variants**. Never choose uniformly from a flattened list of 104 appearances.

For 24 enabled classes:

| Quantity | Correct probability |
| --- | --- |
| Any particular class | 1/24 = 4.1667% |
| Any particular FFV protagonist, conditional on its class | 1/5 = 20% |
| One particular FFV class/protagonist pair | 1/24 × 1/5 = 1/120 = 0.8333% |
| The fixed variant, conditional on its FFIV class | 100% |
| One particular FFIV class/fixed-character pair | 1/24 = 4.1667% |

Summing a class's pair probabilities gives 1/24 regardless of variant count. Uniform selection over 104 pairs would instead give an FFV class five times an FFIV class's probability; that is explicitly rejected.

Local model: `assignment-model.cjs`, tested by `test-model.cjs`. It imports no production code and connects to no database. The intended production random source is unbiased integer sampling such as Node's `crypto.randomInt`; tests inject deterministic draws for reproducibility.

- Structural tests assert two draw bounds: **24 then 5**, or **24 then 1**. Exhaustive class-choice cases preserve equal class selection even when an extra test-only variant is appended.
- Disabled classes are excluded. An enabled class with no valid variants is rejected as a catalogue error, rather than silently dropping it and changing class odds.
- A **240,000-assignment** seeded simulation produced **9,858–10,100** selections per class, around an expected 10,000. All 104 pairs appeared; conditional FFV variant frequencies stayed within the tested ±2.5 percentage-point band around 20%. The structural argument establishes independence; finite sampling is a regression check, not a proof of randomness quality.
- An in-memory compare-and-set model handled **100 concurrent missing-variant requests with one winning write**. All returned the persisted winner. Repeated reads/nickname changes kept it stable; fixed FFIV and unknown/retired cases also passed.

Full evidence: [assignment-test-results.json](../../level38-sprite-audit-local/variants/assignment-test-results.json). Concurrency simulation is **not a real Prisma/PostgreSQL integration test**; actual transaction and rolling-deployment behavior must be tested when integration is authorized. Production `randomClassId()` remains unchanged.

## 11. Proposed asset and manifest organization

Keep 24 stable class IDs and nested variant records. Do not create class IDs such as `black-mage-faris`.

```text
level38/classes/
  manifest.json
  black-mage/
    bartz/{idle,walk,victory}/...
    lenna/{idle,walk,victory}/...
    galuf/{idle,walk,victory}/...
    faris/{idle,walk,victory}/...
    krile/{idle,walk,victory}/...
  paladin/cecil/...
  dark-knight/cecil/...
  sage/tellah/...
  machinist/cid/...
```

This is a future runtime layout, **not directories added to production**. The audit currently uses `raw/<classId>/<variantId>/<action>.gif` and `normalized/<classId>/<variantId>/<action>/<frame>.png` in its isolated local folder.

The expanded manifest has 24 class records, localized class display names, `validVariantIds`, and per-variant presentation metadata. Each appearance records source game/page/protagonist/classification/attribution/permission, native and normalized dimensions, render scale, anchor, mirror policy, notes and per-frame hashes/bounds/padding/timing. `animations` describes the actual raw source; `runtimeAnimations` separately references source-backed display frames and shared cadence. This separation makes the four single-pose-file exceptions explicit.

Keep one shared manifest and one renderer/frame-selection contract for the future website and OBS consumer. The local review script is a disposable audit fixture, not a second production sprite system. Version assets/manifests independently of participant records, so replacing game art later requires presentation updates rather than class or participant migrations.

Public UI resolves localized **class** names from `classId`. It need not show protagonist names. Owner/debug tools may display `variantId`, asset version and a missing-asset diagnostic. Never allow a client-supplied variant ID to select arbitrary file paths; resolve only catalogue keys.

## 12. Provenance coverage

**312/312 asset records** retain exact source page, exact asset URL, class/job, protagonist, source game, local path, SHA-256, byte size, timestamp and permission status. Of these, 240 are newly retrieved and 72 are prior-audit imports with verified original hashes. The 20 FFV page snapshots were refreshed, and four FFIV class snapshots were copied from the earlier audit. Source HTML identifies the five protagonists in the expected numbered sections; that mapping was checked, not guessed from filenames alone.

Source/site: **VideoGameSprites.net**. Classification: **appears to be original-game sprites presented as archive GIFs, demonstrably enlarged 2×**. Original game creator attribution: **Square**; individual ripper/uploader attribution: **UNKNOWN** on the inspected pages. Source-site attribution is not rightsholder permission. No new licence or legal claim is made; permission remains **UNKNOWN** for every appearance.

Full asset-level provenance: [source-register.json](../../level38-sprite-audit-local/variants/source-register.json). The expanded manifest links each proposed runtime frame back to an actual source action/frame, including standing-frame reuse in the two Thief exceptions. Derived PNGs are local research artifacts and have their own decoded-pixel hashes.

| Class | Source game | Exact source page | Coverage |
| --- | --- | --- | --- |
| `knight` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Knight.html) | 5 appearances / 15 GIFs |
| `dragoon` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Dragoon.html) | 5 appearances / 15 GIFs |
| `monk` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Monk.html) | 5 appearances / 15 GIFs |
| `berserker` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Water/Berserker.html) | 5 appearances / 15 GIFs |
| `thief` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Thief.html) | 5 appearances / 15 GIFs |
| `ninja` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Ninja.html) | 5 appearances / 15 GIFs |
| `samurai` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Samurai.html) | 5 appearances / 15 GIFs |
| `ranger` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Ranger.html) | 5 appearances / 15 GIFs |
| `mystic-knight` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Water/MysticKnight.html) | 5 appearances / 15 GIFs |
| `black-mage` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/BlackMage.html) | 5 appearances / 15 GIFs |
| `white-mage` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/WhiteMage.html) | 5 appearances / 15 GIFs |
| `red-mage` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Water/RedMage.html) | 5 appearances / 15 GIFs |
| `blue-mage` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/BlueMage.html) | 5 appearances / 15 GIFs |
| `time-mage` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Water/TimeMage.html) | 5 appearances / 15 GIFs |
| `summoner` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Water/Summoner.html) | 5 appearances / 15 GIFs |
| `bard` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Bard.html) | 5 appearances / 15 GIFs |
| `dancer` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Dancer.html) | 5 appearances / 15 GIFs |
| `beastmaster` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Beastmaster.html) | 5 appearances / 15 GIFs |
| `geomancer` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Geomancer.html) | 5 appearances / 15 GIFs |
| `chemist` | Final Fantasy V (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Chemist.html) | 5 appearances / 15 GIFs |
| `paladin` | Final Fantasy IV (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy4/Party/Cecil/) | 1 appearances / 3 GIFs |
| `dark-knight` | Final Fantasy IV (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy4/Party/Cecil/) | 1 appearances / 3 GIFs |
| `sage` | Final Fantasy IV (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy4/Party/Tellah/) | 1 appearances / 3 GIFs |
| `machinist` | Final Fantasy IV (SNES) | [Source page](https://www.videogamesprites.net/FinalFantasy4/Party/Cid/) | 1 appearances / 3 GIFs |

## 13. Remaining limitations, files and validation

The model is supported by source retrieval, independent per-combination measurements, complete FFV pose/mirror inspection and isolated assignment tests. Remaining limits:

- Two Thief variants need acceptance of explicitly assembled source-pose cycles, or a later verified replacement source. The raw GIFs themselves are not complete cycles.
- No live browser surface was available. HTML/renderer logic checks and offline frame/GIF artifacts do not establish subjective real-time motion quality, performance or compressed-stream readability.
- GIF source timing is archive timing, not authenticated game-engine timing. Offline previews sample a timeline; exact playback judgment belongs in the local HTML review.
- Foot motion is a simple standing/stride alternation. Robes, short legs and some similar costumes may still read as gliding or remain hard to distinguish without class text.
- No production schema migration, backfill, API change, database concurrency integration test, OBS consumer or shared production renderer was implemented.
- Persistent variants preserve an existing participant identity; they do not recover an expired or lost anonymous identity. Permission remains UNKNOWN.

### Files created

Repository deliverable: **`docs/level38-sprite-variants-audit.md`**. The two earlier research/audit reports remain unchanged.

Local root: `C:/Users/Leo Nifelheim/Documents/creator-website/level38-sprite-audit-local/variants/` — outside the Git repository and public asset tree.

| Files | Purpose |
| --- | --- |
| `raw/` (312 GIFs), `normalized/` (516 PNGs), `sources/` (24 HTML snapshots) | Original archive inputs, lossless normalized research frames and source evidence. |
| `source-register.json`, `technical-summary.json`, `proposed-expanded-manifest.json`, `manifest-data.js` | Provenance, raw exceptions, 104-appearance proposal and local page data. |
| `class-*-review.png` (20), `class-matrix-{1..5}.png`, `protagonist-*-20-jobs.png` (5) | Required class/variant and protagonist/job visual matrices. |
| `animated-*-{walk,victory}.gif` (40), `phase-offsets.json` | Both-facing five-variant animation fixtures with staggered pseudo-random phases. |
| `mixed-crowd-{5,15,30}-1080p.png`, `mixed-crowd-{5,15,30}-walk.gif`, `simulated-crowds.json` | Seeded two-stage random visual simulations. |
| `index.html`, `review-page.js`, `README.md` | Local interactive review, usage notes and explicit verification limits. |
| `assignment-model.cjs`, `test-model.cjs`, `assignment-test-results.json` | Probability and in-memory persistence model evidence. |
| `retrieve.mjs`, `audit.py`, `write_report.py`, `validate.py`, `verify-page.mjs`, `validation-results.json`, `renderer-test-results.json`, `files-index.txt` | Reproduction, pixel/provenance/renderer checks and exact file inventory. |
| `thief-source-diagnostic.png` | Diagnostic of raw standing/stride/cheer source poses for the two exceptions. |

Validation covers 104 pairs, 24 distinct class IDs, five variants for each FFV class, fixed FFIV variants, all 312 hashes, all 516 reductions and alpha/baseline checks, no opaque-pixel loss, all local frame references, exact narrow-crop registration, four source-backed assembled sequences, and 104 distinct standing images. Assignment tests and JavaScript syntax/renderer logic checks are local only; **3,456 renderer-logic combinations** passed using filesystem-backed image/canvas stubs. These cover every class/protagonist view, 5/15/30 crowds, three scales, three actions and frame-timing boundaries, not real browser rendering. The report is checked for whitespace and the final repository status for unrelated changes. No application build or production integration test was run for this documentation-only repository change.

### Full appearance index

Raw counts below are **idle / walk / victory**, preserving the single-frame source exceptions. Every proposed runtime presentation resolves to one standing pose and two walk/victory poses; assembly is named explicitly. Heights are effective native visible heights before 2× rendering.

| classId | variantId | Standing height | Raw frame counts | Runtime basis |
| --- | --- | --- | --- | --- |
| `knight` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `knight` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `knight` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `knight` | `faris` | 24 px | 1/2/2 | Source frame order |
| `knight` | `krile` | 23 px | 1/2/2 | Source frame order |
| `dragoon` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `dragoon` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `dragoon` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `dragoon` | `faris` | 24 px | 1/2/2 | Source frame order |
| `dragoon` | `krile` | 24 px | 1/2/2 | Source frame order |
| `monk` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `monk` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `monk` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `monk` | `faris` | 24 px | 1/2/2 | Source frame order |
| `monk` | `krile` | 24 px | 1/2/2 | Source frame order |
| `berserker` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `berserker` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `berserker` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `berserker` | `faris` | 24 px | 1/2/2 | Source frame order |
| `berserker` | `krile` | 24 px | 1/2/2 | Source frame order |
| `thief` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `thief` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `thief` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `thief` | `faris` | 24 px | 1/1/1 | Standing + supplied stride/cheer |
| `thief` | `krile` | 23 px | 1/1/1 | Standing + supplied stride/cheer |
| `ninja` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `ninja` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `ninja` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `ninja` | `faris` | 24 px | 1/2/2 | Source frame order |
| `ninja` | `krile` | 23 px | 1/2/2 | Source frame order |
| `samurai` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `samurai` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `samurai` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `samurai` | `faris` | 24 px | 1/2/2 | Source frame order |
| `samurai` | `krile` | 23 px | 1/2/2 | Source frame order |
| `ranger` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `ranger` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `ranger` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `ranger` | `faris` | 24 px | 1/2/2 | Source frame order |
| `ranger` | `krile` | 24 px | 1/2/2 | Source frame order |
| `mystic-knight` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `mystic-knight` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `mystic-knight` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `mystic-knight` | `faris` | 24 px | 1/2/2 | Source frame order |
| `mystic-knight` | `krile` | 23 px | 1/2/2 | Source frame order |
| `black-mage` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `black-mage` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `black-mage` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `black-mage` | `faris` | 24 px | 1/2/2 | Source frame order |
| `black-mage` | `krile` | 24 px | 1/2/2 | Source frame order |
| `white-mage` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `white-mage` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `white-mage` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `white-mage` | `faris` | 24 px | 1/2/2 | Source frame order |
| `white-mage` | `krile` | 24 px | 1/2/2 | Source frame order |
| `red-mage` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `red-mage` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `red-mage` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `red-mage` | `faris` | 24 px | 1/2/2 | Source frame order |
| `red-mage` | `krile` | 23 px | 1/2/2 | Source frame order |
| `blue-mage` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `blue-mage` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `blue-mage` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `blue-mage` | `faris` | 24 px | 1/2/2 | Source frame order |
| `blue-mage` | `krile` | 24 px | 1/2/2 | Source frame order |
| `time-mage` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `time-mage` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `time-mage` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `time-mage` | `faris` | 24 px | 1/2/2 | Source frame order |
| `time-mage` | `krile` | 23 px | 1/2/2 | Source frame order |
| `summoner` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `summoner` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `summoner` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `summoner` | `faris` | 24 px | 1/2/2 | Source frame order |
| `summoner` | `krile` | 23 px | 1/2/2 | Source frame order |
| `bard` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `bard` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `bard` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `bard` | `faris` | 24 px | 1/2/2 | Source frame order |
| `bard` | `krile` | 23 px | 1/2/2 | Source frame order |
| `dancer` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `dancer` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `dancer` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `dancer` | `faris` | 24 px | 1/2/2 | Source frame order |
| `dancer` | `krile` | 24 px | 1/2/2 | Source frame order |
| `beastmaster` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `beastmaster` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `beastmaster` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `beastmaster` | `faris` | 24 px | 1/2/2 | Source frame order |
| `beastmaster` | `krile` | 23 px | 1/2/2 | Source frame order |
| `geomancer` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `geomancer` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `geomancer` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `geomancer` | `faris` | 24 px | 1/2/2 | Source frame order |
| `geomancer` | `krile` | 24 px | 1/2/2 | Source frame order |
| `chemist` | `bartz` | 24 px | 1/2/2 | Source frame order |
| `chemist` | `lenna` | 24 px | 1/2/2 | Source frame order |
| `chemist` | `galuf` | 24 px | 1/2/2 | Source frame order |
| `chemist` | `faris` | 24 px | 1/2/2 | Source frame order |
| `chemist` | `krile` | 23 px | 1/2/2 | Source frame order |
| `paladin` | `cecil` | 24 px | 1/2/2 | Source frame order |
| `dark-knight` | `cecil` | 24 px | 1/2/2 | Source frame order |
| `sage` | `tellah` | 24 px | 1/2/2 | Source frame order |
| `machinist` | `cid` | 23 px | 1/2/2 | Source frame order |
