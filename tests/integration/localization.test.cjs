const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture } = require('./support.cjs');

test('bilingual HTML and semantic APIs preserve secret filtering, votes, identity and authorization', { timeout: 60000 }, async t => {
  const f = await fixture(t); await f.start();
  const viewer = await f.viewer('Garnet'); const mod = await f.operator('Isma', 'MODERATOR');
  const identity = await f.db.participant.findFirstOrThrow();
  const es = await f.call('/', undefined, undefined, { 'Accept-Language': 'es-ES,en;q=0.8' });
  const en = await f.call('/', undefined, 'level38_lang=en', { 'Accept-Language': 'es-ES' });
  assert.match(es.data, /<html lang="es">/); assert.match(es.data, /Diario de misiones/); assert.match(es.data, /Gana el primer combate/);
  assert.match(en.data, /<html lang="en">/); assert.match(en.data, /The quest journal/);
  for (const lang of ['es','en']) {
    const control = await f.call('/control', undefined, `${mod.cookie}; level38_lang=${lang}`);
    assert.equal(control.status, 200); assert.match(control.data, new RegExp(`<html lang="${lang}">`));
    assert.match(control.data, lang === 'es' ? /Cambiar juego/ : /Change game/);
    const state = (await f.call('/api/state', undefined, `${viewer}; level38_lang=${lang}`)).data;
    assert.equal(state.quests[0].status, 'AVAILABLE'); assert.ok(state.quests[0].translations.es.title);
    const secret = await f.db.quest.findFirstOrThrow({ where: { isSecret: true } });
    assert.ok(!JSON.stringify(state).includes(secret.id)); assert.ok(!JSON.stringify(state).includes(secret.titleEs));
    assert.equal((await f.call('/api/control/state', undefined, `${viewer}; level38_lang=${lang}`)).status, 401);
    assert.equal((await f.call('/api/session', undefined, `${viewer}; level38_lang=${lang}`)).data.class.id, identity.classId);
  }
  const defaultControl = await f.call('/control', undefined, mod.cookie, { 'Accept-Language': 'en-US' });
  assert.match(defaultControl.data, /<html lang="es">/);
  const revision = (await f.call('/api/control/state', undefined, mod.cookie)).data.event.controlRevision;
  const draft = await f.call('/api/control/polls', { type:'YES_NO', title:'¿Continuamos?', options:[{label:'Sí'},{label:'No'}], controlRevision:revision }, mod.cookie);
  assert.equal(draft.status, 200); const poll = await f.db.poll.findFirstOrThrow({include:{options:{orderBy:{position:'asc'}}}});
  assert.deepEqual(poll.options.map(o => o.label), ['Yes','No']);
  const nextRevision = (await f.call('/api/control/state', undefined, mod.cookie)).data.event.controlRevision;
  assert.equal((await f.call(`/api/control/polls/${poll.id}/status`, {action:'open',controlRevision:nextRevision},mod.cookie)).status,200);
  for (const lang of ['es','en']) assert.equal((await f.call(`/api/polls/${poll.id}/vote`,{optionId:poll.options[0].id},`${viewer}; level38_lang=${lang}`)).status,200);
  assert.equal(await f.db.vote.count(),1);
  assert.deepEqual(await f.db.participant.findFirstOrThrow(), identity);
});

test('Phase 3.6 additive migration preserves legacy content/state and supports repeat deploy and schema verification', { timeout: 90000 }, async t => {
  const f = await fixture(t, {migrate:false,seed:false});
  const schema = new URL(f.databaseUrl).searchParams.get('schema');
  assert.match(schema,/^level38_test_[a-f0-9]{32}$/);
  await f.db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for (const name of fs.readdirSync('prisma/migrations').filter(name => /^\d/.test(name) && !name.includes('quest_localization')).sort()) {
    f.cli('db','execute','--file',`prisma/migrations/${name}/migration.sql`,'--schema','prisma/schema.prisma');
    f.cli('migrate','resolve','--applied',name);
  }
  await f.db.$executeRaw`INSERT INTO "Event" (id,slug,title,revision,"controlRevision","updatedAt") VALUES ('old-event','level38','LEVEL 38',12,8,NOW())`;
  await f.db.$executeRaw`INSERT INTO "Game" (id,"eventId",slug,title) VALUES ('old-game','old-event','ff6','Final Fantasy VI')`;
  await f.db.$executeRaw`INSERT INTO "Quest" (id,"eventId","gameId",number,title,description,status,"completedAt","updatedAt") VALUES ('old-quest','old-event','old-game',1,'Legacy victory','Keep all this prose.','COMPLETED',NOW(),NOW())`;
  const [before] = await f.db.$queryRaw`SELECT * FROM "Quest" WHERE id='old-quest'`;
  f.cli('migrate','deploy');
  const { titleEs, descriptionEs, ...after } = await f.db.quest.findUniqueOrThrow({where:{id:'old-quest'}});
  assert.deepEqual(after,before); assert.equal(titleEs,null); assert.equal(descriptionEs,null);
  const event = await f.db.event.findFirstOrThrow(); assert.equal(event.revision,12); assert.equal(event.controlRevision,8);
  assert.match(f.cli('migrate','deploy').toString(),/No pending migrations/);
  assert.match(f.cli('migrate','status').toString(),/up to date/);
  f.cli('migrate','diff','--from-url',f.databaseUrl,'--to-schema-datamodel','prisma/schema.prisma','--exit-code');
});
