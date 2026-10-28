import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { QUESTION_BLANKS, QUESTION_SOURCE_MARKS, findQuestionBlanks, findQuestionSourceMarks, renderQuestionBlanks } from '../assets/js/question-blanks.js';
import { mountQuestionParts, questionParts, serializePartAnswers } from '../assets/js/question-parts.js';
import { buildQuestionBlanksModule, validateQuestionBlanks, validateQuestionSourceMarks } from './lib/question-blanks.mjs';
import { buildContentCatalog } from './lib/content-catalog.mjs';
import { projectScopedAnswers } from './lib/answer-release-scope.mjs';

const records = JSON.parse(readFileSync(new URL('../data/all.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const between = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
// Exercise the page's real formatting and source-annotation functions without
// booting identity, progress recording or the network-facing application.
const page = { renderQuestionBlanks };
vm.createContext(page);
vm.runInContext([
  between('function escapeHtml(', 'function answerStorageKey('),
  between('function effectiveAnnoType(', 'function renderRecord('),
  between('function formatQuestionBody(', 'function scrollCurrentQuestionIntoView('),
].join('\n'), page);
const countBlanks = html => (html.match(/class="question-blank"/g) || []).length;
const find = (id, index) => records.find(r => r.id === id).questions.find(q => q.qIndex === index);
const load = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const definition = load('question-blanks');
const sourceMarks = load('question-source-marks');
const published = projectScopedAnswers(records, load('answer-authority'), load('answer-release-scope'), load('answer-release-preserved'));

test('the shared module regenerates byte-exactly from canonical publication and a text-free range definition', () => {
  assert.deepEqual(Object.keys(definition).sort(), ['schemaVersion', 'sourceQuestions']);
  for (const entry of definition.sourceQuestions) {
    assert.deepEqual(Object.keys(entry).sort(), ['provenance', 'qIndex', 'ranges', 'recordId', 'sha256']);
  }
  assert.equal(buildQuestionBlanksModule(published, definition, sourceMarks), readFileSync(new URL('../assets/js/question-blanks.js', import.meta.url), 'utf8'));
  assert.equal(QUESTION_BLANKS.length, 24);
  assert.equal(QUESTION_BLANKS.reduce((total, entry) => total + entry.ranges.length, 0), 110);
});

test('the source validator rejects drift, overlapping ranges and replacement of real question text', () => {
  const sourceDrift = structuredClone(published);
  sourceDrift.find(r => r.id === definition.sourceQuestions[0].recordId).questions.find(q => q.qIndex === definition.sourceQuestions[0].qIndex).text += ' changed';
  assert.throws(() => validateQuestionBlanks(sourceDrift, definition), /source hash/);
  const overlap = structuredClone(definition);
  overlap.sourceQuestions[0].ranges[1] = [...overlap.sourceQuestions[0].ranges[0]];
  assert.throws(() => validateQuestionBlanks(published, overlap), /range bounds/);
  const content = structuredClone(definition);
  content.sourceQuestions[0].ranges = [[0, 1]];
  assert.throws(() => validateQuestionBlanks(published, content), /range content/);
  const wrongHash = structuredClone(definition);
  wrongHash.sourceQuestions[0].sha256 = '0'.repeat(64);
  assert.throws(() => validateQuestionBlanks(published, wrongHash), /source hash/);
  const duplicateText = structuredClone(definition);
  duplicateText.sourceQuestions[0].text = 'a second editable copy';
  assert.throws(() => validateQuestionBlanks(published, duplicateText), /source fields/);
});

test('every reviewed blank map matches the exact unchanged source question and ordered ranges', () => {
  assert(QUESTION_BLANKS.length > 0);
  const texts = new Map();
  for (const entry of QUESTION_BLANKS) {
    const q = find(entry.recordId, entry.qIndex);
    assert.equal(entry.text, q.text, `${entry.recordId}:${entry.qIndex}`);
    assert.equal(createHash('sha256').update(q.text).digest('hex'), entry.sha256);
    if (texts.has(entry.text)) assert.deepEqual(entry.ranges, texts.get(entry.text), 'retained aliases must share the same rendering');
    texts.set(entry.text, entry.ranges);
    assert.deepEqual(findQuestionBlanks(q.text).ranges, entry.ranges);
    let previousEnd = 0;
    for (const [start, end] of entry.ranges) {
      assert(Number.isInteger(start) && Number.isInteger(end) && start >= previousEnd && end > start && end <= q.text.length);
      assert.match(q.text.slice(start, end), /^[\s①-⑳]*$/u, 'a blank cannot replace question content');
      previousEnd = end;
    }
    assert.equal(countBlanks(page.renderQuestionBody({ annotations: [] }, q)), entry.ranges.length);
    assert.equal((page.renderQuestionBody({ annotations: [] }, q).match(/<br>/g) || []).length, (q.text.match(/\n/g) || []).length, 'source line breaks survive blank rendering');
  }
});

test('2012 language question 4 shows four answer blanks and retains option alignment and all source text', () => {
  const q = find('2012-yuyanjichu', 4), before = JSON.stringify(q);
  const html = page.renderQuestionBody({ annotations: [] }, q);
  assert.equal(countBlanks(html), 4);
  assert(html.includes('①引力波每时每刻都在影响着我们   ②你会听到它悄然逼近的声音'));
  assert(html.includes('③引力波是听不到的                 ④声波在真空中无法传播'));
  assert(html.includes('A．②③①④       B．②④①③     C．③②①④   D．③①④②'));
  assert.equal(JSON.stringify(q), before);
});

test('numbered blanks keep each original circled label exactly once', () => {
  let numbered = 0;
  for (const entry of QUESTION_BLANKS) {
    for (const [start, end] of entry.ranges) {
      const labels = entry.text.slice(start, end).match(/[①-⑳]/gu) || [];
      if (!labels.length) continue;
      const html = renderQuestionBlanks(entry.text, page.formatQuestionBody, { start, end });
      for (const label of labels) assert.equal(html.split('>')[1].split('<')[0].split(label).length - 1, 1);
      numbered++;
    }
  }
  assert(numbered > 0);
});

test('unreviewed whitespace and source drift do not invent blanks; HTML stays escaped', () => {
  for (const text of ['①内容     ②内容\nA．甲      B．乙', '<img src=x onerror="alert(1)"> & *字*', find('2012-yuyanjichu', 4).text + ' changed']) {
    assert.equal(findQuestionBlanks(text), null);
    const html = page.renderQuestionBody({ annotations: [] }, { qIndex: 1, text });
    assert.equal(html, page.formatQuestionBody(text));
    assert.equal(countBlanks(html), 0);
    assert(!html.includes('<img'));
  }
});

test('source annotations after a blank retain their text, offsets and remapped year identity', () => {
  const q = find('2012-yuyanjichu', 4), start = q.text.indexOf('引力波会');
  const mark = { material: 'question4', qIndex: 4, start, end: start + 4, type: 'underline', rationale: '<source>' };
  const rec = { annotations: [mark] }, before = JSON.stringify(rec);
  const html = page.renderQuestionBody(rec, q);
  assert.match(html, /class="anno anno-underline active" data-q-index="4" data-anno-type="underline" title="&lt;source&gt;">引力波会<\/span>/);
  assert.equal(countBlanks(html), 4);
  const composite = { ...q, qIndex: 27, origQIndex: 4 };
  const yearHtml = page.renderQuestionBody({ annotations: [{ ...mark, qIndex: 27 }] }, composite);
  assert.equal(yearHtml.replaceAll('data-q-index="27"', 'data-q-index="4"'), html);
  assert.equal(JSON.stringify(rec), before);
});

test('range rendering uses absolute offsets and reconstructs whole markup at blank boundaries', () => {
  for (const entry of QUESTION_BLANKS) {
    const q = find(entry.recordId, entry.qIndex), [start, end] = entry.ranges[0];
    const rec = { annotations: [] };
    const pieces = [[0, start], [start, end], [end, q.text.length]];
    const partial = pieces.map(([start, end]) => page.renderQuestionBody(rec, q, { start, end })).join('');
    assert.equal(partial, page.renderQuestionBody(rec, q), `${entry.recordId}:${entry.qIndex}`);
  }
  const q = find('2012-yuyanjichu', 4), start = q.text.indexOf('引力波会');
  const rec = { annotations: [{ material: 'question4', qIndex: 4, start, end: start + 4, type: 'underline' }] };
  const fragment = page.renderQuestionBody(rec, q, { start, end: start + 6 });
  assert(fragment.includes('>引力波会</span>“挤'));
});

test('existing multipart source slices retain the full-question blank lookup', () => {
  let checked = 0;
  for (const rec of records) for (const q of rec.questions || []) {
    if (!q.questionParts) continue;
    const ranges = [{ start: 0, end: q.questionParts.introductionEnd }, ...questionParts(q)];
    const total = ranges.map(range => page.renderQuestionBody(rec, q, range)).reduce((sum, html) => sum + countBlanks(html), 0);
    assert.equal(total, findQuestionBlanks(q.text)?.ranges.length || 0, `${rec.id}:${q.qIndex}`);
    checked++;
  }
  assert(checked > 0);
});

test('multipart mounting passes original offsets to the formatter and preserves draft hydration', () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; }
    append(...children) { this.children.push(...children); }
    before() {}
    remove() {}
    setAttribute() {}
    addEventListener() {}
    dispatchEvent() {}
    focus() {}
  }
  class Textarea extends Element {
    get value() { return this.savedValue || ''; }
    set value(value) { this.savedValue = String(value); }
  }
  const doc = {
    defaultView: { HTMLTextAreaElement: Textarea },
    createElement(tag) { const element = tag === 'textarea' ? new Textarea(tag) : new Element(tag); element.ownerDocument = doc; return element; },
  };
  const input = doc.createElement('textarea'), q = find('2014-yuyanjichu', 4), calls = [];
  const answer = serializePartAnswers(q, { p1: 'D', p3: 'C\n依据' });
  input.value = answer;
  const box = mountQuestionParts(input, q, (text, start, end) => {
    assert.equal(text, q.text.slice(start, end));
    calls.push([start, end]);
    return page.renderQuestionBody({ annotations: [] }, q, { start, end });
  });
  const expected = questionParts(q).map(part => [part.start, part.end]);
  if (q.text.slice(0, q.questionParts.introductionEnd).trim()) expected.unshift([0, q.questionParts.introductionEnd]);
  assert.deepEqual(calls, expected);
  const fields = box.children.filter(element => element.tag === 'fieldset');
  assert.equal(fields[0].children[2].value, 'D');
  assert.equal(fields[2].children[2].value, 'C\n依据');
  assert(fields.every(field => typeof field.children[1].innerHTML === 'string'));
  assert.equal(fields.reduce((n, field) => n + (field.children[1].innerHTML.match(/class="question-source-dot"/g) || []).length, 0), 5);
  assert.equal(input.value, answer);
  input._unmountQuestionParts();
  assert.equal(input.value, answer);
});

test('2014 original question 5 retains four dotted groups and excludes the comma from its five ranges', () => {
  const q = find('2014-yuyanjichu', 4), before = JSON.stringify(q);
  const entry = findQuestionSourceMarks(q.text), html = page.renderQuestionBody({ annotations: [] }, q);
  assert.equal(QUESTION_SOURCE_MARKS.length, 1);
  assert.equal(findQuestionBlanks(q.text), null);
  assert.equal(countBlanks(html), 0);
  assert.equal((html.match(/class="question-source-dot"/g) || []).length, 5);
  assert.deepEqual(entry.ranges.map(({ start, end }) => q.text.slice(start, end)), ['按下葫芦起了瓢','一家人不说两家话','兵马未动','粮草先行','君子之交淡如水']);
  assert.deepEqual([...new Set(entry.ranges.map(r => r.group))], ['A','B','C','D']);
  assert.equal(entry.ranges.reduce((n, r) => n + r.end - r.start, 0), 30);
  assert.match(html, /data-source-mark-group="C">兵马未动<\/span>，<span class="question-source-dot" data-source-mark-group="C">粮草先行<\/span>/);
  assert.equal(JSON.stringify(q), before);
  assert.equal(findQuestionSourceMarks(q.text + ' changed'), null);
  assert.equal((renderQuestionBlanks(q.text + ' changed').match(/question-source-dot/g) || []).length, 0);
});

test('source mark definitions require exact source, publisher evidence and ordered Chinese-only dot spans', () => {
  assert.equal(sourceMarks.sourceQuestions[0].provenance.sourceSha256, '7bba52b77674769eb2dd1a8dda2d5326103b84ac761927f4f8f574d3194340c0');
  assert.equal(sourceMarks.sourceQuestions[0].provenance.sourceUrl, 'https://img.eol.cn/html/g/2014gkst/bj/yw2.jpg');
  assert.equal(validateQuestionSourceMarks(published, sourceMarks).length, 1);
  const cases = [
    [d => { d.sourceQuestions[0].sha256 = '0'.repeat(64); }, /source hash/],
    [d => { d.sourceQuestions[0].text = 'duplicate editable stem'; }, /source fields/],
    [d => { delete d.sourceQuestions[0].provenance.sourceSha256; }, /provenance/],
    [d => { d.sourceQuestions[0].provenance.qualification = 'official-original'; }, /provenance/],
    [d => { d.sourceQuestions[0].provenance.sourceUrl = 'javascript:alert(1)'; }, /provenance/],
    [d => { d.sourceQuestions[0].ranges[1].start = 192; }, /range bounds/],
    [d => { d.sourceQuestions[0].ranges[2].end = 318; }, /range content/],
    [d => { d.sourceQuestions[0].ranges[0].type = 'blank'; }, /range content/],
    [d => { d.sourceQuestions.push(structuredClone(d.sourceQuestions[0])); }, /identity/],
  ];
  for (const [change, expected] of cases) {
    const bad = structuredClone(sourceMarks); change(bad);
    assert.throws(() => validateQuestionSourceMarks(published, bad), expected);
  }
  const drift = structuredClone(published);
  drift.find(r => r.id === '2014-yuyanjichu').questions.find(q => q.qIndex === 4).text += ' drift';
  assert.throws(() => validateQuestionSourceMarks(drift, sourceMarks), /source hash/);
});

test('source dots preserve absolute callback annotations and grouped-question boundaries', () => {
  const q = find('2014-yuyanjichu', 4), entry = findQuestionSourceMarks(q.text);
  const rec = { annotations: [{ material: 'question4', qIndex: 4, start: 191, end: 198, type: 'underline' }] };
  const html = page.renderQuestionBody(rec, q, { start: 152, end: 438 });
  assert.equal((html.match(/class="question-source-dot"/g) || []).length, 5);
  assert.match(html, /data-source-mark-group="A"><span class="anno anno-underline active"[^>]*>按下葫芦起了瓢<\/span><\/span>/);
  const calls = [];
  const partial = renderQuestionBlanks(q.text, (text, start, end) => { calls.push([start, end]); assert.equal(text, q.text.slice(start, end)); return text; }, { start: 193, end: 196 });
  assert.deepEqual(calls, [[193, 196]]);
  assert(partial.includes('>葫芦起</span>'));
  const parts = [{ start: 0, end: q.questionParts.introductionEnd }, ...questionParts(q)];
  assert.equal(parts.reduce((n, range) => n + (page.renderQuestionBody(rec, q, range).match(/class="question-source-dot"/g) || []).length, 0), entry.ranges.length);
});

test('display metadata preserves canonical publication, catalog and all retained question/answer fields', () => {
  const before = JSON.stringify(published);
  buildQuestionBlanksModule(published, definition, sourceMarks);
  assert.equal(JSON.stringify(published), before);
  const digest = value => createHash('sha256').update(value).digest('hex');
  const content = buildContentCatalog(published);
  assert.equal(digest(content.get('data/all.json')), '7aeb9f57cbcb52178a2709d49e17c0afa9db6acb6ef94253f6f04a77c78284b3');
  assert.equal(digest(content.get('data/catalog.json')), '9cc4a27911b45b9385c8cdfa8ea35545425c42ac9d9e06f366660e015d4bae32');
});
