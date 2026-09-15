const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { setTimeout: delay } = require('node:timers/promises');
const { fixture } = require('./support.cjs');
const { newToken, hashToken } = require('../../dist/modules/level38/auth');

async function until(check) { for(let i=0;i<150;i++){if(await check())return;await delay(30);}throw new Error('Party condition timed out'); }
function client(t,f,kind,cookie,origin=f.origin) {
  const s=io(`${f.origin}/level38-party`,{path:'/level38/socket.io',transports:['websocket'],forceNew:true,autoConnect:false,
    auth:{kind},extraHeaders:{Origin:origin,...(cookie?{Cookie:cookie}:{})}});
  t.after(()=>s.disconnect());return s;
}
async function watch(t,f) {
  const s=client(t,f,'overlay'),members=new Map(),events=[];let config;
  s.onAny((name,payload)=>events.push({name,payload}));
  s.on('party:snapshot',data=>{members.clear();data.members.forEach(m=>members.set(m.presenceId,m));config=data.config;});
  s.on('party:joined',m=>members.set(m.presenceId,m));s.on('party:updated',m=>members.set(m.presenceId,m));s.on('party:left',m=>members.delete(m.presenceId));
  s.on('party:config',c=>{config=c;});s.connect();await until(()=>!!config);
  return {s,members,events,get config(){return config;}};
}
async function register(s, forged={}) { s.connect();await until(()=>s.connected);s.emit('party:register',forged); }

test('cookie identity, multi-tab presence, visibility, rename, reconnect and read-only public projection', {timeout:60000}, async t=>{
  const f=await fixture(t);await f.start();const overlay=await watch(t,f);
  const cookie=await f.viewer('Garnet'),row=await f.db.participant.findFirstOrThrow();
  const a=client(t,f,'viewer',cookie),b=client(t,f,'viewer',cookie);
  await register(a,{participantId:'forged',nickname:'Hacked',classId:'knight',variantId:'cecil'});await until(()=>overlay.members.size===1);
  const first=[...overlay.members.values()][0];assert.equal(first.nickname,row.nickname);assert.equal(first.classId,row.classId);assert.equal(first.variantId,row.variantId);
  await register(b);await delay(100);assert.equal(overlay.members.size,1);
  a.disconnect();await delay(100);assert.equal(overlay.members.size,1);
  b.disconnect();a.connect();await until(()=>a.connected);a.emit('party:register',{});await delay(100);
  assert.equal([...overlay.members.keys()][0],first.presenceId);
  assert.equal((await f.call('/api/stream-visibility',{streamVisible:false},cookie)).status,200);await until(()=>overlay.members.size===0);
  assert.equal((await f.call('/api/stream-visibility',{streamVisible:true},cookie)).status,200);await until(()=>overlay.members.size===1);
  const visibleId=[...overlay.members.keys()][0];
  await f.call('/api/join',{nickname:'New name'},cookie);await until(()=>overlay.members.get(visibleId)?.nickname==='New name');
  const retained=await f.db.participant.findUniqueOrThrow({where:{id:row.id}});
  for(const key of ['id','tokenHash','classId','variantId'])assert.equal(retained[key],row[key]);assert.deepEqual(retained.expiresAt,row.expiresAt);
  const unauth=client(t,f,'viewer');await register(unauth,{...row});await delay(100);assert.equal(overlay.members.size,1);
  const anonymousCookie=await f.viewer();await register(client(t,f,'viewer',anonymousCookie));await delay(100);assert.equal(overlay.members.size,1);
  overlay.s.emit('party:joined',{nickname:'Fake'});overlay.s.emit('party:register',{...row});overlay.s.emit('party:action',{action:'quest'});await delay(100);assert.equal(overlay.members.size,1);
  const wire=JSON.stringify(overlay.events);assert.ok(!wire.includes(row.id));assert.ok(!wire.includes(row.tokenHash));assert.ok(!wire.includes(cookie));
  assert.doesNotMatch(wire,/participantId|tokenHash|expiresAt|operator|controlRevision|pollId/);
  assert.equal((await f.call('/api/stream-visibility',{streamVisible:'true'},cookie)).status,400);
  assert.equal((await f.call('/api/stream-visibility',{streamVisible:false})).status,401);
  const second=await watch(t,f);assert.deepEqual([...second.members.values()],[...overlay.members.values()]);
});

test('vote targets only the voter, committed quest/finale reactions, audited configuration and reset integration', {timeout:90000},async t=>{
  const f=await fixture(t);await f.start();const owner=await f.operator('Leo','OWNER'),mod=await f.operator('Isma','MODERATOR');
  const overlay=await watch(t,f),cookies=[await f.viewer('One'),await f.viewer('Two')];
  for(const cookie of cookies)await register(client(t,f,'viewer',cookie));await until(()=>overlay.members.size===2);
  const revision=async()=>(await f.db.event.findFirstOrThrow()).controlRevision;
  const op=async(path,body,cookie=mod.cookie)=>f.call(path,{...body,controlRevision:await revision()},cookie);
  assert.equal((await op('/api/control/party',{enabled:true,nameMode:'ALWAYS',maxVisible:1})).status,200);
  await until(()=>overlay.config.maxVisible===1);assert.equal(overlay.config.nameMode,'ALWAYS');
  assert.deepEqual((await f.call('/api/control/state',undefined,mod.cookie)).data.partyCounts,{online:2,rendered:1,overflow:1});
  assert.equal((await f.db.auditLog.findFirstOrThrow({orderBy:{eventRevision:'desc'}})).action,'party:configured');
  for(const maxVisible of [0,51,1.5])assert.equal((await op('/api/control/party',{enabled:true,nameMode:'OFF',maxVisible})).status,400);
  assert.equal((await op('/api/control/party',{enabled:true,nameMode:'BAD',maxVisible:30})).status,400);
  assert.equal((await op('/api/control/party',{enabled:false,nameMode:'OFF',maxVisible:30},cookies[0])).status,401);
  await op('/api/control/polls',{type:'CUSTOM',title:'Choose',options:[{label:'Yes'},{label:'No'}]});
  const poll=await f.db.poll.findFirstOrThrow({include:{options:true}});await op(`/api/control/polls/${poll.id}/status`,{action:'open'});
  const before=overlay.events.length;assert.equal((await f.call(`/api/polls/${poll.id}/vote`,{optionId:poll.options[0].id},cookies[0])).status,200);
  await until(()=>overlay.events.slice(before).some(e=>e.name==='party:action'));
  const action=overlay.events.slice(before).find(e=>e.name==='party:action').payload;
  assert.deepEqual(action,{action:'vote',presenceId:[...overlay.members.values()].find(m=>m.nickname==='One').presenceId});
  const quests=await f.db.quest.findMany({where:{isSecret:false},orderBy:{number:'asc'}});
  await op(`/api/control/quests/${quests[0].id}`,{action:'activate'});await op(`/api/control/quests/${quests[0].id}`,{action:'complete'});
  await until(()=>overlay.events.some(e=>e.name==='party:action'&&e.payload.action==='quest'));
  const reactionCount=overlay.events.filter(e=>e.name==='party:action').length;
  await op('/api/owner/tools/preview',{confirmation:'PREVIEW LEVEL 38'},owner.cookie);await delay(100);
  assert.equal(overlay.events.filter(e=>e.name==='party:action').length,reactionCount);
  await f.db.quest.updateMany({where:{id:{in:quests.slice(0,37).map(q=>q.id)}},data:{status:'COMPLETED'}});
  await op(`/api/control/quests/${quests[37].id}`,{action:'activate'});await op(`/api/control/quests/${quests[37].id}`,{action:'complete'});
  await until(()=>overlay.events.some(e=>e.name==='level38:unlocked'));
  assert.equal(overlay.events.find(e=>e.name==='level38:unlocked').payload.id,'level38:unlock:1');
  await op('/api/control/party',{enabled:false,nameMode:'OFF',maxVisible:30});await until(()=>!overlay.config.enabled);assert.equal(overlay.members.size,2);
  assert.equal((await f.call('/api/control/state',undefined,mod.cookie)).data.partyCounts.rendered,0);
  await op('/api/owner/tools/progress',{confirmation:'RESET PROGRESS'},owner.cookie);assert.equal(overlay.members.size,2);
  await op('/api/owner/tools/participants',{confirmation:'CLEAR TEST PARTICIPANTS'},owner.cookie);await until(()=>overlay.members.size===0);
  assert.equal((await f.call('/overlay/party?preview=30')).status,401);
  assert.equal((await f.call('/overlay/party?preview=30',undefined,mod.cookie)).status,403);
  assert.equal((await f.call('/overlay/party?preview=30',undefined,owner.cookie)).status,200);
  assert.equal((await f.call('/overlay/party?preview=999',undefined,owner.cookie)).status,400);
  assert.equal((await f.call('/overlay/party')).status,200);assert.equal(overlay.members.size,0);
});

test('Phase 5 additive upgrade preserves existing participant identity and opt-in defaults', {timeout:120000},async t=>{
  const f=await fixture(t,{migrate:false,seed:false});
  const schema=new URL(f.databaseUrl).searchParams.get('schema');assert.match(schema,/^level38_test_[a-f0-9]{32}$/);
  await f.db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const name of require('node:fs').readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)&&n<'202609150009').sort()){
    f.cli('db','execute','--file',`prisma/migrations/${name}/migration.sql`,'--schema','prisma/schema.prisma');
    f.cli('migrate','resolve','--applied',name);
  }
  await f.db.$executeRaw`INSERT INTO "Participant" (id,"tokenHash",nickname,"classId","variantId","expiresAt") VALUES ('old','test-session','Garnet','thief','krile',NOW()+interval '1 year')`;
  await f.db.$executeRaw`INSERT INTO "Event" (id,slug,title,"updatedAt") VALUES ('old-event','level38','LEVEL 38',NOW())`;
  const before=await f.db.$queryRaw`SELECT * FROM "Participant"`,eventBefore=await f.db.$queryRaw`SELECT * FROM "Event"`;
  await f.start();assert.equal((await fetch(f.origin+'/healthz')).status,503);
  f.cli('migrate','deploy');
  assert.deepEqual(await f.db.participant.findMany(),before.map(p=>({...p,streamVisible:true})));
  assert.deepEqual(await f.db.event.findMany(),eventBefore.map(e=>({...e,partyEnabled:true,partyNameMode:'ENTRY',partyMaxVisible:30})));
  assert.equal((await fetch(f.origin+'/healthz')).status,200);
  assert.match(f.cli('migrate','deploy').toString(),/No pending migrations/);
});

test('process restart discards ephemeral presence then reconnect restores stored appearance and configuration', {timeout:60000},async t=>{
  const f=await fixture(t);const {startSite}=require('../helpers.cjs');
  const token=newToken(),p=await f.db.participant.create({data:{tokenHash:hashToken(token),nickname:'Persistent',classId:'machinist',variantId:'cid',expiresAt:new Date('2030-01-01')}});
  await f.db.event.updateMany({data:{partyNameMode:'ALWAYS',partyMaxVisible:5}});
  const env={LEVEL38_ENABLED:'true',DATABASE_URL:f.databaseUrl};let site=await startSite(env);t.after(()=>site.stop());
  const ctx={origin:site.origin},overlay=await watch(t,ctx),viewer=client(t,ctx,'viewer',`level38_viewer=${token}`);
  viewer.on('connect',()=>viewer.emit('party:register',{}));viewer.connect();await until(()=>overlay.members.size===1);
  const oldId=[...overlay.members.keys()][0],port=Number(new URL(site.origin).port),snapshots=()=>overlay.events.filter(e=>e.name==='party:snapshot').length,before=snapshots();
  await site.stop();site=await startSite(env,port);
  await until(()=>snapshots()>before&&overlay.members.size===1);
  const current=[...overlay.members.values()][0];assert.notEqual(current.presenceId,oldId);assert.equal(current.classId,p.classId);assert.equal(current.variantId,p.variantId);assert.equal(current.nickname,p.nickname);
  assert.equal(overlay.config.nameMode,'ALWAYS');assert.equal(overlay.config.maxVisible,5);
  assert.deepEqual(await f.db.participant.findUniqueOrThrow({where:{id:p.id}}),p);
});
