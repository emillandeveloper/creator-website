const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {setTimeout:delay}=require('node:timers/promises');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const {catalogs}=require('../public/js/level38/translations');

test('shared control finale keeps preview dedupe separate, prioritizes genuine events and resets without replay',async t=>{
  const dom=new JSDOM('<body class="l38-control"><div id="progress-segments"></div><div id="event-toast" hidden></div><div id="level-up" hidden><canvas id="fireworks"></canvas><p id="celebration-preview-label"></p><p id="celebration-progress"></p><button id="celebration-dismiss"></button></div></body>',{url:'https://level38.test/level38/control',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());const w=dom.window;
  w.matchMedia=()=>({matches:true,addEventListener(){}});w.Level38={byId:id=>w.document.getElementById(id)};
  w.eval(fs.readFileSync('public/js/level38/experience.js','utf8'));
  const socket=new EventEmitter();w.Level38Experience.attach(socket);socket.emit('connect');
  const observe=(revision,completed,unlockSequence,resetSequence=0)=>w.Level38Experience.observe({serverTime:Date.now(),event:{revision,completed,unlockSequence,resetSequence}});
  const visible=()=>!w.document.getElementById('level-up').hidden;
  const dismiss=()=>w.document.getElementById('celebration-dismiss').click();
  observe(1,4,0);const preview={version:1,id:'preview-1',startsAt:Date.now(),durationMs:6500,target:38};
  socket.emit('level38:celebration-preview',preview);await delay(20);assert.ok(visible());assert.equal(w.sessionStorage.getItem('level38:last-unlock'),null);assert.match(w.document.getElementById('celebration-progress').textContent,/unchanged/);
  dismiss();socket.emit('level38:celebration-preview',preview);await delay(20);assert.ok(!visible());
  const real={version:1,id:'level38:unlock:1',sequence:1,revision:2,completed:38,target:38,startsAt:Date.now(),durationMs:6500};
  observe(2,38,1);socket.emit('level38:unlocked',real);socket.emit('level38:celebration-preview',{...preview,id:'preview-2'});await delay(20);
  assert.ok(visible());assert.equal(w.document.getElementById('celebration-preview-label').hidden,true);assert.equal(w.sessionStorage.getItem('level38:acknowledged-unlock'),null);
  observe(3,0,1,1);assert.ok(!visible());socket.emit('level38:unlocked',real);await delay(20);assert.ok(!visible());
  observe(4,38,2,1);socket.emit('level38:unlocked',{...real,id:'level38:unlock:2',sequence:2,revision:4,startsAt:Date.now()});await delay(20);assert.ok(visible());
  dismiss();socket.emit('disconnect');socket.emit('connect');observe(4,38,2,1);socket.emit('level38:unlocked',{...real,id:'level38:unlock:2',sequence:2,revision:4});await delay(20);assert.ok(!visible());
});

test('owner and shared celebration templates use complete ES/EN catalogs',()=>{
  for(const file of ['owner-tools','celebration']){
    for(const [,key] of fs.readFileSync(`src/views/level38/${file}.ejs`,'utf8').matchAll(/data-i18n="([^"<>]+)"/g))assert.ok(catalogs.es[key]&&catalogs.en[key],key);
  }
});
