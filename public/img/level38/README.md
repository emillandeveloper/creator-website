# LEVEL 38 original demo artwork

`world.svg` and all 16 `classes/*/idle.svg` sheets are original geometric pixel artwork created for this repository. They are demo assets, not extracted or downloaded commercial game sprites. The generator is `scripts/level38-demo-assets.cjs`; it reads the compiled central class catalog. Run `npm run build` then `node scripts/level38-demo-assets.cjs` to regenerate the demos. Regeneration overwrites those demo paths, so do not run it over final supplied artwork.

The shipped sheets contain four horizontal 32 × 32 frames. Each class directory matches a stable class ID. The UI displays them at an integer scale with `image-rendering: pixelated` and animates one horizontal strip using CSS `steps()` at four frames per second. Only the viewer's own sprite is animated; reduced-motion users see the first frame.

To replace a class sprite:

1. Put the permitted/licensed sheet in that class directory, preferably under a new versioned filename for cache refreshes. PNG, WebP, and SVG horizontal strips work; no GIF is required. Do not add copyrighted game sprites without appropriate permission.
2. Add or update `sprite` on that roster entry in `src/modules/level38/classes.ts`: `path`, `frameWidth`, `frameHeight`, `frames`, `fps`, and `demo: false`. Each entry can override the shared defaults independently. Sheet width must equal `frameWidth × frames` and height must equal `frameHeight`.
3. Keep the class `id` stable. Participant rows contain only this identifier, not an asset path; no database rewrite or class reroll is needed.
4. Verify the image loads, its animation has no frame bleed, and its first frame looks good under reduced motion. Missing/failed sheets show the built-in geometric fallback and keep the class name visible.

Class names, enabled selection pool, sprite keys, and metadata live in the catalog. All enabled entries have equal probability through `crypto.randomInt`. To retire an assignment from new rolls, retain its metadata and set `enabled: false`; never silently change existing participant IDs. Keep at least one class enabled. Unknown historical IDs fall back to “Adventurer” without rerolling.

The heading font is the separately licensed **Silkscreen**, copyright The Silkscreen Project Authors, redistributed from the [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/silkscreen). The complete SIL Open Font License is included at `public/fonts/level38/OFL.txt`. The font is served locally; there is no third-party font request at runtime.
