const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {fixture}=require('./support.cjs');
const {syncQuestCatalog}=require('../../dist/modules/level38/quest-content-update');
const legacy=require('../../src/modules/level38/legacy-quest-content.json');
const {QUEST_CONTENT}=require('../../dist/modules/level38/quest-content');

async function seedLegacy(db){
  const event=await db.event.create({data:{slug:'level38',title:'LEVEL 38',target:38}});
  const games={};
  for(const slug of ['ff5','ff6','ff9'])games[slug]=await db.game.create({data:{eventId:event.id,slug,title:'Final Fantasy '+{ff5:'V',ff6:'VI',ff9:'IX'}[slug]}});
  for(const q of legacy){
    const quest=await db.quest.create({data:{eventId:event.id,gameId:games[q.gameSlug].id,number:q.number,title:q.title.en,titleEs:q.title.es,
      description:q.description.en,descriptionEs:q.description.es,isSecret:q.isSecret,status:q.isSecret?'SECRET':'AVAILABLE',initialStatus:q.isSecret?'SECRET':'AVAILABLE'}});
    await db.questGame.create({data:{eventId:event.id,questId:quest.id,gameId:quest.gameId}});
  }
  await db.event.update({where:{id:event.id},data:{currentGameId:games.ff5.id}});
  return event;
}
const snapshot=async db=>({events:await db.event.findMany(),quests:await db.quest.findMany({orderBy:{id:'asc'}}),games:await db.game.findMany({orderBy:{id:'asc'}}),
  links:await db.questGame.findMany({orderBy:[{questId:'asc'},{gameId:'asc'}]}),polls:await db.poll.findMany(),options:await db.pollOption.findMany(),votes:await db.vote.findMany(),
  participants:await db.participant.findMany(),audit:await db.auditLog.findMany(),operators:await db.operator.findMany()});

test('legacy54 dry-run has zero writes; apply retires safely into exactly60 and reruns preserve all activity',{timeout:60000},async t=>{
  const f=await fixture(t,{seed:false});await seedLegacy(f.db);await f.start();const owner=await f.operator('Leo','OWNER');await f.viewer('Garnet');
  const before=await snapshot(f.db),dry=await syncQuestCatalog(f.db);
  assert.equal(dry.canApply,true);assert.equal(dry.retire.length,54);assert.equal(dry.create.length,60);assert.equal(dry.activeAfter,60);
  assert.deepEqual(dry.distribution,{MULTI_GAME:20,GAME_SPECIFIC:28,COOPERATIVE:6,SECRET:6});assert.deepEqual(await snapshot(f.db),before);
  const applied=await syncQuestCatalog(f.db,true);assert.deepEqual({...applied,apply:false},dry);
  const active=await f.db.quest.findMany({where:{retiredAt:null},orderBy:{number:'asc'}});
  assert.equal(active.length,60);assert.equal(await f.db.quest.count(),114);assert.equal(await f.db.quest.count({where:{retiredAt:{not:null}}}),54);
  for(const [i,q]of active.entries()){assert.equal(q.number,i+1);assert.equal(q.catalogKey,QUEST_CONTENT[i].key);assert.equal(q.titleEs,QUEST_CONTENT[i].title.es);}
  for(const old of before.quests){const {retiredAt,updatedAt,...after}=await f.db.quest.findUniqueOrThrow({where:{id:old.id}});const {retiredAt:r,updatedAt:u,...prior}=old;assert.ok(retiredAt);assert.deepEqual(after,prior);}
  assert.deepEqual(await f.db.participant.findMany(),before.participants);assert.deepEqual(await f.db.operator.findMany(),before.operators);
  assert.deepEqual(await f.db.poll.findMany(),before.polls);assert.deepEqual(await f.db.vote.findMany(),before.votes);
  assert.equal((await f.call('/api/state')).data.quests.length,60);assert.equal((await f.call('/api/state')).data.event.completed,0);
  // Operator-managed links, chosen game and completed state survive later synchronization.
  const q=active[0],links=await f.db.questGame.findMany({where:{questId:q.id}});assert.ok(links.length>1);
  await f.db.quest.update({where:{id:q.id},data:{status:'COMPLETED',completedAt:new Date(),gameId:links[1].gameId}});
  await f.db.questGame.deleteMany({where:{questId:q.id,gameId:{not:links[1].gameId}}});
  const settled=await snapshot(f.db),again=await syncQuestCatalog(f.db,true);
  assert.equal(again.create.length+again.update.length+again.retire.length+again.createGames.length,0);assert.equal(again.unchanged.length,60);assert.deepEqual(await snapshot(f.db),settled);
  assert.ok(owner.id);
});

test('legacy progress, reveal, customization, polls/votes and audit history block the entire apply atomically',{timeout:60000},async t=>{
  const f=await fixture(t,{seed:false});const event=await seedLegacy(f.db);await f.start();const owner=await f.operator('Leo','OWNER');await f.viewer('Viewer');
  const quests=await f.db.quest.findMany({orderBy:{number:'asc'}});
  await f.db.quest.update({where:{id:quests[0].id},data:{status:'COMPLETED',completedAt:new Date()}});
  await f.db.quest.update({where:{id:quests[1].id},data:{title:'My custom objective'}});
  const secret=quests.find(q=>q.isSecret);await f.db.quest.update({where:{id:secret.id},data:{status:'AVAILABLE',revealedAt:new Date()}});
  const poll=await f.db.poll.create({data:{eventId:event.id,title:'Historical vote',createdById:owner.id,status:'CLOSED',options:{create:[{position:0,label:quests[2].title,questId:quests[2].id}]}},include:{options:true}});
  await f.db.vote.create({data:{pollId:poll.id,optionId:poll.options[0].id,participantId:(await f.db.participant.findFirstOrThrow()).id}});
  await f.db.auditLog.create({data:{eventId:event.id,operatorId:owner.id,operatorName:'Leo',action:'quest:available',entityId:quests[3].id,before:{status:'ACTIVE'},after:{status:'AVAILABLE'},eventRevision:1}});
  const before=await snapshot(f.db),dry=await syncQuestCatalog(f.db);assert.equal(dry.canApply,false);assert.ok(dry.blocked.length>=5);
  assert.deepEqual(await snapshot(f.db),before);await assert.rejects(syncQuestCatalog(f.db,true),/BLOCKED/);assert.deepEqual(await snapshot(f.db),before);
});

test('fresh final seed is complete and repeat sync is a no-op; canonical text update preserves lifecycle',{timeout:60000},async t=>{
  const f=await fixture(t);const before=await snapshot(f.db);assert.equal((await syncQuestCatalog(f.db)).unchanged.length,60);
  await syncQuestCatalog(f.db,true);assert.deepEqual(await snapshot(f.db),before);
  const q=before.quests.find(q=>q.number===1);await f.db.quest.update({where:{id:q.id},data:{description:'Outdated text',status:'COMPLETED',completedAt:new Date()}});
  const changed=await f.db.quest.findUniqueOrThrow({where:{id:q.id}}),dry=await syncQuestCatalog(f.db);assert.deepEqual(dry.update,[1]);
  await syncQuestCatalog(f.db,true);const after=await f.db.quest.findUniqueOrThrow({where:{id:q.id}});assert.equal(after.status,'COMPLETED');assert.deepEqual(after.completedAt,changed.completedAt);assert.equal(after.description,QUEST_CONTENT[0].description.en);
});

test('context-only game polls, including archived rounds, block legacy retirement without any writes',{timeout:60000},async t=>{
  const f=await fixture(t,{seed:false});const event=await seedLegacy(f.db);
  const quest=await f.db.quest.findFirstOrThrow({where:{eventId:event.id,number:1}});
  const owner=await f.db.operator.create({data:{name:'Context history owner',role:'OWNER',keyHash:'catalog-context-history-test-key'}});
  const poll=await f.db.poll.create({data:{eventId:event.id,title:'Context-only game choice',type:'NEXT_GAME',contextQuestId:quest.id,createdById:owner.id}});
  assert.equal(await f.db.pollOption.count(),0);
  assert.equal(await f.db.auditLog.count(),0);
  for(const archived of [false,true]){
    if(archived)await f.db.poll.update({where:{id:poll.id},data:{status:'CLOSED',closedAt:new Date(),archivedAt:new Date()}});
    const before=await snapshot(f.db),dry=await syncQuestCatalog(f.db);
    assert.equal(dry.canApply,false,archived?'Archived context history must block':'Draft context history must block');
    assert.equal(dry.blocked.length,1);
    assert.match(dry.blocked[0],new RegExp(`Legacy quest #1 \\(${quest.id}\\).*poll or audit history`));
    assert.deepEqual(await snapshot(f.db),before);
    await assert.rejects(syncQuestCatalog(f.db,true),/BLOCKED/);
    assert.deepEqual(await snapshot(f.db),before);
  }
});

test('legacy starter variants are recognized; custom initial states and duplicate game editions stop apply',{timeout:60000},async t=>{
  const f=await fixture(t,{seed:false});const event=await seedLegacy(f.db);
  await f.db.quest.updateMany({data:{titleEs:null,descriptionEs:null,description:'Starter challenge: agree on a suitable objective for the current save before activating.'}});
  await f.db.quest.update({where:{id:(await f.db.quest.findFirstOrThrow({where:{number:17}})).id},data:{titleEs:'Búsqueda del tesoro secreta',descriptionEs:'Misión de prueba: acordad un objetivo adecuado para la partida actual antes de activarla.'}});
  assert.equal((await syncQuestCatalog(f.db)).canApply,true);
  const q=await f.db.quest.findFirstOrThrow({where:{number:1}});
  await f.db.quest.update({where:{id:q.id},data:{initialStatus:'LOCKED'}});
  const custom=await snapshot(f.db);await assert.rejects(syncQuestCatalog(f.db,true),/BLOCKED/);assert.deepEqual(await snapshot(f.db),custom);
  await f.db.quest.update({where:{id:q.id},data:{initialStatus:'AVAILABLE'}});
  await f.db.game.create({data:{eventId:event.id,slug:'old-ff7',title:'Final Fantasy VII'}});
  const duplicate=await snapshot(f.db),dry=await syncQuestCatalog(f.db);assert.equal(dry.canApply,false);assert.ok(dry.blocked.some(message=>message.includes('another slug')));
  await assert.rejects(syncQuestCatalog(f.db,true),/BLOCKED/);assert.deepEqual(await snapshot(f.db),duplicate);
});

test('catalog CLI defaults to dry-run, supports explicit modes and rejects unexpected arguments',{timeout:60000},async t=>{
  const f=await fixture(t);const before=await snapshot(f.db);
  const cli=(...args)=>JSON.parse(execFileSync(process.execPath,['dist/modules/level38/commands.js','quest-catalog',...args],{
    env:{...process.env,DATABASE_URL:f.databaseUrl},encoding:'utf8',stdio:'pipe',windowsHide:true}));
  assert.equal(cli().apply,false);assert.equal(cli('--dry-run').apply,false);assert.equal(cli('--apply').apply,true);
  assert.throws(()=>cli('--apply','unexpected'));assert.deepEqual(await snapshot(f.db),before);
});
