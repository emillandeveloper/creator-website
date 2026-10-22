// Installed Chromium renders the real EJS/scripts/Socket.IO. Only Twitch is
// simulated; no Browser response, vote tally or DOM state is fabricated.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {chromium}=require('../../dist/phase3-qa-tools/node_modules/playwright');
const {nativeFixture,ok}=require('../integration/twitch-polls-support.cjs');
const {origin}=require('../twitch-fake.cjs');

test('sixty-second native polls show a vote cast at ten seconds live in Chromium through EventSub and independent five-second backup', {timeout:210000},async t=>{
  const f=await nativeFixture(t,{skipEnsure:true,pollRuntime:true});
  f.fake.appTokenFailure=403;
  await assert.rejects(f.twitch.run('ensure'));
  const before=await f.service.state(),questsBefore=await f.db.quest.findMany({orderBy:{id:'asc'}});
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1920,height:1080},locale:'en-US'});
  await context.addInitScript(()=>localStorage.setItem('level38:language','en'));
  const [name,value]=f.owner.cookie.split('=');await context.addCookies([{name,value,url:f.url}]);
  const control=await context.newPage(),overlay=await context.newPage(),publicPage=await context.newPage();
  const out=path.resolve('dist/level38-native-realtime-qa');fs.mkdirSync(out,{recursive:true});
  const errors=[],csp=[],checks=[];
  for(const page of [control,overlay,publicPage]) {
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(/Content Security Policy|Refused to/.test(message.text()))csp.push(message.text());});
  }
  await control.route('**/level38/api/**',async route=>{
    const response=await route.fetch({headers:{...route.request().headers(),...(route.request().method()==='POST'?{origin}:{})}});await route.fulfill({response});
  });
  await Promise.all([control.goto(f.url+'/control'),overlay.goto(f.url+'/overlay/poll?lang=en'),publicPage.goto(f.url)]);
  await control.waitForFunction(()=>!document.getElementById('operator-controls').disabled);
  const participantsBefore=await f.db.participant.count();
  control.on('dialog',dialog=>dialog.accept());
  for(const mode of ['eventsub','backup']) {
    const title=`Live 60 seconds ${mode}`;
    await control.locator('#poll-type').selectOption('CUSTOM');await control.locator('#poll-title').fill(title);await control.locator('#poll-duration').fill('60');
    await control.locator('#poll-options input').nth(0).fill('First choice');await control.locator('#poll-options input').nth(1).fill('Second choice');
    const saving=control.waitForResponse(response=>new URL(response.url()).pathname==='/level38/api/control/polls'&&response.request().method()==='POST');
    await control.locator('#save-poll').click();assert.equal((await saving).status(),200);await control.waitForFunction(()=>!document.getElementById('operator-controls').disabled);
    const poll=await f.db.poll.findFirstOrThrow({where:{title},include:{options:{orderBy:{position:'asc'}}}}),card=control.locator(`[data-poll-id="${poll.id}"]`);
    const opening=control.waitForResponse(response=>new URL(response.url()).pathname===`/level38/api/control/polls/${poll.id}/status`);
    await card.locator('[data-poll-action="open"]').click();assert.equal((await opening).status(),200);
    const remote=f.fake.polls[0];assert.equal(remote.duration,60);
    await overlay.locator(`#poll-overlay[data-poll-id="${poll.id}"][data-overlay-mode="open"]`).waitFor({state:'visible'});
    assert.deepEqual(await overlay.locator('.obs-option-votes').allTextContents(),['0','0']);
    await delay(Math.max(0,10000-(Date.now()-Date.parse(remote.started_at))));
    const votedAt=Date.now();
    remote.choices[0].votes=1;
    if(mode==='eventsub')assert.equal((await f.sendPoll('channel.poll.progress',remote,{votes:[1,0]})).status,204);
    // The backup path sends no begin/progress/end webhook at any point.
    await overlay.waitForFunction(()=>document.getElementById('poll-overlay').dataset.overlayMode==='open'&&document.querySelector('.obs-option-votes')?.textContent==='1',{},{timeout:7000});
    const latencyMs=Date.now()-votedAt;assert.ok(latencyMs<=7000,`${mode}: vote latency ${latencyMs}ms`);
    const openState=ok(await f.call('/api/control/state',undefined,f.owner.cookie)).polls.find(item=>item.id===poll.id);
    assert.equal(openState.status,'OPEN');assert.equal(openState.totalVotes,1);assert.equal(openState.resultsFinal,false);assert.equal(openState.effectiveWinnerId,null);
    await card.locator('[data-total]').filter({hasText:'1 vote'}).waitFor();
    await publicPage.locator(`[data-poll-id="${poll.id}"] [data-total]`).filter({hasText:'1 vote'}).waitFor();
    assert.ok(Date.now()<Date.parse(remote.ends_at),'the live vote must appear before the deadline');
    await overlay.screenshot({path:path.join(out,`${mode}-01-one-vote-open.png`),omitBackground:true});
    await delay(Math.max(0,Date.parse(remote.started_at)+30000-Date.now()));
    remote.choices[0].votes=3;remote.choices[1].votes=1;
    if(mode==='eventsub')assert.equal((await f.sendPoll('channel.poll.progress',remote,{votes:[3,1]})).status,204);
    await overlay.waitForFunction(()=>[...document.querySelectorAll('.obs-option-votes')].map(node=>node.textContent).join(',')==='3,1',{},{timeout:7000});
    const bars=await overlay.locator('.obs-option').evaluateAll(nodes=>nodes.map(node=>node.style.getPropertyValue('--vote-percent')));
    assert.deepEqual(bars,['75%','25%']);
    assert.deepEqual(await overlay.locator('.obs-option-percent').allTextContents(),['75%','25%']);
    await card.locator('[data-total]').filter({hasText:'4 votes'}).waitFor();
    assert.deepEqual(await card.locator('[data-percent]').allTextContents(),['75%','25%']);
    if(mode==='backup') await control.waitForFunction(()=>/Backup mode:/.test(document.getElementById('twitch-poll-live')?.textContent||''),{},{timeout:4000});
    await overlay.screenshot({path:path.join(out,`${mode}-02-percentages-open.png`),omitBackground:true});
    // Reconnection must immediately recover the persisted live tally.
    await overlay.reload();await overlay.locator(`#poll-overlay[data-poll-id="${poll.id}"][data-overlay-mode="open"]`).waitFor({state:'visible'});
    assert.deepEqual(await overlay.locator('.obs-option-votes').allTextContents(),['3','1']);
    await delay(Math.max(0,Date.parse(remote.ends_at)-Date.now()+25));
    remote.status='COMPLETED';remote.ended_at=new Date().toISOString();
    if(mode==='eventsub')assert.equal((await f.sendPoll('channel.poll.end',remote,{votes:[3,1],status:'completed'})).status,204);
    await overlay.locator(`#poll-overlay[data-poll-id="${poll.id}"][data-overlay-mode="winner"]`).waitFor({state:'visible',timeout:7000});
    assert.equal(await overlay.locator('#poll-winner').textContent(),'First choice');
    const final=await f.statePoll(poll.id);assert.equal(final.resultsFinal,true);assert.equal(final.totalVotes,4);assert.equal(final.effectiveWinnerId,poll.options[0].id);
    await overlay.screenshot({path:path.join(out,`${mode}-03-final-winner.png`),omitBackground:true});
    checks.push({mode,durationSeconds:60,voteAtSeconds:Math.round((votedAt-Date.parse(remote.started_at))/1000),latencyMs,openVotes:openState.totalVotes,percentages:bars,reconnected:true,winner:'First choice',eventSubSent:mode==='eventsub'});
  }
  const after=await f.service.state();assert.equal(after.event.completed,before.event.completed);assert.equal(after.event.currentGameId,before.event.currentGameId);assert.equal(after.event.target,38);
  assert.deepEqual(await f.db.quest.findMany({orderBy:{id:'asc'}}),questsBefore);assert.equal(await f.db.vote.count(),0);assert.equal(await f.db.participant.count(),participantsBefore);
  assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({browser:browser.version(),fakeTwitch:true,actualOBS:false,checks,errors,csp,productionChanged:false},null,2));
});
