const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const { setTimeout: delay } = require('node:timers/promises');
const { fixture } = require('./support.cjs');
const { startSite } = require('../helpers.cjs');

const editable = game => ({ title: game.title, type: game.type, status: game.status, revision: game.revision,
  description: game.description, coverScale: game.coverScale ?? 1, coverOutline: game.coverOutline ?? false,
  details: { format: game.details.format, outcome: game.details.outcome,
    rules: Object.fromEntries(['en', 'es'].map(lang => [lang, game.details.rules.map(r => r[lang]).join('\n')])) } });

test('owner catalog persists games and logos, protects writes, and keeps edits across deployments', { timeout: 60000 }, async t => {
  const f = await fixture(t); await f.start();
  const owner = await f.operator('Catalog owner', 'OWNER');
  const moderator = await f.operator('Catalog moderator', 'MODERATOR');
  const call = async (route, body, cookie, headers = {}, origin = f.origin) => {
    const response = await fetch(origin + route, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin, 'X-Catalog-Request': '1' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text(), cookie: response.headers.get('set-cookie'), headers: response.headers };
  };
  assert.equal((await call('/admin/api/games')).status, 401);
  assert.equal((await call('/admin/api/games', undefined, owner.cookie)).status, 401, 'event cookie must not grant catalog access');
  assert.equal((await call('/admin/api/login', { key: moderator.key })).status, 401);
  assert.equal((await call('/admin/api/login', { key: owner.key }, undefined, { Origin: 'https://evil.test' })).status, 403);
  const login = await call('/admin/api/login', { key: owner.key }); assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly/); assert.match(login.cookie, /SameSite=Strict/); assert.match(login.cookie, /Path=\/admin/);
  const cookie = login.cookie.split(';')[0];
  const initial = await call('/admin/api/games', undefined, cookie); assert.equal(initial.status, 200);
  assert.equal(initial.data.games.length, 37);
  const logo = 'data:image/png;base64,' + (await sharp({ create: { width: 40, height: 30, channels: 4, background: '#1ba4a080' } }).png().toBuffer()).toString('base64');
  const input = { title: 'Prueba <img src=x onerror=alert(1)>', type: 'challenge', status: 'playing', revision: 0, description: { es: 'Descripción de prueba', en: '' }, logo };
  assert.equal((await call('/admin/api/games', input)).status, 401);
  assert.equal((await call('/admin/api/games', input, cookie, { 'X-Catalog-Request': '' })).status, 403);
  assert.equal((await call('/admin/api/games', { ...input, logo: 'data:image/png;base64,' + Buffer.from('<svg/>').toString('base64') }, cookie)).status, 400);
  const created = await call('/admin/api/games', input, cookie); assert.equal(created.status, 201);
  const game = created.data.game; assert.equal(game.description.en, input.description.es);
  const page = await call('/challenges/' + game.id + '?lang=es'); assert.equal(page.status, 200);
  const dom = new JSDOM(page.data); assert.equal(dom.window.document.querySelector('h1').textContent, input.title);
  assert.equal(dom.window.document.querySelector('img[onerror]'), null); dom.window.close();
  assert.equal((await call('/?lang=es')).data.includes(game.id), true);
  const image = await fetch(f.origin + game.cover); assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/webp');
  const bytes = Buffer.from(await image.arrayBuffer()); assert.equal((await sharp(bytes).metadata()).hasAlpha, true);
  const updated = await call('/admin/api/games/' + game.id, { ...editable(game), title: 'Juego renombrado', status: 'completed' }, cookie);
  assert.equal(updated.status, 200); assert.equal(updated.data.game.id, game.id); assert.equal(updated.data.game.cover, game.cover);
  assert.equal((await call('/admin/api/games/' + game.id, editable(game), cookie)).status, 409);
  const base = initial.data.games.find(g => g.id === 'ff9-solo-garnet');
  const editedBase = await call('/admin/api/games/' + base.id, { ...editable(base), description: { es: 'Editado desde admin', en: 'Edited from admin' } }, cookie);
  assert.equal(editedBase.status, 200); assert.deepEqual(editedBase.data.game.details, base.details);

  // Run the actual editor script and FileReader against the HTTP API and test database.
  const editor = new JSDOM((await call('/admin', undefined, cookie)).data, { url: f.origin + '/admin', runScripts: 'outside-only' });
  const w = editor.window, doc = w.document;
  const pending = new Set();
  w.fetch = (route, options = {}) => {
    const promise = fetch(new URL(route, f.origin), { ...options, headers: { ...options.headers, Cookie: cookie, Origin: f.origin } });
    pending.add(promise); promise.finally(() => pending.delete(promise)); return promise;
  };
  const until = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(20); } throw new Error('Editor did not reach the expected state'); };
  w.eval(await fs.readFile('public/js/admin.js', 'utf8'));
  await until(() => !doc.querySelector('#save-game').disabled);
  doc.querySelector('[data-id="ff5-crystal-roulette-fiesta"]').click();
  assert.equal(doc.querySelector('#logo-scale').value, '0.78');
  assert.equal(doc.querySelector('#game-form').checkValidity(), true, 'existing logo scales must be valid');
  doc.querySelector('#new-game').click();
  doc.querySelector('#game-title').value = 'Juego desde el formulario';
  doc.querySelector('#description-es').value = 'Guardado desde FileReader';
  doc.querySelector('#game-type').value = 'challenge';
  doc.querySelector('#game-type').dispatchEvent(new w.Event('change'));
  assert.equal(doc.querySelector('#challenge-fields').hidden, false);
  const file = new w.File([Buffer.from(logo.split(',')[1], 'base64')], 'logo.png', { type: 'image/png' });
  Object.defineProperty(doc.querySelector('#game-logo'), 'files', { value: [file], configurable: true });
  doc.querySelector('#game-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => doc.querySelector('#admin-message').textContent.includes('guardado y publicado'));
  assert.equal(doc.querySelector('#view-game').hidden, false);
  const formGame = (await call('/admin/api/games', undefined, cookie)).data.games.find(g => g.title === 'Juego desde el formulario');
  assert.ok(formGame); assert.equal(formGame.description.en, 'Guardado desde FileReader');
  doc.querySelector('#description-es').value = 'Modificado desde el formulario';
  doc.querySelector('#game-status').value = 'upcoming';
  Object.defineProperty(doc.querySelector('#game-logo'), 'files', { value: [], configurable: true });
  doc.querySelector('#game-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => doc.querySelector('#admin-message').textContent.includes('Está oculto'));
  assert.equal(doc.querySelector('#view-game').hidden, true);
  assert.equal((await call('/challenges/' + formGame.id)).status, 404);
  await Promise.all(pending); editor.window.close();
  f.cli('migrate', 'deploy');
  const restarted = await startSite({ DATABASE_URL: f.databaseUrl }); t.after(restarted.stop);
  const persisted = await call('/admin/api/games', undefined, cookie, {}, restarted.origin);
  assert.equal(persisted.status, 200); assert.equal(persisted.data.games.length, 39);
  assert.equal(persisted.data.games.find(g => g.id === game.id).title, 'Juego renombrado');
  assert.equal(persisted.data.games.find(g => g.id === base.id).description.es, 'Editado desde admin');
  assert.deepEqual(Buffer.from(await (await fetch(restarted.origin + game.cover)).arrayBuffer()), bytes);
  const hidden = await call('/admin/api/games/' + game.id, { ...editable(updated.data.game), status: 'upcoming' }, cookie);
  assert.equal(hidden.status, 200); assert.equal((await call('/challenges/' + game.id)).status, 404);
  assert.equal((await call('/?lang=es')).data.includes('Juego renombrado'), false);
  await f.db.operator.update({ where: { id: owner.id }, data: { disabled: true } });
  assert.equal((await call('/admin/api/games', undefined, cookie)).status, 401);
  await f.db.operator.update({ where: { id: owner.id }, data: { disabled: false } });
  assert.equal((await call('/admin/api/logout', {}, cookie)).status, 200);
  assert.equal((await call('/admin/api/games', undefined, cookie)).status, 401);
});
