const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./support.cjs');

test('Phase 5.1 upgrades untouched defaults to ALWAYS, preserves saved settings and participant identity', {timeout:180000},async t=>{
  const f=await fixture(t,{migrate:false,seed:false});
  const schema=new URL(f.databaseUrl).searchParams.get('schema');assert.match(schema,/^level38_test_[a-f0-9]{32}$/);
  await f.db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const name of require('node:fs').readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)&&n<'202609150010').sort()){
    f.cli('db','execute','--file',`prisma/migrations/${name}/migration.sql`,'--schema','prisma/schema.prisma');f.cli('migrate','resolve','--applied',name);
  }
  for(const [id,mode] of [['untouched','ENTRY'],['explicit','ENTRY'],['off','OFF'],['always','ALWAYS']]){
    await f.db.$executeRaw`INSERT INTO "Event" (id,slug,title,"partyNameMode","updatedAt") VALUES (${id},${id==='untouched'?'level38':id},'LEVEL 38',${mode},NOW())`;
  }
  await f.db.auditLog.create({data:{eventId:'explicit',operatorName:'Test operator',action:'party:configured',entityId:'explicit',before:{nameMode:'ENTRY'},after:{nameMode:'ENTRY'},eventRevision:1}});
  const participant=await f.db.participant.create({data:{tokenHash:'test-only-placeholder',nickname:'Garnet',classId:'thief',variantId:'krile',streamVisible:false,expiresAt:new Date('2030-01-01')}});
  const before=await f.db.event.findMany({orderBy:{id:'asc'}}),audit=await f.db.auditLog.findMany();
  f.cli('migrate','deploy');
  assert.deepEqual(await f.db.event.findMany({orderBy:{id:'asc'}}),before.map(e=>e.id==='untouched'?{...e,partyNameMode:'ALWAYS'}:e));
  assert.deepEqual(await f.db.participant.findUniqueOrThrow({where:{id:participant.id}}),participant);assert.deepEqual(await f.db.auditLog.findMany(),audit);
  const inserted=await f.db.$queryRaw`INSERT INTO "Event" (id,slug,title,"updatedAt") VALUES ('new','new','New',NOW()) RETURNING "partyNameMode"`;
  assert.equal(inserted[0].partyNameMode,'ALWAYS');
  await f.start();assert.equal((await f.call('/api/state')).data.party.nameMode,'ALWAYS');
  assert.match(f.cli('migrate','deploy').toString(),/No pending migrations/);
});
