const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const {translate, questText} = require('../public/js/level38/translations');

function browser(t, control = false, lang = 'en') {
  const dom = new JSDOM(`<body class="${control ? 'l38-control' : 'l38-public'}"><span id="progress-text"></span><progress id="progress"></progress><span id="current-game"></span><span id="secret-count"></span><div id="progress-segments"></div><span id="journey-label"></span><span id="progress-remaining"></span><span id="active-count"></span><div id="active-board"></div><span id="journal-count"></span><select id="quest-game"><option value="all">All</option></select><select id="quest-status"><option value="all">All</option><option value="SECRET">Secret</option></select><input id="quest-search"><div id="quest-board"></div><span id="quest-filter-status"></span><div id="secret-placeholder"><strong></strong></div><span id="control-active-count"></span></body>`, {runScripts:'outside-only'});
  t.after(() => dom.window.close());
  dom.window.Level38I18n = {language:lang, t:(key, params) => translate(lang, key, params), questText:(quest, field) => questText(quest, field, lang)};
  dom.window.eval(fs.readFileSync('public/js/level38/common.js', 'utf8'));
  return dom.window;
}
function state() {
  return {event:{target:38, completed:0, currentGameId:'game2'}, secretCount:6,
    games:[{id:'game1',title:'First RPG',enabled:true},{id:'game2',title:'Second RPG',enabled:true},{id:'other',title:'Unrelated RPG',enabled:true}],
    quests:Array.from({length:60}, (_, i) => ({id:`quest${i+1}`, number:i+1, category:i<20?'MULTI_GAME':i<48?'GAME_SPECIFIC':i<54?'COOPERATIVE':'SECRET', status:i<54?'AVAILABLE':'SECRET', hidden:i>=54, gameId:'game1', eligibleGameIds:['game1','game2'], translations:{en:{title:i<54?`Quest ${i+1}`:'PRIVATE SECRET TITLE',description:i<54?'English objective':'PRIVATE SECRET RULES'},es:{title:i<54?`Misión ${i+1}`:'TÍTULO SECRETO PRIVADO',description:i<54?'Objetivo español':'REGLAS SECRETAS PRIVADAS'}}}))};
}

test('public journal shows 60 numbered cards, localized categories, mystery cards and eligibility filtering', t => {
  const w = browser(t), data = state();
  w.Level38.renderState(data);
  const cards = w.document.querySelectorAll('#quest-board .l38-card');
  assert.equal(cards.length, 60);
  assert.equal(cards[0].querySelector('.l38-quest-number').textContent, 'QUEST 01');
  assert.equal(cards[59].querySelector('.l38-quest-number').textContent, 'QUEST 60');
  assert.equal(cards[0].querySelector('.l38-quest-category').textContent, 'Multi-game');
  assert.equal(w.document.querySelectorAll('[data-category="COOPERATIVE"]').length, 6);
  for (const card of Array.from(cards).slice(54)) {
    assert.equal(card.querySelector('h3').textContent, '???');
    assert.equal(card.querySelector('.l38-meta'), null);
    assert.doesNotMatch(card.textContent, /PRIVATE|RPG/);
  }
  w.document.getElementById('quest-game').value = 'game2';
  w.document.getElementById('quest-game').dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelectorAll('#quest-board .l38-card').length, 54, 'eligible games match even when a different game is selected');
  w.document.getElementById('quest-game').value = 'all';
  w.document.getElementById('quest-status').value = 'SECRET';
  w.document.getElementById('quest-status').dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelectorAll('#quest-board .l38-card').length, 6);
  w.document.getElementById('quest-search').value = 'PRIVATE';
  w.document.getElementById('quest-search').dispatchEvent(new w.Event('input'));
  assert.equal(w.document.querySelectorAll('#quest-board .l38-card').length, 0, 'hidden content is not searchable');
});

test('operator cards preserve secret visibility and separate manual game selection from editable eligibility', t => {
  const w = browser(t, true, 'es'), data = state(), selected = [], edited = [];
  w.Level38.renderState(data, () => {}, {selectGame:(quest, gameId) => selected.push([quest.id,gameId]),eligibility:(quest, gameIds) => edited.push([quest.id,Array.from(gameIds)])});
  assert.match(w.document.getElementById('quest-board').textContent, /TÍTULO SECRETO PRIVADO/);
  const card = w.document.querySelector('[data-quest-number="1"]');
  assert.equal(card.querySelector('.l38-quest-category').textContent, 'Varios juegos');
  const select = card.querySelector('.l38-quest-game-form select');
  assert.deepEqual(Array.from(select.options, option => option.value), ['game1','game2']);
  select.value = 'game2';
  card.querySelector('.l38-quest-game-form').dispatchEvent(new w.Event('submit', {cancelable:true}));
  assert.deepEqual(selected, [['quest1','game2']]);
  card.querySelector('.l38-eligibility-editor input[value="other"]').checked = true;
  card.querySelector('.l38-eligibility-editor form').dispatchEvent(new w.Event('submit', {cancelable:true}));
  assert.deepEqual(edited, [['quest1',['game1','game2','other']]]);
  data.quests[0].status = 'COMPLETED';
  w.Level38.renderState(data, () => {}, {selectGame(){},eligibility(){}});
  assert.equal(w.document.querySelector('[data-quest-number="1"] .l38-quest-game-form'), null, 'completed game history is not edited');
});
