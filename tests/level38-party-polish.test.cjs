const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {EventEmitter}=require('node:events');
const {JSDOM}=require('jsdom');
const manifest=require('../public/level38/classes/manifest.json');

async function client(t,{preview=false,reduced=false,storage={}}={}){
  const dom=new JSDOM(`<body data-preview="${preview?5:0}"><main id="party-stage"></main><span id="party-overflow" hidden></span><canvas id="party-fireworks" hidden></canvas><section id="party-celebration" hidden></section><button id="preview-vote"></button><button id="preview-victory"></button><button id="preview-finale"></button><select id="preview-names"><option>ALWAYS</option><option>ENTRY</option><option>OFF</option></select></body>`,{url:'https://level38.test/level38/overlay/party',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());const w=dom.window;let now=0,id=0,hidden=false,draws=0;
  const frames=new Map(),media={matches:reduced};
  w.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};w.cancelAnimationFrame=id=>frames.delete(id);
  w.performance.now=()=>now;w.matchMedia=()=>media;Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},fillRect(){draws++;}});
  w.fetch=async()=>({ok:true,json:async()=>manifest});
  for(const [k,v] of Object.entries(storage))w.sessionStorage.setItem(k,v);
  const socket=new EventEmitter();socket.disconnect=()=>socket.emit('disconnect');w.io=()=>socket;
  for(const file of ['sprites','party-fireworks','party-overlay'])w.eval(fs.readFileSync(`public/js/level38/${file}.js`,'utf8'));
  await new Promise(resolve=>setImmediate(resolve));
  const member={presenceId:'safe-id',nickname:'<b>Long nickname unchanged</b>',classId:'thief',variantId:'krile'};
  const snapshot=(nameMode='ALWAYS',enabled=true,members=[member])=>socket.emit('party:snapshot',{members,config:{enabled,nameMode,maxVisible:30}});
  const animate=ms=>{now+=ms;const batch=[...frames];frames.clear();for(const [,fn] of batch)fn(now);};
  const event=sequence=>({version:1,id:`level38:unlock:${sequence}`,sequence});
  return {w,socket,frames,media,snapshot,animate,event,member,get draws(){return draws;},
    visible:()=>!w.document.getElementById('party-fireworks').hidden,
    hide:value=>{hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));},
    storage:()=>Object.fromEntries(Object.keys(w.sessionStorage).map(k=>[k,w.sessionStorage.getItem(k)]))};
}

test('overlay nickname modes remain safe, persistent and reactive without rewriting identity',async t=>{
  const p=await client(t);p.snapshot();p.animate(6000);
  const name=p.w.document.querySelector('.party-name');
  assert.equal(name.textContent,p.member.nickname);assert.equal(name.querySelector('b'),null);assert.equal(name.hidden,false);assert.equal(name.classList.contains('is-faded'),false);
  assert.equal(name.style.maxWidth,'124px');assert.ok(parseInt(name.style.bottom)>30);
  p.snapshot('OFF');p.animate(1);assert.equal(name.hidden,true);
  p.snapshot('ENTRY');p.animate(1);assert.equal(name.classList.contains('is-faded'),true);
  p.socket.emit('party:action',{presenceId:'safe-id',action:'vote'});p.animate(1);assert.equal(name.hidden,false);assert.equal(name.classList.contains('is-faded'),false);
  p.animate(5300);assert.equal(name.classList.contains('is-faded'),true);
  p.socket.emit('party:updated',{...p.member,nickname:'Garnet'});p.animate(1);assert.equal(name.textContent,'Garnet');
  assert.equal(p.w.document.querySelector('.party-avatar').dataset.presenceId,'safe-id');
});

test('genuine overlay finale dedupes across reconnect/refresh; quest and fake preview stay separate',async t=>{
  const p=await client(t);p.snapshot();p.animate(1600);
  p.socket.emit('party:action',{action:'quest'});p.animate(1);assert.equal(p.visible(),false);
  p.socket.emit('level38:celebration-preview',{id:'preview'});assert.equal(p.visible(),false);
  p.socket.emit('level38:unlocked',{...p.event(1),id:'fake'});assert.equal(p.visible(),false);
  p.socket.emit('level38:unlocked',p.event(1));assert.equal(p.visible(),true);p.animate(100);
  assert.equal(p.frames.size,1);assert.ok(p.draws>0);assert.equal(p.w.document.querySelector('.party-avatar').dataset.action,'celebration');
  p.animate(6000);p.socket.emit('level38:unlocked',p.event(1));p.animate(4000);assert.equal(p.visible(),false);
  assert.equal(p.w.document.getElementById('party-fireworks').width,1);assert.equal(p.w.document.getElementById('party-celebration').hidden,true);
  p.socket.emit('disconnect');assert.equal(p.frames.size,0);p.snapshot();p.socket.emit('level38:unlocked',p.event(1));assert.equal(p.visible(),false);
  const fresh=await client(t,{storage:p.storage()});fresh.snapshot();fresh.socket.emit('level38:unlocked',fresh.event(1));assert.equal(fresh.visible(),false);
  p.socket.emit('level38:unlocked',p.event(2));assert.equal(p.visible(),true);p.hide(true);assert.equal(p.visible(),false);assert.equal(p.frames.size,0);
  p.hide(false);p.socket.emit('level38:unlocked',p.event(2));assert.equal(p.visible(),false);
  p.socket.emit('level38:unlocked',p.event(3));p.socket.emit('party:config',{enabled:false,nameMode:'ALWAYS',maxVisible:30});assert.equal(p.visible(),false);assert.equal(p.frames.size,0);
});

test('OWNER visual preview stays isolated; reduced motion and zero-avatar effects finish cleanly',async t=>{
  const p=await client(t,{preview:true,reduced:true});p.animate(1);
  p.w.document.getElementById('preview-finale').click();p.animate(50);assert.equal(p.visible(),true);const draws=p.draws;
  p.animate(1000);assert.equal(p.draws,draws);assert.deepEqual(p.storage(),{});
  p.animate(3000);assert.equal(p.visible(),false);
  const empty=await client(t);empty.snapshot('ALWAYS',true,[]);assert.equal(empty.frames.size,0);
  empty.socket.emit('level38:unlocked',empty.event(1));assert.equal(empty.frames.size,1);empty.animate(10001);assert.equal(empty.frames.size,0);assert.equal(empty.visible(),false);
});

test('finite fireworks budget, restart, resize, reduced-motion switch and disposal',async t=>{
  const p=await client(t,{preview:true});const canvas=p.w.document.getElementById('party-fireworks'),banner=p.w.document.getElementById('party-celebration');
  const effect=p.w.Level38PartyFireworks.create(canvas,banner);effect.start(0);let peak=0;
  for(let now=0;now<=10000;now+=17){effect.paint(now);peak=Math.max(peak,effect.particleCount);assert.ok(effect.particleCount<=900);}
  effect.paint(10000);
  assert.ok(peak>=300);assert.equal(effect.active,false);assert.equal(effect.particleCount,0);assert.equal(canvas.width,1);
  effect.start(20000);effect.resize();effect.paint(20050,true);const draws=p.draws;effect.paint(22000,true);assert.equal(p.draws,draws);effect.paint(24000,true);assert.equal(effect.active,false);
  effect.start(30000);effect.start(30010);effect.stop();effect.stop();assert.equal(effect.particleCount,0);assert.equal(banner.hidden,true);
});
