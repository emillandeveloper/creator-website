const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./support.cjs');
const {updateStarterQuestContent}=require('../../dist/modules/level38/quest-content-update');
const {QUEST_CONTENT}=require('../../dist/modules/level38/quest-content');

test('starter text backfill is explicit, idempotent and preserves all event activity and custom content',{timeout:60000},async t=>{
  const f=await fixture(t);await f.start();const owner=await f.operator('Leo','OWNER');await f.viewer('Garnet');
  const quests=await f.db.quest.findMany({orderBy:{number:'asc'}});
  await f.db.quest.updateMany({data:{titleEs:null,descriptionEs:null,description:'Starter challenge: agree on a suitable objective for the current save before activating.'}});
  await f.db.quest.update({where:{id:quests[0].id},data:{status:'COMPLETED',completedAt:new Date()}});
  await f.db.quest.update({where:{id:quests[1].id},data:{title:'Custom curated quest'}});
  await f.db.quest.update({where:{id:quests[2].id},data:{titleEs:'Mi misión personalizada'}});
  const event=await f.db.event.findFirstOrThrow();
  const poll=await f.db.poll.create({data:{eventId:event.id,number:1,title:'Quest choice',createdById:owner.id,type:'NEXT_QUEST',status:'CLOSED',closedAt:new Date(),options:{create:[{position:0,label:quests[0].title,questId:quests[0].id}]}} ,include:{options:true}});
  const participant=await f.db.participant.findFirstOrThrow();
  await f.db.vote.create({data:{pollId:poll.id,optionId:poll.options[0].id,participantId:participant.id}});
  const activity=async()=>({polls:await f.db.poll.findMany(),options:await f.db.pollOption.findMany(),votes:await f.db.vote.findMany(),participants:await f.db.participant.findMany(),audit:await f.db.auditLog.findMany(),operators:await f.db.operator.findMany()});
  const before=await activity();const beforeQuests=await f.db.quest.findMany({orderBy:{number:'asc'}});
  const dry=await updateStarterQuestContent(f.db);assert.equal(dry.updated.length,52);assert.deepEqual(dry.skipped,[2,3]);assert.deepEqual(await f.db.quest.findMany({orderBy:{number:'asc'}}),beforeQuests);
  const applied=await updateStarterQuestContent(f.db,true);assert.deepEqual(applied.updated,dry.updated);assert.deepEqual(await activity(),before);
  const after=await f.db.quest.findMany({orderBy:{number:'asc'}});
  for(const [i,quest] of after.entries()){
    const stable=q=>{const {title,titleEs,description,descriptionEs,updatedAt,...rest}=q;return rest;};
    assert.deepEqual(stable(quest),stable(beforeQuests[i]));
    if(!applied.skipped.includes(quest.number)){assert.equal(quest.titleEs,QUEST_CONTENT[i].title.es);assert.equal(quest.descriptionEs,QUEST_CONTENT[i].description.es);}
    else assert.deepEqual(quest,beforeQuests[i]);
  }
  const finalEvent=await f.db.event.findFirstOrThrow();const {revision,controlRevision,updatedAt,...stableEvent}=finalEvent;
  const {revision:r,controlRevision:cr,updatedAt:ua,...oldStableEvent}=event;assert.deepEqual(stableEvent,oldStableEvent);assert.equal(revision,r+1);assert.equal(controlRevision,cr+1);
  assert.equal((await updateStarterQuestContent(f.db,true)).updated.length,0);assert.deepEqual(await f.db.event.findFirstOrThrow(),finalEvent);
  for(const lang of ['es','en']){
    const state=(await f.call('/api/state',undefined,`level38_lang=${lang}`)).data;
    assert.equal(state.polls[0].options[0].translations[lang].title,QUEST_CONTENT[0].title[lang]);
    for(const q of after.filter(q=>q.isSecret)){assert.ok(!JSON.stringify(state).includes(q.id));assert.ok(!JSON.stringify(state).includes(q.descriptionEs));}
  }
  assert.ok(owner.id);
});
