// Real Chrome + disposable PostgreSQL. Artifacts stay under ignored dist/.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('../../dist/phase3-qa-tools/node_modules/playwright');
const {fixture}=require('../integration/support.cjs');
const {QUEST_CONTENT}=require('../../dist/modules/level38/quest-content');

test('Phase 3.8 bilingual starter content and persistent shared finale across all viewports',{timeout:240000},async t=>{
  const f=await fixture(t);await f.start();const owner=await f.operator('Leo','OWNER');
  const quests=await f.db.quest.findMany({where:{isSecret:false},orderBy:{number:'asc'}});
  const revision=async()=>(await f.db.event.findFirstOrThrow()).controlRevision;
  const op=async(route,body)=>{const r=await f.call(`/api/control/${route}`,{...body,controlRevision:await revision()},owner.cookie);assert.equal(r.status,200,JSON.stringify(r.data));return r;};
  await op(`quests/${quests[0].id}`,{action:'activate'});
  await op('polls',{title:'The next adventure',type:'NEXT_QUEST',options:[{questId:quests[1].id},{questId:quests[2].id}]});
  const poll=await f.db.poll.findFirstOrThrow();await op(`polls/${poll.id}/status`,{action:'open'});
  const out=path.resolve('dist/phase38-visual-qa');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
  const errors=[],csp=[],checks=[];let performanceSample;
  const ready=page=>page.waitForFunction(()=>/connected|conectad/.test(document.getElementById('connection').textContent));
  const make=async(control=false)=>{
    const context=await browser.newContext({locale:'es-ES',viewport:{width:1440,height:1000},hasTouch:true});
    if(control){const [name,value]=owner.cookie.split('=');await context.addCookies([{name,value,url:f.origin}]);}
    // Measure only canvas draws/RAF ownership, without changing animation behavior.
    await context.addInitScript(()=>{
      const original=CanvasRenderingContext2D.prototype.fillRect;window.qaDraws=0;
      CanvasRenderingContext2D.prototype.fillRect=function(...args){window.qaDraws++;return original.apply(this,args);};
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Content Security Policy|Refused to/.test(m.text()))csp.push(m.text());});
    await page.goto(`${f.origin}/level38${control?'/control':''}`);await ready(page);await page.evaluate(()=>document.fonts.ready);return page;
  };
  const page=await make(),panel=await make(true);
  const capture=async(target,name,finale=false)=>{
    const size=await target.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
    assert.ok(size.document<=size.viewport&&size.body<=size.viewport,`${name}: overflow`);
    if(finale){
      const box=await target.locator('.l38-level-up-copy').boundingBox(),button=await target.locator('#celebration-dismiss').boundingBox();
      assert.ok(box.y>=0&&box.y+box.height<=target.viewportSize().height,`${name}: panel fits`);
      assert.ok(button.y>=0&&button.y+button.height<=target.viewportSize().height,`${name}: instruction fits`);
    }
    checks.push({name,...size});await target.screenshot({path:path.join(out,`${name}.png`)});
  };
  await page.locator('#join-open').click();await page.locator('#nickname').fill('Garnet');await page.locator('#nickname').press('Enter');await page.waitForFunction(()=>document.getElementById('viewer-name').textContent==='Garnet');
  const identity=await f.db.participant.findFirstOrThrow();const cookiesBefore=(await page.context().cookies()).filter(c=>c.name!=='level38_lang');
  let apiCalls=0;page.on('request',r=>{if(r.url().includes('/level38/api/'))apiCalls++;});const requestsBefore=apiCalls;
  for(const lang of ['es','en']){
    await page.locator(`[data-language="${lang}"]`).click();await panel.locator(`[data-language="${lang}"]`).click();
    assert.ok((await page.locator('#active-quests').textContent()).includes(QUEST_CONTENT[0].title[lang]));
    assert.ok((await page.locator('#active-quests').textContent()).includes(QUEST_CONTENT[0].description[lang]));
    assert.ok((await page.locator('#quest-log').textContent()).includes(QUEST_CONTENT[1].title[lang]));
    assert.ok((await page.locator('#voting').textContent()).includes(QUEST_CONTENT[1].title[lang]));
    for(const secret of QUEST_CONTENT.filter(q=>q.isSecret))assert.ok(!(await page.content()).includes(secret.description[lang]));
    for(const [width,height] of [[1440,1000],[1024,1000],[768,1000],[390,844],[844,390]]){
      await page.setViewportSize({width,height});await page.locator('#active-quests').evaluate(el=>el.scrollIntoView({block:'start'}));await capture(page,`${lang}-${width}-active`);
      await page.locator('#quest-log').evaluate(el=>el.scrollIntoView({block:'start'}));await capture(page,`${lang}-${width}-journal`);
    }
  }
  assert.equal(apiCalls,requestsBefore);assert.deepEqual(await f.db.participant.findFirstOrThrow(),identity);assert.deepEqual((await page.context().cookies()).filter(c=>c.name!=='level38_lang'),cookiesBefore);
  await f.db.quest.updateMany({where:{id:{in:quests.slice(0,37).map(q=>q.id)}},data:{status:'COMPLETED',completedAt:new Date()}});await f.db.quest.update({where:{id:quests[37].id},data:{status:'ACTIVE'}});
  await op(`quests/${quests[37].id}`,{action:'complete'});
  for(const target of [page,panel])await target.locator('#level-up').waitFor({state:'visible'});
  const progress=await f.db.event.findFirstOrThrow();
  await page.setViewportSize({width:1440,height:1000});
  // Give opening/dense/quiet stages actual wall time and retain representative frames.
  for(const [stage,wait] of [['opening',1200],['dense',1800],['quiet',5000]]){
    await page.waitForTimeout(wait);assert.ok(await page.locator('#level-up').isVisible());await capture(page,`en-1440-${stage}`,true);
  }
  await page.reload();await ready(page);await page.locator('#level-up').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>sessionStorage.getItem('level38:acknowledged-unlock')),null);
  for(const lang of ['es','en'])for(const [width,height] of [[1440,1000],[1024,1000],[768,1000],[390,844],[844,390]])for(const [kind,target] of [['public',page],['control',panel]]){
    await target.evaluate(lang=>window.Level38I18n.setLanguage(lang),lang);await target.setViewportSize({width,height});await target.waitForTimeout(1100);
    assert.equal(await target.locator('#celebration-dismiss').textContent(),lang==='es'?'PULSA PARA CONTINUAR':'CLICK TO CONTINUE');await capture(target,`${lang}-${width}-${kind}-finale`,true);
  }
  await page.setViewportSize({width:390,height:844});
  performanceSample=await page.evaluate(()=>new Promise(resolve=>{
    const intervals=[],longTasks=[];let last,start;
    const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));
    observer.observe({type:'longtask',buffered:false});
    function sample(time){
      start??=time;if(last!==undefined)intervals.push(time-last);last=time;
      if(time-start<3000){requestAnimationFrame(sample);return;}
      observer.disconnect();intervals.sort((a,b)=>a-b);
      resolve({viewport:innerWidth,sampleMs:time-start,frames:intervals.length,p95FrameMs:intervals[Math.floor(intervals.length*.95)],maxFrameMs:Math.max(...intervals),longTasks});
    }
    requestAnimationFrame(sample);
  }));
  assert.ok(performanceSample.frames>30,'mobile-sized finale keeps rendering');
  await page.locator('#celebration-dismiss').tap();assert.ok(!await page.locator('#level-up').isVisible());assert.ok(await panel.locator('#level-up').isVisible());
  const draws=await page.evaluate(()=>window.qaDraws);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.qaDraws),draws,'canvas work stops on dismissal');
  assert.deepEqual(await f.db.event.findFirstOrThrow(),progress);assert.equal(await page.evaluate(()=>sessionStorage.getItem('level38:acknowledged-unlock')),'1');
  await page.reload();await ready(page);assert.ok(!await page.locator('#level-up').isVisible());await panel.keyboard.press('Enter');assert.ok(!await panel.locator('#level-up').isVisible());
  const acknowledged=await page.evaluate(()=>sessionStorage.getItem('level38:acknowledged-unlock'));
  for(let run=0;run<3;run++){
    const preview=await f.call('/api/owner/tools/preview',{confirmation:'PREVIEW LEVEL 38',controlRevision:await revision()},owner.cookie);assert.equal(preview.status,200);
    for(const target of [page,panel]){await target.locator('#level-up').waitFor({state:'visible'});assert.ok(await target.locator('#celebration-preview-label').isVisible());}
    if(run===0){await page.waitForTimeout(9000);assert.ok(await page.locator('#level-up').isVisible());await capture(page,'en-landscape-preview',true);}
    for(const target of [page,panel])await target.keyboard.press(run===1?'Space':'Escape');
    assert.equal(await page.locator('#fireworks').count(),1);assert.equal(await page.evaluate(()=>sessionStorage.getItem('level38:acknowledged-unlock')),acknowledged);
  }
  assert.equal((await f.db.event.findFirstOrThrow()).unlockSequence,1);assert.equal(await f.db.quest.count({where:{status:'COMPLETED'}}),38);
  // Direct fixture setup emulates a later reset without changing real event behavior.
  await f.db.quest.update({where:{id:quests[37].id},data:{status:'ACTIVE',completedAt:null}});
  for(const target of [page,panel])await target.emulateMedia({reducedMotion:'reduce'});
  await op(`quests/${quests[37].id}`,{action:'complete'});
  for(const [kind,target] of [['public',page],['control',panel]]){
    await target.locator('#level-up').waitFor({state:'visible'});assert.ok(!await target.locator('#fireworks').isVisible());await target.setViewportSize({width:390,height:844});await target.evaluate(()=>window.Level38I18n.setLanguage('es'));await capture(target,`es-390-${kind}-reduced`,true);await target.keyboard.press('Escape');
  }
  assert.equal((await f.db.event.findFirstOrThrow()).unlockSequence,2);assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({browser:await browser.version(),checks,performanceSample,errors,csp,screenshots:fs.readdirSync(out).filter(f=>f.endsWith('.png'))},null,2));
});
