# LEVEL 38 — RPG/JRPG class sprite research

Research date: 2026-09-15. Scope: source discovery and recommendations only.

No application, database, roster or asset changes accompany this report. No sprite files were downloaded, saved, processed or integrated. Links below lead to source pages, not remotely embedded images.

Evidence labels: **confirmed** means stated by an archive page or its HTML; **estimate** means a planning assumption, not a pixel measurement; **UNKNOWN** means not established. Some Spriters Resource pages returned HTTP 403, so their indexed page metadata was used. No binary sprite inspection was performed. Consequently, this is a source-backed shortlist, not a claim that every candidate has passed animation, transparency or pixel-level visual QA.

## 1. Executive recommendation

Use **Final Fantasy V, original SNES version**, as the first family to evaluate for integration. It supplies exact job identities for **19 of the 24 provisional classes**, with five protagonist variants per job. The linked job pages explicitly catalogue walking, attack, casting and victory GIFs. That combination is stronger evidence for a coherent walking crowd than merely finding a recognizable standing sprite.

Use **Final Fantasy: Record Keeper** as the second complete-family option. Its catalogue covers 20 provisional classes through generic jobs; Cecil (Paladin) and Edgar offer two further same-game candidates. Its potential **22/24 coverage** beats FFV, but complete walking cycles have not been verified for those 22. Coverage is an identity count, not an animation-readiness count. Sources: [FFV party catalogue](https://www.videogamesprites.net/FinalFantasy5/Party/), [Record Keeper catalogue](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/), and the individual pages below.

Do not assemble a 24-character release by accepting visibly incompatible donors. Recommend a **20-class FFV art target: the 19 direct matches plus Chemist**, with Paladin, Dark Knight and Machinist reserved for a tightly controlled extension. Sage is optional; Necromancer remains unresolved within the recommended family. This is not a proposal to remove or reassign existing participants.

**Target presentation:** approximately **48 pixels of standing character height at 1080p**, using integer enlargement and a shared foot baseline. Final scale depends on measured native frames. Licensing remains unresolved for commercial-game rips; none is labelled cleared for LEVEL 38 publication.

## 2. Best overall sprite family — Final Fantasy V, SNES

The attraction is a consistent vocabulary of small bodies, exaggerated hats, helmets and costumes. Choosing Bartz as the initial comparison set controls the underlying body design; Faris, Lenna, Galuf and Krile provide alternatives without changing games. They need not become participant-facing character names.

All 19 linked job pages in section 5 were checked as HTML. Each lists all five protagonists and 145 image items. That is **29 displayed items per protagonist, not 29 unique frames**: the listings include animated GIFs and status transformations. For example, the [Knight page](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Knight.html) names normal walk, victory, defend, hit, wounded, attack and cast files. Mini/toad walking entries must not be mistaken for additional normal walking directions.

The alternative archive provides consolidated PNG sheets: [Bartz](https://www.spriters-resource.com/snes/ff5/asset/31541/) is **700 × 658**, and [Faris](https://www.spriters-resource.com/snes/ff5/asset/31543/) is **700 × 655**. These are whole-sheet dimensions, not character dimensions or extraction grids.

The main limitation is the missing five jobs. Also, an expressive battle advance can read differently from a side-on stroll. The normal walk GIF must eventually be watched for sustained travel before approving it for OBS. Long capes, shields and attack weapons require individual bounds and mirroring checks.

## 3. Second-best family — Final Fantasy: Record Keeper, mobile

Record Keeper redraws characters from multiple Final Fantasy titles within one game’s compact pixel language. Use the **Record Keeper versions throughout**, not original FFIV/FFT sprites simply because the characters have the same names.

The generic catalogue includes Knight, Dark Knight, Dragoon, Monk, Berserker, Thief, Ninja, Samurai, Ranger, Spellblade, Black Mage, White Mage, Red Mage, Blue Mage, Time Mage, Summoner, Sage, Bard, Dancer and Beastmaster. Spellblade maps naturally to Mystic Knight. Geomancer and Necromancer lack convincing entries in that generic list. [Source catalogue](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/).

Individual examples substantiate the family rather than only its job names:

| Candidate | Whole PNG sheet | Use |
| --- | --- | --- |
| [Knight](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/65369/) | 256 × 256 | Generic armored baseline |
| [White Mage](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/sheet/65394/) | 256 × 256 | Robed baseline |
| [Bard](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/65356/) | 256 × 256 | Support-class comparison |
| [Spellblade](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/78345/) | 256 × 256 | Mystic Knight equivalent |
| [Sage](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/208280/) | 256 × 256 | Exact Sage identity |
| [Cecil, Paladin](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/65373/) | 128 × 256 | Named Paladin candidate |
| [Edgar](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/71117/) | 256 × 256 | Machinist/engineer candidate |
| [Edgar, Gerad costume](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/141009/) | 256 × 256 | Same-family Machinist fallback |

A 256-pixel sheet edge does **not** establish 32-pixel cells, 64 frames or a complete walk cycle. Those details remain UNKNOWN. This family could become the first choice if a later permitted animation audit verifies consistent travel for the intended roster.

## 4. Hybrid fallback strategy and alternatives

Prefer this order:

1. Another protagonist in the same FFV job.
2. A small, explicitly reviewed **FFIV SNES battle-sprite** extension: Cecil for Paladin/Dark Knight, Cid for an engineer-like Machinist, optionally Tellah for Sage.
3. An entirely Record Keeper roster if its animation audit succeeds.
4. Original commissioned additions or a replacement family with an explicit suitable licence, if gaps or permissions prevent using the selected rips.

FFIV donor pages distinguish map sprites from battle sprites. Do not combine the smaller map presentation with FFV battle bodies. [Cecil](https://www.videogamesprites.net/FinalFantasy4/Party/Cecil/), [Cid](https://www.videogamesprites.net/FinalFantasy4/Party/Cid/) and [Tellah](https://www.videogamesprites.net/FinalFantasy4/Party/Tellah/) each list normal battle walking as well as front/left/back map walking. Similar era and compact presentation make them plausible donors, **not verified pixel-perfect matches**.

Other families were compared rather than dismissed solely for being different:

| Family and exact source catalogue | Coverage assessment against the 24 | Coherence and reason not ranked first |
| --- | --- | --- |
| [Final Fantasy Tactics, PlayStation](https://www.spriters-resource.com/playstation/fft/) plus [War of the Lions, PSP](https://www.spriters-resource.com/psp/finalfantasytacticsthewarofthelions/) | PS1 generics provide 14 direct/name-equivalent matches, counting Archer as Ranger. WotL Dark Knight makes 15. Mustadio, Agrias and Beowulf could extend this to 18 through character/archetype mappings. | Excellent internal job variety and male/female options. Taller, shaded, isometric bodies suit a tactical scene. Missing exact Red Mage, Blue Mage, Berserker, Sage, Beastmaster and Necromancer matches. Do not quietly relabel Calculator as Sage or Mediator as Beastmaster. |
| [Final Fantasy Tactics Advance, GBA](https://www.spriters-resource.com/game_boy_advance/fftacticsadv/) | 15 direct/name-equivalent mappings, counting Mog Knight, White Monk and Hunter; Moogle Gadgeteer could make 16 through an engineer interpretation. | One coherent game, but race-bound jobs produce intentionally different proportions. Paladin, Blue Mage, Red Mage, Sage and Beastmaster are useful. Dark Knight, Berserker, Samurai, Mystic Knight, Bard, Dancer, Geomancer and Necromancer are not clean catalogue matches. |
| [Final Fantasy Tactics A2, DS](https://www.spriters-resource.com/ds_dsi/ffta2/) | The inspected archive lists 21 generic entries across races: about 9 direct/name-equivalent provisional classes, or 10 allowing Tinker as Machinist. This counts available catalogue entries, not every job in the game. | Similar race/proportion issue to FFTA; incomplete archived generic coverage makes it a weaker starting point. The presence of many jobs in the game does not establish a downloadable complete family here. |
| [Tactics Ogre: Let Us Cling Together, PSP](https://www.spriters-resource.com/psp/tacticsogreletusclingtogether/) | Approximately 15 archetype mappings: Knight, Divine Knight→Paladin, Terror Knight→Dark Knight, Dragoon, Berserker, Rogue→Thief, Ninja, Swordmaster→Samurai, Archer→Ranger, Rune Fencer→Mystic Knight, Wizard→Black Mage, Cleric→White Mage, Beast Tamer, Fusilier→Machinist and Necromancer. Several are interpretations, not identical jobs. | Strong dark-fantasy alternative with an actual Necromancer entry. Subdued, detailed isometric style is incompatible with a casual FFV donor strategy. Poor exact coverage of the remaining colored/specialist mages, Monk, Bard, Dancer and Geomancer. |
| [Final Fantasy V Pixel Remaster, PC](https://www.spriters-resource.com/pc_computer/finalfantasy5pixelremaster/page-1/) and [Final Fantasy III Pixel Remaster, PC](https://www.spriters-resource.com/pc_computer/finalfantasy3pixelremaster/) | FFV offers the same 19 job identities in principle; its five protagonist sheets are catalogued, but their individual animation contents were not audited. FFIII is a lead for additional jobs such as Sage/Dark Knight, not a verified complete extension. | A viable alternative visual generation. Treat it as a separate family; do not silently mix Pixel Remaster, original SNES, NES, 3D DS or older mobile graphics. |

These coverage counts are research mappings, not claims of complete, transparent, walking assets. Named characters can fit an archetype while carrying a stronger personal identity than a generic job.

## 5. Coverage table — all 24 provisional classes

For FFV rows, both candidates are on the linked job page: **Bartz preferred, Faris fallback** as a controlled starting comparison, not a claim that Bartz wins every silhouette test. Lenna/Galuf/Krile are additional same-family options. All FFV/FFIV entries below are presented by VideoGameSprites.net as game sprites and **appear to be original-game rips in archive GIF form**. Individual extraction provenance and reuse permission are **UNKNOWN**. Spriters Resource entries likewise appear to be game rips, with permission status described in section 10.

| LEVEL 38 class | Preferred candidate and exact page | Fallback candidate and exact page | Fit / decision |
| --- | --- | --- | --- |
| Knight | [FFV Bartz — Knight](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Knight.html) | Faris — same linked FFV job page | Exact; check shield silhouette against Paladin. |
| Paladin | [FFIV Cecil — Paladin, battle section](https://www.videogamesprites.net/FinalFantasy4/Party/Cecil/) | [FFRK Cecil — Paladin](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/65373/) | Exact identities; FFIV is a conditional SNES donor, FFRK belongs to the alternate family. |
| Dark Knight | [FFIV Cecil — Dark Knight, battle section](https://www.videogamesprites.net/FinalFantasy4/Party/Cecil/) | [FFRK Cecil — Dark Knight](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/sheet/65361/) | Exact identities; do not reuse ordinary Knight with a dark UI label. |
| Dragoon | [FFV Bartz — Dragoon](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Dragoon.html) | Faris — same linked FFV job page | Exact; helmet and spear bounds need checking. |
| Monk | [FFV Bartz — Monk](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Monk.html) | Faris — same linked FFV job page | Exact; valuable unarmored silhouette. |
| Berserker | [FFV Bartz — Berserker](https://www.videogamesprites.net/FinalFantasy5/Party/Water/Berserker.html) | Faris — same linked FFV job page | Exact; animal-like costume helps separate it from Knight. |
| Thief | [FFV Bartz — Thief](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/Thief.html) | Faris — same linked FFV job page | Exact; compare with Ninja at final size. |
| Ninja | [FFV Bartz — Ninja](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Ninja.html) | Faris — same linked FFV job page | Exact; face covering is a useful identity cue. |
| Samurai | [FFV Bartz — Samurai](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Samurai.html) | Faris — same linked FFV job page | Exact; armor profile must remain legible. |
| Ranger | [FFV Bartz — Ranger](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Ranger.html) | Faris — same linked FFV job page | Exact; do not depend on an attack-only bow for identity. |
| Mystic Knight | [FFV Bartz — Mystic Knight](https://www.videogamesprites.net/FinalFantasy5/Party/Water/MysticKnight.html) | Faris — same linked FFV job page | Exact; [FFRK Spellblade](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/78345/) is the alternate-family equivalent. |
| Black Mage | [FFV Bartz — Black Mage](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/BlackMage.html) | Faris — same linked FFV job page | Exact; strong hat/face convention. |
| White Mage | [FFV Bartz — White Mage](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/WhiteMage.html) | Faris — same linked FFV job page | Exact; check robe against light overlay backgrounds. |
| Red Mage | [FFV Bartz — Red Mage](https://www.videogamesprites.net/FinalFantasy5/Party/Water/RedMage.html) | Faris — same linked FFV job page | Exact; hat and outfit distinguish the hybrid archetype. |
| Blue Mage | [FFV Bartz — Blue Mage](https://www.videogamesprites.net/FinalFantasy5/Party/Wind/BlueMage.html) | Faris — same linked FFV job page | Exact; costume distinction matters more than blue tint alone. |
| Time Mage | [FFV Bartz — Time Mage](https://www.videogamesprites.net/FinalFantasy5/Party/Water/TimeMage.html) | Faris — same linked FFV job page | Exact; small symbols may disappear at stream scale. |
| Summoner | [FFV Bartz — Summoner](https://www.videogamesprites.net/FinalFantasy5/Party/Water/Summoner.html) | Faris — same linked FFV job page | Exact; keep head ornament visible without enlarging the whole body. |
| Sage | [FFIV Tellah, battle section](https://www.videogamesprites.net/FinalFantasy4/Party/Tellah/) | [FFIV FuSoYa, battle section](https://www.videogamesprites.net/FinalFantasy4/Party/FuSoYa/) | Tellah is the clearer Sage identity; FuSoYa is a sage-like visual interpretation. [FFRK generic Sage](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/208280/) is an exact alternate-family option. |
| Bard | [FFV Bartz — Bard](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Bard.html) | Faris — same linked FFV job page | Exact; musical identity may need class text when the instrument is absent. |
| Dancer | [FFV Bartz — Dancer](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Dancer.html) | Faris — same linked FFV job page | Exact; worthwhile costume alternative to armored classes. |
| Beastmaster | [FFV Bartz — Beastmaster](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Beastmaster.html) | Faris — same linked FFV job page | Exact; costume must work without adding a separately animated pet. |
| Machinist | [FFIV Cid, battle section](https://www.videogamesprites.net/FinalFantasy4/Party/Cid/) | [FFRK Edgar](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/71117/) | Cid is an engineer interpretation, not an exact generic Machinist. Edgar is stronger for tool-based identity in an FFRK roster; his [Gerad costume](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/asset/141009/) is a same-family alternative. |
| Geomancer | [FFV Bartz — Geomancer](https://www.videogamesprites.net/FinalFantasy5/Party/Fire/Geomancer.html) | Faris — same linked FFV job page | Exact; unusually useful coverage advantage over FFRK. |
| Necromancer | No approved FFV-family candidate. Research lead: [Tactics Ogre PSP — Necromancer catalogue entry](https://www.spriters-resource.com/psp/tacticsogreletusclingtogether/) | [Same catalogue — Nybeth](https://www.spriters-resource.com/psp/tacticsogreletusclingtogether/), a named-character lead only | Both are catalogue-level leads, not individually audited asset sheets. The isometric family is a poor FFV match. Do not count either as filling the recommended roster. |

## 6. Suggested final class roster changes

**Recommended art-selection target: 20 classes** — Knight, Dragoon, Monk, Berserker, Thief, Ninja, Samurai, Ranger, Mystic Knight, Black Mage, White Mage, Red Mage, Blue Mage, Time Mage, Summoner, Bard, Dancer, Beastmaster, Geomancer and **Chemist**. [Chemist has the same five FFV protagonist variants and normal walking listings](https://www.videogamesprites.net/FinalFantasy5/Party/Earth/Chemist.html).

Chemist adds a useful non-mage support archetype. It is a better initial addition than another advanced robed caster. Sage overlaps with White Mage, Black Mage and Summoner unless its aged face/beard remains distinct at the chosen size. Recommend deferring Sage rather than pretending a second robe automatically adds visual variety.

Paladin, Dark Knight and Machinist are valuable extension candidates: holy armor, dark armor and engineering are meaningful differences. If the FFIV donor audit succeeds, the 20-class target could expand to **23**. Necromancer should wait for a suitable same-style source or original work. [FFV Mime](https://www.videogamesprites.net/FinalFantasy5/Party/Other/Mime.html) is another optional archetype, but its four listed variants and overlap with flamboyant caster outfits make it less urgent than Chemist.

Review Knight/Paladin/Dark Knight, Thief/Ninja, and the mage group in a monochrome silhouette test before settling the roster. These are potential redundancies to test, not findings from an unperformed pixel comparison. Class names and readable labels should remain available; color alone must not carry identity.

The current application defines 16 stable class IDs in `src/modules/level38/classes.ts`, including `dark-knight`. **Do not delete that ID or reroll its participants to fit this research target.** A future roster decision must preserve existing assignments and their presentation even if a class is excluded from new random assignments.

## 7. Sprite dimensions and animation comparison

Native frame canvas, visible character height and whole-sheet size are different measurements. **Exact native frame dimensions, visible bounds and unique frame counts remain UNKNOWN for these candidates.** The accessible metadata does not provide sufficient extraction specifications, and image binaries were not retrieved. Approximate sizes below are explicitly provisional planning envelopes, not measured specifications suitable for a manifest.

| Family | Native frame / approximate standing height | Confirmed packaging and whole-sheet examples | Animation evidence and frame count | Directions / mirroring assessment |
| --- | --- | --- | --- | --- |
| FFV SNES | Exact frame UNKNOWN; nominal 16 × 24 body convention is a working estimate, about 24 px high before exceptional poses/accessories. | Separate GIFs on VGS; consolidated PNG on TSR. Bartz 700 × 658, Faris 700 × 655. GIF transparency index and PNG alpha UNKNOWN; VGS provides a background-color selector. | Normal walk, victory, cast, attacks, defend, damage and status entries confirmed in job HTML. Unique frames per animation and timing UNKNOWN. A base pose exists; animated idle not established. | Battle-facing walk is listed; a complete four-direction normal job set is not established. Horizontal mirroring is a candidate technique for travel, not an asset-wide approval. Check handedness/capes; `AttackR`/`AttackL` do not prove right/left walking. |
| FFIV SNES donors | Exact frame UNKNOWN; roughly 24 px battle-body height is a working estimate. Smaller map representation must be treated separately. | Separate GIFs, normal/status/map/battle sections. Exact image dimensions and binary transparency UNKNOWN. | Battle walk, victory, attacks, hit/weak/KO and character-specific actions listed. Unique frame counts and animated idle UNKNOWN. | Front, left and back map walks explicitly named; normal battle walk also named. A right-facing map file was not established. Check shield/weapon reversal before mirroring. |
| FFRK | Exact frame UNKNOWN; allow roughly 24–32 px body height as a planning estimate, plus accessories. Do not infer cells from 256 × 256 sheets. | PNG sheets; common examples 256 × 256, Cecil Paladin 128 × 256. Alpha/background UNKNOWN. | Character sheets confirmed; exact idle/walk/attack frame inventory and durations UNKNOWN. Availability of a character sheet does not establish a complete field-walking set. | Full directional coverage UNKNOWN. Mirroring may suit ordinary travel but must be audited per costume; named characters can have asymmetric weapons. |
| FFT / WotL | Exact frame UNKNOWN; roughly 28–40 px human-body planning envelope. | [Male Knight PNG](https://www.spriters-resource.com/playstation/fft/asset/1294/) is 806 × 695. Background/alpha UNKNOWN. | Pose sheet confirmed; unique animation counts, walk sequence and timings not established from metadata. | Isometric projection; source-facing pairs and their completeness need inspection. Mirroring changes handedness and diagonal orientation; horizontal translation can look like sliding on a different ground plane. |
| FFTA / FFTA2 | Exact frame UNKNOWN; provisionally about 20–36 px standing bodies across races, with substantial variation. Do not normalize a Moogle and Bangaa to identical physical height. | FFTA [Soldier](https://www.spriters-resource.com/game_boy_advance/fftacticsadv/sheet/62269/) 1032 × 960; [Paladin](https://www.spriters-resource.com/game_boy_advance/fftacticsadv/asset/62270/) 1032 × 1080; [Templar](https://www.spriters-resource.com/game_boy_advance/fftacticsadv/asset/63319/) 888 × 1032, PNG. FFTA2 atlas dimensions UNKNOWN. Binary alpha UNKNOWN. | FFTA sheets and [separate VGS job GIFs](https://www.videogamesprites.net/FinalFantasyTacticsAdvance/Jobs/) exist. Static/status GIFs must not be counted as full walk sets. Unique frame counts and complete animation inventories UNKNOWN. | Isometric; FFTA VGS names include SE/NE examples. All required facings and mirrored handedness need inspection. |
| Tactics Ogre PSP | Exact frame UNKNOWN; roughly 24–40 px human-body planning envelope. | Individual character/class sheets catalogued; exact atlas size and alpha not established for Necromancer. | Generic and named entries confirmed; unique frames and complete normal walk/idle inventory UNKNOWN. | Isometric; direction completeness and safe mirroring UNKNOWN. Do not interpret archive comments about grid/offset layout as native character dimensions. |
| Pixel Remaster alternatives | Exact frame UNKNOWN; approximately 24–32 px body planning envelope, not interchangeable with SNES extraction coordinates. | FFIII [Earth Crystal jobs PNG](https://www.spriters-resource.com/pc_computer/finalfantasy3pixelremaster/asset/160141/) is 392 × 288. FFV protagonist entries listed; their atlas sizes were not established. Alpha UNKNOWN. | Sheet availability confirmed; exact per-job frames, walking directions and animation timing UNKNOWN. A site's “Animations (0)” counter is not proof that a sheet contains no animation poses. | Verify field versus battle sections independently. Mirroring has the same costume/handedness caveat as the other compact FF families. |

**Transparency is an acceptance gate for OBS.** PNG is not synonymous with transparent PNG; a GIF listing is not proof that its background index is transparent. None of the above has passed an alpha audit. A later permitted audit should test on black, white, saturated and checkerboard backgrounds, including weapon edges and shadows.

## 8. OBS suitability

FFV is the best initial fit for a narrow horizontal crowd: compact bodies, varied job costumes and explicit walking listings. FFRK is a strong alternative if its candidate walk sequences prove complete. FFT/FFTA/Tactics Ogre are better suited to an intentionally isometric stage; their camera angle should guide the overlay layout rather than be hidden by scale changes.

Recommend a **48 px nominal standing height at a 1920 × 1080 overlay**, with a shared foot anchor and reserved headroom for hats, jumping and celebration. For an actually measured 24 px body, this means 2× nearest-neighbor enlargement. Use 72 px at 3× for an enlarged selected-character presentation if useful. Preserve proportional differences and integer pixels; do not distort or fractionally shrink every sprite to hit exactly 48 px. A different family's native dimensions may require a different shared integer scale.

For 5–30 participants, later implementation should share locally served atlases, animate only a short chosen cycle, and move characters independently of sprite frame changes. A proposed 6–8 fps walk cadence is a starting design choice, not a measured source cadence or performance result. Reuse a standing pose if animated idle is unavailable. Do not synthesize a fake walk from unrelated attack poses merely to tick a requirement.

Thirty bodies may fit across a 1920-pixel stage, but thirty names generally will not remain readable in one row. Use two shallow lanes or collision-aware spacing, restrained name visibility, and a selected-participant label. Keep labels in readable text rather than baking them into sprites. Mobile identity cards can use the standing pose and class label without replaying crowd motion.

Later QA must include 5, 15 and 30 active characters, light/dark moving backgrounds, overlap, direction changes, reduced motion and a 720p stream preview. Performance and final readability are **not benchmarked in this research phase**. No OBS scene, browser source or Twitch integration was created.

## 9. Source URLs and provenance register

The class table and dimension tables contain the exact individual source pages. This register identifies the source types and applies to every linked asset in each family. “Appears to be a rip” is an archive classification, not independent authentication of every pixel.

| Source / game | Exact source page | Classification | Explicit licence / usage status |
| --- | --- | --- | --- |
| VideoGameSprites.net / FFV SNES | [Party and job catalogue](https://www.videogamesprites.net/FinalFantasy5/Party/) | Appears to be original-game sprites, extracted into GIF presentations; individual job URLs in section 5. | No asset reuse grant established: **UNKNOWN**. |
| VideoGameSprites.net / FFIV SNES | [Party catalogue](https://www.videogamesprites.net/FinalFantasy4/Party/) | Appears to be original-game sprites in GIF presentations; Cecil, Cid, Tellah and FuSoYa pages linked above. | **UNKNOWN**. |
| The Spriters Resource / FFV SNES | [Game catalogue](https://www.spriters-resource.com/snes/ff5/) | Appears to be original-game rips; Bartz and Faris uploaded by WaxPoetic. | Site terms apply; rightsholder permission for LEVEL 38 **UNKNOWN**. |
| The Spriters Resource / FFRK mobile | [Game catalogue](https://www.spriters-resource.com/mobile/finalfantasyrecordkeeper/) | Appears to be original FFRK rips, including official redraws of older FF characters; not fan recreations of those older games. | Site terms apply; permission **UNKNOWN**. |
| The Spriters Resource / FFT PS1 and WotL PSP | [FFT](https://www.spriters-resource.com/playstation/fft/), [WotL](https://www.spriters-resource.com/psp/finalfantasytacticsthewarofthelions/) | Appears to be original-game rips; distinguish PS1 base jobs from PSP additions. | Site terms apply; permission **UNKNOWN**. |
| The Spriters Resource and VideoGameSprites.net / FFTA GBA | [TSR catalogue](https://www.spriters-resource.com/game_boy_advance/fftacticsadv/), [VGS jobs](https://www.videogamesprites.net/FinalFantasyTacticsAdvance/Jobs/) | Appears to be original-game rips; detailed cited sheets uploaded by G-Haven. | TSR site terms; VGS asset permission **UNKNOWN**. |
| The Spriters Resource / FFTA2 DS | [Catalogue](https://www.spriters-resource.com/ds_dsi/ffta2/) | Appears to be original-game rips; catalogue-level comparison. | Site terms apply; permission **UNKNOWN**. |
| The Spriters Resource / Tactics Ogre PSP | [Catalogue](https://www.spriters-resource.com/psp/tacticsogreletusclingtogether/) | Appears to be original-game rips; Necromancer and Nybeth are catalogue-level leads. | Site terms apply; permission **UNKNOWN**. |
| The Spriters Resource / FFIII and FFV Pixel Remaster | [FFIII](https://www.spriters-resource.com/pc_computer/finalfantasy3pixelremaster/), [FFV](https://www.spriters-resource.com/pc_computer/finalfantasy5pixelremaster/page-1/) | Appears to be original Pixel Remaster game assets, a separate art generation. | Site terms apply; permission **UNKNOWN**. |
| The Spriters Resource / FFV Advance GBA | [Catalogue](https://www.spriters-resource.com/game_boy_advance/finalfantasy5advance/) | Original-game archive lead; no usable Necromancer protagonist sheet verified in this research. | Site terms apply; permission **UNKNOWN**. |
| Nexus Mods / older PC FFV, “Galuf Missing Job Sprites” by SwiftSails | [Mod page](https://www.nexusmods.com/finalfantasy5/mods/4) | **Custom/fan-made mod sprites**, not original missing SNES/GBA rips. | Page permits redistribution with credit and requires permission to modify. Website/OBS reuse grant **UNKNOWN**. Different game-version style; excluded from the preferred set. |

No commercial asset pack or openly licensed sprite family is being represented as an approved substitute here. Commissioned replacement art is a future option, not an asset already sourced or licensed by this report.

## 10. Known licensing information and unknowns

The Spriters Resource's [help page](https://www.spriters-resource.com/page/help/) explains that the archive does not own the game assets and cannot license them to users; its guidance calls for rightsholder consent for commercial use. Its [Terms of Use](https://www.spriters-resource.com/page/tou/) expressly discuss monetized videos and advertising-supported websites, and distinguish custom work requiring artist permission/credit. These are the site's stated rules, not a licence granted by Square Enix or another game rightsholder.

Accordingly, mark **every commercial-game rip in this report “publication permission: UNKNOWN”**. Archive availability, an uploader credit, free access and a transparent background do not establish permission for the LEVEL 38 website or a monetized stream. No legal conclusion about a particular intended use is made here.

No explicit reuse licence was established from the inspected VideoGameSprites.net asset pages. The Nexus mod's stated permissions must not be broadened into an assumed permission for all uses or its underlying game imagery. A future manifest should retain both the actual source page and the documented permission status, rather than reduce them to “free sprite.”

## 11. Classes with no good candidate

**Necromancer has no accepted candidate within the FFV base family.** Tactics Ogre supplies relevant identities but a different projection and density. The FFV Advance archive is an investigation lead, not evidence that a complete usable job sheet was found. The custom Galuf mod must not be misidentified as an original GBA Necromancer rip. Do not substitute a generic villain, recolor Black Mage or relabel Geomancer just to complete 24 rows.

**Machinist has a conditional candidate rather than a perfect FFV-family match.** Cid supports an engineer interpretation; Edgar is more attractive if adopting FFRK throughout. A distinct tool-bearing original sprite may ultimately be preferable.

**Paladin, Dark Knight and Sage have strong identity candidates but no exact job sprite in the FFV SNES base roster.** Their gap is family consistency, not lack of any sprite. Conversely, an all-FFRK selection still leaves Geomancer and Necromancer unresolved. None of these gaps should be hidden in coverage totals.

## 12. Recommended next step and replaceability

The next phase should first choose between the FFV art target and a broader FFRK target, then establish the intended-use permissions. Only after separate authorization to retrieve assets should an asset audit begin. This report does not authorize or perform that retrieval.

Audit a representative subset first: Knight, Black Mage, White Mage, Berserker, Dancer, Geomancer and the proposed donors. Measure native frame rectangles, standing visible bounds, foot anchors, alpha, unique frames, durations, facing and mirrored asymmetries. Then inspect the entire selected roster on one baseline and test the crowd sizes in section 8. Reject incomplete walking candidates before integrating participant identity.

Keep the future sprite manifest independent of participant data:

| Stable concept | Future presentation metadata |
| --- | --- |
| Participant retains existing `classId` | Resolve through a replaceable class-to-asset mapping; never persist an archive URL or game-character name as class identity. |
| Class definition retains ID and localized display names | Asset key, family/version and local file path can change without a participant migration. |
| Asset record | Source-page URL, source classification, artist/uploader attribution, permission status and any obtained licence record. |
| Animation record | Measured frame rectangles, durations, idle/walk/celebrate mappings, foot anchor, native bounds and an explicit per-animation mirror policy. |
| Missing/retired asset | Preserve existing class identity and use an owned placeholder; do not silently reroll or drop a participant. |

The current class module already separates stable IDs from sprite metadata and marks the SVG sprites as demos. Extend that separation later rather than coupling gameplay or database records to FFV, FFRK or a particular sheet layout. Store any future approved assets locally, isolated from logic, and share the same asset mapping between the website and OBS.

Completion check for this research: all 24 provisional classes are catalogued; source identity and licence unknowns are recorded; unavailable extraction facts remain explicit. The only repository deliverable is this Markdown report. No build or integration tests are required for this documentation-only change; no application behavior was changed or tested.
