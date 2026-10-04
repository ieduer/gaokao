import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {answerVersionSpecs, versionsForQuestion, reviewForQuestion} from '../assets/js/answer-versions.js';

const source = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8')
  .replace(/^import \{ answerVersionSpecs, versionsForQuestion, reviewForQuestion \} from '\.\/answer-versions\.js';$/m, '');
const corpus = JSON.parse(readFileSync(new URL('../data/all.json', import.meta.url)));
function fixture({ items = [], authenticated = true, saved = {}, legacy = {}, failure = false } = {}) {
  const storage = new Map([['gk_progress', JSON.stringify(saved)], ['gaokao_read_progress', JSON.stringify(legacy)]]);
  const calls = [];
  const context = vm.createContext({
    console, setTimeout, clearTimeout, answerVersionSpecs, versionsForQuestion, reviewForQuestion,
    window: { BdfzIdentity: { api: async path => { calls.push(path); if (failure) throw Error('offline'); return { items }; } } },
    document: { readyState: 'loading', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  vm.runInContext(source, context);
  context.records = structuredClone(corpus);
  vm.runInContext(`state.data=records; state.byId=new Map(records.map(r=>[r.id,r])); state.identityAuthenticated=${authenticated}; loadLocalProgress(); refreshCatalogStatus=()=>{};`, context);
  return { run: code => vm.runInContext(code, context), result: () => JSON.parse(storage.get('gk_progress')), storage, calls };
}
const record = corpus.find(r => r.id === '2026-guwen');
const legacyItem = (state, extra = {}) => ({ siteKey: 'gk', itemKey: `question-${record.legacy_progress_key}`, state, ...extra });

test('all 201 historical records and 612 legacy prompts survive source supplements', () => {
  const historical = corpus.filter(r => r.answer_policy !== 'authority_only');
  assert.equal(historical.length, 201);
  assert.equal(new Set(historical.map(r => r.legacy_progress_key)).size, 196);
  assert.equal(historical.reduce((n, r) => n + r.questions.length, 0), 612);
  assert.ok(historical.every(r => r.questions.every(q => r.ai_answers[q.qIndex])));
});

test('new year collections exclude wrong-year aliases while old links keep their own progress identity', () => {
  const f = fixture({saved:{'2007-yuyanjichu-2':'done','2005-yuyanjichu-2':'in_progress'}});
  const before = f.storage.get('gk_progress');
  const y2005 = f.run('buildYearExam(2005)'), y2007 = f.run('buildYearExam(2007)');
  assert.equal(y2005.questions.filter(q => q.origRecId === '2005-yuyan-professor').length, 1);
  assert.equal(y2005.questions.filter(q => q.origRecId === '2005-yuyanjichu-2').length, 2);
  assert.equal(y2007.questions.filter(q => q.origRecId === '2007-yuyanjichu-2').length, 0);
  assert.equal(f.run('buildYearExam(2003)').questions.filter(q => q.origRecId === '2003-yuyanjichu-2' && q.origQIndex === 3).length, 1);
  for (const id of ['2007-yuyanjichu-2','2005-yuyanjichu-2']) {
    const identity = f.run(`questionIdentity(state.byId.get('${id}'),3)`);
    assert.equal(identity.sourceRecordId,id); assert.equal(identity.sourceQIndex,3);
  }
  assert.equal(f.run("state.byId.get('2005-yuyanjichu-2').questions[2].score"),null);
  assert.equal(f.run("state.byId.get('2007-yuyanjichu-2').questions[2].score"),5);
  assert.match(f.run("questionSourceNotice(state.byId.get('2005-yuyanjichu-2').questions[2])"),/2003 年北京卷第 25 题/);
  assert.equal(f.storage.get('gk_progress'),before);
  assert.equal(y2005.collectionComplete,false);
  assert.ok(y2007.sections.every(s => s.qStart <= s.qEnd));
});

test('legacy reader renders corrected source and retained original stem without moving the answer slot', () => {
  const f=fixture();
  f.run(`
    const nodes=new Map();
    const element=()=>({children:[],innerHTML:'',dataset:{},querySelector(){return element();},append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);}});
    document.createElement=()=>element();
    document.querySelector=(key)=>{if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);};
    renderAnswerVersions=()=>{};renderChatMessages=()=>{};renderDiscussionPanel=()=>{};
    state.currentRecord=state.byId.get('2005-yuyanjichu-2');state.currentQIndex=3;
    renderWorkpad();
  `);
  const html=f.run("nodes.get('#active-question').innerHTML");
  assert.match(html,/不少于40字/);assert.match(html,/2003 年北京卷第 25 题/);
  const history=f.run("nodes.get('#active-question').children[0]");
  assert.match(history.children[1].textContent,/不少于\$\+字/);
  assert.equal(f.run('state.conversationKey'),'2005-yuyanjichu-2#3');
});
test('ambiguous historical category keys do not invent per-record progress', async () => {
  const rec=corpus.find(r=>r.id==='2007-yuyanjichu');
  const f=fixture({legacy:{'yuyanjichu-2007':'done'},items:[{siteKey:'gk',itemKey:`question-${rec.legacy_progress_key}`,state:'done'}]});
  f.run('restoreLegacyLocalProgress()'); await f.run('hydrateProgressFromServer()');
  assert.deepEqual(f.result(),{});
});
test('old category progress is restored without deleting or downgrading either cache', () => {
  const f = fixture({ saved: {'2026-guwen': 'done'}, legacy: {'guwen-2026': 'in_progress', 'shici-2026': 'done', 'unknown-1900': 'done'} });
  const before = f.storage.get('gaokao_read_progress');
  f.run('restoreLegacyLocalProgress()');
  assert.equal(f.result()['2026-guwen'], 'done');
  assert.equal(f.result()['2026-shici'], 'done');
  assert.equal(f.storage.get('gaokao_read_progress'), before);
});
test('exact legacy key restores the correct category despite hyphens', async () => {
  const f = fixture({ items: [legacyItem('in_progress')] });
  await f.run('hydrateProgressFromServer()');
  assert.deepEqual(f.result(), {'2026-guwen': 'in_progress'});
  assert.equal(f.calls.length, 1);
});
for (const item of [legacyItem('completed'), legacyItem('done'), legacyItem('in_progress', {meta: {progressPercent: 100}})]) {
  test(`completion semantics ${JSON.stringify(item)}`, async () => {
    const f = fixture({items: [item]}); await f.run('hydrateProgressFromServer()'); assert.equal(f.result()['2026-guwen'], 'done');
  });
}
test('modern paper and whole-paper keys survive while unknown and other-site records are ignored', async () => {
  const f = fixture({items: [
    {siteKey:'gk',itemKey:'paper-2025-guwen',state:'completed'},
    {siteKey:'gk',itemKey:'paper-exam-2026',state:'in_progress'},
    {siteKey:'other',itemKey:'paper-2026-shici',state:'done'},
    {siteKey:'gk',itemKey:'paper-unknown',state:'done'},
    legacyItem('not_started', {progressPercent:100}),
  ]});
  await f.run('hydrateProgressFromServer()');
  assert.deepEqual(f.result(), {'2025-guwen':'done','exam-2026':'in_progress'});
});
test('hydration never downgrades completion or makes writes', async () => {
  const f = fixture({items:[legacyItem('in_progress')],saved:{'2026-guwen':'done'}});
  await f.run('hydrateProgressFromServer()'); assert.equal(f.result()['2026-guwen'],'done');
  assert.deepEqual(f.calls,['/api/progress?site=gk']);
});
test('anonymous and offline sessions preserve local progress', async () => {
  for (const options of [{authenticated:false},{failure:true}]) {
    const f=fixture({...options,saved:{'2025-shici':'done'}});
    await f.run('hydrateProgressFromServer()'); assert.deepEqual(f.result(),{'2025-shici':'done'});
    if (options.authenticated===false) assert.equal(f.calls.length,0);
  }
});
test('2026 full paper retains all Codex answers and original per-question identity', () => {
  const f=fixture(); const exam=f.run('buildYearExam(2026)');
  assert.equal(exam.questions.length,26);
  assert.equal(Object.keys(exam.ai_answer_versions.openai_codex_gpt_5.answers).length,26);
  for (const q of exam.questions) {
    f.run(`state.currentRecord=buildYearExam(2026);`);
    const identity=f.run(`questionIdentity(state.currentRecord,${q.qIndex})`);
    assert.equal(identity.sourceRecordId,q.origRecId); assert.equal(identity.sourceQIndex,q.origQIndex);
  }
});
test('modern entrypoint retains catalog, APIS, discussions and source disclosure', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/data-theme="mono"/); assert.match(html,/id="active-question"/);
  assert.match(source,/https:\/\/apis\.bdfz\.net\//); assert.doesNotMatch(source,/https:\/\/ai\.bdfz\.net\//);
  assert.match(source,/\/api\/question-discussions/);
});
test('whole-paper view preserves dynamic model identity and per-question current version',()=>{
  const f=fixture();
  f.run(`const r=state.data.find(r=>r.id==='2026-guwen');
    r.ai_answer_versions.gpt_6_astra={model:'gpt-6-astra',label:'GPT-6 Astra',answers:{1:'synthetic new answer'},provenance:{1:{generatedAt:'2026-10-02T23:00:00Z'}}};
    r.ai_answer_versions.history_fixture={model:'gpt-6-astra',label:'旧题面',answers:{1:'old context answer'},provenance:{1:{historicalSourceContext:'fixture-context'}}};
    r.answer_review_history={1:[{contextSha256:'fixture-context',source:{materials:[{text:'原题面材料'}]}}]};
    r.answer_reviews={1:{status:'reviewed',currentVersion:'gpt_6_astra',modelVersions:['gpt_6_astra'],correctOptions:['D']}};`);
  const exam=f.run('buildYearExam(2026)'),q=exam.questions.find(q=>q.origRecId==='2026-guwen'&&q.origQIndex===1);
  const versions=versionsForQuestion(exam,q.qIndex);
  assert.equal(versions[0].model,'gpt-6-astra');assert.equal(versions[0].current,true);
  assert.equal(versions[0].generatedAt,'2026-10-02T23:00:00Z');
  assert.equal(exam.answer_reviews[q.qIndex].correctOptions[0],'D');
  assert.equal(versions.find(v=>v.key==='history_fixture').historicalSource.materials[0].text,'原题面材料');
  const untouched=exam.questions.find(q=>q.origRecId==='2026-feilian');
  assert.equal(versionsForQuestion(exam,untouched.qIndex)[0].key,'claude_opus_5');
});
