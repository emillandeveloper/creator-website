const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { JSDOM } = require('jsdom');
const manifest = require('../public/level38/classes/manifest.json');

async function client(t, { reduced = false, storage = {}, preview = false } = {}) {
  const dom = new JSDOM(`<body data-preview="${preview ? 3 : 0}"><main id="party-stage"></main><span id="party-overflow" hidden></span><canvas id="party-fireworks" hidden></canvas><section id="party-celebration" hidden></section><button id="preview-vote"></button><button id="preview-victory"></button><button id="preview-finale"></button><select id="preview-names"></select></body>`, { url: 'https://level38.test/level38/overlay/party', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window, socket = new EventEmitter(), frames = new Map();
  const epoch = Date.parse('2026-10-21T12:00:00.000Z');
  let now = 0, nextFrame = 0, hidden = false;
  w.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  w.cancelAnimationFrame = id => frames.delete(id);
  w.performance.now = () => now;
  w.matchMedia = () => ({ matches: reduced });
  Object.defineProperty(w.document, 'hidden', { get: () => hidden });
  w.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, fillRect() {} });
  w.fetch = async () => ({ ok: true, json: async () => manifest });
  for (const [key, value] of Object.entries(storage)) w.sessionStorage.setItem(key, value);
  socket.disconnect = () => socket.emit('disconnect'); w.io = () => socket;
  for (const file of ['sprites', 'party-fireworks', 'party-overlay']) w.eval(fs.readFileSync(`public/js/level38/${file}.js`, 'utf8'));
  await new Promise(resolve => setImmediate(resolve));
  const appearances = manifest.classes.flatMap(c => c.variants.map(v => ({ classId: c.classId, variantId: v.variantId })));
  const members = Array.from({ length: 16 }, (_, i) => ({ presenceId: `member-${i}`, nickname: `Player <${i}>`, ...appearances[(i * 7) % appearances.length] }));
  const snapshot = (revision = 10, selected = members) => socket.emit('party:snapshot', { revision, serverTime: epoch + now, members: selected, config: { enabled: true, nameMode: 'ALWAYS', maxVisible: 30 } });
  const event = (revision, age = 0) => ({ action: 'quest', version: 1, id: `level38:quest-completed:${revision}`, revision, occurredAt: new Date(epoch + now - age).toISOString(), durationMs: 4000 });
  const animate = milliseconds => { now += milliseconds; const batch = [...frames.values()]; frames.clear(); for (const callback of batch) callback(now); };
  return { w, socket, frames, members, snapshot, event, animate,
    nodes: () => [...w.document.querySelectorAll('.party-avatar')],
    celebrating: () => [...w.document.querySelectorAll('.is-quest-celebrating')],
    send: (revision, age = 0) => socket.emit('party:action', event(revision, age)),
    hide: value => { hidden = value; w.document.dispatchEvent(new w.Event('visibilitychange')); },
    storage: () => Object.fromEntries(Object.keys(w.sessionStorage).map(key => [key, w.sessionStorage.getItem(key)])) };
}
const x = node => node.style.transform.match(/translate\(([^,]+),/)[1];

test('all visible party members celebrate for four seconds, retaining names, identity, lanes and horizontal positions', async t => {
  const p = await client(t); p.snapshot(); p.animate(0);
  assert.equal(p.nodes().length, 16);
  assert.ok(p.nodes().every(node => !node.querySelector('img').src.includes('/victory/')), 'initial snapshot cannot replay a victory');
  const before = p.nodes().map(node => ({ x: x(node), lane: node.dataset.lane, id: node.dataset.presenceId, name: node.querySelector('.party-name').textContent, nameWidth: node.querySelector('.party-name').style.maxWidth }));
  p.send(11); p.animate(100);
  for (const age of [100, 1600, 2100]) {
    if (age !== 100) p.animate(age);
    assert.equal(p.celebrating().length, 16);
    p.nodes().forEach((node, i) => {
      assert.equal(node.dataset.action, 'celebration');
      assert.ok(node.querySelector('img').src.includes('/victory/'), 'finite victory frames keep cycling beyond 1.5 seconds');
      assert.equal(x(node), before[i].x); assert.equal(node.dataset.lane, before[i].lane);
      assert.equal(node.dataset.presenceId, before[i].id); assert.equal(node.querySelector('.party-name').textContent, before[i].name);
      assert.equal(node.querySelector('.party-name').style.maxWidth, before[i].nameWidth);
    });
    assert.equal(p.frames.size, 1, 'the existing party RAF remains the only animation clock');
  }
  p.socket.emit('party:action', p.event(11)); p.animate(200);
  assert.equal(p.celebrating().length, 0, 'a repeated event did not extend the four-second reaction');
  assert.ok(p.nodes().every(node => node.dataset.action !== 'celebration' && !node.querySelector('img').src.includes('/victory/')));
  assert.equal(p.w.document.getElementById('party-fireworks').hidden, true);
});

test('completion validation, snapshot baseline, out-of-order delivery and refresh acknowledgement prevent replay', async t => {
  const p = await client(t); p.snapshot(10); p.animate(0);
  for (const payload of [{ action: 'quest' }, { ...p.event(11), id: 'fake' }, { ...p.event(11), occurredAt: 'invalid' }, { ...p.event(11), durationMs: 99999 }, { ...p.event(11), version: 2 }, p.event(10), { action: 'failed' }, { action: 'cancelled' }, { action: 'active' }]) p.socket.emit('party:action', payload);
  assert.equal(p.celebrating().length, 0);
  p.send(11, 5000); assert.equal(p.celebrating().length, 0, 'already expired completion is consumed without replay');
  p.send(13); p.animate(1000); p.send(12); p.animate(3200);
  assert.equal(p.celebrating().length, 16, 'a distinct lower revision arriving out of order still receives its reaction');
  p.send(13); p.animate(800); assert.equal(p.celebrating().length, 0, 'duplicate higher revision never restarts it');
  p.send(12); p.animate(1); assert.equal(p.celebrating().length, 0);
  const refreshed = await client(t, { storage: p.storage() }); refreshed.snapshot(13); refreshed.animate(0); refreshed.send(13); refreshed.animate(1);
  assert.equal(refreshed.celebrating().length, 0);
  assert.ok(refreshed.nodes().every(node => !node.querySelector('img').src.includes('/victory/')));
});

test('an older completion delivered late cannot shorten a newer celebration or extend it when duplicated', async t => {
  const p = await client(t); p.snapshot(10); p.animate(0);
  p.send(13); p.animate(1000); p.send(12, 2000); p.animate(2001);
  assert.equal(p.celebrating().length, 16, 'the older event deadline at three seconds cannot truncate the newer four-second reaction');
  p.send(12); p.animate(998); assert.equal(p.celebrating().length, 16);
  p.animate(1); assert.equal(p.celebrating().length, 0, 'a duplicate older ID cannot extend the original deadline');
});

test('latency uses the server snapshot clock; hiding, disconnecting and disabling cleanly consume the effect', async t => {
  const p = await client(t); p.snapshot(20); p.animate(0); p.send(21, 3000); p.animate(999);
  assert.equal(p.celebrating().length, 16); p.animate(1); assert.equal(p.celebrating().length, 0);
  p.send(22); p.animate(100); p.hide(true);
  assert.equal(p.celebrating().length, 0); assert.equal(p.frames.size, 0);
  assert.ok(p.nodes().every(node => node.dataset.action === 'idle' && !node.querySelector('img').src.includes('/victory/')));
  p.hide(false); p.send(22); p.animate(10); assert.equal(p.celebrating().length, 0);
  p.send(23); p.socket.emit('disconnect'); assert.equal(p.celebrating().length, 0); assert.equal(p.frames.size, 0);
  p.snapshot(23); p.send(23); p.animate(1); assert.equal(p.celebrating().length, 0);
  p.send(24); p.socket.emit('party:config', { enabled: false, nameMode: 'ALWAYS', maxVisible: 30 });
  assert.equal(p.celebrating().length, 0); assert.equal(p.frames.size, 0);
  p.socket.emit('party:config', { enabled: true, nameMode: 'ALWAYS', maxVisible: 30 }); p.send(24); p.animate(1);
  assert.equal(p.celebrating().length, 0);
  p.send(25); p.w.dispatchEvent(new p.w.Event('pagehide'));
  assert.equal(p.celebrating().length, 0); assert.equal(p.frames.size, 0); assert.equal(p.nodes().length, 0);
});

test('the existing LEVEL 38 finale takes priority over individual reactions', async t => {
  const p = await client(t); p.snapshot(30); p.animate(0); p.send(31); p.animate(100);
  assert.equal(p.celebrating().length, 16);
  p.socket.emit('level38:unlocked', { version: 1, id: 'level38:unlock:1', sequence: 1 }); p.animate(100);
  assert.equal(p.celebrating().length, 0); assert.equal(p.w.document.getElementById('party-fireworks').hidden, false);
  p.send(32); assert.equal(p.celebrating().length, 0);
  p.animate(10001); assert.equal(p.w.document.getElementById('party-fireworks').hidden, true);
  p.send(32); p.animate(1); assert.equal(p.celebrating().length, 0, 'a completion consumed during the finale cannot replay afterward');
});

test('reduced motion retains a quiet four-second indication and OWNER preview never acknowledges production events', async t => {
  const p = await client(t, { reduced: true }); p.snapshot(); p.animate(0);
  const positions = p.nodes().map(node => node.style.transform); p.send(11); p.animate(2000);
  assert.equal(p.celebrating().length, 16);
  assert.deepEqual(p.nodes().map(node => node.style.transform), positions);
  assert.ok(p.nodes().every(node => node.dataset.action === 'idle' && !node.querySelector('img').src.includes('/victory/')));
  p.animate(2000); assert.equal(p.celebrating().length, 0);
  const preview = await client(t, { preview: true }); preview.animate(0); preview.w.document.getElementById('preview-victory').click(); preview.animate(3000);
  assert.equal(preview.celebrating().length, 3); assert.deepEqual(preview.storage(), {});
  preview.animate(1000); assert.equal(preview.celebrating().length, 0);
});
