# LEVEL 38 artwork

The public character UI now uses the approved Phase 3.9 assets at `public/level38/classes/`. The single `manifest.json` supplies 24 class IDs, 104 persistent class/variant pairs, ES/EN names, normalized dimensions, anchors and animation sequences. `public/js/level38/sprites.js` is the shared resolver, frame clock and DOM renderer; the server uses the same resolver. The manifest is also available at `/level38/api/classes`.

Runtime PNGs are 16 × 24, rendered at 2× using nearest-neighbor sampling. Audited shorter characters retain their 23-pixel visible height with transparent top padding. Idle is frame zero; walk uses 200 ms/frame; celebration uses 250 ms/frame for three cycles and returns to idle. The website only plays celebration on first class reveal. Reduced motion uses idle.

`placeholder.svg` is original geometric artwork for missing or failed variants. The older 16 `classes/*/idle.svg` demo strips remain original assets but are no longer used by the public character renderer. `world.svg` remains the original background illustration. The legacy generator `scripts/level38-demo-assets.cjs` writes demo paths only; it does not generate or replace the integrated PNGs.

To update audited artwork, use `scripts/level38-import-sprites.py` with an approved local audit manifest. It copies only normalized idle/walk/victory PNGs after verifying pixel hashes, dimensions and binary transparency. It generates the public manifest and the internal `docs/level38-sprite-provenance.json`. No raw GIF, source HTML or audit screenshot is shipped. Internal provenance records source URLs, hashes, padding and permission status **UNKNOWN**; it is not a claim of permission.

Keep class/variant IDs stable when replacing pixels. Update the asset version and validate all references and the public renderer; no participant database rewrite is needed. Retired classes can keep metadata with `enabled: false`. Unknown IDs keep their stored identity and use the owned fallback. Variants must never be derived from arbitrary URL or filesystem fragments.

Silkscreen remains separately licensed under the bundled `public/fonts/level38/OFL.txt`; all artwork and fonts are served locally.
