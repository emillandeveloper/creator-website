const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const translations = require('../public/js/level38/translations');

const script = name => fs.readFileSync(`public/js/level38/${name}.js`, 'utf8');
function page(t, view, lang = 'en') {
  const filename = path.resolve(`src/views/level38/${view}.ejs`);
  const html = ejs.render(fs.readFileSync(filename, 'utf8'), {lang, overlayLang:lang,
    t:(key, params) => translations.translate(lang, key, params), operator:{name:'Owner', role:'OWNER'}, classNames:{}}, {filename});
  const dom = new JSDOM(html, {url:'http://localhost/level38/control', runScripts:'outside-only'});
  t.after(() => dom.window.close());
  dom.window.Level38I18n = {language:lang, t:(key, params) => translations.translate(lang, key, params)};
  return dom.window;
}
function poll() {
  return {id:'poll', number:1, title:'Keep going?', type:'YES_NO', status:'OPEN', source:'TWITCH', nativeStatus:'ACTIVE', resultsFinal:false,
    openedAt:'2026-10-22T10:00:00.000Z', endsAt:'2026-10-22T10:01:00.000Z', twitchUrl:'https://www.twitch.tv/leonifelheim',
    totalVotes:0, leadingOptionIds:[], effectiveWinnerId:null, options:[{id:'yes',label:'Yes',votes:0},{id:'no',label:'No',votes:0}]};
}

test('public and control cards update open tallies, visible percentages and bars without rebuilding cards or declaring provisional winners', t => {
  for (const control of [false, true]) {
    const dom = new JSDOM('<body><div id="poll-board"></div></body>', {runScripts:'outside-only'}); t.after(() => dom.window.close());
    const w = dom.window; w.Level38I18n = {language:'en', t:(key, params) => translations.translate('en', key, params)}; w.eval(script('common'));
    const p = poll(), state = {polls:[p]};
    const handlers = control ? {control:true, clone(){}, status(){}} : {};
    w.Level38.renderPolls(state, handlers);
    const card = w.document.querySelector('[data-poll-id]');
    p.totalVotes = 1; p.options[0].votes = 1; p.leadingOptionIds = ['yes'];
    w.Level38.renderPolls(state, handlers);
    assert.equal(w.document.querySelector('[data-poll-id]'), card, 'live count updates preserve the card and operator inputs');
    assert.equal(card.querySelector('[data-total]').textContent, '1 vote');
    assert.match(card.querySelector('[data-option-id="yes"]').textContent, /Yes.*1/);
    assert.equal(card.querySelector('[data-percent="yes"]').textContent, '100%');
    assert.equal(card.querySelector('[data-choice-id="yes"]').style.getPropertyValue('--vote-percent'), '100%');
    assert.equal(card.querySelector('.is-winner,.l38-result'), null);
    p.totalVotes = 4; p.options[1].votes = 3;
    w.Level38.renderPolls(state, handlers);
    assert.equal(card.querySelector('[data-total]').textContent, '4 votes');
    assert.equal(card.querySelector('[data-percent="yes"]').textContent, '25%');
    assert.equal(card.querySelector('[data-percent="no"]').textContent, '75%');
    assert.equal(card.querySelector('[data-choice-id="no"]').style.getPropertyValue('--vote-percent'), '75%');
    p.effectiveWinnerId = 'no'; w.Level38.renderPolls(state, handlers);
    assert.equal(w.document.querySelector('.is-winner,.l38-result'), null, 'even a premature winner field cannot announce a native winner');
  }
});

test('OBS shows live external votes and percentages with a running countdown before the definitive result', t => {
  const w = page(t, 'poll-overlay'), events = {};
  w.Level38Translations = translations; w.setInterval = () => 1;
  w.io = () => ({on(name, handler) {events[name] = handler;}, disconnect(){}});
  w.eval(script('overlays'));
  const p = poll(), state = {event:{revision:1}, serverTime:Date.parse(p.openedAt), quests:[], polls:[p], games:[]};
  events['level38:state'](state);
  p.totalVotes = 1; p.options[0].votes = 1; state.event.revision++;
  events['level38:state']({...state, serverTime:Date.parse(p.openedAt) + 10000});
  assert.equal(w.document.getElementById('poll-overlay').dataset.overlayMode, 'open');
  assert.equal(w.document.getElementById('poll-total').textContent, '1 vote');
  assert.equal(w.document.getElementById('poll-countdown').textContent, '00:50');
  assert.deepEqual(Array.from(w.document.querySelectorAll('.obs-option-votes'), node => node.textContent), ['1','0']);
  assert.deepEqual(Array.from(w.document.querySelectorAll('.obs-option-percent'), node => node.textContent), ['100%','0%']);
  p.totalVotes = 4; p.options[1].votes = 3; state.event.revision++;
  events['level38:state']({...state, serverTime:Date.parse(p.openedAt) + 15000});
  assert.deepEqual(Array.from(w.document.querySelectorAll('.obs-option-percent'), node => node.textContent), ['25%','75%']);
  assert.equal(w.document.querySelector('[data-option-id="no"]').style.getPropertyValue('--vote-percent'), '75%');
  assert.equal(w.document.getElementById('poll-result').hidden, true);
});

test('control refresh updates poll creation availability without requiring an event revision or losing unsaved draft text', async t => {
  const w = page(t, 'control'); w.setInterval = () => 1; w.eval(script('common'));
  const p = {...poll(),status:'DRAFT',nativeStatus:null};
  const state = {event:{revision:1,controlRevision:1},serverTime:Date.now(),games:[],quests:[],polls:[p],audit:[],undo:{available:false},twitch:{polls:{available:false}}};
  let refresh;
  Object.assign(w.Level38, {renderState(){}, async request(){return structuredClone(state);}, connect(update, reconnect){refresh = reconnect; return {};}});
  w.eval(script('control')); await new Promise(resolve => setImmediate(resolve));
  assert.equal(w.document.querySelector('[data-poll-action="open"]').disabled, true);
  w.document.getElementById('poll-title').value = 'Keep this unsaved question';
  state.twitch.polls.available = true;
  await refresh();
  assert.equal(w.document.querySelector('[data-poll-action="open"]').disabled, false);
  assert.equal(w.document.getElementById('poll-title').value, 'Keep this unsaved question');
});

test('control diagnostics separate broadcaster authorization, app authorization, each poll subscription and working or degraded backup', t => {
  const w = page(t, 'control'); w.eval(script('common')); w.eval(script('twitch-control'));
  const at = '2026-10-22T10:00:10.000Z';
  const state = {event:{controlRevision:1}, games:[], polls:[poll()], twitch:{enabled:true, available:true, connection:'Error', subscriptionStatus:'enabled',
    error:'App authorization failed.', appAuth:{status:'error', httpStatus:403},
    eventSub:{available:false, error:null, subscriptions:[]},
    polls:{available:true, scopesValid:true, error:null, backup:{status:'healthy', intervalSeconds:5, activePollId:'poll', lastSuccessAt:at}, live:{source:'helix', lastUpdateAt:at}}}};
  const text = id => w.document.getElementById(id).textContent;
  w.Level38Twitch.render(state, () => {});
  assert.match(text('twitch-polls-status'), /Broadcaster authorization verified/);
  assert.doesNotMatch(text('twitch-polls-status'), /ready|live/i);
  assert.match(text('twitch-app-auth'), /HTTP 403/);
  assert.equal(w.document.querySelectorAll('#twitch-poll-subscriptions li').length, 3);
  for (const type of ['begin','progress','end']) assert.match(text('twitch-poll-subscriptions'), new RegExp(`channel\\.poll\\.${type}: Unknown`));
  assert.match(text('twitch-poll-live'), /Backup mode/);
  assert.match(text('twitch-poll-backup'), /working every 5 seconds/);
  assert.equal(text('twitch-subscription'), 'enabled', 'an enabled category subscription must not imply healthy poll subscriptions');
  state.twitch.polls.backup.status = 'retrying'; state.twitch.polls.backup.error = 'Temporary upstream error.';
  w.Level38Twitch.render(state, () => {});
  assert.match(text('twitch-poll-live'), /degraded/); assert.match(text('twitch-poll-backup'), /retrying.*Temporary upstream error/);
  state.twitch.appAuth.status = 'ready'; state.twitch.eventSub.available = true;
  state.twitch.eventSub.subscriptions = ['begin','progress','end'].map(type => ({type:`channel.poll.${type}`, status:'enabled', lastReceiptAt:at}));
  state.twitch.polls.live.source = 'eventsub'; state.twitch.polls.backup.status = 'healthy'; state.twitch.polls.backup.error = null;
  w.Level38Twitch.render(state, () => {});
  assert.equal(text('twitch-app-auth'), 'App authorization verified.');
  assert.match(text('twitch-poll-live'), /Live results received through EventSub/);
});

test('new live diagnostics and backup status have Spanish operator messages', t => {
  const w = page(t, 'control', 'es'); w.eval(script('common')); w.eval(script('twitch-control'));
  w.Level38Twitch.render({event:{controlRevision:1},games:[],polls:[poll()],twitch:{enabled:true,subscriptionStatus:'unknown',appAuth:{status:'error',httpStatus:403},eventSub:{available:false},
    polls:{available:true,backup:{status:'healthy',intervalSeconds:5,activePollId:'poll'},live:{source:'helix'}}}}, () => {});
  assert.match(w.document.getElementById('twitch-polls-status').textContent, /Autorización del broadcaster verificada/);
  assert.match(w.document.getElementById('twitch-app-auth').textContent, /aplicación \(HTTP 403\)/);
  assert.match(w.document.getElementById('twitch-poll-live').textContent, /Modo de respaldo/);
  assert.match(w.document.getElementById('twitch-poll-backup').textContent, /funciona cada 5 segundos/);
});
