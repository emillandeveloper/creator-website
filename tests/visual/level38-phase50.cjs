// Real Chrome / disposable PostgreSQL. No OBS FPS claims; no production connections.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {io}=require('socket.io-client');
const {chromium}=require('../../dist/phase3-qa-tools/node_modules/playwright');
const {fixture}=require('../integration/support.cjs');
const {newToken,hashToken}=require('../../dist/modules/level38/auth');
const {SPRITE_MANIFEST}=require('../../dist/modules/level38/classes');

test('Phase 5 transparent overlay, real presence, responsive crowds and three-minute Chrome stress', {timeout:360000}, async t=>{
  const f=await fixture(t);await f.start();const owner=await f.operator('Leo','OWNER');
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
  const out=path.resolve('dist/phase50-visual-qa');fs.mkdirSync(out,{recursive:true});
  const errors=[],csp=[],checks=[];
  const context=await browser.newContext({viewport:{width:1920,height:1080},locale:'en-US'});
  await context.addInitScript(()=>{
    const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window),pending=new Set();
    window.qa={pending,longTasks:[],intervals:[],last:0};
    window.requestAnimationFrame=fn=>{let id;id=request(now=>{pending.delete(id);if(window.qa.freeze && fn.name === "frame"){window.qa.resume=()=>fn(performance.now());return;}if(window.qa.last)window.qa.intervals.push(now-window.qa.last);window.qa.last=now;fn(now);});pending.add(id);return id;};
    window.cancelAnimationFrame=id=>{pending.delete(id);cancel(id);};
    new PerformanceObserver(list=>window.qa.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:false});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Content Security Policy|Refused to/.test(m.text()))csp.push(m.text());});
  await page.goto(f.origin+'/level38/overlay/party');
  const count=async n=>page.waitForFunction(n=>document.querySelectorAll('.party-avatar').length===n,n);
  const capture=async label=>{
    // Freeze only the application's RAF callback after resize has painted. This lets all
    // independent image loads settle without requiring 30 walking phases to align.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.evaluate(()=>{window.qa.freeze=true;});
    await page.waitForFunction(()=>typeof window.qa.resume==='function',null,{polling:20});
    await page.waitForFunction(()=>[...document.querySelectorAll('.party-art img')].every(img=>{const b=img.getBoundingClientRect();return b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;}));
    await page.waitForFunction(()=>[...document.querySelectorAll('.party-art img')].every(img=>img.complete&&img.naturalWidth===16));
    const data=await page.evaluate(()=>({html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,
      width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,
      sprites:[...document.querySelectorAll('.party-avatar')].map(el=>{const img=el.querySelector('img'),box=img.getBoundingClientRect();return {x:box.x,y:box.y,w:box.width,h:box.height,native:[img.naturalWidth,img.naturalHeight],pixels:getComputedStyle(img).imageRendering,lane:el.dataset.lane,action:el.dataset.action};})}));
    assert.equal(data.html,'rgba(0, 0, 0, 0)');assert.equal(data.body,'rgba(0, 0, 0, 0)');assert.equal(data.overflow,false);
    for(const sprite of data.sprites){assert.equal(sprite.w,32);assert.equal(sprite.h,48);assert.deepEqual(sprite.native,[16,24]);assert.equal(sprite.pixels,'pixelated');assert.ok(sprite.x>=0&&sprite.y>=0&&sprite.x+32<=data.width&&sprite.y+48<=data.height);}
    checks.push({label,...data});await page.screenshot({path:path.join(out,label+'.png'),omitBackground:true});
    await page.evaluate(()=>{window.qa.freeze=false;const resume=window.qa.resume;window.qa.resume=null;resume();});
  };
  // A real public-page join, visibility toggle and second tab share one authenticated avatar.
  const viewerContext=await browser.newContext({viewport:{width:390,height:844},locale:'es-ES'}),viewer=await viewerContext.newPage();
  await viewer.goto(f.origin+'/level38');await viewer.locator('#join-open').click();await viewer.locator('#nickname').fill('Garnet');await viewer.locator('#nickname').press('Enter');await count(1);
  const identity=await f.db.participant.findFirstOrThrow(),publicId=await page.locator('.party-avatar').getAttribute('data-presence-id');
  const second=await viewerContext.newPage();await second.goto(f.origin+'/level38');await second.waitForFunction(()=>document.getElementById('viewer-name').textContent==='Garnet');await second.close();await count(1);
  await viewer.reload();await viewer.waitForFunction(()=>document.getElementById('viewer-name').textContent==='Garnet');await count(1);
  assert.equal(await page.locator('.party-avatar').getAttribute('data-presence-id'),publicId);
  await viewer.locator('#stream-visible').uncheck();await count(0);await viewer.locator('#stream-visible').check();await count(1);
  assert.deepEqual(await f.db.participant.findUniqueOrThrow({where:{id:identity.id}}),identity);
  await viewer.locator('#stream-visibility').screenshot({path:path.join(out,'es-390-visibility.png')});
  await viewer.evaluate(()=>window.Level38I18n.setLanguage('en'));await viewer.locator('#stream-visibility').screenshot({path:path.join(out,'en-390-visibility.png')});
  assert.ok(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // Explicit test fixtures create real authenticated sessions, never fake overlay events.
  const choices=SPRITE_MANIFEST.classes.flatMap(c=>c.variants.map(v=>({classId:c.classId,variantId:v.variantId})));
  const preferred=[{classId:'thief',variantId:'faris'},{classId:'thief',variantId:'krile'},{classId:'machinist',variantId:'cid'},...choices];
  const sockets=[];t.after(()=>sockets.forEach(s=>s.disconnect()));
  async function add(n){
    while(sockets.length<n-1){
      const i=sockets.length,token=newToken();
      await f.db.participant.create({data:{tokenHash:hashToken(token),nickname:i===0?'<b>safe nickname</b>':`Adventurer ${i+2}`,expiresAt:new Date('2030-01-01'),...preferred[i]}});
      const s=io(f.origin+'/level38-party',{path:'/level38/socket.io',transports:['websocket'],forceNew:true,auth:{kind:'viewer'},extraHeaders:{Origin:f.origin,Cookie:`level38_viewer=${token}`}});
      s.on('connect',()=>s.emit('party:register',{}));sockets.push(s);
    }
    await count(Math.min(n,30));
  }
  const heartbeat=setInterval(()=>sockets.forEach(s=>s.emit('party:heartbeat',{})),20000);t.after(()=>clearInterval(heartbeat));
  for(const n of [1,5,15,30]){
    await add(n);await page.waitForTimeout(1800);
    for(const [width,height] of [[1920,1080],[1280,720]]){await page.setViewportSize({width,height});await capture(`${width}-${n}-party`);}
  }
  assert.equal(await page.locator('.party-name b').count(),0);
  const beforeIds=await page.locator('.party-avatar').evaluateAll(nodes=>nodes.map(n=>n.dataset.presenceId));
  await add(35);await page.locator('#party-overflow').waitFor({state:'visible'});assert.equal(await page.locator('#party-overflow').textContent(),'+5 PARTY MEMBERS');
  assert.deepEqual(await page.locator('.party-avatar').evaluateAll(nodes=>nodes.map(n=>n.dataset.presenceId)),beforeIds);
  const rev=async()=>(await f.db.event.findFirstOrThrow()).controlRevision;
  const configure=async patch=>{const r=await f.call('/api/control/party',{enabled:true,nameMode:'ENTRY',maxVisible:30,...patch,controlRevision:await rev()},owner.cookie);assert.equal(r.status,200);};
  await page.waitForTimeout(5200);assert.equal(await page.locator('.party-name:not(.is-faded)').count(),0);
  await configure({nameMode:'ALWAYS'});await page.waitForFunction(()=>[...document.querySelectorAll('.party-name')].every(el=>!el.hidden&&!el.classList.contains('is-faded')));
  await capture('1280-35-overflow-always');
  await configure({nameMode:'OFF'});await page.waitForFunction(()=>[...document.querySelectorAll('.party-name')].every(el=>el.hidden));
  await configure({enabled:false});await count(0);assert.equal(await page.evaluate(()=>window.qa.pending.size),0);
  await configure({});await count(30);await page.waitForTimeout(1800);
  await page.waitForFunction(()=>document.querySelector('.party-avatar[data-direction="1"] .l38-sprite')?.style.transform==='scaleX(-1)'&&!!document.querySelector('.party-avatar[data-direction="-1"]'));
  // Actual server-side vote and quest actions, with no forged browser reactions.
  const op=async(route,body)=>{const r=await f.call('/api/control/'+route,{...body,controlRevision:await rev()},owner.cookie);assert.equal(r.status,200);};
  await op('polls',{type:'CUSTOM',title:'Overlay vote',options:[{label:'Yes'},{label:'No'}]});const poll=await f.db.poll.findFirstOrThrow({include:{options:true}});await op(`polls/${poll.id}/status`,{action:'open'});
  const cookie=(await viewerContext.cookies()).find(c=>c.name==='level38_viewer');
  const voter=page.locator('.party-avatar').first(),baseY=(await voter.boundingBox()).y;
  await f.call(`/api/polls/${poll.id}/vote`,{optionId:poll.options[0].id},`${cookie.name}=${cookie.value}`);await page.waitForTimeout(140);
  assert.ok((await voter.boundingBox()).y<baseY-3);await page.screenshot({path:path.join(out,'vote-hop.png'),omitBackground:true});
  const quest=await f.db.quest.findFirstOrThrow({where:{status:'AVAILABLE',isSecret:false}});await op(`quests/${quest.id}`,{action:'activate'});await op(`quests/${quest.id}`,{action:'complete'});
  await page.waitForFunction(()=>document.querySelectorAll('.party-avatar[data-action="celebration"]').length===30);await capture('party-victory');
  await page.waitForTimeout(1800);await context.setOffline(true);await page.waitForFunction(()=>document.getElementById('party-stage').hidden);
  assert.equal(await page.evaluate(()=>window.qa.pending.size),0);await context.setOffline(false);await page.waitForFunction(()=>!document.getElementById('party-stage').hidden);await count(30);
  await page.reload();await count(30);
  for(let i=0;i<4;i++){
    await context.setOffline(true);await page.waitForFunction(()=>document.getElementById('party-stage').hidden);
    assert.equal(await page.evaluate(()=>window.qa.pending.size),0);
    await context.setOffline(false);await page.waitForFunction(()=>!document.getElementById('party-stage').hidden);await count(30);
    assert.equal(await page.evaluate(()=>window.qa.pending.size),1);
  }
  // Owner previews are isolated from the 35 real presences.
  const admin=await browser.newContext({viewport:{width:1920,height:1080}});const [name,value]=owner.cookie.split('=');await admin.addCookies([{name,value,url:f.origin}]);
  const preview=await admin.newPage();
  const eventBeforePreview=await f.db.event.findFirstOrThrow();
  for(const n of [1,5,15,30])for(const [width,height] of [[1920,1080],[1280,720]]){
    await preview.setViewportSize({width,height});await preview.goto(`${f.origin}/level38/overlay/party?preview=${n}`);
    await preview.waitForFunction(n=>document.querySelectorAll('.party-avatar').length===n,n);await preview.waitForTimeout(200);
    await preview.screenshot({path:path.join(out,`preview-${width}-${n}.png`),omitBackground:true});
  }
  await preview.locator('#preview-vote').click();await preview.locator('#preview-victory').click();
  await preview.waitForFunction(()=>document.querySelectorAll('.party-avatar[data-action="celebration"]').length===30);
  assert.deepEqual(await f.db.event.findFirstOrThrow(),eventBeforePreview);
  await preview.emulateMedia({reducedMotion:'reduce'});await preview.waitForFunction(()=>document.querySelectorAll('.party-avatar[data-action="idle"]').length===30);
  const still=await preview.locator('.party-avatar').first().getAttribute('style');await preview.waitForTimeout(300);assert.equal(await preview.locator('.party-avatar').first().getAttribute('style'),still);await preview.close();
  assert.equal((await f.call('/api/control/state',undefined,owner.cookie)).data.partyCounts.online,35);
  const panel=await admin.newPage();await panel.goto(f.origin+'/level38/control');await panel.locator('#party-counts').filter({hasText:'35'}).waitFor();
  for(const lang of ['es','en'])for(const width of [1440,390]){await panel.setViewportSize({width,height:900});await panel.evaluate(lang=>window.Level38I18n.setLanguage(lang),lang);await panel.locator('#party-overlay-controls').screenshot({path:path.join(out,`${lang}-${width}-control.png`)});assert.ok(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await panel.close();await viewerContext.close(); // 45s grace removes its member, promotes overflow without changing count.
  await page.bringToFront();await page.setViewportSize({width:1920,height:1080});await configure({nameMode:'ALWAYS'});await page.waitForTimeout(1800);
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const baselineCounters=await cdp.send('Memory.getDOMCounters');
  const baselineMetrics=await cdp.send('Performance.getMetrics');
  await page.evaluate(()=>{window.qa.intervals=[];window.qa.longTasks=[];window.qa.last=0;});
  const samples=[];const stressStart=Date.now();
  for(let i=0;i<18;i++){
    await page.waitForTimeout(10000);
    const metrics=await cdp.send('Performance.getMetrics'),data=await page.evaluate(()=>({nodes:document.querySelectorAll('*').length,avatars:document.querySelectorAll('.party-avatar').length,raf:window.qa.pending.size}));
    samples.push({...data,elapsedMs:Date.now()-stressStart,heap:metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value});
    assert.equal(data.avatars,30);assert.equal(data.raf,1);
    if(i%6===5)console.log(`Chrome stress: ${i+1}0 seconds, 30 avatars, one RAF, ${data.nodes} DOM nodes`);
  }
  const performanceResult=await page.evaluate(()=>{const a=window.qa.intervals.sort((a,b)=>a-b);return {frames:a.length,p95FrameMs:a[Math.floor(a.length*.95)],maxFrameMs:a.at(-1),longTasks:window.qa.longTasks};});
  await cdp.send('HeapProfiler.collectGarbage');
  const finalCounters=await cdp.send('Memory.getDOMCounters'),finalMetrics=await cdp.send('Performance.getMetrics');
  assert.ok(finalCounters.jsEventListeners<=baselineCounters.jsEventListeners+5);
  assert.ok(Math.max(...samples.map(s=>s.nodes))-Math.min(...samples.map(s=>s.nodes))<=2);
  await capture('1920-30-after-stress');
  assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({browser:browser.version(),checks,stress:{durationMs:Date.now()-stressStart,samples,baselineCounters,finalCounters,
    baselineHeap:baselineMetrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,finalHeap:finalMetrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,...performanceResult},errors,csp,actualOBS:false},null,2));
});

test('Phase 5 fallback recovery, disconnected visibility cleanup and genuine finale in Chrome', {timeout:90000}, async t=>{
  const f=await fixture(t);await f.start();const owner=await f.operator('Leo','OWNER');
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    const request=requestAnimationFrame.bind(window),cancel=cancelAnimationFrame.bind(window);window.pendingFrames=new Set();
    window.requestAnimationFrame=fn=>{let id;id=request(now=>{window.pendingFrames.delete(id);fn(now);});window.pendingFrames.add(id);return id;};
    window.cancelAnimationFrame=id=>{window.pendingFrames.delete(id);cancel(id);};
  });
  let blockArt=true;
  await context.route('**/level38/classes/**/*.png',route=>blockArt?route.abort():route.continue());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(f.origin+'/level38/overlay/party');
  const token=newToken(),participant=await f.db.participant.create({data:{tokenHash:hashToken(token),nickname:'Recovery',classId:'thief',variantId:'faris',expiresAt:new Date('2030-01-01')}});
  const viewer=io(f.origin+'/level38-party',{path:'/level38/socket.io',transports:['websocket'],forceNew:true,auth:{kind:'viewer'},extraHeaders:{Origin:f.origin,Cookie:`level38_viewer=${token}`}});
  t.after(()=>viewer.disconnect());viewer.on('connect',()=>viewer.emit('party:register',{}));
  const heartbeat=setInterval(()=>viewer.emit('party:heartbeat',{}),20000);t.after(()=>clearInterval(heartbeat));
  await page.waitForFunction(()=>{const img=document.querySelector('.party-art img');return img?.complete&&img.naturalWidth===16&&img.getAttribute('src').endsWith('/placeholder.svg');});
  const avatar=page.locator('.party-avatar'),id=await avatar.getAttribute('data-presence-id');
  assert.equal(await page.locator('.party-art').getAttribute('data-sprite-fallback'),'true');
  assert.deepEqual(await f.db.participant.findUniqueOrThrow({where:{id:participant.id}}),participant);
  blockArt=false;
  await context.setOffline(true);await page.waitForFunction(()=>document.getElementById('party-stage').hidden);
  // A foreground/visibility event must not restart a disconnected renderer.
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.pendingFrames.size),0);
  await context.setOffline(false);
  await page.waitForFunction(()=>{const img=document.querySelector('.party-art img');return !document.getElementById('party-stage').hidden&&img?.complete&&img.naturalWidth===16&&img.getAttribute('src').endsWith('.png');});
  assert.equal(await avatar.getAttribute('data-presence-id'),id);assert.equal(await page.locator('.party-art').getAttribute('data-sprite-fallback'),'false');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(1800);
  const quests=await f.db.quest.findMany({where:{isSecret:false},orderBy:{number:'asc'}});
  await f.db.quest.updateMany({where:{id:{in:quests.slice(0,37).map(q=>q.id)}},data:{status:'COMPLETED'}});
  for(const action of ['activate','complete']){
    const controlRevision=(await f.db.event.findFirstOrThrow()).controlRevision;
    assert.equal((await f.call(`/api/control/quests/${quests[37].id}`,{action,controlRevision},owner.cookie)).status,200);
  }
  await page.waitForFunction(()=>document.querySelector('.party-avatar')?.dataset.action==='celebration');
  assert.ok((await f.db.event.findFirstOrThrow()).lastUnlockedAt);
  await page.waitForFunction(()=>document.querySelector('.party-avatar')?.dataset.action!=='celebration');
  assert.deepEqual(errors,[]);
});
