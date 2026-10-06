import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { validateAnswerReview, answerReviewContextHash } from './check-answer-reviews.mjs';

const records = JSON.parse(readFileSync(new URL('../data/all.json', import.meta.url)));
const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const getRecord = id => structuredClone(records.find(r => r.id === id));
function fixture() {
  const context = vm.createContext({ console, setTimeout, clearTimeout,
    window: {}, document: { readyState: 'loading', addEventListener() {},
      querySelectorAll: () => [], querySelector: () => null },
    localStorage: { getItem: () => null, setItem() { throw Error('unexpected progress write'); } },
    fetch: async () => ({ ok: true, json: async () => structuredClone(records) }) });
  vm.runInContext(app, context);
  context.records = structuredClone(records);
  vm.runInContext('state.data=records.map(applyReviewedSource);state.byId=new Map(state.data.map(r=>[r.id,r]));', context);
  return code => vm.runInContext(code, context);
}

test('reviews preserve every pre-existing field of all seven source records', () => {
  for (const [id, expected] of Object.entries({
    '2015-lunyu': 'e2aa44db84b4d70c1d1532a72034b7ced515baefadca8ecfe9869538a5f053f5',
    '2023-lunyu': '8cec3d031049ebe5ceab1555e9c65bab023c69df0ba1e356abf6c5449f192004',
    '2021-lunyu': 'c381492a3499f400ad4b790e75c6c1069264c347d3b65c83296ee769df768d44',
    '2020-lunyu': 'a5f4402776d7b4651312bac07a2f80e3f3bc01c22e0192c1315e0385f7f5144e',
    '2019-lunyu': '18e393a6fcd0422740b6cb70eff6d9ff29f7e7c13c84c416fb3ba355960b9b30',
    '2018-lunyu': 'e5577baa5dc7efeae9488d7e56b8cb4952f26771e78295fa483c8cbe5a14ca86',
    '2018-weixiezuo': 'ba9606abcff650fe2bdc50b33fb03c4a6c864e3686196a7b4aa8ff9e97f64cdc',
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

test('2023 reviews all three subparts without inventing score allocations or rejecting correct models', () => {
  const run = fixture();
  const versions = run("getAnswerVersions(state.byId.get('2023-lunyu'),1)");
  assert.match(versions[0].text, /chèn.*相称、符合/);
  assert.match(versions[0].sourceNote, /仍待核/);
  for (const key of [1, 2, 3]) {
    const review = run(`getAnswerVersions(state.byId.get('2023-lunyu'),${key})`)[0];
    assert.equal(review.key, 'source_review');
    assert.match(review.sourceNote, /未显示逐项配分/);
  }
  assert.ok(!versions.find(v => v.key === 'gpt_5_5_pro').warning);
});

test('whole-year view maps review and warning to original question without leaking to siblings', () => {
  const run = fixture();
  for (const year of [2015, 2018, 2019, 2020, 2021, 2023]) {
    const exam = run(`buildYearExam(${year})`);
    for (const question of exam.questions) {
      const reviewed = Boolean(getRecord(question.origRecId)?.source_review?.answers[String(question.origQIndex)]);
      const versions = run(`getAnswerVersions(buildYearExam(${year}),${question.qIndex})`);
      assert.equal(versions.some(v => v.key === 'source_review'), reviewed);
      const identity = run(`questionIdentity(buildYearExam(${year}),${question.qIndex})`);
      assert.equal(identity.sourceRecordId, question.origRecId);
      assert.equal(identity.sourceQIndex, question.origQIndex);
    }
  }
});

test('all seven groups and only the twelve intended subparts are reviewed', () => {
  const expected = { '2015-lunyu': ['1', '2'], '2018-lunyu': ['1'],
    '2018-weixiezuo': ['3'], '2019-lunyu': ['1', '2'], '2020-lunyu': ['1', '2'],
    '2021-lunyu': ['1'], '2023-lunyu': ['1', '2', '3'] };
  assert.deepEqual(Object.fromEntries(records.filter(r => r.source_review)
    .map(r => [r.id, Object.keys(r.source_review.answers)])), expected);
  records.forEach(validateAnswerReview);
  const run = fixture();
  assert.match(run("getAnswerVersions(state.byId.get('2019-lunyu'),2).find(v=>v.key==='gpt_5_5_pro').warning"), /冲突/);
  assert.match(run("getAnswerVersions(state.byId.get('2020-lunyu'),1).find(v=>v.key==='gpt_5_5_pro').warning"), /冲突/);
  assert.match(run("getAnswerVersions(state.byId.get('2018-weixiezuo'),3)[0].text"), /任选一个/);
});

test('new chat, feedback and regeneration use the reviewed reference in both navigation modes', () => {
  const run = fixture();
  for (const original of records.filter(r => r.source_review)) {
    for (const [key, answer] of Object.entries(original.source_review.answers)) {
      const recExpr = `state.byId.get('${original.id}')`;
      run(`${recExpr}.ai_answers['${key}']='UNTRUSTED_OLD_REFERENCE';`);
      const exam = run(`buildYearExam(${original.year})`);
      const mapped = exam.questions.find(q => q.origRecId === original.id && String(q.origQIndex) === key);
      assert.ok(mapped);
      for (const [rec, qIndex] of [[recExpr, Number(key)], [`buildYearExam(${original.year})`, mapped.qIndex]]) {
        for (const mode of ['chat', 'review', 'regenerate']) {
          const prompt = run(`buildContextPrompt(${rec},${qIndex},'依据是什么','${mode}')`);
          assert.ok(prompt.includes(answer.text), `${original.id}/${key}/${mode}`);
          assert.ok(prompt.includes(original.source_review.sourceNote));
          assert.doesNotMatch(prompt, /UNTRUSTED_OLD_REFERENCE|【AI 之前给出的参考答案】/);
          assert.match(prompt, /不沿用旧说/);
        }
      }
    }
  }
});

test('unknown subpart points cannot become a numeric grading request from legacy scores or group totals', () => {
  const run = fixture();
  for (const id of ['2019-lunyu', '2023-lunyu']) {
    const original = getRecord(id);
    for (const key of Object.keys(original.source_review.answers)) {
      const expr = `state.byId.get('${id}')`;
      const exam = run(`buildYearExam(${original.year})`);
      const mapped = exam.questions.find(q => q.origRecId === id && String(q.origQIndex) === key);
      for (const [rec, qIndex] of [[expr, Number(key)], [`buildYearExam(${original.year})`, mapped.qIndex]]) {
        assert.equal(run(`questionPointLabel(${rec},${qIndex})`), '配分待核');
        for (const mode of ['chat', 'review', 'regenerate']) {
          const prompt = run(`buildContextPrompt(${rec},${qIndex},'请给出一个分数','${mode}')`);
          assert.match(prompt, /只给定性评语，不给数字得分、满分、百分比或等级/);
          assert.match(prompt, /历史记录中保留的分数不能作为本次评分上限/);
          assert.doesNotMatch(prompt, /推测得分|【当前小题】[^\n]*（\d+ 分）/);
        }
      }
      assert.equal(run(`${expr}.questions.find(q=>String(q.qIndex)==='${key}').score`),
        original.questions.find(q => String(q.qIndex) === key).score);
    }
  }
});

test('verified point values govern future estimates while corrupt or absent values fail closed', () => {
  const run = fixture();
  run("state.byId.get('2015-lunyu').questions[0].score=99");
  assert.equal(run("questionPointLabel(state.byId.get('2015-lunyu'),1)"), '1 分');
  assert.match(run("buildContextPrompt(state.byId.get('2015-lunyu'),1,'','review')"),
    /确认本小问配分为1 分/);
  assert.equal(run("state.byId.get('2015-lunyu').questions[0].score"), 99);
  for (const bad of ['null', 'undefined', '0', '-1', '1.5', '99', "'1'"]) {
    run(`state.byId.get('2015-lunyu').source_review.answers['1'].printedScore=${bad}`);
    assert.equal(run("questionPointLabel(state.byId.get('2015-lunyu'),1)"), '配分待核');
    assert.doesNotMatch(run("buildContextPrompt(state.byId.get('2015-lunyu'),1,'','review')"), /推测得分/);
  }
});

test('unreviewed adjacent choices keep their existing reference and grading behavior', () => {
  const run = fixture();
  for (const key of [1, 2]) {
    const original = getRecord('2018-weixiezuo');
    assert.equal(run(`getReviewedQuestion(state.byId.get('2018-weixiezuo'),${key})`), null);
    const prompt = run(`buildContextPrompt(state.byId.get('2018-weixiezuo'),${key},'','review')`);
    assert.ok(prompt.includes(original.ai_answers[String(key)]));
    assert.match(prompt, /一行总评 \+ 推测得分（注明本题满分）/);
    assert.doesNotMatch(prompt, /【经来源核对的学习参考】|配分待核/);
  }
});

test('new capture identifies exact reviewed content without changing original resource or owner keys', () => {
  const run = fixture();
  const expected = `sha256:${createHash('sha256').update(readFileSync(new URL('../data/all.json', import.meta.url))).digest('hex')}`;
  const exam = run('buildYearExam(2023)');
  const mapped = exam.questions.find(q => q.origRecId === '2023-lunyu' && q.origQIndex === 1);
  for (const [rec, qIndex] of [["state.byId.get('2023-lunyu')", 1], ['buildYearExam(2023)', mapped.qIndex]]) {
    run(`state.currentRecord=${rec};state.currentQIndex=${qIndex};window.BdfzLearningRecords={scope:'fixture-owner',id:()=> 'fixture-session'};`);
    const context = run('detailedContext()');
    assert.equal(context.resourceVersion, expected);
    assert.equal(context.resourceKey, 'question:2023-lunyu:1');
    assert.equal(context.captureScope, 'fixture-owner');
    assert.equal(context.sourceContext.recordId, '2023-lunyu');
    assert.equal(context.sourceContext.qIndex, 1);
  }
  for (const rec of ["state.byId.get('2018-weixiezuo')", "({id:'custom-fixture',questions:[{qIndex:1,text:'自订题目'}]})"]) {
    run(`state.currentRecord=${rec};state.currentQIndex=1;`);
    assert.equal(run('detailedContext().resourceVersion'), 'git-tree-sha1:3487023148584d9f649a91dbf0dd6a691065b124');
  }
});

test('loaded corrections reach year views and discussion while historical fields, IDs and scores stay intact', async () => {
  const run = fixture();
  await run('loadData()');
  for (const original of records.filter(r => r.source_review?.corrections)) {
    const actual = JSON.parse(JSON.stringify(run(`state.byId.get('${original.id}')`)));
    const expected = structuredClone(original);
    for (const { field, from, to } of original.source_review.corrections) {
      expected[field] = expected[field].replace(from, to);
      if (field !== 'topic') expected.materials.find(m => m.key === field).text = expected[field];
    }
    assert.deepEqual(actual, expected);
    const section = run(`buildYearExam(${original.year}).sections.find(s=>s.recId==='${original.id}')`);
    assert.equal(section.topic, expected.topic);
    assert.deepEqual(JSON.parse(JSON.stringify(section.materials)), expected.materials);
    assert.deepEqual(JSON.parse(JSON.stringify(run(`materialsForDiscussion(state.byId.get('${original.id}'))`)))
      .map(m => m.text), expected.materials.map(m => m.text));
  }
  assert.match(getRecord('2023-lunyu').material1, /不已知/);
  assert.match(run("buildDiscussionContext(state.byId.get('2019-lunyu'),2,'').answerVersions.find(v=>v.label.includes('GPT')).text"), /冲突/);
  assert.match(run("buildDiscussionContext(state.byId.get('2023-lunyu'),1,'').answerVersions[0].text"), /未显示逐项配分/);
});

test('correction scope, duplicate targets, unmatched text and annotation length drift fail closed', () => {
  for (const mutate of [r => { r.source_review.corrections[0].field='questions'; },
    r => { r.source_review.corrections.push(r.source_review.corrections[0]); },
    r => { r.source_review.corrections[0].from='不存在'; },
    r => { r.source_review.corrections[0].to='更长的新增字词'; },
    r => { r.material1 += r.source_review.corrections[0].from; },
    r => { r.materials[0].text += '新增'; }]) {
    const record = getRecord('2023-lunyu');
    mutate(record);
    record.source_review.sourceContextSha256 = answerReviewContextHash(record);
    assert.throws(() => validateAnswerReview(record), /correction/);
    const run = fixture();
    assert.throws(() => run(`applyReviewedSource(${JSON.stringify(record)})`), /invalid source correction/);
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
