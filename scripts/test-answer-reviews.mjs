import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { validateAnswerReview } from './check-answer-reviews.mjs';

const records = JSON.parse(readFileSync(new URL('../data/all.json', import.meta.url)));
const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const getRecord = id => structuredClone(records.find(r => r.id === id));
function fixture() {
  const context = vm.createContext({ console, setTimeout, clearTimeout,
    window: {}, document: { readyState: 'loading', addEventListener() {},
      querySelectorAll: () => [], querySelector: () => null },
    localStorage: { getItem: () => null, setItem() { throw Error('unexpected progress write'); } } });
  vm.runInContext(app, context);
  context.records = structuredClone(records);
  vm.runInContext('state.data=records;state.byId=new Map(records.map(r=>[r.id,r]));', context);
  return code => vm.runInContext(code, context);
}

test('reviews preserve every pre-existing field of both source records', () => {
  for (const [id, expected] of Object.entries({
    '2015-lunyu': 'e2aa44db84b4d70c1d1532a72034b7ced515baefadca8ecfe9869538a5f053f5',
    '2023-lunyu': '8cec3d031049ebe5ceab1555e9c65bab023c69df0ba1e356abf6c5449f192004',
  })) {
    const record = getRecord(id);
    delete record.source_review;
    assert.equal(createHash('sha256').update(JSON.stringify(record)).digest('hex'), expected);
  }
});

test('2015 corrected speakers precede retained models and both conflicting answers are marked', () => {
  const run = fixture();
  for (const key of [1, 2]) {
    const versions = run(`getAnswerVersions(state.byId.get('2015-lunyu'),${key})`);
    assert.equal(versions[0].key, 'source_review');
    assert.match(versions[0].sourceNote, /不是考试院直接发布件/);
    assert.ok(versions.find(v => v.key === 'gpt_5_5_pro').warning);
    assert.ok(!versions.find(v => v.key === 'claude_opus_4_8').warning);
  }
  assert.match(run("getAnswerVersions(state.byId.get('2015-lunyu'),1)[0].text"), /曾皙、孔子、曾皙、孔子/);
});

test('2023 corrects the reference word meaning only on the reviewed subpart', () => {
  const run = fixture();
  const versions = run("getAnswerVersions(state.byId.get('2023-lunyu'),1)");
  assert.match(versions[0].text, /chèn.*相称、符合/);
  assert.match(versions[0].sourceNote, /仍待核/);
  for (const key of [2, 3]) assert.ok(!run(`getAnswerVersions(state.byId.get('2023-lunyu'),${key})`).some(v => v.key === 'source_review'));
  assert.ok(!versions.find(v => v.key === 'gpt_5_5_pro').warning);
});

test('whole-year view maps review and warning to original question without leaking to siblings', () => {
  const run = fixture();
  for (const year of [2015, 2023]) {
    const exam = run(`buildYearExam(${year})`);
    for (const question of exam.questions) {
      const reviewed = question.origRecId === `${year}-lunyu`
        && (year === 2015 || question.origQIndex === 1);
      const versions = run(`getAnswerVersions(buildYearExam(${year}),${question.qIndex})`);
      assert.equal(versions.some(v => v.key === 'source_review'), reviewed);
      const identity = run(`questionIdentity(buildYearExam(${year}),${question.qIndex})`);
      assert.equal(identity.sourceRecordId, question.origRecId);
      assert.equal(identity.sourceQIndex, question.origQIndex);
    }
  }
});

test('source question edits invalidate old review instead of silently reusing it', () => {
  const record = getRecord('2015-lunyu');
  validateAnswerReview(record);
  record.questions[0].text += '新增条件';
  assert.throws(() => validateAnswerReview(record), /question mismatch/);
});

test('changing either the display material or retained legacy material invalidates the review', () => {
  for (const key of ['materials', 'material1']) {
    const record = getRecord('2015-lunyu');
    record[key] = '另一个对话';
    assert.throws(() => validateAnswerReview(record), /material mismatch/);
  }
});

test('missing evidence, unrecognized source and invented historical version fail closed', () => {
  for (const mutate of [r => { r.sources=[]; },
    r => { r.sources[0].url='javascript:alert(1)'; },
    r => { r.answers['1'].rejectedVersions=['nonexistent']; },
    r => { r.answers['99']=r.answers['1']; },
    r => { r.officialSource=true; }]) {
    const record = getRecord('2015-lunyu');
    mutate(record.source_review);
    assert.throws(() => validateAnswerReview(record), /answer review/);
  }
});
