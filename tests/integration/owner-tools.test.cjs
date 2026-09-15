const {test}=require('node:test');
const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const fs=require('node:fs');
const {fixture}=require('./support.cjs');
const next=(socket,name)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Missing ${name}`)),5000);socket.once(name,value=>{clearTimeout(timer);resolve(value);});});

test('owner tools preserve history, require authorization/confirmation, recover identities and allow another genuine finale', {timeout:60000},async t=>{
  const f=await fixture(t);await f.start();
  const owner=await f.operator('Leo','OWNER'),mod=await f.operator('Isma','MODERATOR'),cookie=await f.viewer('Garnet');
  const revision=async()=>(await f.db.event.findFirstOrThrow()).controlRevision;
  const tool=async(action,confirmation,who=owner.cookie,rev)=>f.call(`/api/owner/tools/${action}`,{confirmation,controlRevision:rev ?? await revision()},who);
  const op=async(route,body)=>{const r=await f.call(`/api/control/${route}`,{...body,controlRevision:await revision()},owner.cookie);assert.equal(r.status,200,JSON.stringify(r.data));return r;};
  const socket=io(`${f.origin}/level38`,{path:'/level38/socket.io',autoConnect:false,transports:['websocket']});t.after(()=>socket.disconnect());
  let count=0;socket.on('level38:unlocked',()=>count++);let initial=next(socket,'level38:state');socket.connect();await initial;
  const operators=await f.db.operator.findMany(),sessions=await f.db.operatorSession.findMany(),games=await f.db.game.findMany({orderBy:{sortOrder:'asc'}});
  const html=(await f.call('/control',undefined,mod.cookie)).data;assert.ok(!html.includes('id="owner-tools"'));
  assert.ok((await f.call('/control',undefined,owner.cookie)).data.includes('id="owner-tools"'));
  const beforePreview=await f.db.event.findFirstOrThrow(),questsBefore=await f.db.quest.findMany();
  const preview=next(socket,'level38:celebration-preview');assert.equal((await tool('preview','PREVIEW LEVEL 38')).status,200);
  const event=await preview;assert.equal(event.sequence,undefined);assert.equal(event.completed,undefined);
  const afterPreview=await f.db.event.findFirstOrThrow();assert.equal(afterPreview.unlockSequence,beforePreview.unlockSequence);assert.deepEqual(afterPreview.lastUnlockedAt,beforePreview.lastUnlockedAt);
  assert.deepEqual(await f.db.quest.findMany(),questsBefore);assert.equal(count,0);
  const quests=await f.db.quest.findMany({where:{isSecret:false},orderBy:{number:'asc'}});
  await f.db.quest.updateMany({where:{id:{in:quests.slice(0,37).map(q=>q.id)}},data:{status:'COMPLETED',completedAt:new Date()}});
  await f.db.quest.update({where:{id:quests[37].id},data:{status:'ACTIVE'}});
  const genuine=next(socket,'level38:unlocked');await op(`quests/${quests[37].id}`,{action:'complete'});assert.equal((await genuine).sequence,1);
  const secret=await f.db.quest.findFirstOrThrow({where:{isSecret:true}});await op(`quests/${secret.id}`,{action:'reveal'});
  await f.db.quest.update({where:{id:quests[38].id},data:{initialStatus:'LOCKED',status:'SKIPPED'}});
  await op('polls',{type:'YES_NO',title:'Test round',options:[]});const poll=await f.db.poll.findFirstOrThrow({include:{options:true}});
  await op(`polls/${poll.id}/status`,{action:'open'});assert.equal((await f.call(`/api/polls/${poll.id}/vote`,{optionId:poll.options[0].id},cookie)).status,200);
  const participant=await f.db.participant.findFirstOrThrow(),vote=await f.db.vote.findFirstOrThrow();
  const defs=(await f.db.quest.findMany({orderBy:{number:'asc'}})).map(({status,completedAt,revealedAt,updatedAt,...q})=>q);
  const rev=await revision();const duplicate=await Promise.all([tool('progress','RESET PROGRESS',owner.cookie,rev),tool('progress','RESET PROGRESS',owner.cookie,rev)]);
  assert.deepEqual(duplicate.map(r=>r.status).sort(),[200,409]);
  const state=(await f.call('/api/state')).data;assert.equal(state.event.completed,0);assert.equal(state.event.unlockSequence,1);assert.equal(state.event.resetSequence,1);assert.equal(state.polls.length,0);assert.ok(!JSON.stringify(state).includes(secret.id));
  const resetQuests=await f.db.quest.findMany({orderBy:{number:'asc'}});
  const resetEvent=await f.db.event.findFirstOrThrow();assert.equal(resetEvent.gameSource,'MANUAL_OVERRIDE');assert.equal(resetEvent.manualOverrideBy,null);assert.equal(resetEvent.currentGameId,games[0].id);assert.equal(resetEvent.lastUnlockedAt,null);
  assert.deepEqual(resetQuests.map(({status,completedAt,revealedAt,updatedAt,...q})=>q),defs);
  for(const q of resetQuests){assert.equal(q.status,q.isSecret?'SECRET':q.initialStatus);assert.equal(q.completedAt,null);assert.equal(q.revealedAt,null);}
  assert.deepEqual(await f.db.participant.findFirstOrThrow(),participant);assert.deepEqual(await f.db.vote.findFirstOrThrow(),vote);
  assert.equal((await f.db.poll.findUniqueOrThrow({where:{id:poll.id}})).status,'CLOSED');
  assert.equal((await f.call(`/api/control/polls/${poll.id}/winner`,{optionId:poll.options[0].id,controlRevision:await revision()},owner.cookie)).status,404);
  assert.equal((await f.call('/api/control/state',undefined,owner.cookie)).data.archivedPolls.length,1);
  assert.equal((await f.call('/api/control/state',undefined,owner.cookie)).data.undo.available,false);
  assert.equal((await tool('participants','CLEAR TEST PARTICIPANTS')).status,200);
  const expired=await f.db.participant.findUniqueOrThrow({where:{id:participant.id}});assert.equal(expired.nickname,null);assert.equal(expired.classId,null);assert.equal(expired.expiresAt.getTime(),0);assert.deepEqual(await f.db.vote.findFirstOrThrow(),vote);
  assert.equal((await f.call('/api/join',{nickname:'Again'},cookie)).status,401);
  const fresh=await f.call('/api/session',undefined,cookie);assert.equal(fresh.status,200);assert.ok(fresh.cookie);assert.notEqual(fresh.cookie,cookie);assert.equal(fresh.data.nickname,null);assert.deepEqual(fresh.data.votes,[]);
  assert.equal((await f.call('/api/join',{nickname:'Again'},fresh.cookie)).status,200);
  const auditBefore=await f.db.auditLog.count();assert.equal((await tool('prepare','wrong')).status,400);assert.equal(await f.db.auditLog.count(),auditBefore);
  assert.equal((await tool('prepare','RESET LEVEL 38')).status,200);
  assert.equal(await f.db.participant.count({where:{expiresAt:{gt:new Date()}}}),0);
  assert.deepEqual(await f.db.operator.findMany(),operators);assert.deepEqual(await f.db.operatorSession.findMany(),sessions);
  assert.deepEqual(await f.db.game.findMany({orderBy:{sortOrder:'asc'}}),games);
  assert.equal((await f.call('/api/control/state',undefined,owner.cookie)).status,200);
  await f.db.quest.updateMany({where:{id:{in:quests.slice(0,37).map(q=>q.id)}},data:{status:'COMPLETED',completedAt:new Date()}});
  await f.db.quest.update({where:{id:quests[37].id},data:{status:'ACTIVE'}});
  const again=next(socket,'level38:unlocked');await op(`quests/${quests[37].id}`,{action:'complete'});assert.equal((await again).sequence,2);
  assert.equal(count,2);
  const actions=(await f.db.auditLog.findMany()).map(a=>a.action);for(const action of ['owner:preview','owner:progress','owner:participants','owner:prepare'])assert.ok(actions.includes(action));
  assert.equal(actions.filter(a=>a==='owner:progress').length,1);
});

test('owner routes reject moderators, viewers and cross-origin requests without mutation', {timeout:30000},async t=>{
  const f=await fixture(t);await f.start();const owner=await f.operator('Leo','OWNER'),mod=await f.operator('Isma','MODERATOR'),cookie=await f.viewer('Garnet');
  const before=await f.db.event.findFirstOrThrow();
  for(const [action,confirmation] of Object.entries({preview:'PREVIEW LEVEL 38',progress:'RESET PROGRESS',participants:'CLEAR TEST PARTICIPANTS',prepare:'RESET LEVEL 38'})){
    const body={confirmation,controlRevision:0,role:'OWNER'};
    assert.equal((await f.call(`/api/owner/tools/${action}`,body,mod.cookie)).status,403);
    assert.equal((await f.call(`/api/owner/tools/${action}`,body,cookie)).status,401);
  }
  assert.equal((await f.call('/api/owner/tools/prepare',{confirmation:'RESET LEVEL 38',controlRevision:0},owner.cookie,{Origin:'https://invalid.example'})).status,403);
  await f.db.operator.update({where:{id:owner.id},data:{disabled:true}});
  assert.equal((await f.call('/api/owner/tools/prepare',{confirmation:'RESET LEVEL 38',controlRevision:0},owner.cookie)).status,401);
  assert.deepEqual(await f.db.event.findFirstOrThrow(),before);assert.equal(await f.db.auditLog.count(),0);
});

test('owner-tool migration is additive, infers initial states and preserves prior progress/history', {timeout:90000},async t=>{
  const f=await fixture(t,{migrate:false,seed:false});const schema=new URL(f.databaseUrl).searchParams.get('schema');
  assert.match(schema,/^level38_test_[a-f0-9]{32}$/);await f.db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const name of fs.readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)&&!n.includes('owner_tools')).sort()){
    f.cli('db','execute','--file',`prisma/migrations/${name}/migration.sql`,'--schema','prisma/schema.prisma');f.cli('migrate','resolve','--applied',name);
  }
  await f.db.$executeRaw`INSERT INTO "Event" (id,slug,title,"unlockSequence","updatedAt") VALUES ('e','level38','LEVEL 38',7,NOW())`;
  await f.db.$executeRaw`INSERT INTO "Game" (id,"eventId",slug,title) VALUES ('g','e','ff6','Final Fantasy VI')`;
  await f.db.$executeRaw`INSERT INTO "Quest" (id,"eventId","gameId",number,title,description,status,"isSecret","completedAt","updatedAt") VALUES ('q','e','g',1,'Keep title','Keep description','COMPLETED',true,NOW(),NOW()),('l','e','g',2,'Locked','Keep','LOCKED',false,NULL,NOW())`;
  const before=await f.db.$queryRaw`SELECT * FROM "Quest" ORDER BY number`;
  f.cli('migrate','deploy');const after=await f.db.quest.findMany({orderBy:{number:'asc'}});
  assert.deepEqual(after.map(({initialStatus,...q})=>q),before);assert.deepEqual(after.map(q=>q.initialStatus),['SECRET','LOCKED']);assert.equal((await f.db.event.findFirstOrThrow()).unlockSequence,7);
  assert.match(f.cli('migrate','deploy').toString(),/No pending migrations/);assert.match(f.cli('migrate','status').toString(),/up to date/);
  f.cli('migrate','diff','--from-url',f.databaseUrl,'--to-schema-datamodel','prisma/schema.prisma','--exit-code');
});
