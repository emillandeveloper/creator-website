const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { CLASS_CATALOG, publicClass, randomClassId } = require("../dist/modules/level38/classes");

test("one centralized class catalog supplies stable IDs and valid replaceable sprite sheets", () => {
  assert.equal(CLASS_CATALOG.length, 16);
  assert.equal(new Set(CLASS_CATALOG.map((job) => job.id)).size, 16);
  for (const job of CLASS_CATALOG) {
    assert.match(job.id, /^[a-z]+(?:-[a-z]+)*$/);
    const dto = publicClass(job.id);
    assert.deepEqual(Object.keys(dto).sort(), ["displayName", "id", "sprite", "spriteKey"]);
    assert.equal(dto.sprite.frames, 4); assert.equal(dto.sprite.demo, true);
    const svg = fs.readFileSync(`public${dto.sprite.path}`, "utf8");
    assert.match(svg, new RegExp(`width="${dto.sprite.frameWidth * dto.sprite.frames}" height="${dto.sprite.frameHeight}"`));
    assert.doesNotMatch(svg, /<script|<image|https?:\/\/(?!www.w3.org)/);
  }
  assert.equal(publicClass(null), null);
  assert.deepEqual(publicClass("retired-unknown-class"), { id: "adventurer", displayName: "Adventurer", spriteKey: "placeholder", sprite: null });
  const selected = randomClassId();
  assert.ok(CLASS_CATALOG.some((job) => job.enabled && job.id === selected));
});
