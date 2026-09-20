import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const corpus = JSON.parse(readFileSync(new URL('../data/all.json', import.meta.url)));
function fixture({ items = [], authenticated = true, saved = {}, legacy = {}, failure = false } = {}) {
  const storage = new Map([['gk_progress', JSON.stringify(saved)], ['gaokao_read_progress', JSON.stringify(legacy)]]);
  const calls = [];
  const context = vm.createContext({
    console, setTimeout, clearTimeout,
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

test('all 201 records retain exact legacy aliases and 612 complete prompts', () => {
  assert.equal(corpus.length, 201);
  assert.equal(new Set(corpus.map(r => r.legacy_progress_key)).size, 196);
  assert.equal(corpus.reduce((n, r) => n + r.questions.length, 0), 612);
  assert.ok(corpus.every(r => r.questions.every(q => r.ai_answers[q.qIndex])));
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
