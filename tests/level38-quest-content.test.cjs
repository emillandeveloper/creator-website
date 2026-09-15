const {test}=require('node:test');
const assert=require('node:assert/strict');
const {QUEST_CONTENT,validateQuestContent,questTextData,warnMissingQuestTranslations}=require('../dist/modules/level38/quest-content');
const {questText}=require('../public/js/level38/translations');

test('complete curated dataset validates all 54 starters, including both titles and descriptions',()=>{
  assert.equal(QUEST_CONTENT.length,54);validateQuestContent(QUEST_CONTENT);
  for(const quest of QUEST_CONTENT){
    const data=questTextData(quest);
    const dto={translations:{en:{title:data.title,description:data.description},es:{title:data.titleEs,description:data.descriptionEs}}};
    for(const field of ['title','description'])for(const lang of ['en','es'])assert.equal(questText(dto,field,lang),quest[field][lang]);
  }
  for(const field of ['title','description'])for(const lang of ['en','es']){
    const invalid=structuredClone(QUEST_CONTENT);invalid[53][field][lang]=' ';
    assert.throws(()=>validateQuestContent(invalid),new RegExp(`${field}.${lang}`));
  }
  const duplicate=structuredClone(QUEST_CONTENT);duplicate[1].key=duplicate[0].key;assert.throws(()=>validateQuestContent(duplicate),/duplicate/);
  const paragraphs=structuredClone(QUEST_CONTENT);paragraphs[0].description.es='Primer objetivo.\n\nObjetivo opcional.';validateQuestContent(paragraphs);
});

test('missing legacy translations produce bounded development diagnostics without exposing prose',t=>{
  const oldEnv=process.env.NODE_ENV;process.env.NODE_ENV='test';t.after(()=>{if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;});
  const warning=t.mock.method(console,'warn',()=>{});
  const quest={id:'diagnostic-quest',title:'Secret prose',description:'Secret prose',titleEs:null,descriptionEs:null};
  warnMissingQuestTranslations(quest);warnMissingQuestTranslations(quest);
  assert.equal(warning.mock.callCount(),1);assert.match(warning.mock.calls[0].arguments[0],/titleEs, descriptionEs/);assert.doesNotMatch(warning.mock.calls[0].arguments[0],/Secret prose/);
  assert.equal(questText({translations:{es:{title:' '},en:{title:'Fallback'}}},'title','es'),'Fallback');
});
