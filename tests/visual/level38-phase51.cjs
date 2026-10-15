// Installed Chrome, isolated PostgreSQL schemas; no production access or OBS performance claim.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {io}=require('socket.io-client');
const {chromium}=require('../../dist/phase3-qa-tools/node_modules/playwright');
const {fixture}=require('../integration/support.cjs');
const {newToken,hashToken}=require('../../dist/modules/level38/auth');
const {SPRITE_MANIFEST}=require('../../dist/modules/level38/classes');

test('Phase 5.1 readable names, transparent finale, isolated previews and cleanup in Chrome', {timeout:240000},async t=>{
  const f=await fixture(t);await f.start();const owner=await f.operator('Leo','OWNER');
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
  const out=path.resolve('dist/phase51-visual-qa');fs.mkdirSync(out,{recursive:true});
  const context=await browser.newContext({viewport:{width:1920,height:1080},locale:'en-US'});
  await context.addInitScript(()=>{
    const request=requestAnimationFrame.bind(window),cancel=cancelAnimationFrame.bind(window),pending=new Set();
    window.qa={pending,intervals:[],longTasks:[],last:0};
    window.requestAnimationFrame=fn=>{let id;id=request(now=>{pending.delete(id);if(fn.name==='frame'){if(window.qa.last)window.qa.intervals.push(now-window.qa.last);window.qa.last=now;}fn(now);});pending.add(id);return id;};
    window.cancelAnimationFrame=id=>{pending.delete(id);cancel(id);};
    new PerformanceObserver(list=>window.qa.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:false});
  });
  const page=await context.newPage(),errors=[],csp=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Content Security Policy|Refused to/.test(m.text()))csp.push(m.text());});
  await page.goto(f.origin+'/level38/overlay/party');
  assert.equal((await f.call('/api/state')).data.party.nameMode,'ALWAYS');
  const choices=SPRITE_MANIFEST.classes.flatMap(c=>c.variants.map(v=>({classId:c.classId,variantId:v.variantId})));
  const preferred=[{classId:'thief',variantId:'krile'},{classId:'thief',variantId:'faris'},{classId:'machinist',variantId:'cid'},...choices];
  const names=['Garnet','Leo Nifelheim','<b>A very long safe nickname</b>','Celes','Isma','Terra','Moonlight','Black Mage','Freya','Vivi','Pixel Knight','Luna'];
  const sockets=[],identities=[];t.after(()=>sockets.forEach(s=>s.disconnect()));
  const heartbeat=setInterval(()=>sockets.forEach(s=>s.emit('party:heartbeat',{})),20000);t.after(()=>clearInterval(heartbeat));
  async function add(n){
    while(sockets.length<n){const i=sockets.length,token=newToken();
      identities.push(await f.db.participant.create({data:{tokenHash:hashToken(token),nickname:names[i%names.length],expiresAt:new Date('2030-01-01'),...preferred[i]}}));
      const s=io(f.origin+'/level38-party',{path:'/level38/socket.io',transports:['websocket'],forceNew:true,auth:{kind:'viewer'},extraHeaders:{Origin:f.origin,Cookie:`level38_viewer=${token}`}});
      s.on('connect',()=>s.emit('party:register',{}));sockets.push(s);
    }
    await page.waitForFunction(n=>document.querySelectorAll('.party-avatar').length===n,n);
  }
  async function capture(label,target=page){
    await target.waitForTimeout(150);
    const data=await target.evaluate(()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
      return {width:innerWidth,height:innerHeight,background:getComputedStyle(document.body).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,
        names:[...document.querySelectorAll('.party-avatar')].map(el=>{const label=el.querySelector('.party-name');return {avatar:rect(el),label:rect(label),text:label.textContent,ellipsis:getComputedStyle(label).textOverflow,scroll:label.scrollWidth,client:label.clientWidth,opacity:getComputedStyle(label).opacity,hidden:label.hidden,lane:el.dataset.lane};})};
    });
    assert.equal(data.background,'rgba(0, 0, 0, 0)');assert.equal(data.overflow,false);
    for(const a of data.names){assert.ok(Math.abs(a.label.x+a.label.w/2-(a.avatar.x+16))<1);assert.equal(a.ellipsis,'ellipsis');assert.equal(a.hidden,false);assert.equal(a.opacity,'1');assert.ok(a.label.x>=0&&a.label.right<=data.width&&a.label.y>=0);assert.ok(a.label.bottom<a.avatar.bottom-30);}
    for(const a of data.names)for(const b of data.names)if(a!==b&&a.lane===b.lane)assert.ok(a.label.right<=b.label.x+2||b.label.right<=a.label.x+2,'nickname boxes overlap');
    checks.push({label,...data});await target.screenshot({path:path.join(out,label+'.png'),omitBackground:true});
  }
  for(const n of [1,5,15,30]){
    await add(n);await page.waitForTimeout(1700);
    for(const [width,height] of [[1920,1080],[1280,720]]){await page.setViewportSize({width,height});await capture(`names-${width}-${n}`);}
  }
  assert.equal(await page.locator('.party-name b').count(),0);
  assert.ok(await page.locator('.party-name').filter({hasText:'A very long'}).first().evaluate(el=>el.scrollWidth>el.clientWidth));
  const op=async(route,body)=>{const controlRevision=(await f.db.event.findFirstOrThrow()).controlRevision;const r=await f.call('/api/'+route,{...body,controlRevision},owner.cookie);assert.equal(r.status,200);};
  await op('control/party',{enabled:true,nameMode:'ENTRY',maxVisible:30});await page.waitForTimeout(5300);
  assert.equal(await page.locator('.party-name:not(.is-faded)').count(),0);
  await op('control/party',{enabled:true,nameMode:'OFF',maxVisible:30});await page.waitForFunction(()=>[...document.querySelectorAll('.party-name')].every(el=>el.hidden));
  await op('control/party',{enabled:true,nameMode:'ALWAYS',maxVisible:30});
  const quests=await f.db.quest.findMany({where:{isSecret:false},orderBy:{number:'asc'}});
  await op(`control/quests/${quests[0].id}`,{action:'activate'});await op(`control/quests/${quests[0].id}`,{action:'complete'});
  await page.waitForFunction(()=>document.querySelectorAll('.party-avatar[data-action="celebration"]').length===30);
  assert.equal(await page.locator('#party-fireworks').isVisible(),false);await page.waitForTimeout(1600);
  await f.db.quest.updateMany({where:{id:{in:quests.slice(0,37).map(q=>q.id)}},data:{status:'COMPLETED'}});
  await op(`control/quests/${quests[37].id}`,{action:'activate'});
  await page.setViewportSize({width:1920,height:1080});
  const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');const before=await cdp.send('Memory.getDOMCounters');
  await page.evaluate(()=>{window.qa.intervals=[];window.qa.longTasks=[];window.qa.last=0;});
  await op(`control/quests/${quests[37].id}`,{action:'complete'});await page.locator('#party-fireworks').waitFor({state:'visible'});
  assert.equal(await page.locator('#party-celebration strong').textContent(),'ADVENTURE COMPLETE');
  await page.waitForTimeout(500);await page.screenshot({path:path.join(out,'genuine-1920-opening.png'),omitBackground:true});
  await page.waitForTimeout(2500);await page.screenshot({path:path.join(out,'genuine-1920-rockets.png'),omitBackground:true});
  assert.equal(await page.evaluate(()=>window.qa.pending.size),1);
  const pixels=await page.locator('#party-fireworks').evaluate(canvas=>{const a=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let drawn=0;for(let i=3;i<a.length;i+=4)if(a[i])drawn++;return {drawn,total:a.length/4};});assert.ok(pixels.drawn>100);assert.ok(pixels.drawn/pixels.total<.2);
  await page.locator('#party-fireworks').waitFor({state:'hidden',timeout:12000});assert.equal(await page.locator('#party-fireworks').getAttribute('width'),'1');
  const performance=await page.evaluate(()=>{const a=window.qa.intervals.sort((a,b)=>a-b);return {frames:a.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1),longTasks:window.qa.longTasks};});
  await cdp.send('HeapProfiler.collectGarbage');const after=await cdp.send('Memory.getDOMCounters');assert.ok(after.jsEventListeners<=before.jsEventListeners);
  await context.setOffline(true);await page.waitForFunction(()=>document.getElementById('party-stage').hidden);await context.setOffline(false);await page.waitForFunction(()=>!document.getElementById('party-stage').hidden);assert.equal(await page.locator('#party-fireworks').isVisible(),false);
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.party-avatar').length===30);assert.equal(await page.locator('#party-fireworks').isVisible(),false);
  const admin=await browser.newContext({viewport:{width:1920,height:1080},locale:'es-ES'});const [name,value]=owner.cookie.split('=');await admin.addCookies([{name,value,url:f.origin}]);
  const preview=await admin.newPage(),eventBefore=await f.db.event.findFirstOrThrow();
  for(const n of [1,5,15,30])for(const [width,height] of [[1920,1080],[1280,720]]){
    await preview.setViewportSize({width,height});await preview.goto(`${f.origin}/level38/overlay/party?preview=${n}`);await preview.waitForFunction(n=>document.querySelectorAll('.party-avatar').length===n,n);
    await preview.locator('#preview-finale').click();await preview.waitForTimeout(600);await capture(`preview-fireworks-${width}-${n}`,preview);
    assert.equal(await preview.locator('#party-celebration strong').textContent(),'AVENTURA COMPLETADA');
  }
  await preview.emulateMedia({reducedMotion:'reduce'});await preview.locator('#preview-finale').click();await preview.waitForTimeout(150);
  const quiet=await preview.locator('#party-fireworks').evaluate(c=>c.toDataURL());await preview.waitForTimeout(500);assert.equal(await preview.locator('#party-fireworks').evaluate(c=>c.toDataURL()),quiet);
  await preview.screenshot({path:path.join(out,'reduced-motion-1280.png'),omitBackground:true});await preview.locator('#party-fireworks').waitFor({state:'hidden'});
  assert.deepEqual(await f.db.event.findFirstOrThrow(),eventBefore);
  assert.deepEqual(await f.db.participant.findMany({orderBy:{createdAt:'asc'}}),identities);
  await preview.close();await admin.close();assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({browser:browser.version(),checks,performance,before,after,pixels,errors,csp,actualOBS:false},null,2));
});

test('Phase 5.1 30-avatar fireworks performance and repeated disposal without screenshot overhead', {timeout:90000},async t=>{
  const f=await fixture(t);await f.start();const owner=await f.operator('Leo','OWNER');
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  const [name,value]=owner.cookie.split('=');await context.addCookies([{name,value,url:f.origin}]);
  await context.addInitScript(()=>{
    const request=requestAnimationFrame.bind(window),cancel=cancelAnimationFrame.bind(window),pending=new Set();
    window.qa={pending,intervals:[],last:0,peak:0,longTasks:[]};let fireworks;
    Object.defineProperty(window,'Level38PartyFireworks',{get:()=>fireworks,set:value=>{
      const create=value.create;value.create=(...args)=>{window.qa.effect=create(...args);return window.qa.effect;};fireworks=value;
    }});
    window.requestAnimationFrame=fn=>{let id;id=request(now=>{pending.delete(id);if(fn.name==='frame'){if(window.qa.last)window.qa.intervals.push(now-window.qa.last);window.qa.last=now;window.qa.peak=Math.max(window.qa.peak,window.qa.effect?.particleCount||0);}fn(now);});pending.add(id);return id;};
    window.cancelAnimationFrame=id=>{pending.delete(id);cancel(id);};
    new PerformanceObserver(list=>window.qa.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:false});
  });
  const page=await context.newPage();await page.goto(f.origin+'/level38/overlay/party?preview=30');
  await page.waitForFunction(()=>document.querySelectorAll('.party-avatar').length===30);await page.waitForTimeout(2500);
  await page.locator('#preview-finale').click();await page.waitForTimeout(10300); // Warm canvas/font resources before measuring repeated runs.
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');const results=[];
  for(const [width,height] of [[1920,1080],[1280,720]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(500);await cdp.send('HeapProfiler.collectGarbage');
    const before=await cdp.send('Memory.getDOMCounters'),heapBefore=await cdp.send('Performance.getMetrics');
    await page.evaluate(()=>{window.qa.intervals=[];window.qa.longTasks=[];window.qa.last=0;window.qa.peak=0;window.qa.started=performance.now();document.getElementById('preview-finale').click();});
    await page.waitForTimeout(10300);
    const result=await page.evaluate(()=>{const a=window.qa.intervals.sort((a,b)=>a-b);return {durationMs:performance.now()-window.qa.started,frames:a.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1),longTasks:window.qa.longTasks,peakParticles:window.qa.peak,remainingParticles:window.qa.effect.particleCount,active:window.qa.effect.active,raf:window.qa.pending.size,canvasWidth:document.getElementById('party-fireworks').width};});
    await cdp.send('HeapProfiler.collectGarbage');const after=await cdp.send('Memory.getDOMCounters'),heapAfter=await cdp.send('Performance.getMetrics');
    assert.equal(result.active,false);assert.equal(result.remainingParticles,0);assert.equal(result.canvasWidth,1);assert.equal(result.raf,1);
    assert.ok(result.peakParticles<=900);assert.ok(result.peakParticles>=300);assert.equal(after.nodes,before.nodes);assert.equal(after.jsEventListeners,before.jsEventListeners);
    results.push({width,height,...result,before,after,heapBefore:heapBefore.metrics.find(m=>m.name==='JSHeapUsedSize').value,heapAfter:heapAfter.metrics.find(m=>m.name==='JSHeapUsedSize').value});
  }
  fs.mkdirSync('dist/phase51-visual-qa',{recursive:true});fs.writeFileSync('dist/phase51-visual-qa/performance.json',JSON.stringify({browser:browser.version(),results,actualOBS:false},null,2));
});
