// Optional real Chrome QA. Uses the same ignored Playwright installation as level38.cjs.
// Set LEVEL38_TEST_DATABASE_URL to a disposable local PostgreSQL test database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../dist/phase3-qa-tools/node_modules/playwright');
const { fixture } = require('../integration/support.cjs');

test('Phase 3.6 bilingual public/control visual QA and language-safe live operation', { timeout: 180000 }, async t => {
  const f = await fixture(t); await f.start();
  const mod = await f.operator('Isma', 'MODERATOR');
  const quests = await f.db.quest.findMany({where:{isSecret:false},orderBy:{number:'asc'}});
  await f.db.quest.updateMany({where:{id:{in:quests.slice(0,12).map(q=>q.id)}},data:{status:'COMPLETED',completedAt:new Date()}});
  const active = quests[12];
  await f.db.quest.update({where:{id:active.id},data:{status:'ACTIVE',title:'Bring the whole party home',titleEs:'Regresa al campamento con todo el grupo',description:'Explore the northern ruins and bring every party member back safely.\n\nRead the inscriptions before opening the gate. Optional treasure can wait.',descriptionEs:'Explora las ruinas del norte y regresa al campamento sin perder a ningún miembro del grupo.\n\nLee las inscripciones antes de abrir la puerta. El tesoro opcional puede esperar.'}});
  for (const [i,status] of ['FAILED','SKIPPED','LOCKED'].entries()) await f.db.quest.update({where:{id:quests[13+i].id},data:{status}});
  const control = async () => (await f.call('/api/control/state',undefined,mod.cookie)).data;
  const op = async (route,body) => {const r=await f.call(`/api/control/${route}`,{...body,controlRevision:(await control()).event.controlRevision},mod.cookie);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
  await op('polls',{type:'YES_NO',title:'¿Exploramos las ruinas? / Explore the ruins?',options:[{label:'Yes'},{label:'No'}]});
  const poll=(await control()).polls[0];await op(`polls/${poll.id}/status`,{action:'open'});
  const out=path.resolve('dist/phase36-visual-qa');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
  const errors=[],csp=[],overflow=[];
  function watch(page){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Content Security Policy|Refused to/.test(m.text()))csp.push(m.text());});}
  async function check(page,label){const sizes=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));if(sizes.document>sizes.viewport||sizes.body>sizes.viewport){await page.screenshot({path:path.join(out,`${label}-overflow.png`)});console.log(await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,id:el.id,class:el.className,width:el.getBoundingClientRect().width,text:el.textContent.slice(0,70)}))));}assert.ok(sizes.document<=sizes.viewport&&sizes.body<=sizes.viewport,`${label}: ${JSON.stringify(sizes)}`);overflow.push({label,...sizes});}
  async function ready(page){await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('conectad')||document.getElementById('connection').textContent.includes('connected'));await page.evaluate(()=>document.fonts.ready);}
  const ctx=await browser.newContext({locale:'es-ES',viewport:{width:1440,height:1000}});const page=await ctx.newPage();watch(page);
  let apiRequests=0;page.on('request',req=>{if(req.url().includes('/level38/api/'))apiRequests++;});
  await page.goto(`${f.origin}/level38`);await ready(page);
  assert.equal(await page.locator('html').getAttribute('lang'),'es');
  await page.locator('[data-vote-id]').first().click();await page.locator('#nickname').fill('Aventurera Garnet');await page.locator('#nickname').press('Enter');
  await page.locator('[data-vote-id][aria-pressed="true"]').waitFor();await page.locator('#party-welcome').waitFor({state:'visible'});
  await page.locator('#party').screenshot({path:path.join(out,'es-class-reveal.png')});
  const identity=await f.db.participant.findFirstOrThrow();const vote=await f.db.vote.findFirstOrThrow();
  const requestsBefore=apiRequests;
  await page.locator('[data-language="en"]').click();await page.locator('[data-language="es"]').click();
  assert.equal(apiRequests,requestsBefore,'language changes use cached state without fetching session/state');
  assert.deepEqual(await f.db.participant.findFirstOrThrow(),identity);assert.deepEqual(await f.db.vote.findFirstOrThrow(),vote);
  assert.equal(await page.locator('#join-form').isVisible(),false);
  await page.reload();await ready(page);assert.equal(await page.locator('html').getAttribute('lang'),'es');
  const admin=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000}});
  const [name,value]=mod.cookie.split('=');await admin.addCookies([{name,value,url:f.origin}]);
  const panel=await admin.newPage();watch(panel);await panel.goto(`${f.origin}/level38/control`);await ready(panel);
  await panel.waitForFunction(()=>!document.getElementById('operator-controls').disabled);
  assert.equal(await panel.locator('html').getAttribute('lang'),'es','operator default is Spanish even in English browser');
  await panel.locator('#poll-title').fill('Unsaved question stays exactly as typed');
  await panel.locator('#poll-type').selectOption('CUSTOM');
  await panel.locator('#poll-options input').first().fill('Yes');await panel.locator('#poll-options input').nth(1).fill('A custom choice');
  let controlRequests=0;panel.on('request',req=>{if(req.url().includes('/level38/api/'))controlRequests++;});
  await panel.locator('[data-language="en"]').click();
  assert.equal(controlRequests,0,'operator language changes must use cached state');
  assert.equal(await panel.locator('#poll-title').inputValue(),'Unsaved question stays exactly as typed');
  assert.equal(await panel.locator('#poll-options input').first().inputValue(),'Yes');
  await panel.reload();await ready(panel);assert.equal(await panel.locator('html').getAttribute('lang'),'en');
  const fresh=await browser.newContext({locale:'fr-FR'});const freshPage=await fresh.newPage();await freshPage.goto(`${f.origin}/level38`);await ready(freshPage);assert.equal(await freshPage.locator('html').getAttribute('lang'),'en');await fresh.close();
  for(const lang of ['es','en']){
    await page.locator(`[data-language="${lang}"]`).click();await panel.locator(`[data-language="${lang}"]`).click();
    for(const [width,height] of [[1440,1000],[1024,1000],[768,1000],[390,844],[844,390]]){
      for(const [kind,target,sections] of [['public',page,[['overview','body'],['objectives','#active-quests'],['poll','#voting'],['party','#party'],['journal','#quest-log'],['footer','.l38-footer']]],['control',panel,[['overview','body'],['quests','#quest-board'],['polls','#poll-workspace'],['editor','#poll-editor'],['audit','#audit-panel']]]]){
        await target.setViewportSize({width,height});
        for(const [section,selector] of sections){
          await target.locator(selector).evaluate(el=>el.scrollIntoView({block:'start'}));await check(target,`${lang}-${kind}-${width}-${section}`);
          await target.screenshot({path:path.join(out,`${lang}-${kind}-${width}-${section}.png`)});
        }
      }
      await page.locator('#join-open').click();await check(page,`${lang}-${width}-join`);await page.screenshot({path:path.join(out,`${lang}-public-${width}-join.png`)});await page.locator('#nickname').press('Escape');
    }
    await panel.locator('.l38-config-panel > summary').click();await panel.locator('.l38-config-panel').screenshot({path:path.join(out,`${lang}-configuration.png`)});await panel.locator('.l38-config-panel > summary').click();
  }
  // Live notices, structured audit and confirmation dialogs use the active language.
  await page.locator('[data-language="es"]').click();await panel.locator('[data-language="es"]').click();
  const confirmation=panel.waitForEvent('dialog');
  const completeClick=panel.locator('[data-quest-section="ACTIVE"] button').first().click();
  const dialog=await confirmation;assert.match(dialog.message(),/Completar misión/);await dialog.dismiss();await completeClick;
  await op(`quests/${active.id}`,{action:'complete'});await page.locator('#event-toast').waitFor({state:'visible'});
  assert.match(await page.locator('#event-toast').textContent(),/MISIÓN COMPLETADA/);
  await panel.waitForFunction(()=>document.getElementById('audit-list').textContent.includes('completó la misión'));
  await panel.locator('[data-language="en"]').click();assert.match(await panel.locator('#audit-list').textContent(),/completed quest/);
  await op(`polls/${poll.id}/status`,{action:'close'});
  await panel.locator('[data-accept]').waitFor();
  await panel.locator('.l38-poll > input').fill('Moderator reason remains untouched');
  await panel.locator('[data-language="es"]').click();
  assert.equal(await panel.locator('.l38-poll > input').inputValue(),'Moderator reason remains untouched');
  await op(`polls/${poll.id}/winner`,{optionId:poll.options[0].id});
  await page.locator('.l38-result').waitFor();assert.match(await page.locator('.l38-result').textContent(),/Ganadora: Sí/);
  await op('polls',{type:'CUSTOM',title:'Do not translate moderator prose',options:[{label:'Yes'},{label:'Custom text'}]});
  const custom=(await control()).polls[0];await op(`polls/${custom.id}/status`,{action:'open'});
  await page.locator(`[data-poll-id="${custom.id}"]`).waitFor();assert.match(await page.locator(`[data-poll-id="${custom.id}"]`).textContent(),/Yes/);
  const secret=await f.db.quest.findFirstOrThrow({where:{isSecret:true}});assert.ok(!(await page.content()).includes(secret.titleEs));
  // Signed-out control is also translated and usable at every requested size.
  const loginContext=await browser.newContext({locale:'en-US'});const login=await loginContext.newPage();watch(login);
  await login.goto(`${f.origin}/level38/control`);assert.equal(await login.locator('html').getAttribute('lang'),'es');
  for(const lang of ['es','en']){
    await login.locator(`[data-language="${lang}"]`).click();
    for(const [width,height] of [[1440,1000],[1024,1000],[768,1000],[390,844],[844,390]]){
      await login.setViewportSize({width,height});await check(login,`${lang}-login-${width}`);await login.screenshot({path:path.join(out,`${lang}-login-${width}.png`)});
    }
  }
  await loginContext.close();
  // A committed threshold crossing localizes the existing celebration in place.
  await f.db.quest.updateMany({where:{isSecret:false},data:{status:'AVAILABLE',completedAt:null}});
  await f.db.quest.updateMany({where:{id:{in:quests.slice(0,37).map(q=>q.id)}},data:{status:'COMPLETED',completedAt:new Date()}});
  await f.db.quest.update({where:{id:quests[37].id},data:{status:'ACTIVE'}});
  await op(`quests/${quests[37].id}`,{action:'complete'});await page.locator('#level-up').waitFor({state:'visible'});
  for(const lang of ['es','en']){
    await page.evaluate(lang=>window.Level38I18n.setLanguage(lang),lang);
    for(const [width,height] of [[390,844],[844,390]]){
      await page.setViewportSize({width,height});await check(page,`${lang}-celebration-${width}`);await page.screenshot({path:path.join(out,`${lang}-celebration-${width}.png`)});
    }
  }
  // SSR also selects Spanish without scripts; its poll/user prose stays unchanged.
  const nojs=await browser.newContext({javaScriptEnabled:false,locale:'es-ES',viewport:{width:390,height:844}});
  const staticPage=await nojs.newPage();watch(staticPage);await staticPage.goto(`${f.origin}/level38`);assert.equal(await staticPage.locator('html').getAttribute('lang'),'es');await check(staticPage,'es-no-javascript');await staticPage.locator('#quest-log').screenshot({path:path.join(out,'es-no-javascript-journal.png')});await nojs.close();
  assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({browser:await browser.version(),languages:['es','en'],viewports:[[1440,1000],[1024,1000],[768,1000],[390,844],[844,390]],overflow,errors,csp,screenshots:fs.readdirSync(out).filter(f=>f.endsWith('.png'))},null,2));
});
