const {test}=require('node:test');
const assert=require('node:assert/strict');
const {QUEST_CONTENT,GAME_CONTENT,validateQuestContent,validateGameContent,questTextData,warnMissingQuestTranslations}=require('../dist/modules/level38/quest-content');
const {questText}=require('../public/js/level38/translations');
const legacy=require('../src/modules/level38/legacy-quest-content.json');

// Approved title pairs are deliberately independent of the runtime catalog.
const APPROVED_TITLES=[
  {
    "en": "Back to the Stone Age",
    "es": "Vuelta a la Edad de Piedra"
  },
  {
    "en": "No Safety Net",
    "es": "Sin red de seguridad"
  },
  {
    "en": "The Wrong Hero",
    "es": "El héroe equivocado"
  },
  {
    "en": "Job Roulette",
    "es": "Cambio de profesión"
  },
  {
    "en": "The Last Word",
    "es": "La última palabra"
  },
  {
    "en": "Champions for a Day",
    "es": "Campeones por un día"
  },
  {
    "en": "The Labyrinth",
    "es": "El laberinto"
  },
  {
    "en": "Legend Hunter",
    "es": "Cazador de leyendas"
  },
  {
    "en": "Sticky Fingers",
    "es": "Manos largas"
  },
  {
    "en": "Gotta Catch 'Em All!",
    "es": "¡Hazte con todos!"
  },
  {
    "en": "Let's Get to Work",
    "es": "Manos a la obra"
  },
  {
    "en": "Treasure Hunter",
    "es": "Cazatesoros"
  },
  {
    "en": "Side Effects",
    "es": "Efectos secundarios"
  },
  {
    "en": "Where It Hurts Most",
    "es": "Donde más duele"
  },
  {
    "en": "Learning the Hard Way",
    "es": "Se aprende a golpes"
  },
  {
    "en": "Strength in Numbers",
    "es": "La unión hace la fuerza"
  },
  {
    "en": "Hero for Hire",
    "es": "Héroe por encargo"
  },
  {
    "en": "Money Talks",
    "es": "Poderoso caballero es Don Dinero"
  },
  {
    "en": "An Eye for an Eye",
    "es": "Ojo por ojo"
  },
  {
    "en": "For Our Lord RNGsus",
    "es": "Por nuestro señor RNGsuscristo"
  },
  {
    "en": "We Live in a MATERIAl World",
    "es": "Vivimos en un mundo MATERIAl"
  },
  {
    "en": "I Can Be a Gym Leader Too!",
    "es": "¡Yo también puedo ser líder de gimnasio!"
  },
  {
    "en": "Do Not Throw",
    "es": "No lanzar"
  },
  {
    "en": "RNG or RGB?",
    "es": "¿RNG o RGB?"
  },
  {
    "en": "The Mushroom Whisperer",
    "es": "El encantador de champiñones"
  },
  {
    "en": "Everyone Has Their Own Way",
    "es": "Cada uno a su manera"
  },
  {
    "en": "Heart of the Cards",
    "es": "El corazón de las cartas"
  },
  {
    "en": "Ivalice Zoo",
    "es": "El zoo de Ivalice"
  },
  {
    "en": "Netherworld Express",
    "es": "Servicio de mensajería infernal"
  },
  {
    "en": "The Hero Is on Holiday",
    "es": "El héroe está de vacaciones"
  },
  {
    "en": "That's Not a Weapon!",
    "es": "¡Eso no es un arma!"
  },
  {
    "en": "He Doesn't Deserve Your Charity",
    "es": "No se merece tu caridad"
  },
  {
    "en": "Kermit's Revenge",
    "es": "La rana Gustavo"
  },
  {
    "en": "Human Lightning Rod",
    "es": "Pararrayos humano"
  },
  {
    "en": "Explosive Chemistry",
    "es": "Química explosiva"
  },
  {
    "en": "Pass the Baton!",
    "es": "¡Pasa la patata!"
  },
  {
    "en": "It's in the Genes!",
    "es": "¡Está en los genes!"
  },
  {
    "en": "Saving Grunty",
    "es": "Rescatando a Grunty"
  },
  {
    "en": "Clash of Eras",
    "es": "Choque de épocas"
  },
  {
    "en": "Bag That Pig!",
    "es": "¡Al saco, cerdo!"
  },
  {
    "en": "A Piece of Art!",
    "es": "¡Una obra de arte!"
  },
  {
    "en": "Vote for Me!",
    "es": "¡Vótame a mí!"
  },
  {
    "en": "Play It Again, Cloud!",
    "es": "¡Toca otra, Cloud!"
  },
  {
    "en": "Look, Mom, No Hands!",
    "es": "Mira mamá, ¡sin manos!"
  },
  {
    "en": "SOLDIER of the Month",
    "es": "SOLDADO del mes"
  },
  {
    "en": "Two for One!",
    "es": "¡Dos por uno!"
  },
  {
    "en": "An Ace Up Your Sleeve",
    "es": "Un as bajo la manga"
  },
  {
    "en": "Small but Mighty",
    "es": "Pequeños pero matones"
  },
  {
    "en": "Dynamic Duo",
    "es": "Dúo dinámico"
  },
  {
    "en": "You Bring the Fuel!",
    "es": "¡Tú pon la gasolina!"
  },
  {
    "en": "I Didn't Come Alone!",
    "es": "¡No venía solo!"
  },
  {
    "en": "I've Got Your Back!",
    "es": "¡Yo te cubro!"
  },
  {
    "en": "You Pick, I Suffer",
    "es": "Tú eliges, yo sufro"
  },
  {
    "en": "Magic and Muscle",
    "es": "Magia y músculo"
  },
  {
    "en": "The Cure Is Worse Than the Disease",
    "es": "La cura es peor que la enfermedad"
  },
  {
    "en": "The Enemy of My Enemy",
    "es": "El enemigo de mi enemigo"
  },
  {
    "en": "38 Hits for 38 Years",
    "es": "38 golpes para 38 años"
  },
  {
    "en": "Three Generations of Heroes",
    "es": "Tres generaciones de héroes"
  },
  {
    "en": "Last One Standing",
    "es": "El último en pie"
  },
  {
    "en": "Does This Still Work?",
    "es": "¿Esto todavía sirve?"
  }
];

test('final catalog has exactly 60 stable identities, canonical numbers and approved ES/EN titles',()=>{
  assert.equal(QUEST_CONTENT.length,60);validateQuestContent(QUEST_CONTENT);
  assert.deepEqual(QUEST_CONTENT.map(q=>q.number),Array.from({length:60},(_,i)=>i+1));
  assert.equal(new Set(QUEST_CONTENT.map(q=>q.key)).size,60);
  assert.deepEqual(QUEST_CONTENT.map(q=>q.title),APPROVED_TITLES);
  assert.deepEqual(QUEST_CONTENT.reduce((counts,q)=>(counts[q.category]=(counts[q.category]||0)+1,counts),{}),{
    MULTI_GAME:20,GAME_SPECIFIC:28,COOPERATIVE:6,SECRET:6
  });
  assert.deepEqual(QUEST_CONTENT.filter(q=>q.isSecret).map(q=>q.number),[55,56,57,58,59,60]);
  for(const quest of QUEST_CONTENT){
    assert.match(quest.key,new RegExp('^q'+String(quest.number).padStart(2,'0')+'-[a-z0-9-]+$'));
    const data=questTextData(quest);
    const dto={translations:{en:{title:data.title,description:data.description},es:{title:data.titleEs,description:data.descriptionEs}}};
    for(const field of ['title','description'])for(const lang of ['en','es']){
      assert.ok(quest[field][lang].trim());
      assert.equal(questText(dto,field,lang),quest[field][lang]);
    }
  }
});

test('content validation rejects damaged identity, language, category, privacy and game associations',()=>{
  assert.throws(()=>validateQuestContent(QUEST_CONTENT.slice(0,59)),/exactly 60/);
  for(const field of ['title','description'])for(const lang of ['en','es']){
    const invalid=structuredClone(QUEST_CONTENT);invalid[59][field][lang]=' ';
    assert.throws(()=>validateQuestContent(invalid),new RegExp(field+'.'+lang));
  }
  const mutations=[
    [q=>{q[1].key=q[0].key;},/duplicate/],
    [q=>{q[1].number=q[0].number;},/duplicate/],
    [q=>{q[0].key='legacy-opening-encounter';},/identity/],
    [q=>{q[0].category='SECRET';},/category/],
    [q=>{q[54].isSecret=false;},/secret/],
    [q=>{q[0].eligibleGameSlugs=['ff5'];},/eligible/],
    [q=>{q[0].eligibleGameSlugs.push(q[0].eligibleGameSlugs[0]);},/eligible/],
    [q=>{q[0].gameSlug='tombi';},/eligible/],
    [q=>{q[0].eligibleGameSlugs.push('unverified-nonexistent-game');},/eligible/],
    [q=>{q[20].eligibleGameSlugs.push('ff9');},/eligible/]
  ];
  for(const [mutate,pattern] of mutations){const data=structuredClone(QUEST_CONTENT);mutate(data);assert.throws(()=>validateQuestContent(data),pattern);}
  const paragraphs=structuredClone(QUEST_CONTENT);paragraphs[0].description.es='Primer objetivo.\n\nObjetivo opcional.';validateQuestContent(paragraphs);
});

test('mechanic-specific game candidates and editions are explicit and never imply save readiness',()=>{
  validateGameContent(GAME_CONTENT);
  const slugs=new Set(GAME_CONTENT.map(g=>g.slug));
  assert.equal(slugs.size,GAME_CONTENT.length);
  for(const quest of QUEST_CONTENT){
    assert.ok(quest.eligibleGameSlugs.includes(quest.gameSlug));
    assert.equal(new Set(quest.eligibleGameSlugs).size,quest.eligibleGameSlugs.length);
    for(const slug of quest.eligibleGameSlugs)assert.ok(slugs.has(slug));
    if(quest.category==='MULTI_GAME')assert.ok(quest.eligibleGameSlugs.length>=2);
  }
  assert.ok(slugs.has('pokemon-hgss'));assert.equal(QUEST_CONTENT[39].gameSlug,'tombi');
  assert.equal(QUEST_CONTENT[38].gameSlug,'chrono-trigger');
  assert.notEqual(QUEST_CONTENT[20].gameSlug,QUEST_CONTENT[42].gameSlug);
  assert.deepEqual(QUEST_CONTENT.slice(51,54).map(q=>q.gameSlug),['ff4-classic-coop','ff5-classic-coop','ff6-classic-coop']);
  assert.equal(QUEST_CONTENT[45].gameSlug,'ff4');
  assert.equal(QUEST_CONTENT[34].gameSlug,'ff5');
  assert.equal(QUEST_CONTENT[25].gameSlug,'ff6');
  const forbidden=/octopath|final fantasy xiii|ff13|ffxiii|sea of stars|sea-of-stars|castle crashers|kitaria|sacred 3|swords of ditto/i;
  for(const game of GAME_CONTENT){
    assert.doesNotMatch(game.slug+' '+game.title,forbidden);
    for(const locale of ['en','es'])assert.match(game.technicalNotes[locale],/NOT CHECKED/);
    assert.ok(QUEST_CONTENT.some(q=>q.eligibleGameSlugs.includes(game.slug)));
  }
  assert.deepEqual(QUEST_CONTENT[6].eligibleGameSlugs,['disgaea7','phantom-brave','hack-gu-last-recode']);
  assert.deepEqual(QUEST_CONTENT[9].eligibleGameSlugs,['pokemon-hgss','monster-hunter-stories2','world-of-final-fantasy','disgaea7','digimon-next-order']);
  assert.equal(QUEST_CONTENT[56].gameSlug,'tales-berseria');
  assert.deepEqual(QUEST_CONTENT[57].eligibleGameSlugs,['ff1-8bit','ff6-classic-coop','ff9']);
  const invalid=structuredClone(GAME_CONTENT);invalid[1].slug=invalid[0].slug;assert.throws(()=>validateGameContent(invalid),/duplicate/);
});

test('approved rule-sensitive objectives preserve thresholds, optional audience choice and human requirements',()=>{
  const en=n=>QUEST_CONTENT[n-1].description.en;
  const es=n=>QUEST_CONTENT[n-1].description.es;
  assert.match(en(1),/automatically triggered/);assert.match(en(1),/No manually activated damaging/);
  assert.match(en(2),/regeneration, passive healing, life-steal, automatic recovery or resurrection/);
  assert.match(en(3),/If nobody votes, OWNER/);assert.match(en(3),/no additional poll/);
  assert.match(en(4),/external roulette/);assert.match(en(4),/actually impossible/);
  assert.match(en(5),/player chooses/);assert.match(en(5),/no extra roulette or public vote/);
  assert.match(en(6),/3 consecutive Triple Triad wins/);
  assert.match(en(7),/Leaving before reaching the objective does not count/);
  assert.match(en(13),/two DIFFERENT/);assert.match(en(13),/different enemies/);
  assert.match(en(14),/three attacks/);assert.match(en(14),/do not need to use three different elements/);
  assert.match(en(15),/different battles/);assert.match(en(16),/No finishing blow/);
  assert.match(en(20),/outcome need not be favorable/);
  assert.match(en(21),/TWO DIFFERENT linked Materia/);
  assert.match(en(22),/Level cap/);assert.match(en(22),/ONLY if the audience voluntarily/);
  assert.match(en(23),/TWO enemies/);assert.match(en(23),/SINGLE throw/);
  assert.match(en(24),/THREE different colors/);
  assert.match(en(26),/Edgar's Tools, Sabin's Blitz, Cyan's Bushido and Setzer's Slots/);
  assert.match(en(28),/Ramza accompanied exclusively by recruited monsters/);
  assert.match(en(34),/20 consecutive/);assert.match(en(35),/three DIFFERENT/);
  assert.match(en(36),/three Baton Pass transfers in the same turn/);
  assert.match(en(41),/DURING this quest/);assert.match(es(41),/DURANTE esta misión/);
  assert.match(en(42),/WIN/);assert.match(en(43),/rank A/);
  assert.match(en(44),/NO manual battle commands/);assert.match(en(44),/Automatic healing and resurrection are allowed/);
  assert.match(en(45),/three predetermined/);assert.match(en(45),/without changing Materia or accessories/);assert.match(en(45),/restart the complete three-mission sequence/);
  assert.match(en(46),/ALL enemy damage coming only from Palom and Porom's Twincast/);
  assert.match(en(47),/THREE DIFFERENT Sleights/);
  assert.match(en(48),/all four party members under Mini status from the start to the end/);
  for(let n=49;n<=54;n++){assert.match(en(n),/HUMAN/);assert.match(es(n),/HUMANOS/);}
  assert.match(en(49),/2–4/);assert.match(en(49),/EVERY participating human/);
  assert.match(en(50),/2 players, not 4/);
  assert.match(en(51),/invited player delivering the finishing blow/);
  assert.match(en(52),/Cagnazzo/);assert.match(en(52),/healing\/support only/);
  assert.match(en(53),/OTHER player's assigned characters/);
  assert.match(en(54),/actual two-controller multiplayer/);
  assert.match(en(55),/ONLY source of damage/);
  assert.match(en(56),/one enemy defeat another/);
  assert.match(en(57),/at least 38 consecutive hits/);
  assert.match(en(58),/ONE quest and awards one completion, not three/);
  assert.match(en(59),/exactly ONE surviving/);
  assert.match(en(60),/original starting weapon equipped and meaningfully used/);
});

test('original 54-quest fixture remains separate for safe operator reconciliation',()=>{
  assert.equal(legacy.length,54);
  assert.equal(legacy.filter(q=>q.isSecret).length,6);
  const keys=new Set(QUEST_CONTENT.map(q=>q.key));
  for(const quest of legacy)assert.equal(keys.has(quest.key),false);
  assert.equal(legacy[0].key,'ff5-opening-encounter');
  assert.equal(legacy[53].key,'ff9-secret-finale');
});

test('missing legacy translations produce bounded development diagnostics without exposing prose',t=>{
  const oldEnv=process.env.NODE_ENV;process.env.NODE_ENV='test';t.after(()=>{if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;});
  const warning=t.mock.method(console,'warn',()=>{});
  const quest={id:'diagnostic-quest',title:'Secret prose',description:'Secret prose',titleEs:null,descriptionEs:null};
  warnMissingQuestTranslations(quest);warnMissingQuestTranslations(quest);
  assert.equal(warning.mock.callCount(),1);assert.match(warning.mock.calls[0].arguments[0],/titleEs, descriptionEs/);assert.doesNotMatch(warning.mock.calls[0].arguments[0],/Secret prose/);
  assert.equal(questText({translations:{es:{title:' '},en:{title:'Fallback'}}},'title','es'),'Fallback');
});
