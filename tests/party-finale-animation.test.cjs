const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { JSDOM } = require('jsdom');
const manifest = require('../public/level38/classes/manifest.json');

async function client(t, { preview = 0, reduced = false } = {}) {
  const dom = new JSDOM(`<body data-preview="${preview}"><main id="party-stage"></main><span id="party-overflow" hidden></span><canvas id="party-fireworks" hidden></canvas><section id="party-celebration" hidden></section><button id="preview-vote"></button><button id="preview-victory"></button><button id="preview-finale"></button><select id="preview-names"></select></body>`, { url: 'https://level38.test/level38/overlay/party', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window, socket = new EventEmitter(), frames = new Map(), motion = { matches: reduced };
  const epoch = Date.parse('2026-10-21T12:00:00.000Z');
  let now = 0, nextFrame = 0, hidden = false;
  w.innerWidth = 1920; w.innerHeight = 1080;
  w.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  w.cancelAnimationFrame = id => frames.delete(id);
  w.performance.now = () => now; w.matchMedia = () => motion;
  Object.defineProperty(w.document, 'hidden', { get: () => hidden });
  w.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, fillRect() {} });
  w.fetch = async () => ({ ok: true, json: async () => manifest });
  socket.disconnect = () => socket.emit('disconnect'); w.io = () => socket;
  for (const file of ['sprites', 'party-fireworks', 'party-overlay']) w.eval(fs.readFileSync(`public/js/level38/${file}.js`, 'utf8'));
  await new Promise(resolve => setImmediate(resolve));
  const appearances = manifest.classes.flatMap(c => c.variants.map(v => ({ classId: c.classId, variantId: v.variantId })));
  const members = Array.from({ length: 16 }, (_, i) => ({ presenceId: `member-${i}`, nickname: `Player ${i}`, ...appearances[(i * 7) % appearances.length] }));
  const snapshot = (selected = members) => socket.emit('party:snapshot', { revision: 10, serverTime: epoch + now, members: selected, config: { enabled: true, nameMode: 'ENTRY', maxVisible: 30 } });
  const animate = milliseconds => { now += milliseconds; const batch = [...frames.values()]; frames.clear(); for (const callback of batch) callback(now); };
  const nodes = () => [...w.document.querySelectorAll('.party-avatar')];
  return { w, socket, frames, motion, members, snapshot, animate, nodes,
    images: () => nodes().map(node => node.querySelector('img').getAttribute('src')),
    finale: () => !w.document.getElementById('party-fireworks').hidden,
    unlock: (sequence = 1) => socket.emit('level38:unlocked', { version: 1, id: `level38:unlock:${sequence}`, sequence }),
    preview: (id = 'preview-1') => socket.emit('level38:celebration-preview', { version: 1, id, startsAt: epoch + now }),
    vote: () => socket.emit('party:action', { action: 'vote', presenceId: members[0].presenceId }),
    hide: value => { hidden = value; w.document.dispatchEvent(new w.Event('visibilitychange')); },
    storage: () => Object.fromEntries(Object.keys(w.sessionStorage).map(key => [key, w.sessionStorage.getItem(key)])) };
}
const identities = p => p.nodes().map(node => ({ id: node.dataset.presenceId, name: node.querySelector('.party-name').textContent, transform: node.style.transform, lane: node.dataset.lane, direction: node.dataset.direction }));
function assertVictory(p, frame) {
  assert.ok(p.finale(), 'the existing fireworks are active');
  assert.ok(p.nodes().length > 0);
  assert.ok(p.nodes().every(node => node.dataset.action === 'celebration'));
  assert.ok(p.images().every(path => new RegExp(`/victory/${frame ?? '(00|01)'}\\.png$`).test(path)), 'the real shared renderer selects authored victory PNGs');
  assert.equal(p.frames.size, 1, 'avatars and fireworks share the original RAF');
}
function assertNormal(p) {
  assert.equal(p.finale(), false);
  assert.ok(p.nodes().every(node => node.dataset.action !== 'celebration'));
  assert.ok(p.images().every(path => !path.includes('/victory/')));
}

test('genuine unlock loops authored victory frames for ten seconds with frozen party identities and returns to normal', async t => {
  const p = await client(t); p.snapshot(); p.animate(0);
  const before = identities(p);
  p.unlock();
  for (const [delta, frame] of [[260, '01'], [250, '00'], [1000, '00'], [3750, '01'], [4500, '01']]) {
    p.animate(delta); assertVictory(p, frame); assert.deepEqual(identities(p), before);
    assert.ok(p.nodes().every(node => !node.querySelector('.party-name').classList.contains('is-faded')), 'ENTRY names remain visible throughout the finale');
  }
  // At 9.76s a vote must not create a hop, restart a clock or replace a pose.
  p.vote(); p.animate(100); assertVictory(p, '01'); assert.deepEqual(identities(p), before);
  p.animate(140); assertNormal(p); p.animate(1000); assertNormal(p);
  assert.deepEqual(p.storage(), { 'level38:party:last-quest-completion': '10', 'level38:party:last-unlock': '1' });
  p.unlock(); p.animate(1); assertNormal(p);
});

test('isolated OWNER previews and live Test Finale invoke the same complete avatar celebration as unlock', async t => {
  for (const count of [1, 5, 15, 30]) {
    const p = await client(t, { preview: count }); p.animate(0);
    assert.equal(p.nodes().length, count);
    p.w.document.getElementById('preview-finale').click();
    p.animate(5260); assertVictory(p, '01');
    p.animate(4500); assertVictory(p, '01');
    p.animate(240); assertNormal(p);
    assert.deepEqual(p.storage(), {}, 'isolated preview never acknowledges or mutates real event state');
  }
  const live = await client(t); live.snapshot(); live.animate(0);
  live.preview(); live.animate(0); live.animate(5260); assertVictory(live, '01');
  live.animate(4740); assertNormal(live);
  assert.equal(live.storage()['level38:party:last-unlock'], undefined, 'live Test Finale has no durable unlock acknowledgement');
  live.unlock(); live.animate(5260); assertVictory(live, '01');
  live.animate(4740); assertNormal(live);
});

test('reduced-motion finales hold the visibly raised-arm frame until the existing quiet fireworks finish', async t => {
  const p = await client(t, { reduced: true }); p.snapshot(); p.animate(0);
  const before = identities(p);
  p.unlock();
  for (const delta of [100, 1500, 2399]) {
    p.animate(delta); assertVictory(p, '01'); assert.deepEqual(identities(p), before);
  }
  p.animate(1); assertNormal(p);
  assert.deepEqual(identities(p).map(x => x.transform), before.map(x => x.transform));
});

test('motion preference changes retain a visible static victory and follow the fireworks lifetime', async t => {
  const p = await client(t); p.snapshot(); p.animate(0); p.unlock();
  p.animate(260); assertVictory(p, '01');
  p.motion.matches = true; p.animate(500); assertVictory(p, '01');
  p.motion.matches = false; p.animate(250); assertVictory(p, '01');
  p.animate(2989); assertVictory(p, '01');
  p.animate(1); assertNormal(p);
  p.unlock(2); p.animate(5260); assertVictory(p, '01');
  p.motion.matches = true; p.animate(1); assertNormal(p);
});

test('roster/layout changes cannot move celebrating members and lifecycle cleanup prevents stuck victory poses', async t => {
  const p = await client(t); p.snapshot(); p.animate(0); p.unlock(); p.animate(260);
  const before = identities(p);
  p.w.innerWidth = 1600; p.w.dispatchEvent(new p.w.Event('resize'));
  p.socket.emit('party:joined', { presenceId: 'late', nickname: 'Late arrival', classId: 'knight', variantId: 'bartz' });
  p.animate(100);
  assert.deepEqual(identities(p).slice(0, before.length), before);
  assert.ok(p.nodes().slice(0, before.length).every(node => node.dataset.action === 'celebration'));
  assert.equal(p.nodes().at(-1).dataset.action === 'celebration', false, 'late arrivals keep their normal behavior');
  p.hide(true); assertNormal(p); assert.equal(p.frames.size, 0);
  p.hide(false); p.animate(1); assertNormal(p);
  p.unlock(2); p.animate(260); assertVictory(p, '01');
  p.socket.emit('disconnect'); assertNormal(p); assert.equal(p.frames.size, 0);
  p.snapshot(); p.animate(1); assertNormal(p);
  p.unlock(3); p.animate(260); assertVictory(p, '01');
  p.socket.emit('party:config', { enabled: false, nameMode: 'ENTRY', maxVisible: 30 });
  assert.equal(p.nodes().length, 0); assert.equal(p.finale(), false); assert.equal(p.frames.size, 0);
  p.socket.emit('party:config', { enabled: true, nameMode: 'ENTRY', maxVisible: 30 }); p.animate(1); assertNormal(p);
  p.unlock(4); p.animate(260); assertVictory(p, '01');
  p.w.dispatchEvent(new p.w.Event('pagehide'));
  assert.equal(p.nodes().length, 0); assert.equal(p.finale(), false); assert.equal(p.frames.size, 0);
});
