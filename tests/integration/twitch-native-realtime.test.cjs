const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setTimeout:delay}=require('node:timers/promises');
const {spawn}=require('node:child_process');
const {io}=require('socket.io-client');
const {nativeFixture,ok}=require('./twitch-polls-support.cjs');

async function until(read,predicate,timeout=7000) {
  const started=Date.now();let value;
  while(Date.now()-started<timeout) {value=await read();if(predicate(value))return {value,elapsedMs:Date.now()-started};await delay(40);}
  assert.fail(`Native state did not update in ${timeout}ms: ${JSON.stringify(value)}`);
}
const gets=f=>f.fake.pollCalls.filter(call=>call.method==='GET').length;
async function open(f,title='Live sixty second poll') {const poll=await f.create({title,durationSeconds:60});ok(await f.op(`polls/${poll.id}/status`,{action:'open'}));return {poll,remote:f.fake.polls[0]};}

test('broadcaster polling updates open control state and Socket.IO within seven seconds despite app-token 403 and absent EventSub', {timeout:60000},async t=>{
  const f=await nativeFixture(t,{skipEnsure:true,pollRuntime:true});
  f.fake.appTokenFailure=403;
  await assert.rejects(f.twitch.run('ensure'));
  const idleGets=gets(f);await delay(5200);assert.equal(gets(f),idleGets,'idle events do not query Helix polls');
  const before=await f.service.state(), {poll,remote}=await open(f);
  const socket=io(`${f.origin}/level38`,{path:'/level38/socket.io',transports:['websocket'],reconnection:false});t.after(()=>socket.disconnect());
  let published=null;socket.on('level38:state',state=>{const current=state.polls.find(item=>item.id===poll.id);if(current?.totalVotes===1)published=current;});
  await delay(Math.max(0,10000-(Date.now()-Date.parse(remote.started_at))));
  const votedAt=Date.now();remote.choices[0].votes=1;
  await until(()=>f.call('/api/control/state',undefined,f.owner.cookie),response=>response.status===200&&response.data.polls.some(item=>item.id===poll.id&&item.status==='OPEN'&&item.totalVotes===1));
  await until(()=>published,value=>value?.totalVotes===1,1000);
  assert.ok(Date.now()-votedAt<=7000);
  assert.equal(published.effectiveWinnerId,null);assert.equal(published.resultsFinal,false);
  remote.choices[0].votes=3;remote.choices[1].votes=1;
  // Unrelated state broadcasts cannot postpone the existing backup deadline.
  const broadcasts=setInterval(()=>f.service.state().then(state=>f.pollRuntime.update(state)),350);
  let result;try {result=await until(()=>f.statePoll(poll.id),state=>state.totalVotes===4);} finally {clearInterval(broadcasts);}
  assert.equal(result.value.status,'OPEN');assert.deepEqual(result.value.options.map(option=>option.votes),[3,1]);
  ok(await f.op(`polls/${poll.id}/status`,{action:'close'}));
  const final=await f.statePoll(poll.id);assert.equal(final.resultsFinal,true);assert.equal(final.effectiveWinnerId,poll.options[0].id);
  const closedGets=gets(f);await delay(5600);assert.equal(gets(f),closedGets,'closing stops the background queries');
  assert.equal((await f.service.state()).event.completed,before.event.completed);assert.equal(await f.db.quest.count({where:{retiredAt:null}}),60);assert.equal(await f.db.vote.count(),0);
});

test('live backup preserves newer EventSub votes, deduplicates requests, retries temporary errors and leaves ties/zero votes to the operator', {timeout:60000},async t=>{
  const f=await nativeFixture(t,{pollRuntime:true});
  const {poll,remote}=await open(f,'Primary live progress');
  const event=await f.sendPoll('channel.poll.progress',remote,{votes:[4,1]});assert.equal(event.status,204);
  assert.equal((await f.webhook(event.message)).status,204);
  remote.choices.forEach(choice=>choice.votes=0);
  await delay(5500);assert.deepEqual((await f.statePoll(poll.id)).options.map(option=>option.votes),[4,1]);
  const liveAfterUnchangedRead=(await f.native.status()).live;
  assert.equal(liveAfterUnchangedRead.source,'eventsub','an unchanged Helix read must not relabel the source of published votes');
  assert.ok(Number.isFinite(Date.parse(liveAfterUnchangedRead.lastHelixAt)),'backup health still records the successful Helix read');
  const count=gets(f);
  await Promise.all(Array.from({length:8},()=>f.native.reconcile()));
  assert.ok(gets(f)-count<=1,'manual/background reconciliation is coalesced or throttled');
  const revisionBeforeFailure=(await f.service.state()).event.revision,publishedBeforeFailure=f.published.length;
  f.fake.pollFailure=503;await assert.rejects(f.native.reconcile());
  assert.ok((await f.dbPoll(poll.id)).twitchSyncError,'a failed Helix read persists a useful diagnostic');
  f.fake.pollFailure=null;await f.native.reconcile();
  assert.equal((await f.dbPoll(poll.id)).twitchSyncError,null,'an unchanged successful GET clears the persisted error');
  assert.equal((await f.native.status()).backup.status,'healthy');
  assert.equal((await f.service.state()).event.revision,revisionBeforeFailure);
  assert.equal(f.published.length,publishedBeforeFailure,'recovering diagnostics alone does not need an extra state broadcast');
  f.fake.pollFailure=429;await delay(5500);f.fake.pollFailure=null;
  remote.choices[0].votes=5;remote.choices[1].votes=2;
  await until(()=>f.statePoll(poll.id),state=>state.totalVotes===7,14000);
  ok(await f.op(`polls/${poll.id}/status`,{action:'cancel'}));
  const cancelled=await f.statePoll(poll.id);assert.equal(cancelled.effectiveWinnerId,null);assert.ok(cancelled.cancelledAt);
  for(const votes of [[2,2],[0,0]]) {
    const next=await open(f,votes[0]?'Live tied poll':'Live zero vote poll');
    next.remote.choices.forEach((choice,index)=>choice.votes=votes[index]);
    next.remote.status='COMPLETED';next.remote.ended_at=new Date().toISOString();
    const final=(await until(()=>f.statePoll(next.poll.id),state=>state.resultsFinal)).value;
    assert.equal(final.effectiveWinnerId,null);assert.deepEqual(final.options.map(option=>option.votes),votes);
    ok(await f.op(`polls/${next.poll.id}/winner`,{optionId:next.poll.options[0].id,...(!votes[0]?{overrideReason:'Operator resolves an unvoted round'}:{})}));
  }
  assert.equal(await f.db.vote.count(),0);
});

test('a fresh server runtime process resumes five-second polling from the persisted open native poll', {timeout:25000},async t=>{
  const f=await nativeFixture(t,{pollRuntime:true});const {poll,remote}=await open(f,'Resume live native poll');
  await f.pollRuntime.close();
  const before=await f.db.event.findFirstOrThrow();
  const child=spawn(process.execPath,['tests/integration/twitch-realtime-worker.cjs'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  const timeout=setTimeout(()=>child.kill(),15000);t.after(()=>{clearTimeout(timeout);if(child.exitCode===null)child.kill();});
  let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(stderr||'Fresh runtime process failed')));});
  child.stdin.end(JSON.stringify({databaseUrl:f.databaseUrl,cfg:f.cfg,remote,votes:[2,1]}));
  try {await finished;} finally {clearTimeout(timeout);}const result=JSON.parse(stdout);
  assert.equal(result.status,'OPEN');assert.equal(result.totalVotes,3);assert.ok(result.elapsedMs>=1000&&result.elapsedMs<8000);assert.ok(result.gets>=1&&result.gets<=3);
  const state=await f.statePoll(poll.id);assert.equal(state.totalVotes,3);assert.equal(state.effectiveWinnerId,null);
  const after=await f.db.event.findFirstOrThrow();assert.equal(after.currentGameId,before.currentGameId);assert.equal(after.target,38);assert.equal(after.unlockedAt,before.unlockedAt);
  remote.choices.forEach((choice,index)=>choice.votes=[2,1][index]);ok(await f.op(`polls/${poll.id}/status`,{action:'close'}));
  assert.equal((await f.statePoll(poll.id)).effectiveWinnerId,poll.options[0].id);
});
