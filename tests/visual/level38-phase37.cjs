// Optional Chrome QA; use the ignored Playwright installation and a disposable test DB.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('../../dist/phase3-qa-tools/node_modules/playwright');
const {fixture}=require('../integration/support.cjs');

test('public/operator finale, owner reset workflows and ES/EN responsive QA', {timeout:180000},async t=>{
  const f=await fixture(t);await f.start();const owner=await f.operator('Leo','OWNER'),mod=await f.operator('Isma','MODERATOR');
  const out=path.resolve('dist/phase37-visual-qa');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
  const errors=[],csp=[],checks=[];
  const make=async(operator)=>{
    const context=await browser.newContext({locale:'es-ES',viewport:{width:1440,height:1000}});
    if(operator){const [name,value]=operator.cookie.split('=');await context.addCookies([{name,value,url:f.origin}]);}
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Content Security Policy|Refused to/.test(m.text()))csp.push(m.text());});
    await page.goto(`${f.origin}/level38${operator?'/control':''}`);
    await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('conectad'));
    await page.evaluate(()=>document.fonts.ready);return page;
  };
  const publicPage=await make(),panel=await make(owner),moderator=await make(mod);
  assert.equal(await moderator.locator('#owner-tools').count(),0);
  const capture=async(page,name)=>{
    const sizes=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
    assert.ok(sizes.document<=sizes.viewport&&sizes.body<=sizes.viewport,`${name}: ${JSON.stringify(sizes)}`);checks.push({name,...sizes});
    await page.screenshot({path:path.join(out,`${name}.png`)});
  };
  const revision=async()=>(await f.db.event.findFirstOrThrow()).controlRevision;
  const op=async(route,body)=>{const r=await f.call(`/api/control/${route}`,{...body,controlRevision:await revision()},owner.cookie);assert.equal(r.status,200,JSON.stringify(r.data));return r;};
  const tool=async(action,confirmation)=>{const r=await f.call(`/api/owner/tools/${action}`,{confirmation,controlRevision:await revision()},owner.cookie);assert.equal(r.status,200,JSON.stringify(r.data));return r;};
  await publicPage.locator('#join-open').click();await publicPage.locator('#nickname').fill('Garnet');await publicPage.locator('#nickname').press('Enter');await publicPage.waitForFunction(()=>document.getElementById('viewer-name').textContent==='Garnet');
  await panel.locator('#owner-tools > summary').click();
  panel.on('dialog',dialog=>dialog.accept());
  await panel.locator('[data-owner-tool="preview"]').click();
  for(const page of [publicPage,panel,moderator])await page.locator('#level-up').waitFor({state:'visible'});
  assert.equal((await f.db.event.findFirstOrThrow()).unlockSequence,0);assert.equal(await f.db.quest.count({where:{status:'COMPLETED'}}),0);
  for(const [kind,page] of [['public',publicPage],['owner',panel],['moderator',moderator]]){
    assert.equal(await page.locator('#celebration-preview-label').isVisible(),true);await capture(page,`es-${kind}-preview`);await page.keyboard.press('Escape');
  }
  await panel.reload();await panel.waitForFunction(()=>document.getElementById('connection').textContent.includes('conectad'));assert.equal(await panel.locator('#level-up').isVisible(),false);
  const quests=await f.db.quest.findMany({where:{isSecret:false},orderBy:{number:'asc'}});
  const prepareCrossing=async()=>{
    await f.db.quest.updateMany({where:{id:{in:quests.slice(0,37).map(q=>q.id)}},data:{status:'COMPLETED',completedAt:new Date()}});
    await f.db.quest.update({where:{id:quests[37].id},data:{status:'ACTIVE'}});
  };
  await prepareCrossing();await op(`quests/${quests[37].id}`,{action:'complete'});
  for(const page of [publicPage,panel,moderator])await page.locator('#level-up').waitFor({state:'visible'});
  for(const lang of ['es','en']){
    for(const page of [publicPage,panel,moderator])await page.evaluate(lang=>window.Level38I18n.setLanguage(lang),lang);
    for(const [width,height] of [[1440,1000],[1024,1000],[768,1000],[390,844],[844,390]]){
      for(const [kind,page] of [['public',publicPage],['control',moderator]]){
        await page.setViewportSize({width,height});assert.equal(await page.locator('#level-up').isVisible(),true);
        assert.equal(await page.locator('#celebration-preview-label').isVisible(),false);await capture(page,`${lang}-${kind}-${width}-finale`);
        const box=await page.locator('.l38-level-up-copy').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height,`${lang}-${kind} finale height`);
      }
    }
  }
  for(const page of [publicPage,panel,moderator])await page.keyboard.press('Escape');
  await moderator.reload();await moderator.waitForFunction(()=>document.getElementById('connection').textContent.includes('connected'));assert.equal(await moderator.locator('#level-up').isVisible(),false);
  await op('polls',{title:'Preserved test votes',type:'YES_NO',options:[]});const poll=await f.db.poll.findFirstOrThrow({include:{options:true}});await op(`polls/${poll.id}/status`,{action:'open'});
  await publicPage.locator('[data-vote-id]').first().click();await publicPage.locator('[data-vote-id][aria-pressed="true"]').waitFor();
  const beforeParticipant=await f.db.participant.findFirstOrThrow();
  await panel.locator('#owner-tools > summary').click();await panel.locator('[data-owner-tool="progress"]').click();
  await panel.waitForFunction(()=>document.getElementById('progress-text').textContent.startsWith('0 /'));
  assert.equal(await f.db.poll.count({where:{status:'OPEN'}}),0);assert.equal(await f.db.vote.count(),1);assert.deepEqual(await f.db.participant.findFirstOrThrow(),beforeParticipant);
  await panel.locator('[data-owner-tool="participants"]').click();await panel.waitForFunction(()=>document.getElementById('audit-list').textContent.includes('cleared test participants'));
  // A stale already-open viewer page recovers on its next name-submit interaction.
  await publicPage.locator('#join-open').click();await publicPage.locator('#nickname').fill('Garnet Again');await publicPage.locator('#nickname').press('Enter');
  await publicPage.waitForFunction(()=>document.getElementById('viewer-name').textContent==='Garnet Again');
  const fresh=await f.db.participant.findFirstOrThrow({where:{expiresAt:{gt:new Date()}}});assert.notEqual(fresh.id,beforeParticipant.id);
  for(const lang of ['es','en']){
    await panel.evaluate(lang=>window.Level38I18n.setLanguage(lang),lang);
    for(const [width,height] of [[1440,1000],[1024,1000],[768,1000],[390,844],[844,390]]){
      await panel.setViewportSize({width,height});await panel.locator('#owner-tools').evaluate(el=>el.scrollIntoView({block:'start'}));await capture(panel,`${lang}-owner-${width}-tools`);
      await panel.locator('#prepare-event-form').evaluate(el=>el.scrollIntoView({block:'center'}));await capture(panel,`${lang}-owner-${width}-prepare`);
    }
  }
  await panel.locator('#reset-confirmation').fill('wrong');await panel.locator('#prepare-event-form button').click();assert.equal(await f.db.participant.count({where:{expiresAt:{gt:new Date()}}}),1);
  await panel.locator('#reset-confirmation').fill('RESET LEVEL 38');await panel.locator('#prepare-event-form button').click();
  await panel.waitForFunction(()=>document.getElementById('audit-list').textContent.includes('prepared a clean event'));
  assert.equal(await f.db.participant.count({where:{expiresAt:{gt:new Date()}}}),0);assert.equal(await f.db.operator.count(),2);assert.equal(await f.db.vote.count(),1);
  await moderator.emulateMedia({reducedMotion:'reduce'});await publicPage.emulateMedia({reducedMotion:'reduce'});
  await prepareCrossing();await op(`quests/${quests[37].id}`,{action:'complete'});
  for(const [kind,page] of [['control',moderator],['public',publicPage]]){
    await page.locator('#level-up').waitFor({state:'visible'});assert.equal(await page.locator('#fireworks').isVisible(),false);await capture(page,`${kind}-reduced-motion-second-finale`);
  }
  assert.equal((await f.db.event.findFirstOrThrow()).unlockSequence,2);
  assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({browser:await browser.version(),checks,errors,csp,screenshots:fs.readdirSync(out).filter(f=>f.endsWith('.png'))},null,2));
});
