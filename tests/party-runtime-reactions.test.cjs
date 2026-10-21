const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PartyRuntime}=require('../dist/modules/level38/party-runtime');

function fixture(t){
  const events=[];
  const channel={on(){},to(room){assert.equal(room,'overlay');return{emit:(name,payload)=>events.push({name,payload})};}};
  const state=(revision,enabled=true)=>({event:{revision},serverTime:Date.parse('2026-10-21T12:00:00Z'),party:{enabled,nameMode:'ALWAYS',maxVisible:30}});
  const runtime=new PartyRuntime(channel,{}, {},async()=>state(0),'https://level38.test');
  t.after(()=>runtime.close());
  const publish=(revision,type='quest:completed',extra={},enabled=true)=>runtime.publish(state(revision,enabled),{type,revision,...extra});
  return{runtime,events,publish};
}

test('committed party reactions dedupe IDs while preserving distinct out-of-order completions',t=>{
  const{runtime,events,publish}=fixture(t);
  publish(10,'quest:activated');publish(12);publish(11);publish(12);publish(11);
  const actions=events.filter(e=>e.name==='party:action');assert.equal(actions.length,2);
  assert.deepEqual(actions.map(e=>e.payload.revision),[12,11]);
  for(const{payload}of actions){
    assert.deepEqual(Object.keys(payload).sort(),['action','durationMs','id','occurredAt','revision','version']);
    assert.equal(payload.action,'quest');assert.equal(payload.version,1);assert.equal(payload.durationMs,4000);
    assert.equal(payload.id,`level38:quest-completed:${payload.revision}`);assert.equal(payload.occurredAt,'2026-10-21T12:00:00.000Z');
  }
  assert.equal(runtime.snapshot().revision,12);assert.ok(Number.isFinite(runtime.snapshot().serverTime));
  assert.deepEqual(runtime.snapshot().members,[]);
});

test('disabled party consumes reactions and finale keeps exclusive priority over a quest reaction',t=>{
  const{events,publish}=fixture(t);
  publish(1,'quest:completed',{},false);publish(2,'party:configured');publish(1);
  assert.equal(events.filter(e=>e.name==='party:action').length,0);
  const unlock={version:1,id:'level38:unlock:1',sequence:1};publish(3,'quest:completed',{unlock});publish(3);
  assert.deepEqual(events.filter(e=>e.name==='level38:unlocked').map(e=>e.payload),[unlock]);
  assert.equal(events.filter(e=>e.name==='party:action').length,0);
  for(const type of ['quest:failed','quest:skipped','quest:available','quest:game','action:undone','poll:closed'])publish(4,type);
  assert.equal(events.filter(e=>e.name==='party:action').length,0);
});
