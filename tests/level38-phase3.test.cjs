const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { JSDOM } = require("jsdom");
const { CLASS_CATALOG, SPRITE_MANIFEST, publicClass, randomClassId, randomVariantId } = require("../dist/modules/level38/classes");
const sprites = require("../public/js/level38/sprites");
const original = "knight dark-knight dragoon monk thief ninja samurai ranger black-mage white-mage red-mage blue-mage summoner bard dancer beastmaster".split(" ");
const additions = "berserker mystic-knight time-mage geomancer chemist paladin sage machinist".split(" ");
const fixed = { paladin: "cecil", "dark-knight": "cecil", sage: "tellah", machinist: "cid" };

test("24 stable classes, exactly eight additions and 104 safe appearances with audited assets", () => {
  assert.deepEqual(CLASS_CATALOG.map(c => c.id).sort(), [...original, ...additions].sort());
  assert.equal(CLASS_CATALOG.flatMap(c => c.variants).length, 104);
  assert.ok(!CLASS_CATALOG.some(c => c.id === "necromancer"));
  const paths = new Set();
  for (const job of CLASS_CATALOG) {
    assert.deepEqual(job.variants.map(v => v.variantId), fixed[job.id] ? [fixed[job.id]] : ["bartz", "lenna", "galuf", "faris", "krile"]);
    for (const variant of job.variants) {
      const dto = publicClass(job.id, variant.variantId);
      assert.deepEqual(dto, sprites.resolve(SPRITE_MANIFEST, job.id, variant.variantId));
      assert.deepEqual(dto.displayNames, job.displayNames);
      assert.deepEqual(dto.sprite.canvas, [16, 24]); assert.deepEqual(dto.sprite.anchor, [8, 24]); assert.equal(dto.sprite.renderScale, 2);
      for (const [action, anim] of Object.entries(dto.sprite.animations)) {
        assert.equal(anim.frames.length, action === "idle" ? 1 : 2);
        for (const frame of anim.frames) {
          assert.ok(sprites.safePath(frame.path)); paths.add(frame.path);
          const png = fs.readFileSync(`public${frame.path}`);
          assert.equal(png.readUInt32BE(16), 16); assert.equal(png.readUInt32BE(20), 24);
        }
      }
    }
  }
  assert.equal(paths.size, 516);
  const provenance = JSON.parse(fs.readFileSync("docs/level38-sprite-provenance.json", "utf8"));
  assert.equal(provenance.appearances.length, 104);
  for (const appearance of provenance.appearances) {
    assert.match(appearance.permissionStatus, /UNKNOWN/);
    for (const frame of appearance.frames) assert.equal(createHash("sha256").update(fs.readFileSync(`public${frame.path}`)).digest("hex"), frame.sha256);
  }
  assert.doesNotMatch(JSON.stringify(SPRITE_MANIFEST), /https?:|sourceUrl|sourcePage|permissionStatus|[A-Z]:\\/);
});

test("class draw has exactly 24 equal slots, followed by five equal variant slots or one fixed slot", () => {
  for (let i = 0; i < 24; i++) {
    const id = randomClassId(max => { assert.equal(max, 24); return i; });
    assert.equal(id, CLASS_CATALOG[i].id);
    const count = fixed[id] ? 1 : 5;
    for (let j = 0; j < count; j++) assert.equal(randomVariantId(id, max => { assert.equal(max, count); return j; }), CLASS_CATALOG[i].variants[j].variantId);
  }
  assert.equal(randomVariantId("retired"), null);
  assert.ok(CLASS_CATALOG.some(c => c.id === randomClassId()));
});

test("one shared clock repeats walk and ends a three-cycle celebration at 1500ms", () => {
  const sprite = publicClass("thief", "faris").sprite;
  for (const variant of ["faris", "krile"]) {
    const anims = publicClass("thief", variant).sprite.animations;
    for (const action of ["walk", "celebration"]) {
      assert.equal(anims[action].sourceFrameCount, 1);
      assert.equal(anims[action].frames[0].path, anims.idle.frames[0].path);
      assert.equal(anims[action].frames[1].sourceFrameIndex, 0);
      assert.equal(anims[action].sourceCycleComplete, false);
    }
  }
  for (let ms = 0; ms < 2000; ms++) {
    assert.deepEqual(sprites.frameAt(sprite, "idle", ms), { action: "idle", index: 0 });
    assert.deepEqual(sprites.frameAt(sprite, "walk", ms), { action: "walk", index: Math.floor(ms / 200) % 2 });
    assert.deepEqual(sprites.frameAt(sprite, "celebration", ms), ms >= 1500 ? { action: "idle", index: 0 } : { action: "celebration", index: Math.floor(ms / 250) % 2 });
  }
});

test("missing/unknown/failed variants preserve identity and use an owned fallback without arbitrary paths", () => {
  assert.equal(publicClass(null), null);
  for (const [id, variant] of [["retired", "old"], ["knight", null], ["knight", "../../secret"], ["__proto__", "constructor"]]) {
    const job = publicClass(id, variant); assert.equal(job.id, id); assert.equal(job.variantId, variant); assert.equal(job.sprite, null);
  }
  const dom = new JSDOM('<div id="sprite"></div>');
  const root = dom.window.document.getElementById("sprite"), job = publicClass("thief", "faris");
  const before = JSON.stringify(job); sprites.render(root, job, { action: "celebration" });
  const img = root.querySelector("img"); img.dispatchEvent(new dom.window.Event("error"));
  assert.equal(img.getAttribute("src"), sprites.placeholder); assert.equal(JSON.stringify(job), before);
  img.dispatchEvent(new dom.window.Event("load")); assert.ok(root.querySelector(".l38-sprite-fallback").hidden);
  img.dispatchEvent(new dom.window.Event("error")); assert.ok(root.querySelector(".l38-sprite").hidden);
  assert.ok(!root.querySelector(".l38-sprite-fallback").hidden); sprites.dispose(root); dom.window.close();
});
