const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { catalogs, translate, questText, language } = require('../public/js/level38/translations');
const { CLASS_CATALOG, publicClass } = require('../dist/modules/level38/classes');

test('language defaults respect browser Spanish, other languages, operator Spanish and explicit preference', () => {
  assert.equal(language(undefined, 'es-ES'), 'es');
  assert.equal(language(undefined, 'es-MX'), 'es');
  assert.equal(language(undefined, 'fr-FR'), 'en');
  assert.equal(language(undefined, 'en-US', true), 'es');
  assert.equal(language('en', 'es-ES', true), 'en');
  assert.equal(language('fr', 'es-ES'), 'es');
});

test('quest translation uses requested language, other language, legacy fields and a nonblank final fallback', () => {
  const quest = { title: 'Legacy title', description: 'Legacy prose', translations: { en: { title: 'English title', description: 'English prose' }, es: { title: 'Título español', description: 'Descripción en español' } } };
  assert.equal(questText(quest, 'title', 'es'), 'Título español');
  assert.equal(questText(quest, 'description', 'en'), 'English prose');
  quest.translations.es.title = '   ';
  assert.equal(questText(quest, 'title', 'es'), 'English title');
  quest.translations.en.description = null;
  assert.equal(questText(quest, 'description', 'en'), 'Descripción en español');
  assert.equal(questText({ title: 'Older quest' }, 'title', 'es'), 'Older quest');
  assert.equal(questText({}, 'description', 'es'), 'Aún no hay descripción.');
});

test('catalogs have matching keys, complete placeholders, valid accents and localized errors/domain states', () => {
  assert.deepEqual(Object.keys(catalogs.en).sort(), Object.keys(catalogs.es).sort());
  for (const key of Object.keys(catalogs.en)) {
    assert.ok(catalogs.es[key].trim(), key);
    const placeholders = text => (text.match(/\{\w+\}/g) || []).sort();
    assert.deepEqual(placeholders(catalogs.en[key]), placeholders(catalogs.es[key]), key);
    assert.doesNotMatch(catalogs.es[key], /[a-záéíóúñ]\?[a-záéíóúñ]|\uFFFD/i, key);
  }
  assert.equal(translate('es', 'ACTIVE'), 'Activa');
  assert.equal(translate('en', 'ACTIVE'), 'Active');
  assert.equal(translate('es', '{count} ACTIVE', {count:1}), '1 ACTIVA');
  assert.equal(translate('es', '{count} ACTIVE', {count:2}), '2 ACTIVAS');
  assert.equal(translate('es', 'Cannot complete a locked quest.'), 'No se puede completar una misión en estado bloqueada.');
  assert.match(translate('es', 'Option must be 2–100 characters without control characters or angle brackets.'), /^Opción debe tener/);
});

test('structured audit and quest poll labels use the client language without translating custom choices', t => {
  const dom = new JSDOM('<body></body>', {runScripts:'outside-only'}); t.after(()=>dom.window.close());
  const {window} = dom;
  window.Level38I18n = {language:'es',t:(key,params)=>translate('es',key,params),questText:(quest,field)=>questText(quest,field,'es')};
  window.eval(fs.readFileSync('public/js/level38/common.js','utf8'));
  const option = {id:'choice',label:'English quest',translations:{en:{title:'English quest'},es:{title:'Misión en español'}}};
  const poll = {id:'poll',type:'NEXT_QUEST',options:[option]};
  assert.equal(window.Level38.optionLabel(poll,option),'Misión en español');
  assert.equal(window.Level38.optionLabel({type:'CUSTOM'},{label:'Yes'}),'Yes');
  assert.match(window.Level38.auditDescription({action:'poll:winner',entityId:'poll',before:{},after:{number:3,winnerLabel:'English quest'},metadata:{}},{polls:[poll],quests:[]}),/Misión en español/);
});

test('browser selector changes static text and persists preference without network, reload or identity-cookie changes', (t) => {
  const dom = new JSDOM('<body class="l38-public"><button data-language="es">ES</button><button data-language="en">EN</button><h2 data-i18n="The quest journal"></h2></body>', { url: 'https://level38.test/level38', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom;
  Object.defineProperty(window.navigator, 'language', { value: 'es-ES' });
  window.document.cookie = 'viewer=unchanged; Path=/';
  window.fetch = () => { throw new Error('Language switching must not request state/session'); };
  for (const file of ['translations','locale']) window.eval(fs.readFileSync(`public/js/level38/${file}.js`, 'utf8'));
  assert.equal(window.document.documentElement.lang, 'es');
  assert.equal(window.Level38I18n.className(publicClass('retired', 'old')), 'Aventurero');
  assert.equal(window.Level38I18n.className(publicClass('black-mage', 'missing')), 'Mago negro');
  window.document.querySelector('[data-language="en"]').click();
  assert.equal(window.document.querySelector('h2').textContent, 'The quest journal');
  assert.equal(window.localStorage.getItem('level38:language'), 'en');
  assert.match(window.document.cookie, /viewer=unchanged/);
  window.eval(fs.readFileSync('public/js/level38/locale.js','utf8'));
  assert.equal(window.Level38I18n.language, 'en');
  assert.equal(window.Level38I18n.className(publicClass('retired', 'old')), 'Adventurer');
});

test('class catalog centralizes both display names without changing stable IDs or public class contract', () => {
  assert.equal(CLASS_CATALOG.find(job => job.id === 'thief').displayNames.es, 'Ladrón');
  assert.equal(CLASS_CATALOG.find(job => job.id === 'samurai').displayNames.es, 'Samurái');
  for (const job of CLASS_CATALOG) {
    assert.ok(job.displayNames.en && job.displayNames.es);
    assert.equal(publicClass(job.id).id, job.id);
    assert.equal(publicClass(job.id).displayName, job.displayNames.en);
  }
});

test('template translation markers all exist in the centralized catalog', () => {
  for (const file of ['index','control','unavailable','language']) {
    const content = fs.readFileSync(`src/views/level38/${file}.ejs`, 'utf8');
    for (const [, value] of content.matchAll(/data-i18n(?:-(?:aria-label|placeholder|alt|content))?="([^"<>]+)"/g)) {
      const key = value.replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
      assert.ok(catalogs.en[key] && catalogs.es[key], `${file}: ${key}`);
    }
  }
});
