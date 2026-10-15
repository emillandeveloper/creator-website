// Installed Chrome against a freshly migrated isolated test schema; never production.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('../../dist/phase3-qa-tools/node_modules/playwright');
const {fixture} = require('../integration/support.cjs');

test('Phase 6.0 bilingual 60-card journal, mobile layout and optional eligible-game operator controls', {timeout:120000}, async t => {
  const f = await fixture(t); await f.start();
  const owner = await f.operator('Catalog QA', 'OWNER');
  const browser = await chromium.launch({channel:'chrome', headless:true}); t.after(() => browser.close());
  const out = path.resolve('dist/phase60-visual-qa'); fs.mkdirSync(out, {recursive:true});
  const context = await browser.newContext({locale:'en-US', viewport:{width:1440,height:1000}});
  const page = await context.newPage(), errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = (await f.call('/api/state')).data;
  const hidden = (await f.db.quest.findMany({where:{isSecret:true}, orderBy:{number:'asc'}}));
  const html = await (await fetch(f.origin + '/level38')).text();
  for (const quest of hidden) { assert.ok(!html.includes(quest.title)); assert.ok(!JSON.stringify(state).includes(quest.title)); }
  assert.equal(state.quests.length,60);
  assert.equal(state.polls.length,0);
  await page.goto(f.origin + '/level38');
  await page.waitForFunction(() => document.querySelectorAll('#quest-board .l38-card').length === 60);
  assert.equal(await page.locator('#quest-board .l38-card[data-status="SECRET"] h3').allTextContents().then(titles => titles.every(title => title === '???')),true);
  assert.equal(await page.locator('#quest-board .l38-card[data-status="SECRET"] .l38-meta').count(),0);
  assert.equal(await page.locator('#quest-board .l38-card[data-category="COOPERATIVE"]').count(),6);
  for (const [language,width,height] of [['en',1440,1000],['es',1440,1000],['es',390,844],['en',390,844]]) {
    await page.setViewportSize({width,height}); await page.locator(`[data-language="${language}"]`).click();
    await page.locator('#quest-log').evaluate(element => element.scrollIntoView({block:'start'}));
    const layout = await page.evaluate(() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,cards:document.querySelectorAll('#quest-board .l38-card').length,columns:getComputedStyle(document.querySelector('#quest-board .l38-grid')).gridTemplateColumns,category:document.querySelector('#quest-board .l38-quest-category').textContent,secret:document.querySelector('#quest-board .l38-card[data-status="SECRET"] p').textContent}));
    assert.ok(layout.scrollWidth<=width); assert.equal(layout.cards,60);
    assert.equal(layout.category,language==='es'?'Varios juegos':'Multi-game');
    checks.push({language,width,height,...layout});
    await page.screenshot({path:path.join(out,`journal-${language}-${width}.png`)});
    await page.locator('#quest-board [data-quest-number="49"]').evaluate(element => element.scrollIntoView({block:'start'}));
    await page.screenshot({path:path.join(out,`cooperative-${language}-${width}.png`)});
    await page.locator('#quest-board [data-quest-number="55"]').evaluate(element => element.scrollIntoView({block:'start'}));
    await page.screenshot({path:path.join(out,`secret-${language}-${width}.png`)});
  }
  const quest = state.quests.find(quest => quest.category === 'MULTI_GAME' && quest.eligibleGameIds.length >= 2);
  assert.ok(quest);
  const chosenGame = quest.eligibleGameIds.find(gameId => gameId!==quest.gameId);
  await page.locator('#quest-game').selectOption(chosenGame);
  assert.ok(await page.locator(`#quest-board [data-quest-number="${quest.number}"]`).count(), 'journal filters by eligibility');
  await page.locator('#quest-game').selectOption('all');
  await page.locator('#quest-status').selectOption('SECRET');
  assert.equal(await page.locator('#quest-board .l38-card').count(),6);

  const admin = await browser.newContext({locale:'es-ES',viewport:{width:1440,height:1000}});
  const [name,value] = owner.cookie.split('='); await admin.addCookies([{name,value,url:f.origin}]);
  const control = await admin.newPage(); control.on('pageerror', error => errors.push(error.message));
  await control.goto(f.origin + '/level38/control');
  const card = control.locator(`[data-quest-number="${quest.number}"]`);
  await card.locator('.l38-quest-game-form select').waitFor();
  const manualOptions = await card.locator('.l38-quest-game-form option').evaluateAll(options => options.map(option => option.value));
  assert.deepEqual(new Set(manualOptions),new Set(quest.eligibleGameIds));
  await card.locator('.l38-quest-game-form select').selectOption(chosenGame);
  await card.locator('.l38-quest-game-form button').click();
  await control.waitForFunction(({number,gameId}) => document.querySelector(`[data-quest-number="${number}"] .l38-quest-game-form select`)?.value===gameId,{number:quest.number,gameId:chosenGame});
  // Wait for the mutation to settle; it must not create or open a poll.
  await control.waitForFunction(() => !document.getElementById('operator-controls').disabled);
  const afterManual = (await f.call('/api/state')).data;
  assert.equal(afterManual.quests.find(item=>item.id===quest.id).gameId,chosenGame);
  assert.equal(afterManual.polls.length,0);
  await card.locator('.l38-eligibility-editor summary').click();
  await card.locator('.l38-eligibility-editor form').evaluate((form,ids) => { for (const input of form.querySelectorAll('input')) input.checked=ids.includes(input.value); },manualOptions.slice(0,2));
  await card.locator('.l38-eligibility-editor button').click();
  await control.waitForFunction(() => !document.getElementById('operator-controls').disabled);
  await control.locator('#poll-type').selectOption('NEXT_GAME');
  await control.locator('#poll-quest').selectOption(quest.id);
  const scopedOptions = await control.locator('#poll-options select').first().locator('option').evaluateAll(options => options.map(option=>option.value).filter(Boolean));
  assert.deepEqual(new Set(scopedOptions),new Set(manualOptions.slice(0,2)));
  await control.locator('#poll-title').fill('Choose the optional next game');
  await control.locator('#poll-options select').nth(0).selectOption(scopedOptions[0]);
  await control.locator('#poll-options select').nth(1).selectOption(scopedOptions[1]);
  await control.locator('#save-poll').click();
  await control.waitForFunction(() => document.querySelectorAll('#poll-board .l38-poll').length===1);
  const controlState = (await f.call('/api/control/state',undefined,owner.cookie)).data;
  assert.equal(controlState.polls[0].contextQuestId,quest.id); assert.equal(controlState.polls[0].status,'DRAFT');
  await control.locator('.l38-quest-section[data-quest-section="SECRET"]').scrollIntoViewIfNeeded();
  assert.ok((await control.locator('.l38-quest-section[data-quest-section="SECRET"]').textContent()).includes(hidden[0].titleEs));
  for (const [width,height] of [[1440,1000],[390,844]]) {
    await control.setViewportSize({width,height}); await card.scrollIntoViewIfNeeded();
    assert.ok(await control.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await control.screenshot({path:path.join(out,`control-${width}.png`)});
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({browser:browser.version(),checks,manualGameSelection:true,scopedOptionalPoll:true,errors},null,2));
});
