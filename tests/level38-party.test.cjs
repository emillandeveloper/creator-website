const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryPartyPresence } = require('../dist/modules/level38/party-presence');
const sprites = require('../public/js/level38/sprites');
const { publicClass } = require('../dist/modules/level38/classes');
const { JSDOM } = require('jsdom');
function fixture() {
  let now = 1000; const events = [];
  const store = new MemoryPartyPresence((name, payload) => events.push({ name, payload }), () => now);
  const p = { id: 'private-database-id', tokenHash: 'private-token', nickname: 'Garnet', classId: 'thief', variantId: 'faris', streamVisible: true, expiresAt: new Date(9999999) };
  return { store, p, events, advance: ms => { now += ms; store.sweep(); } };
}
test('presence is one safe identity across multiple tabs, nickname edits and reconnect grace', () => {
  const {store,p,events,advance} = fixture();
  assert.equal(store.connect('tab-a', p), true); const first = store.members()[0];
  assert.equal(store.connect('tab-b', p), true); assert.equal(store.members().length, 1);
  store.disconnect('tab-a'); advance(46000); store.heartbeat('tab-b'); assert.deepEqual(store.members(), [first]);
  store.disconnect('tab-b'); advance(44000); store.connect('tab-c', p); assert.deepEqual(store.members(), [first]);
  store.update({...p,nickname:'New name'}); assert.equal(store.members()[0].presenceId, first.presenceId);
  assert.equal(store.members()[0].nickname, 'New name');
  assert.deepEqual(Object.keys(first).sort(), ['classId','nickname','presenceId','variantId']);
  assert.doesNotMatch(JSON.stringify(events), /private-database-id|private-token|expiresAt|tokenHash/);
  store.disconnect('tab-c'); advance(45000); assert.deepEqual(store.members(), []);
  store.connect('tab-d',p); assert.notEqual(store.members()[0].presenceId,first.presenceId);
});
test('anonymous, visibility opt-out, stale clients, expiry and cleanup cannot leave ghost avatars', () => {
  const {store,p,advance} = fixture();
  assert.equal(store.connect('anonymous',{...p,nickname:null,classId:null}), false);
  store.connect('a',{...p,streamVisible:false}); assert.equal(store.members().length,0);
  store.update(p); assert.equal(store.members().length,1);
  store.update({...p,streamVisible:false}); assert.equal(store.members().length,0);
  store.update(p); advance(60000); assert.equal(store.members().length,0); assert.equal(store.heartbeat('a'),false);
  store.connect('b',p); store.update({...p,nickname:null,classId:null,expiresAt:new Date(0)}); assert.equal(store.members().length,0);
  store.connect('c',p); store.clear(); assert.equal(store.members().length,0); assert.equal(store.heartbeat('c'),false);
});
test('presence visibility lifecycles preserve FIFO ordering in snapshots and incremental delivery', () => {
  const {store,p} = fixture(); store.connect('a',p); store.connect('b',{...p,id:'second'});
  store.update({...p,streamVisible:false}); store.update(p);
  assert.equal(store.members()[1].presenceId,store.target(p.id));
});
test('external sprite clock uses the same frame contract without individual timers, retains fallback and mirroring', t => {
  const dom = new JSDOM('<div id="sprite"></div>'); t.after(()=>dom.window.close());
  const root=dom.window.document.getElementById('sprite'), job=publicClass('thief','krile');
  const renderer=sprites.render(root,job,{externalClock:true});
  renderer.paint('walk',200,true);
  assert.equal(root.querySelector('img').getAttribute('src'),job.sprite.animations.walk.frames[1].path);
  assert.equal(root.querySelector('.l38-sprite').style.transform,'scaleX(-1)');
  renderer.paint('celebration',1500,false);
  assert.equal(root.querySelector('img').getAttribute('src'),job.sprite.animations.idle.frames[0].path);
  root.querySelector('img').dispatchEvent(new dom.window.Event('error'));
  renderer.paint('walk',0); assert.equal(root.querySelector('img').getAttribute('src'),sprites.placeholder);
  renderer.dispose();
});
