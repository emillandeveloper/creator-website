const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const sharp = require('sharp');
const { catalogInput, DEFAULT_CATALOG } = require('../dist/services/catalog');
const { catalogLogo } = require('../dist/services/catalog-logo');
const { HomeController } = require('../dist/controllers/HomeController');

test('catalog validates fields, preserves languages, and rejects unsafe or malformed logos', async () => {
  const base = { title: 'Nuevo reto', type: 'challenge', status: 'playing', revision: 0, description: { es: 'Solo un personaje', en: '' } };
  const input = catalogInput(base);
  assert.deepEqual(input.description, { es: 'Solo un personaje', en: 'Solo un personaje' });
  for (const change of [{ title: '' }, { type: 'other' }, { status: 'deleted' }, { revision: -1 }, { coverScale: 10 }, { coverOutline: 'true' }, { description: { en: '' } }]) {
    assert.throws(() => catalogInput({ ...base, ...change }));
  }
  const logo = await sharp({ create: { width: 30, height: 20, channels: 4, background: '#ff000080' } }).png().toBuffer();
  const result = await catalogLogo('data:image/png;base64,' + logo.toString('base64'));
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.hasAlpha, true);
  await assert.rejects(catalogLogo('data:image/png;base64,' + Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')));
  await assert.rejects(catalogLogo('data:image/svg+xml;base64,AAAA'));
  await assert.rejects(catalogLogo('data:image/png;base64,' + 'A'.repeat(7_000_000)));
  assert.equal(await catalogLogo(undefined), undefined);
  assert.equal(new Set(DEFAULT_CATALOG.map(g => g.id)).size, DEFAULT_CATALOG.length);
});

test('public search matches accents and descriptions, combines status, and leaves other slides unchanged', async () => {
  const script = await fs.readFile('public/js/catalog-search.js', 'utf8');
  const slider = await fs.readFile('public/js/slider.js', 'utf8');
  for (const lang of ['en', 'es']) {
    let locals; HomeController.index({ query: { lang } }, { render: (_view, data) => { locals = data; } });
    const html = await ejs.renderFile('src/views/index.ejs', locals);
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/#challenges' });
    const doc = dom.window.document;
    dom.window.eval(slider); dom.window.eval(script);
    const section = doc.querySelector('#slide-challenges'), search = section.querySelector('input'), status = section.querySelector('select');
    const visible = () => Array.from(section.querySelectorAll('.game-card')).filter(c => !c.hidden);
    search.value = 'GÁRNET'; search.dispatchEvent(new dom.window.Event('input'));
    assert.equal(visible().length, 1); assert.match(visible()[0].textContent, /Garnet/);
    search.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(doc.querySelector('.nav-btn.active').dataset.slide, '3');
    status.value = 'playing'; status.dispatchEvent(new dom.window.Event('change'));
    assert.equal(visible().length, 0); assert.equal(section.querySelector('[data-catalog-empty]').hidden, false);
    assert.ok(Array.from(doc.querySelectorAll('#slide-playthroughs .game-card')).every(c => !c.hidden));
    search.value = 'randomizer'; search.dispatchEvent(new dom.window.Event('input')); assert.equal(visible().length, 1);
    search.value = ''; status.value = 'all'; status.dispatchEvent(new dom.window.Event('change'));
    assert.equal(visible().length, 6); assert.equal(section.querySelector('[data-catalog-empty]').hidden, true);
    assert.equal(section.querySelectorAll('.game-group[hidden]').length, 0);
    dom.window.close();
  }
});
