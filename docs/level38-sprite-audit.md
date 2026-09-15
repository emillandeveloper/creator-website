# LEVEL 38 — local sprite asset audit

Audit date: 2026-09-15. Roster: 20 FFV SNES jobs using Bartz, plus FFIV SNES Cecil (Paladin/Dark Knight), Tellah (Sage) and Cid (Machinist).

**Recommendation:** retain all 24 candidates for the next visual review. Use a recovered 16×24 pixel canvas, a shared foot anchor and **2× integer rendering: 48 px standing height, 46 px for Cid**. All candidates have genuine source-listed two-frame walks and victories; none needs a fabricated attack-based walk.

**Verification boundary:** 190 GIFs were retrieved and 307 decoded frames measured. Static comparisons, both walk poses, mirrored poses, victory poses and transparency composites were inspected. Local HTML and animated GIF tests were created. No browser surface was available in this session, so real-time browser playback, subjective continuous-motion review and OBS performance are **not verified**. The HTML was syntax/logic checked separately; that is not a browser-rendering test. Recommendations about travel speed and cadence remain provisional pending playback.

Application code, class definitions, participants, database and configuration are unchanged. No commit, push, deployment or Twitch enablement was performed.

## 1. Exact measurements

The archive GIFs are already enlarged: **all 307 frames consist entirely of exact 2×2 duplicate pixel blocks**. Every frame can be reduced by two and re-enlarged with identical RGBA bytes. This establishes the effective native pixel grid used below. It does not independently authenticate the files against a game ROM.

Do not treat the downloaded 32×48 canvas as a native 32×48 sprite and enlarge it twice again. That would produce a 96 px character instead of the intended 48 px.

All selected standing poses are a single frame. All selected walk and victory animations have two distinct frames. Frame order is **0 → 1 → repeat**, as decoded from the GIF. Walk frame 0 is pixel-identical to the standing pose for every class. Standing visible alpha bounds fill the effective canvas: `[0,0,16,24)` except Cid `[0,0,16,23)`.

| Stable/proposed ID | Downloaded idle/walk/victory canvas | Recovered native canvas | Visible height: native / 2× | Walk frames / cycle | Victory frames / cycle |
| --- | --- | --- | --- | --- | --- |
| `knight` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `dragoon` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `monk` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `berserker` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `thief` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `ninja` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `samurai` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `ranger` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `mystic-knight` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `black-mage` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `white-mage` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `red-mage` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `blue-mage` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `time-mage` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `summoner` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `bard` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `dancer` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `beastmaster` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `geomancer` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `chemist` | 32×48 | 16×24 | 24 / 48 px | 2 / 400 ms | 2 / 500 ms |
| `paladin` | 32×48 | 16×24 | 24 / 48 px | 2 / 340 ms | 2 / 400 ms |
| `dark-knight` | 32×48 | 16×24 | 24 / 48 px | 2 / 340 ms | 2 / 400 ms |
| `sage` | 32×48 | 16×24 | 24 / 48 px | 2 / 340 ms | 2 / 400 ms |
| `machinist` | 32×46 | 16×23 | 23 / 46 px | 2 / 340 ms | 2 / 400 ms |

Timing is measured from the archive GIF delay records, not inferred original game-engine timing. FFV walk frames are 200 ms each, 400 ms per cycle (5 frame changes/s); FFIV frames are 170 ms each, 340 ms per cycle (~5.88 changes/s). FFV victories use 250 ms per frame; FFIV victories use 200 ms. A one-frame standing GIF's stored delay does not make it an animated idle.

Exact raw measurements, per-frame bounds, disposal metadata, alpha values, durations and hashes: [measurements.json](../../level38-sprite-audit-local/measurements.json). Raw frames are preserved separately from normalized PNGs.

### Baseline and crop registration

Use a normalized 16×24 canvas and foot anchor **(8,24)** in pixel-edge coordinates: row 23 is the final image row and y=24 is the shared line immediately beneath it. Main idle/walk/victory frames have the same source canvas within each class, and every walk frame reaches the same bottom row. This is a stable sprite registration anchor, not an anatomically measured ankle or a claim of locked foot contact.

Cid's recovered canvas is 16×23; its source anchor is (8,23). Add one transparent row **above** it to produce a 16×24 normalized canvas. Keep its visible height at 23 pixels; do not stretch it to 24. All other selected main poses need offset (0,0). No frame is independently trimmed or recentered.

Optional action crops differ: Thief hit and Bard defend are 15×24; Berserker hit, Dancer defend, Dark Knight defend and Tellah defend are 16×23; Cid defend is 16×22. Other retrieved optional poses follow their class's usual canvas. Their generated bottom alignment is a preview proposal, with original crop registration still flagged for review before optional-action integration.

## 2. Transparency results

**Pass for the retrieved files:** all 307 decoded frames contain alpha values only **0 and 255**. Transparent pixels remain transparent across both animation frames after GIF disposal/compositing. No chroma-key cleanup, palette replacement or anti-aliased resizing was needed. The normalized PNGs preserve binary alpha and exact sprite colors.

The source palettes contain green in transparent entries. This is not a green rectangle to remove from the art; respecting the GIF transparency index eliminates it. Dark outlines are opaque sprite pixels and should remain intact. FFIV uses a harsher near-black outline; some FFV dark edging is softer. These are visual differences, not alpha failures.

Inspected all 24 across black, white, magenta and green composites: [alpha-backgrounds.png](../../level38-sprite-audit-local/alpha-backgrounds.png). No rectangular matte or obvious colored fringe appeared. Black outlines lose some separation on black; light costumes read more strongly there. The HTML also offers checkerboard and transparent canvas modes, which remain browser-playback checks for later review.

## 3. Walk-cycle results

**24/24 have two distinct, source-labelled walk frames.** These are economical battle advance cycles: a standing pose alternates with a stride pose. They are usable candidates for stylized horizontal travel, not a complete naturalistic gait with independently drawn left/right foot-contact phases. No attack frames were substituted and no new art was synthesized.

Inspect [walk frames 1–12](../../level38-sprite-audit-local/walk-native-filmstrip-1.png) and [walk frames 13–24](../../level38-sprite-audit-local/walk-native-filmstrip-2.png), each showing source order, mirrored order and silhouette. The corresponding [all-24 walking GIF](../../level38-sprite-audit-local/all-24-walk.gif) moves every class horizontally. The [local test page](../../level38-sprite-audit-local/index.html) has continuous travel, direction changes, pause/50 ms stepping, native scales and source/shared cadence controls.

Observed from frame inspection:

- Exposed-leg jobs show an obvious stance-to-stride change. Robed jobs, especially White Mage, Summoner and Sage, show less visible foot motion; their motion reads more as shuffling or gliding.
- The canvases and bottom alpha extent are stable; there is no frame-dependent vertical registration drift in the chosen walks.
- A two-pose loop cannot guarantee a foot remains planted while the whole sprite translates. Sliding is a real presentation compromise, particularly at high travel speeds. Do not describe these assets as foot-locked.
- The FFIV archive cadence is about 18% faster than FFV. The manifest retains it; a shared **200 ms per walk frame** is proposed for the future crowd, with phase offsets so characters do not march in synchronization.
- Start playback review at **24 rendered px/s** and compare 12, 36 and 60 using the page. This is a proposed test speed, not an approved measured optimum. Do not compensate for excessive speed by inventing intermediate art.

### Facing, capes, weapons and mirroring

The selected battle travel files face left. No independently authored right-facing travel cycle was retrieved. `AttackR` and `AttackL` are different source attack labels; they do not establish left/right walk availability.

Mirrored frame inspection found no text, emblem lettering or detached component that makes ordinary cosmetic rightward travel unacceptable. Mirroring reverses clothing overlaps, head/hair direction, cape details and any implied handedness. Approve it **only as cosmetic facing**, not as a representation of canonical sword/shield hands or directional combat.

The chosen walks do not include a separate weapon/shield equipment layer. They therefore cannot establish spear, bow, gun or shield bounds for a later equipment system. Existing costume edges remain inside 16×24; broad hats and pelt details are not clipped by normalization. Optional attack files do not prove that all game weapon effects are included.

## 4. FFIV/FFV visual compatibility

**Accept as a controlled four-character extension**, subject to actual motion review. The shared effective pixel grid, short proportions and baseline work without distortion. FFIV outlines and palettes are perceptibly different, but none of the four donors breaks the family as strongly as an isometric or higher-density sprite would.

The comparisons at [1×](../../level38-sprite-audit-local/comparison-native-1x.png), [2×](../../level38-sprite-audit-local/comparison-native-2x.png) and [3×](../../level38-sprite-audit-local/comparison-native-3x.png) preserve native pixels and show original/mirrored poses side by side.

| Comparison | Visual finding |
| --- | --- |
| Knight / Paladin / Dark Knight | Knight's red/orange armor and exposed brown head differ from Paladin's light hair/armor and Dark Knight's enclosed blue-purple helmet. Keep all three. |
| Thief / Ninja | Green open-faced Thief versus blue masked Ninja is a clear distinction. Both retain a compact agile silhouette. |
| Mage group | Black Mage's broad brim/dark face, Red Mage's red hat, Mystic Knight's pale turban and Time Mage's orange headwear read distinctly. Blue Mage relies partly on costume colors and mask/cape. |
| White Mage | Bartz wears white/red clothing with exposed brown hair rather than a full iconic white hood. Acceptable within the controlled Bartz set; class text remains useful. |
| Bard / Summoner | The closest overlap: brown heads and green clothing. Summoner's longer cloak/head ornament help, but their monochrome silhouettes are less distinct than their labels imply. |
| Sage | Tellah's white hair/beard and purple robe add an older caster identity. His outline is darker than FFV's; keep rather than replacing him with another FFV recolor. |
| Machinist | Cid's stockier body, beard and cap stand apart. He is a convincing engineer interpretation, less clearly a gun-wielding Machinist. Preserve his one-pixel shorter stature. |
| Hats/pelts | Black Mage and Red Mage are broad; Time Mage and Summoner have small upper details; Berserker has a substantial animal headdress. All fit the recovered 16×24 main canvas. |

Do not rely on silhouettes alone to identify all 24. Color and readable class labels remain part of the design. No recoloring or costume editing was done in this audit.

## 5. Rejected candidates and remaining compromises

**No selected class candidate is rejected for static compatibility or missing main animations.** All 24 stay on the provisional art roster. This is not a production-ready motion or permission sign-off.

Rejected presentation approaches: treating downloaded GIF pixels as native pixels; stretching Cid; importing smaller FFIV map sprites; faking walks from attacks; assigning one blanket directional-combat mirror policy; using all source GIF cadences without acknowledging the FFIV difference.

Remaining compromises are simple two-pose travel, less obvious feet under robes, Bard/Summoner similarity, the exposed-haired White Mage, Cid's engineer interpretation, slight FFIV palette/outline mismatch, and unknown rightsholder permission. Source timing is archive timing; original game timing was not established.

## 6. Recommended final 24 and optional poses

Keep the user's proposed **20 FFV + 4 FFIV** roster. Necromancer is not introduced. The 24 measurement rows above are the selected list; source character and IDs are recorded in sections 9–11.

Attacks below are the retrieved right-labelled source attacks; all corresponding left-labelled files were also retrieved with the same frame count/timing. “Cast” means the archive's Cast/Magic file, not a claim that the game grants that job every spell.

| Class ID | Attack frames / source cycle | Cast frames / source cycle | Class-specific audit note |
| --- | --- | --- | --- |
| `knight` | 2 / 400 ms | 2 / 400 ms | Red armor and exposed head distinguish from Cecil. Back/shoulder detail swaps under mirroring. |
| `dragoon` | 2 / 400 ms | 1 / 200 ms | Blue crested helmet; wide silhouette. No spear is baked into the selected travel frames. |
| `monk` | 2 / 400 ms | 2 / 400 ms | Bare arms and contrasting trousers; hair/face direction reverses. |
| `berserker` | 2 / 400 ms | 2 / 400 ms | Large animal headdress but same 24-pixel height. Ears and pelt enlarge silhouette. |
| `thief` | 2 / 400 ms | 2 / 400 ms | Green head covering and open face; clear contrast with masked Ninja. |
| `ninja` | 2 / 400 ms | 2 / 400 ms | Blue face covering; belt and trailing cloth reverse under mirroring. |
| `samurai` | 2 / 400 ms | 2 / 400 ms | Red/black armor with yellow helmet detail; head profile differs from Knight. |
| `ranger` | 2 / 400 ms | 2 / 400 ms | Green feathered cap. No bow in travel frames; retain text identity. |
| `mystic-knight` | 2 / 400 ms | 2 / 400 ms | Pale turban and purple/green cloth. Turban overhang fits 16-pixel canvas. |
| `black-mage` | 2 / 400 ms | 2 / 400 ms | Wide brim, concealed dark face and cyan robe. Black outline weaker on black backdrop. |
| `white-mage` | 2 / 400 ms | 2 / 400 ms | Bartz has exposed brown hair and white/red clothing, not the archetypal full white hood. |
| `red-mage` | 2 / 400 ms | 2 / 400 ms | Broad red hat and red coat. Hat/coat orientation reverses. |
| `blue-mage` | 2 / 400 ms | 2 / 400 ms | Blue outfit, mask and red cape details. Handed costume reversal is cosmetic only. |
| `time-mage` | 2 / 400 ms | 2 / 400 ms | Tall orange headwear and purple robe; distinct from Black Mage at 2x. |
| `summoner` | 2 / 400 ms | 2 / 400 ms | Green cloak and head ornament. Fine ornament is less readable than broad robe shape. |
| `bard` | 2 / 400 ms | 2 / 400 ms | Green coat and exposed brown hair; overlaps Summoner in broad silhouette. No instrument in travel frames. |
| `dancer` | 2 / 400 ms | 2 / 400 ms | Red/open shirt and dark trousers; movement is ordinary two-pose walk, not a dance cycle. |
| `beastmaster` | 2 / 400 ms | 2 / 400 ms | Pale spotted pelt distinguishes from green-robed jobs; no pet or whip in travel frames. |
| `geomancer` | 2 / 400 ms | 2 / 400 ms | Green hood/pom and light tunic; short silhouette details remain within 24 pixels. |
| `chemist` | 2 / 400 ms | 2 / 400 ms | Yellow cap, green band and pack-like detail. Items are not needed to identify base costume. |
| `paladin` | 2 / 240 ms | 2 / 300 ms | Pale armor, long light hair and dark blue details. Slightly harsher near-black outline than FFV. |
| `dark-knight` | 2 / 240 ms | Not listed as Magic/Cast | Fully enclosed blue-purple helmet. Keep existing dark-knight stable ID. No magic GIF listed. |
| `sage` | 2 / 240 ms | 2 / 300 ms | Tellah has white hair/beard and purple robe; face reads older than FFV casters. Broader FFIV outlining. |
| `machinist` | 2 / 240 ms | Not listed as Magic/Cast | Cid is naturally one pixel shorter, broad and strongly bearded. Engineer interpretation, not a generic gunner. No magic GIF listed. |

Dragoon's cast is a single pose, not an animated cycle. No conventional Magic/Cast file was retrieved for Cecil Dark Knight or Cid. The Cecil page contains other character-specific actions, which were not substituted for a standard cast or needed for the chosen celebration.

## 7. OBS scale recommendation

**2× recovered native pixels remains the recommended crowd scale at 1080p:** 32×48 rendered canvas, or 46 visible pixels for Cid inside that canvas. This is 1× the downloaded GIF dimensions. Native 1× is too small for comfortable class recognition on a full 1080p stage. Native 3× improves identification but occupies more stream content; reserve it for selected-character emphasis or a deliberately larger overlay.

Static full-1080p scenes were generated for **1, 5, 15 and 30 characters at 1×, 2× and 3×**. The 2× scenes were visually inspected in full, alongside the per-class 1×/2×/3× comparison sheets. No image was distorted to force equal heights.

| Crowd | 2× static result | Artifact |
| --- | --- | --- |
| 1 | Small but crisp as an unobtrusive overlay character; 3× is a reasonable optional spotlight size. | [1080p / 1](../../level38-sprite-audit-local/obs-1-native-2x-1080p.png) |
| 5 | Bodies and short class labels have ample space. | [1080p / 5](../../level38-sprite-audit-local/obs-5-native-2x-1080p.png) |
| 15 | One row remains visually separated at the test spacing. Permanent participant names would need a different spacing budget. | [1080p / 15](../../level38-sprite-audit-local/obs-15-native-2x-1080p.png) |
| 30 | Two rows of 15 preserve distinct bodies and baseline separation. Classes repeat for the final six characters; this simulates participants, not 30 unique jobs. | [1080p / 30](../../level38-sprite-audit-local/obs-30-native-2x-1080p.png) |

The offline crowd GIFs compare [source cadence](../../level38-sprite-audit-local/crowd-30-source-timing.gif) and [shared cadence](../../level38-sprite-audit-local/crowd-30-uniform-timing.gif). They are short looping review artifacts, not an OBS performance benchmark; a loop boundary can restart archive animation phase. The HTML uses continuous time and independent phase offsets in crowd mode.

This static spacing is not a proposed production collision algorithm. Moving-background readability, 720p stream compression, CPU/GPU load and long-duration OBS playback remain untested. Locally shared PNG frames are technically lightweight candidates; no measured FPS claim is made.

## 8. Celebration recommendation

Use the **existing victory GIF for every class**. All 24 provide two distinct frames. Hands/arms rise or change stance in the supplied art; no standing bounce fallback, generated jump or new sprite art is necessary.

Recommend a short three-cycle celebration, then return to the original standing frame. A shared 250 ms per frame would last **1.5 seconds** for three two-frame cycles. Retain source durations in the manifest so this is an explicit presentation override: FFV already uses 250 ms, while FFIV uses 200 ms.

Victory canvas/baseline registration is stable, including Cid's top padding. Inspection: [victory poses 1–12](../../level38-sprite-audit-local/celebrate-native-filmstrip-1.png), [13–24](../../level38-sprite-audit-local/celebrate-native-filmstrip-2.png), and [all-24 victory preview](../../level38-sprite-audit-local/all-24-celebrate.gif). Full live playback remains part of the review boundary described above.

## 9. Proposed normalized manifest

Full proposal: [proposed-manifest.json](../../level38-sprite-audit-local/proposed-manifest.json). It contains all 24 classes and **is outside the application repository**. Relative asset paths resolve against its containing local audit folder; they are not public website paths.

Each class records stable/proposed ID; ES/EN display names; asset family and game; exact source page; source character/site/classification and attribution; raw local candidate path; downloaded and recovered dimensions; standing visible height; normalized 16×24 canvas; render scale 2; source and normalized anchors; padding offset; idle/walk/victory frame indices and local files; measured per-frame source timing; per-animation source URL and SHA-256; mirror policy; permission status; and class-specific notes.

Main animation contract:

| Field | Proposal |
| --- | --- |
| `classId` | Existing persistent ID where available; new IDs listed below remain proposals. |
| `nativeFrameDimensions` | Effective 16×24 grid, or Cid 16×23, recovered losslessly from doubled files. |
| `normalizedFrameDimensions` | `[16,24]` for every class. |
| `renderScale` | `2`, relative to the recovered grid. |
| `footAnchor` | `[8,24]`, fixed across the main animation set. |
| `walkFrames` | `[0,1]`; repeating, preserved source order. |
| `idleFrames` | `[0]`; static standing. |
| `celebrationFrames` | `[0,1]`; future finite-repeat policy, not endless celebration. |
| `mirrorPolicy` | Cosmetic horizontal facing allowed; canonical equipment handedness and attack direction not asserted. |
| `permissionStatus` | `UNKNOWN — no rightsholder permission established`. |

Optional attack/cast/defend/hit data is included for research, with crop-registration review explicitly pending. It must not be treated as already approved equipment/combat integration. The original GIFs, full decoded frames and normalized PNGs remain separate so the reduction/padding is auditable and reversible.

## 10. Safe stable-ID expansion strategy

Inspected `src/modules/level38/classes.ts`. Exactly **16 current IDs** exist:

`knight`, `dark-knight`, `dragoon`, `monk`, `thief`, `ninja`, `samurai`, `ranger`, `black-mage`, `white-mage`, `red-mage`, `blue-mage`, `summoner`, `bard`, `dancer`, `beastmaster`.

Exactly **eight proposed additions** complete this roster:

`berserker`, `mystic-knight`, `time-mage`, `geomancer`, `chemist`, `paladin`, `sage`, `machinist`.

There is **no current `necromancer` ID** in the inspected module. Do not introduce it. No ID deletion or migration is required to express this proposed expansion.

| ID | English | Spanish | Status |
| --- | --- | --- | --- |
| `knight` | Knight | Caballero | Existing — retain unchanged |
| `dragoon` | Dragoon | Dragoon | Existing — retain unchanged |
| `monk` | Monk | Monje | Existing — retain unchanged |
| `berserker` | Berserker | Berserker | Proposed addition only |
| `thief` | Thief | Ladrón | Existing — retain unchanged |
| `ninja` | Ninja | Ninja | Existing — retain unchanged |
| `samurai` | Samurai | Samurái | Existing — retain unchanged |
| `ranger` | Ranger | Explorador | Existing — retain unchanged |
| `mystic-knight` | Mystic Knight | Caballero místico | Proposed addition only |
| `black-mage` | Black Mage | Mago negro | Existing — retain unchanged |
| `white-mage` | White Mage | Mago blanco | Existing — retain unchanged |
| `red-mage` | Red Mage | Mago rojo | Existing — retain unchanged |
| `blue-mage` | Blue Mage | Mago azul | Existing — retain unchanged |
| `time-mage` | Time Mage | Mago del tiempo | Proposed addition only |
| `summoner` | Summoner | Invocador | Existing — retain unchanged |
| `bard` | Bard | Bardo | Existing — retain unchanged |
| `dancer` | Dancer | Bailarín | Existing — retain unchanged |
| `beastmaster` | Beastmaster | Domador | Existing — retain unchanged |
| `geomancer` | Geomancer | Geomante | Proposed addition only |
| `chemist` | Chemist | Químico | Proposed addition only |
| `paladin` | Paladin | Paladín | Proposed addition only |
| `dark-knight` | Dark Knight | Caballero oscuro | Existing — retain unchanged |
| `sage` | Sage | Sabio | Proposed addition only |
| `machinist` | Machinist | Maquinista | Proposed addition only |

The existing module resolves presentation from stable IDs, defaults missing `enabled` to true, and excludes disabled entries from `randomClassId()`. Its comments explicitly call for preserving retired definitions for existing assignments. Preserve every existing ID and existing display name; the new ES labels above are proposals.

In a later authorized implementation, add the eight catalogue definitions and resolve sprite assets through presentation metadata. Decide new-assignment eligibility explicitly: because `enabled` defaults to true, adding entries blindly would immediately alter the random pool. Keep new entries disabled until assets and the roster decision are approved, then enable intentionally. Existing participant IDs remain untouched; do not reroll, reseed or rewrite participants.

No database migration is performed or prescribed by this audit. A later implementation should check any validation/schema allowlists before enabling new IDs. Preserve the existing owned demo/placeholder path as a fallback if a sprite is removed. Family names, archive URLs and named-game-character identities must never replace participant class IDs.

## 11. Source and permission register

All retrieved assets came from **VideoGameSprites.net** source pages already identified in the research phase. Classification: **appears to be an original-game rip presented as an archive GIF**, including demonstrable 2× enlargement. The listed source games are FFV/FFIV SNES; this audit did not independently authenticate ROM extraction or every palette choice.

Original game creator attribution: **Square**. Archive/site attribution: **VideoGameSprites.net**. Individual ripper/uploader/artist attribution: **UNKNOWN** on the inspected pages. Neither archive credit nor attribution is a reuse licence.

| Class ID | Game / character | Source page | Local raw directory | Rightsholder permission |
| --- | --- | --- | --- | --- |
| `knight` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Knight.html) | `raw/knight/` | UNKNOWN |
| `dragoon` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Dragoon.html) | `raw/dragoon/` | UNKNOWN |
| `monk` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Monk.html) | `raw/monk/` | UNKNOWN |
| `berserker` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Water/Berserker.html) | `raw/berserker/` | UNKNOWN |
| `thief` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Thief.html) | `raw/thief/` | UNKNOWN |
| `ninja` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Ninja.html) | `raw/ninja/` | UNKNOWN |
| `samurai` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Samurai.html) | `raw/samurai/` | UNKNOWN |
| `ranger` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Ranger.html) | `raw/ranger/` | UNKNOWN |
| `mystic-knight` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Water/MysticKnight.html) | `raw/mystic-knight/` | UNKNOWN |
| `black-mage` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/BlackMage.html) | `raw/black-mage/` | UNKNOWN |
| `white-mage` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/WhiteMage.html) | `raw/white-mage/` | UNKNOWN |
| `red-mage` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Water/RedMage.html) | `raw/red-mage/` | UNKNOWN |
| `blue-mage` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/BlueMage.html) | `raw/blue-mage/` | UNKNOWN |
| `time-mage` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Water/TimeMage.html) | `raw/time-mage/` | UNKNOWN |
| `summoner` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Water/Summoner.html) | `raw/summoner/` | UNKNOWN |
| `bard` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Bard.html) | `raw/bard/` | UNKNOWN |
| `dancer` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Dancer.html) | `raw/dancer/` | UNKNOWN |
| `beastmaster` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Beastmaster.html) | `raw/beastmaster/` | UNKNOWN |
| `geomancer` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Geomancer.html) | `raw/geomancer/` | UNKNOWN |
| `chemist` | Final Fantasy V (SNES) — Bartz | [Exact page](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Chemist.html) | `raw/chemist/` | UNKNOWN |
| `paladin` | Final Fantasy IV (SNES) — Cecil | [Exact page](https://www.videogamesprites.net/FinalFantasy4/Party/Cecil/) | `raw/paladin/` | UNKNOWN |
| `dark-knight` | Final Fantasy IV (SNES) — Cecil | [Exact page](https://www.videogamesprites.net/FinalFantasy4/Party/Cecil/) | `raw/dark-knight/` | UNKNOWN |
| `sage` | Final Fantasy IV (SNES) — Tellah | [Exact page](https://www.videogamesprites.net/FinalFantasy4/Party/Tellah/) | `raw/sage/` | UNKNOWN |
| `machinist` | Final Fantasy IV (SNES) — Cid | [Exact page](https://www.videogamesprites.net/FinalFantasy4/Party/Cid/) | `raw/machinist/` | UNKNOWN |

For each retrieved GIF, [source-register.json](../../level38-sprite-audit-local/source-register.json) retains the **exact asset URL**, page URL, local path, retrieval timestamp, byte size and SHA-256. The page HTML is preserved under `sources/<classId>.html`. Source HTML snapshots are evidence files, not scripts loaded by the test page.

No explicit rightsholder grant for the LEVEL 38 website or OBS use was established: **UNKNOWN for all 24**. Site access, technical transparency, an uploader credit or source-site terms do not establish commercial permission. The Spriters Resource terms discussed in the earlier report are not a licence for these VGS files and are not substituted for game-rightsholder permission. No legal determination is made here.

## 12. Files created, validation and review steps

Repository deliverable: `docs/level38-sprite-audit.md`. The pre-existing untracked `docs/level38-sprite-research.md` remains unchanged.

Local artifacts are isolated at:

`C:/Users/Leo Nifelheim/Documents/creator-website/level38-sprite-audit-local/`

This folder is a **sibling of the Git repository**, not inside `public`, `src`, `dist` or a production route. No `.gitignore`, server configuration or production build script was changed.

| Files / directories | Purpose |
| --- | --- |
| `index.html`, `audit-page.js`, `manifest-data.js` | Local-only comparison/walking/celebration and 1080p crowd page. No remote image requests; CSP disables network connections. |
| `raw/<classId>/*.gif` | 190 retrieved original archive files; never overwritten with processed sprites. |
| `sources/<classId>.html`, `source-register.json` | 24 page snapshots and per-asset source/hash/attribution records. |
| `frames/<classId>/<action>/*.png` | 307 decoded frames at downloaded dimensions. |
| `normalized/<classId>/<action>/*.png` | 307 losslessly recovered/padded research frames at 16×24. |
| `measurements.json`, `proposed-manifest.json` | Raw exact measurements and normalized proposal. |
| `comparison-native-{1,2,3}x.png`, `alpha-backgrounds.png` | Standing/facing scale and transparency inspections. |
| `{walk,celebrate,attack-right,cast}-native-filmstrip-{1,2}.png` | Source-order normal/mirrored/silhouette frame comparisons. |
| `obs-{1,5,15,30}-native-{1,2,3}x-1080p.png` | Twelve static 1080p crowd/scale fixtures. |
| `all-24-walk.gif`, `all-24-celebrate.gif` | Offline animated previews with all 24 candidates. |
| `crowd-30-{source,uniform}-timing.gif` | Source/shared-cadence offline crowd previews. |
| `{walk,celebrate}-snapshot-*.png` | Time samples from generated previews. |
| `comparison-standing-3x.png`, `filmstrip-*.png` | Early diagnostics at 3× the downloaded files (6× effective native pixels); not recommended render-scale examples. |
| `retrieve.mjs`, `measure.py`, `build_audit.py`, `write_report.py`, `validate.py`, `verify-page.mjs`, `README.md`, `files-index.txt` | Reproducibility, local verification, usage notes and exact artifact inventory. |

Validation checks cover complete 24-class selection, all requested main animations, 190 source hashes, 307 exact 2× block reductions, 307 binary-alpha normalized frames, stable main-pose baselines, valid local manifest paths, preservation of the 16 existing IDs, eight proposed additions and absence of Necromancer. JavaScript syntax and 180 renderer-logic combinations (using filesystem-backed image/canvas stubs, not a browser) pass; report whitespace is checked. No application build/test run is needed to validate a documentation-only repository change; this does not claim application or OBS integration testing.

Open `index.html` locally to review motion; if a browser restricts file-page scripts, the README provides a loopback-only server command. No server is started by the deliverable. Review all-24 lanes at source/shared cadence, both facings and 24/36/60 px/s; then crowd counts 1/5/15/30 at 2× and 3×. Final production integration should wait for real-time motion/OBS review and the unresolved permission decision. This audit itself makes no integration or publication changes.
