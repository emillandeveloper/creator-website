// Real Chrome + isolated PostgreSQL; gallery and screenshots are QA only, never shipped.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../dist/phase3-qa-tools/node_modules/playwright');
const { fixture } = require('../integration/support.cjs');
const { SPRITE_MANIFEST } = require('../../dist/modules/level38/classes');

test('Phase 3.9 real art, all classes/variants, bilingual responsive identity and refresh/reconnect', { timeout: 240000 }, async t => {
  const f = await fixture(t); await f.start();
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' });
  const page = await context.newPage(), errors = [], csp = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Content Security Policy|Refused to/.test(message.text())) csp.push(message.text()); });
  const out = path.resolve('dist/phase39-visual-qa'); fs.mkdirSync(out, { recursive: true });
  const ready = async () => {
    await page.waitForFunction(() => /connected|conectad/.test(document.getElementById('connection').textContent));
    await page.evaluate(() => document.fonts.ready);
  };
  await page.goto(`${f.origin}/level38`); await ready();
  await page.locator('#join-open').click(); await page.locator('#nickname').fill('Garnet'); await page.locator('#nickname').press('Enter');
  await page.waitForFunction(() => document.getElementById('viewer-name').textContent === 'Garnet');
  await page.waitForFunction(() => document.querySelector('#viewer-sprite img')?.naturalWidth === 16);
  await page.waitForFunction(() => document.querySelector('#welcome-sprite img')?.src === document.querySelector('#viewer-sprite img')?.src);
  const original = await f.db.participant.findFirstOrThrow();
  const check = async label => {
    const measured = await page.evaluate(() => {
      const img = document.querySelector('#viewer-sprite img'), slot = document.getElementById('viewer-sprite');
      const a = img.getBoundingClientRect(), b = slot.getBoundingClientRect();
      return { viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
        width: a.width, height: a.height, native: [img.naturalWidth, img.naturalHeight], pixels: getComputedStyle(img).imageRendering,
        fits: a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom, src: img.getAttribute('src') };
    });
    assert.ok(measured.document <= measured.viewport && measured.body <= measured.viewport, label);
    assert.equal(measured.width, 32); assert.equal(measured.height, 48); assert.deepEqual(measured.native, [16, 24]);
    assert.equal(measured.pixels, 'pixelated'); assert.equal(measured.fits, true); checks.push({ label, ...measured });
  };
  // Exercise every class in the actual identity card; rotate all five protagonist variants.
  for (const [i, job] of SPRITE_MANIFEST.classes.entries()) {
    const variantId = job.variants[i % job.variants.length].variantId;
    await f.db.participant.update({ where: { id: original.id }, data: { classId: job.classId, variantId } });
    await page.reload(); await ready();
    await page.waitForFunction(() => document.querySelector('#viewer-sprite img')?.naturalWidth === 16);
    await check(job.classId);
    assert.equal(await page.locator('#viewer-class').textContent(), job.displayNames.es);
    await page.locator('#party').screenshot({ path: path.join(out, `class-${job.classId}.png`) });
  }
  for (const [classId, variantId] of [['thief', 'faris'], ['thief', 'krile'], ['machinist', 'cid']]) {
    await f.db.participant.update({ where: { id: original.id }, data: { classId, variantId } });
    await page.reload(); await ready(); await page.waitForFunction(() => document.querySelector('#viewer-sprite img')?.naturalWidth === 16);
    for (const lang of ['es', 'en']) for (const [width, height] of [[1440, 1000], [1024, 1000], [768, 1000], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height }); await page.evaluate(l => window.Level38I18n.setLanguage(l), lang);
      assert.equal(await page.locator('#viewer-class').textContent(), SPRITE_MANIFEST.classes.find(c => c.classId === classId).displayNames[lang]);
      await page.locator('#party').scrollIntoViewIfNeeded(); await check(`${classId}-${variantId}-${lang}-${width}`);
      await page.screenshot({ path: path.join(out, `${classId}-${variantId}-${lang}-${width}.png`) });
    }
  }
  const persisted = await f.db.participant.findFirstOrThrow(), cookies = await context.cookies();
  await context.setOffline(true); await page.waitForFunction(() => /reconnect|conectando/i.test(document.getElementById('connection').textContent));
  await context.setOffline(false); await ready(); await page.reload(); await ready();
  assert.deepEqual(await f.db.participant.findFirstOrThrow(), persisted); assert.deepEqual(await context.cookies(), cookies);
  assert.equal(persisted.tokenHash, original.tokenHash); assert.deepEqual(persisted.expiresAt, original.expiresAt);
  await page.route('**/level38/classes/**/*.png', route => route.abort()); await page.reload(); await ready();
  await page.waitForFunction(() => document.getElementById('viewer-sprite').dataset.spriteFallback === 'true');
  assert.equal(await page.locator('#viewer-sprite img').getAttribute('src'), '/img/level38/placeholder.svg');
  assert.deepEqual(await f.db.participant.findFirstOrThrow(), persisted);
  await page.screenshot({ path: path.join(out, 'failed-asset-fallback.png') });
  await page.unroute('**/level38/classes/**/*.png');

  // All 104 appearances use the production resolver/renderer/styles in a temporary QA gallery.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(manifest => {
    const gallery = document.createElement('div'); gallery.id = 'qa-gallery';
    Object.assign(gallery.style, { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '16px', padding: '24px', background: '#0c1523' });
    for (const job of manifest.classes) for (const variant of job.variants) {
      const card = document.createElement('div'), slot = document.createElement('div'); slot.className = 'l38-avatar-slot';
      card.textContent = `${job.displayNames.en} / ${variant.variantId}`; card.append(slot); gallery.append(card);
      window.Level38Sprites.render(slot, window.Level38Sprites.resolve(manifest, job.classId, variant.variantId));
    }
    document.body.append(gallery);
  }, SPRITE_MANIFEST);
  await page.waitForFunction(() => [...document.querySelectorAll('#qa-gallery img')].length === 104 && [...document.querySelectorAll('#qa-gallery img')].every(i => i.complete && i.naturalWidth === 16));
  await page.locator('#qa-gallery').screenshot({ path: path.join(out, 'all-104-appearances.png') });
  assert.deepEqual(errors, []); assert.deepEqual(csp, []);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, appearances: 104, errors, csp }, null, 2));
});
