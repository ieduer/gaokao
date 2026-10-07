import {mountQuestionParts,questionParts} from '../assets/js/question-parts.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { validateAnswerReview, answerReviewContextHash } from './check-answer-reviews.mjs';
import {answerVersionSpecs, versionsForQuestion, reviewForQuestion} from '../assets/js/answer-versions.js';

const records = JSON.parse(readFileSync(new URL('../data/all.json', import.meta.url)));
const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8')
  .replace(/^import \{ mountQuestionParts, questionParts \} from '\.\/question-parts\.js';$/m, '')
  .replace(/^import \{ answerVersionSpecs, versionsForQuestion, reviewForQuestion \} from '\.\/answer-versions\.js';$/m, '');
const sourceBytes = readFileSync(new URL('../data/all.json', import.meta.url), 'utf8');
const sourceVersion = 'sha256:' + createHash('sha256').update(sourceBytes).digest('hex');
const getRecord = id => structuredClone(records.find(r => r.id === id));
function fixture() {
  const context = vm.createContext({ console, setTimeout, clearTimeout,
    answerVersionSpecs, versionsForQuestion, reviewForQuestion, mountQuestionParts,questionParts, crypto: webcrypto, TextEncoder,
    window: {}, document: { readyState: 'loading', addEventListener() {},
      querySelectorAll: () => [], querySelector: () => null },
    localStorage: { getItem: () => null, setItem() { throw Error('unexpected progress write'); } },
    fetch: async () => ({ ok: true, text: async () => sourceBytes }) });
  vm.runInContext(app, context);
  context.records = structuredClone(records);
  context.sourceVersion = sourceVersion;
  vm.runInContext('SOURCE_CONTENT_VERSION=sourceVersion;',context);
  vm.runInContext('state.data=records.map(applyReviewedSource);state.byId=new Map(state.data.map(r=>[r.id,r]));', context);
  return code => vm.runInContext(code, context);
}

test('accepted overlays retain their full original evidence, answers and score qualifications', () => {
  for (const [id, expected] of Object.entries({
    '2015-lunyu': 'd3671b24d9879a8a08c4c52c188b541988dca988d2d72da0e389ef055f00a696',
    '2023-lunyu': 'bb6746ef5fdceffea70169e5d6fe923dc2e6484fc593a2b632fa63c81b91a5fd',
    '2021-lunyu': 'cc68273dfa80d189cc1389e4e537411d6e2e0e1be88b513e2ddd57df5be5b39a',
    '2020-lunyu': '525006905d6da74867b5b84fc6ef32bff90ef2294823ce44d175a7470f5406f1',
    '2019-lunyu': 'ea59e09dd5f40a116e8b7a40b97b3eca4e2ac70e18e2bab259dcebadc6adef05',
    '2018-lunyu': 'a0eba0338d96cd491efbccf47cc0c1d2033fce74a912944130354d8bb402b908',
    '2018-weixiezuo': '33cdf07f69bcb4305f8d899e36e16ea422344f0e784cba371058a13cb4a4a1d1',
  })) {
    const record = getRecord(id),review=record.source_review,original=review.reconciliation.acceptedReview;
    assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),expected);
    assert.equal(review.reconciliation.acceptedSource,'7ce7271e8ed2437148b76824712b7e0a99638e6a');
    for(const key of ['answers','sources','scoreNote','printedGroupScore','scope','sourceNote','officialSource'])
      assert.deepEqual(review[key],original[key],`${id}/${key}`);
    assert.deepEqual(review.corrections,[]);
  }
});

test('loaded response bytes determine capture provenance and failed parsing cannot change it', async () => {
  const run=fixture();
  run("fetch=async()=>({ok:true,text:async()=>JSON.stringify(records)+'  '});");
  await run('loadData()');
  const expected='sha256:'+createHash('sha256').update(JSON.stringify(records)+'  ').digest('hex');
  assert.equal(run('SOURCE_CONTENT_VERSION'),expected);
  run("state.currentRecord=state.byId.get('2023-lunyu');state.currentQIndex=1;");
  assert.equal(run('detailedContext().resourceVersion'),expected);
  run("fetch=async()=>({ok:true,text:async()=>'{invalid'});");
  await assert.rejects(run('loadData()'));
  assert.equal(run('detailedContext().resourceVersion'),expected);
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
    assert.match(prompt, /练习估分|只给定性总评/);
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
  for (const original of records.filter(r => r.source_review)) {
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
  assert.match(getRecord('2023-lunyu').material1, /不己知/);
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
    record.source_review.corrections=structuredClone(record.source_review.reconciliation.acceptedReview.corrections);
    record.material1=record.material1.replace('不己知','不已知');
    record.materials.find(m=>m.key==='material1').text=record.material1;
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
