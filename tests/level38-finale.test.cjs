const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

function client(t,{storage={},reduced=false}={}){
  const dom=new JSDOM('<body><main><button id="before">Before</button><div id="progress-segments"></div></main><div id="event-toast" hidden></div><div id="level-up" hidden><canvas id="fireworks"></canvas><p id="celebration-preview-label"></p><p id="celebration-progress"></p><button id="celebration-dismiss">Continue</button></div></body>',{url:'https://level38.test/level38',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());const w=dom.window;let now=100000,id=0,hidden=false,draws=0,clears=0;
  const timers=new Map(),frames=new Map(),media={matches:reduced,addEventListener(type,fn){this.change=fn;}};
  w.Date.now=()=>now;w.setTimeout=(fn,ms=0)=>{timers.set(++id,{fn,at:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);
  w.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};w.cancelAnimationFrame=id=>frames.delete(id);
  w.matchMedia=()=>media;Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){clears++;},fillRect(){draws++;}});
  for(const [key,value] of Object.entries(storage))w.sessionStorage.setItem(key,value);
  w.Level38={byId:id=>w.document.getElementById(id)};w.fetch=()=>{throw new Error('Local finale must never make a server request');};
  for(const file of ['fireworks','experience'])w.eval(fs.readFileSync(`public/js/level38/${file}.js`,'utf8'));
  const socket=new EventEmitter();w.Level38Experience.attach(socket);
  const tick=ms=>{now+=ms;for(const [id,task] of [...timers])if(task.at<=now){timers.delete(id);task.fn();}};
  const animate=ms=>{tick(ms);const batch=[...frames];frames.clear();for(const [,fn] of batch)fn(now);};
  return {w,socket,tick,animate,timers,frames,media,get draws(){return draws;},get clears(){return clears;},
    visible:()=>!w.document.getElementById('level-up').hidden,
    observe:(revision,completed,unlockSequence,resetSequence=0)=>w.Level38Experience.observe({serverTime:now,event:{revision,completed,unlockSequence,resetSequence}}),
    event:(sequence,revision)=>({version:1,id:`level38:unlock:${sequence}`,sequence,revision,completed:38,target:38,startsAt:now,durationMs:6500}),
    storage:()=>Object.fromEntries(Object.keys(w.sessionStorage).map(key=>[key,w.sessionStorage.getItem(key)])),
    hide:value=>{hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));},
    key:key=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key,cancelable:true})),
    dismiss:()=>w.document.getElementById('celebration-dismiss').click()};
}

test('persistent genuine finale acknowledges locally, restores pending refresh, never auto-dismisses and isolates clients',t=>{
  const a=client(t),b=client(t);
  for(const p of [a,b]){p.observe(1,37,0);p.socket.emit('level38:unlocked',p.event(1,2));p.tick(1);assert.ok(p.visible());p.tick(60000);assert.ok(p.visible());assert.equal(p.w.sessionStorage.getItem('level38:acknowledged-unlock'),null);}
  const refresh=client(t,{storage:a.storage()});refresh.observe(2,38,1);refresh.tick(1);assert.ok(refresh.visible());
  refresh.w.document.getElementById('level-up').click();assert.ok(!refresh.visible());assert.equal(refresh.w.sessionStorage.getItem('level38:acknowledged-unlock'),'1');assert.equal(refresh.w.sessionStorage.getItem('level38:pending-unlock'),null);
  assert.ok(b.visible());
  const acknowledged=client(t,{storage:refresh.storage()});acknowledged.observe(2,38,1);acknowledged.tick(10000);assert.ok(!acknowledged.visible());
  acknowledged.socket.emit('disconnect');acknowledged.socket.emit('connect');acknowledged.observe(2,38,1);acknowledged.socket.emit('level38:unlocked',acknowledged.event(1,2));acknowledged.tick(1);assert.ok(!acknowledged.visible());
  acknowledged.observe(3,37,1);acknowledged.socket.emit('level38:unlocked',acknowledged.event(2,4));acknowledged.tick(1);assert.ok(acknowledged.visible());acknowledged.key('Enter');assert.ok(!acknowledged.visible());
  b.key(' ');assert.ok(!b.visible());a.key('Escape');assert.ok(!a.visible());
  const reset=client(t,{storage:{...a.storage(),'level38:pending-unlock':JSON.stringify({event:a.event(3,6),resetSequence:0})}});reset.observe(7,0,3,1);reset.tick(1);assert.ok(!reset.visible());
});

test('one perpetual renderer cleans frames/timers, pauses hidden tabs and respects reduced motion across repeated previews',t=>{
  const p=client(t);p.observe(1,0,0);p.w.document.getElementById('before').focus();
  for(let run=0;run<6;run++){
    p.socket.emit('level38:celebration-preview',{version:1,id:`preview-${run}`,startsAt:p.w.Date.now(),target:38});p.tick(1);assert.ok(p.visible());
    for(let frame=0;frame<950;frame++)p.animate(34);
    assert.ok(p.draws>0);assert.equal(p.frames.size,1);assert.equal(p.timers.size,0);assert.ok(p.visible());
    p.dismiss();assert.equal(p.frames.size,0);assert.equal(p.timers.size,0);assert.equal(p.w.document.activeElement.id,'before');assert.ok(!p.w.document.querySelector('main').inert);
  }
  assert.equal(p.w.document.querySelectorAll('canvas').length,1);assert.equal(p.w.sessionStorage.getItem('level38:acknowledged-unlock'),null);assert.equal(p.w.sessionStorage.getItem('level38:pending-unlock'),null);
  p.socket.emit('level38:unlocked',p.event(1,2));p.tick(1);p.animate(34);p.hide(true);assert.equal(p.frames.size,0);p.tick(20000);p.hide(false);assert.ok(p.visible());assert.equal(p.frames.size,1);
  p.media.matches=true;p.media.change();assert.equal(p.frames.size,0);assert.ok(p.visible());p.tick(60000);assert.ok(p.visible());p.key('Escape');assert.ok(!p.visible());
  p.hide(true);p.socket.emit('level38:unlocked',p.event(2,3));p.tick(1);assert.ok(!p.visible());p.hide(false);p.tick(1);assert.ok(p.visible());assert.equal(p.frames.size,0);p.dismiss();
  const quiet=client(t,{reduced:true});quiet.observe(1,37,0);quiet.socket.emit('level38:unlocked',quiet.event(1,2));quiet.tick(1);assert.ok(quiet.visible());assert.equal(quiet.frames.size,0);quiet.tick(60000);assert.ok(quiet.visible());quiet.dismiss();
});
