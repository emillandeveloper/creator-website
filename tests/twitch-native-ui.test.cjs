const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const { translate, questText } = require('../public/js/level38/translations');

const script = file => fs.readFileSync(`public/js/level38/${file}.js`, 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const tr = (key, params) => translate('en', key, params);
function data() {
  return { event:{ revision:1, controlRevision:1, completed:0, target:38 }, serverTime:Date.now(),
    twitch:{ polls:{available:true} }, undo:{available:false}, audit:[], polls:[],
    games:[{id:'a',title:'Final Fantasy VII Remake Intergrade',enabled:true}, {id:'b',title:'Persona 5 Royal',enabled:true}, {id:'c',title:'Disabled game',enabled:false}, {id:'d',title:'Dragon Quest XI S',enabled:true}],
    quests:[{id:'multi',number:1,title:'A choice across different RPG adventures',gameId:'a',status:'AVAILABLE',eligibleGameIds:['a','b','c']},
      {id:'single',number:21,title:'One game only',gameId:'a',status:'AVAILABLE',eligibleGameIds:['a']},
      {id:'disabled',number:22,title:'Only one enabled game',gameId:'a',status:'AVAILABLE',eligibleGameIds:['a','c']},
      {id:'hidden',number:55,title:'Secret title',status:'SECRET',hidden:true,eligibleGameIds:['a','b']}] };
}
function html(view, locals = {}) {
  const filename = path.resolve(`src/views/level38/${view}.ejs`);
  return ejs.render(fs.readFileSync(filename, 'utf8'), {lang:'en',overlayLang:'en',t:tr,operator:{name:'Owner',role:'OWNER'},classNames:{},...locals}, {filename});
}
async function editor(t) {
  const dom = new JSDOM(html('control'), {url:'http://localhost/level38/control',runScripts:'outside-only'});
  t.after(()=>dom.window.close()); const w = dom.window, state = data(), calls=[];
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.setInterval = () => 1; w.confirm = () => true;
  let handlers, reconnect;
  w.Level38I18n = {language:'en',t:tr,questText:(quest,field)=>questText(quest,field,'en')};
  w.eval(script('common'));
  Object.assign(w.Level38, {renderState(){},renderPolls(next, actions){handlers=actions;},connect(update,refresh){reconnect=refresh;return {};},
    async request(route, body) { if (body) {calls.push({route,body});state.event.revision++;state.event.controlRevision++;return {};} return structuredClone(state); }});
  w.eval(script('control')); await tick();
  return {w,state,calls,get handlers(){return handlers;},refresh:()=>reconnect(),$:(id)=>w.document.getElementById(id),
    change(id,value){const el=w.document.getElementById(id);el.value=value;el.dispatchEvent(new w.Event('change'));}};
}

test('NEXT_GAME editor offers only enabled distinct global/context choices and prevents the reproduced single-game context failure', async t => {
  const f = await editor(t); f.change('poll-type','NEXT_GAME');
  const contexts = Array.from(f.$('poll-quest').options, option=>option.value);
  assert.deepEqual(contexts,['','multi']);
  let selects = f.$('poll-options').querySelectorAll('select');
  assert.deepEqual(Array.from(selects, input=>input.value),['a','b']);
  assert.deepEqual(Array.from(selects[0].options, option=>option.value),['','a','b','d']);
  assert.equal(selects[0].querySelector('[value="b"]').disabled,true);
  f.change('poll-quest','multi'); selects=f.$('poll-options').querySelectorAll('select');
  assert.deepEqual(Array.from(selects[0].options, option=>option.value),['','a','b']);
  assert.equal(f.$('add-option').disabled,true);
  assert.equal(f.$('save-poll').disabled,false);
  f.state.games.find(game=>game.id==='b').enabled=false; f.state.event.revision++;f.state.event.controlRevision++;
  await f.refresh();
  assert.equal(f.$('poll-quest').value,'multi','an invalid context is retained visibly rather than silently becoming global');
  assert.equal(f.$('save-poll').disabled,true);
  assert.match(f.$('poll-options-note').textContent,/At least two/);
});

test('linked Twitch label previews remain distinct even when another game already has a generated suffix', async t => {
  const f = await editor(t);
  f.state.games[0].title = 'Final Fantasy'; f.state.games[1].title = 'FF'; f.state.games[3].title = 'FF #1';
  f.state.event.revision++; f.state.event.controlRevision++;
  await f.refresh();
  f.change('poll-type','NEXT_GAME'); f.$('add-option').click();
  const labels = Array.from(f.$('poll-options').querySelectorAll('[data-native-label]'), node=>node.textContent.replace('Twitch label: ',''));
  assert.equal(labels.length,3); assert.equal(new Set(labels.map(label=>label.toLowerCase())).size,3);
  assert.deepEqual(labels,['FF #1.1','FF #2','FF #1']);
});

test('draft edit, clone and type changes retain correct linked IDs without stale NEXT_GAME context or breaking NEXT_QUEST', async t => {
  const f=await editor(t);
  const poll={id:'draft',number:4,type:'NEXT_GAME',title:'Choose the game',contextQuestId:'multi',durationSeconds:120,options:[{gameId:'b'},{gameId:'a'}]};
  f.handlers.edit(poll);
  assert.equal(f.$('poll-quest').value,'multi');
  assert.deepEqual(Array.from(f.$('poll-options').querySelectorAll('select'), input=>input.value),['b','a']);
  f.$('poll-form').dispatchEvent(new f.w.Event('submit',{cancelable:true})); await tick();
  assert.equal(f.calls[0].route,'control/polls/draft/edit');
  assert.deepEqual(Array.from(f.calls[0].body.options, value=>value.gameId),['b','a']);
  assert.equal(f.calls[0].body.contextQuestId,'multi');
  f.handlers.clone(poll); f.$('poll-form').dispatchEvent(new f.w.Event('submit',{cancelable:true})); await tick();
  assert.equal(f.calls[1].route,'control/polls');
  f.change('poll-type','NEXT_QUEST');
  assert.equal(f.$('poll-quest-context').hidden,true);
  assert.equal(f.$('poll-quest').value,'');
  assert.deepEqual(Array.from(f.$('poll-options').querySelectorAll('select'), input=>input.value),['multi','single']);
  f.change('poll-type','NEXT_GAME');
  assert.equal(f.$('poll-quest').value,'');
  assert.deepEqual(Array.from(f.$('poll-options').querySelectorAll('select'), input=>input.value),['a','b']);
  f.state.quests[0].gameId='c'; f.state.event.revision++;f.state.event.controlRevision++;await f.refresh();
  f.change('poll-type','NEXT_QUEST');
  assert.ok(!Array.from(f.$('poll-options').querySelector('select').options, option=>option.value).includes('multi'),'selected disabled game must be changed before offering the quest');
});

test('editor enforces native Twitch limits and previews recognizable abbreviated linked labels', async t => {
  const f=await editor(t);
  assert.equal(f.$('poll-title').maxLength,60);
  assert.equal(f.$('poll-duration').min,'15');assert.equal(f.$('poll-duration').max,'1800');
  assert.match(f.$('poll-options').querySelector('[data-native-label]').textContent,/Twitch label: #1 /);
  const label=f.$('poll-options').querySelector('[data-native-label]').textContent.replace('Twitch label: ','');
  assert.ok(Array.from(label).length<=25);
  f.change('poll-type','CUSTOM');
  assert.ok(Array.from(f.$('poll-options').querySelectorAll('input')).every(input=>input.maxLength===25&&input.required));
  for(let i=0;i<8;i++) f.$('add-option').click();
  assert.equal(f.$('poll-options').children.length,5);
  assert.equal(f.$('add-option').disabled,true);
  f.change('poll-type','YES_NO');
  assert.equal(f.$('poll-options').children.length,2);
  assert.equal(f.$('add-option').hidden,true);
  assert.ok(Array.from(f.$('poll-options').querySelectorAll('input')).every(input=>input.readOnly));
});

test('public polls expose only Twitch voting links, preserve read-only history and never style provisional winners', t => {
  const dom=new JSDOM('<body><a id="vote-nav"></a><div id="poll-board"></div></body>',{runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window;w.Level38I18n={language:'en',t:tr};w.eval(script('common'));
  const poll={id:'native',number:2,title:'Keep going?',type:'YES_NO',status:'OPEN',source:'TWITCH',nativeStatus:'ACTIVE',resultsFinal:false,twitchUrl:'https://www.twitch.tv/leonifelheim',
    totalVotes:3,leadingOptionIds:['yes'],effectiveWinnerId:'yes',options:[{id:'yes',label:'Yes',votes:3},{id:'no',label:'No',votes:0}]};
  const legacy={...poll,id:'old',number:1,source:'WEB',status:'CLOSED',resultsFinal:true,effectiveWinnerId:'no'};
  w.Level38.renderPolls({polls:[poll,legacy]},{});
  assert.equal(w.document.querySelectorAll('[data-vote-id],button').length,0);
  assert.equal(w.document.querySelector('.l38-twitch-vote a').href,'https://www.twitch.tv/leonifelheim');
  assert.equal(w.document.querySelector('[data-poll-id="native"] .is-winner'),null);
  assert.match(w.document.querySelector('[data-poll-id="old"]').textContent,/Historical web poll/);
  w.Level38.renderPolls({polls:[legacy]}, {control:true});
  assert.equal(w.document.querySelectorAll('button,select,input').length,0,'historical records have no mutating controls');
});

test('uncertain Twitch draft offers safe cancellation and prevents edit or duplicate starts', t => {
  const dom=new JSDOM('<body><div id="poll-board"></div></body>',{runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window;w.Level38I18n={language:'en',t:tr};w.eval(script('common'));
  const actions=[];
  const poll={id:'pending',number:1,title:'Waiting for Twitch',type:'CUSTOM',status:'DRAFT',source:'TWITCH',nativeStatus:'CREATING',resultsFinal:false,totalVotes:0,leadingOptionIds:[],options:[]};
  for(const status of ['CREATING','PREPARING','CANCELLING','CLOSING']) {
    poll.nativeStatus=status;
    w.Level38.renderPolls({polls:[poll]}, {control:true,edit(){},clone(){},status(id,action){actions.push([id,action]);}});
    assert.equal(w.document.querySelector('[data-poll-action="open"]').disabled,true);
    assert.equal(Array.from(w.document.querySelectorAll('button')).find(button=>button.textContent==='Edit draft').disabled,true);
  }
  w.document.querySelector('[data-poll-action="cancel"]').click();
  assert.deepEqual(actions,[['pending','cancel']]);
});

test('OBS poll overlay supports all four types, native countdown expiry waits for definitive result, ties and zero votes remain winnerless', t => {
  const dom=new JSDOM(html('poll-overlay'),{url:'http://localhost/level38/overlay/poll',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window, events={};let clock=0;
  w.Level38Translations=require('../public/js/level38/translations');
  Object.defineProperty(w.performance,'now',{value:()=>clock});w.setInterval=()=>1;
  w.io=()=>({on(name,handler){events[name]=handler;},disconnect(){}});w.eval(script('overlays'));
  const state=data();state.serverTime=100000;
  const poll={id:'p',number:1,title:'Native poll',type:'NEXT_GAME',source:'TWITCH',status:'OPEN',endsAt:new Date(115000).toISOString(),resultsFinal:false,
    twitchUrl:'https://www.twitch.tv/leonifelheim',totalVotes:8,leadingOptionIds:['first'],effectiveWinnerId:null,
    options:[{id:'first',label:'First',votes:7},{id:'second',label:'Second',votes:1}]};state.polls=[poll];
  for(const type of ['NEXT_QUEST','NEXT_GAME','YES_NO','CUSTOM']) {
    poll.type=type;state.event.revision++;events['level38:state'](state);
    assert.equal(w.document.getElementById('poll-overlay').hidden,false,type);
    assert.equal(w.document.querySelectorAll('.obs-option').length,2,type);
  }
  clock=16000;state.event.revision++;events['level38:state']({...state,serverTime:116000});
  assert.equal(w.document.getElementById('poll-countdown').textContent,'00:00');
  assert.match(w.document.getElementById('poll-cta').textContent,/Waiting for final/);
  assert.equal(w.document.getElementById('poll-result').hidden,true);
  poll.status='CLOSED';poll.effectiveWinnerId='first';poll.closedAt=new Date(116000).toISOString();poll.winnerAcceptedAt=poll.closedAt;
  state.event.revision++;events['level38:state']({...state,serverTime:116000});
  assert.equal(w.document.getElementById('poll-overlay').hidden,true,'nonfinal closed payload cannot announce a winner');
  poll.resultsFinal=true;state.event.revision++;events['level38:state']({...state,serverTime:116000});
  assert.equal(w.document.getElementById('poll-overlay').dataset.overlayMode,'winner');
  assert.equal(w.document.getElementById('poll-winner').textContent,'First');
  for(const votes of [0,4]) {
    poll.effectiveWinnerId=null;poll.totalVotes=votes;poll.winnerAcceptedAt=null;state.event.revision++;events['level38:state']({...state,serverTime:116000});
    assert.equal(w.document.getElementById('poll-overlay').dataset.overlayMode,'result');
    assert.equal(w.document.getElementById('poll-winner').textContent,votes?'Tie':'No votes');
    assert.doesNotMatch(w.document.getElementById('poll-winner-label').textContent,/WINNER/);
  }
});
