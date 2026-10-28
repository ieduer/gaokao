import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanonicalQuestionSource, hydrateCanonicalProjection, CANONICAL_CONTENT_VERSION,
  renderQuestionBlanks } from '../assets/js/canonical-question-source.js';
import { projectScopedAnswers } from './lib/answer-release-scope.mjs';
import { buildContentCatalog } from './lib/content-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const records = projectScopedAnswers(read('data/all.json'), read('data/answer-authority.json'),
  read('data/answer-release-scope.json'), read('data/answer-release-preserved.json'));
const files = buildContentCatalog(records);
function transport(edit = (_path, body) => body) {
  const calls = [];
  const load = createCanonicalQuestionSource({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname.slice(1), body = files.get(path);
    return new Response(body === undefined ? 'missing' : edit(path, body), { status: body === undefined ? 404 : 200 });
  } });
  return { load, calls };
}

test('one verified catalog and one year part serve repeated same-year questions', async () => {
  const { load, calls } = transport();
  const first = await load(['2012-yuyanjichu:3', '2012-yuyanjichu:4']);
  assert.equal(first.get('2012-yuyanjichu:4').contentVersion, CANONICAL_CONTENT_VERSION);
  assert.equal(first.get('2012-yuyanjichu:4').question.qIndex, 4);
  await load(['2012-shici:1']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.options.credentials === 'omit'));
  const html = renderQuestionBlanks(first.get('2012-yuyanjichu:4').question.text);
  assert.equal((html.match(/class="question-blank"/g) || []).length, 4);
});

test('catalog drift fails before any part and does not retry or fall back', async () => {
  const { load, calls } = transport((path, body) => path.endsWith('catalog.json')
    ? JSON.stringify({ ...JSON.parse(body), contentVersion: `sha256:${'0'.repeat(64)}` }) : body);
  await assert.rejects(load(['2012-yuyanjichu:4']), /目录完整性/);
  await assert.rejects(load(['2012-yuyanjichu:4']), /目录完整性/);
  assert.equal(calls.length, 1);
});

test('changed part bytes fail integrity without exposing a question', async () => {
  const { load, calls } = transport((path, body) => path.includes('/parts/') ? `${body} ` : body);
  await assert.rejects(load(['2012-yuyanjichu:4']), /完整性/);
  assert.equal(calls.length, 2);
});

test('unknown identities and invalid IDs fail without fetching unrelated parts', async () => {
  const { load, calls } = transport();
  await assert.rejects(load(['missing:1']), /没有题目/);
  assert.equal(calls.length, 1);
  await assert.rejects(load(['2012-yuyanjichu:0']), /身份无效/);
  assert.equal(calls.length, 1);
});

test('catalog cannot reassign part record identity', async () => {
  const { load } = transport((path, body) => {
    if (!path.endsWith('catalog.json')) return body;
    const catalog = JSON.parse(body);
    catalog.records.find(record => record.id === '2012-yuyanjichu').id = 'forged';
    return JSON.stringify(catalog);
  });
  await assert.rejects(load(['forged:4']), /目录完整性/);
});

test('catalog cannot replace part hashes while keeping its claimed contentVersion', async () => {
  const { load, calls } = transport((path, body) => {
    if (!path.endsWith('catalog.json')) return body;
    const catalog = JSON.parse(body);
    catalog.parts[0].sha256 = '0'.repeat(64);
    assert.equal(catalog.contentVersion, CANONICAL_CONTENT_VERSION);
    return JSON.stringify(catalog);
  });
  await assert.rejects(load(['2012-yuyanjichu:4']), /目录完整性/);
  assert.equal(calls.length, 1);
});

// Optional complete cross-consumer acceptance uses explicitly supplied checkouts;
// the canonical repository's standalone tests do not depend on sibling projects.
const consumers = process.env.CANONICAL_CONSUMER_ROOT;
function draftDocument() {
  class Element {
    constructor(tag, ownerDocument) {
      this.tagName = tag; this.ownerDocument = ownerDocument; this.children = [];
      this.style = {}; this.dataset = {}; this.listeners = new Map(); this.events = 0;
      this.innerHTML = ''; this.textContent = '';
    }
    append(...nodes) { this.children.push(...nodes); }
    before(node) { this.beforeNode = node; }
    remove() { this.removed = true; }
    setAttribute() {}
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    dispatchEvent(event) { this.events++; this.listeners.get(event.type)?.(event); return true; }
    focus() { this.focused = true; }
  }
  class TextArea extends Element {
    get value() { return this._value || ''; }
    set value(value) { this._value = String(value); }
  }
  const document = { defaultView: { HTMLTextAreaElement: TextArea, Event },
    createElement(tag) { return tag === 'textarea' ? new TextArea(tag, this) : new Element(tag, this); } };
  return document;
}
const descendants = (node, className) => [node, ...node.children.flatMap(child => descendants(child, className))]
  .filter(element => element.className === className);
const sites = [['yyjc', 'corpus', 'years', 100], ['flx', 'corpus', 'years', 106],
  ['gksw', 'zhenti', 'years', 105], ['shi', 'zhenti', 'items', 70], ['gwyw', 'zhenti', 'years', 135]];
for (const [site, file, array, count] of sites) {
  test(`${site}: generated cache equals canonical content and preserves every identity, score and history`, { skip: !consumers }, async () => {
    const payload = JSON.parse(readFileSync(resolve(consumers, site, 'public/data', `${file}.json`), 'utf8'));
    const before = JSON.stringify(payload), { load } = transport();
    const hydrated = await hydrateCanonicalProjection(payload, { site, loadQuestions: load });
    assert.equal(payload.answerAuthority.totalQuestions, count);
    assert.deepEqual(JSON.parse(JSON.stringify(hydrated)), payload);
    assert.equal(JSON.stringify(payload), before, 'input remains untouched');
    const presentation = await import(new URL(`file://${resolve(consumers, site, 'public/source-context.js')}?v=20261028-blank-lines`));
    presentation.installQuestionBlankRenderer(renderQuestionBlanks);
    for (const record of hydrated[array]) for (const question of record.questions || []) {
      if (!question.canonicalQuestionId) continue;
      assert.doesNotThrow(() => presentation.renderSourceQuestion(record, question));
    }
    const candidates = hydrated[array].flatMap(record => (record.questions || [])
      .filter(question => question.questionParts && question.canonicalQuestionId).map(question => ({ record, question })));
    const selected = candidates.find(({ question }) => question.canonicalQuestionId === '2006-sanwen:2') || candidates[0];
    assert.ok(selected, `${site} has a real multipart question`);
    const partsModule = await import(new URL(`file://${resolve(consumers, site, 'public/question-parts.js')}?v=20261028-blank-lines`));
    const document = draftDocument(), input = document.createElement('textarea');
    const initialParts = partsModule.questionParts(selected.question);
    input.value = partsModule.serializePartAnswers(selected.question, { [initialParts[0].id]: '已保存的作答' });
    const originalAnswer = input.value, originalFocus = input.focus;
    const renderPart = (_text, start, end) => presentation.renderSourceText(selected.record,
      { key: `question${selected.question.canonicalQIndex || selected.question.qIndex}`, text: selected.question.stem },
      selected.question.canonicalQIndex || selected.question.qIndex, { start, end });
    const box = partsModule.mountQuestionParts(input, selected.question, renderPart);
    const stems = descendants(box, 'part-stem'), answers = descendants(box, 'part-answer');
    assert.equal(stems.length, initialParts.length);
    assert.deepEqual(stems.map(stem => stem.innerHTML), initialParts.map(part => renderPart(part.text, part.start, part.end)));
    if (site === 'gksw') assert.equal((stems.map(stem => stem.innerHTML).join('').match(/class="question-blank"/g) || []).length, 2);
    assert.equal(input.value, originalAnswer);
    assert.equal(input.events, 0, 'mounting does not autosave or submit');
    assert.equal(answers[0].value, '已保存的作答');
    answers[0].value = '修改后的分项作答';
    answers[0].dispatchEvent(new Event('input'));
    assert.equal(input.events, 1, 'one edit has one existing draft event');
    assert.equal(partsModule.parsePartAnswers(selected.question, input.value)[initialParts[0].id], '修改后的分项作答');
    input.value = '旧整组作答完整保留';
    assert.equal(input.value, '旧整组作答完整保留');
    assert.equal(input.events, 1, 'restoration does not emit a new submission');
    input._unmountQuestionParts();
    assert.equal(input.focus, originalFocus);
    assert.equal(input.value, '旧整组作答完整保留');
    assert.equal(box.removed, true);
    if (site === 'yyjc') {
      const record = hydrated.years.find(record => record.id === '2012-yuyanjichu');
      const html = presentation.renderSourceQuestion(record, record.questions.find(question => question.qIndex === 4));
      assert.equal((html.match(/class="question-blank"/g) || []).length, 4);
      const wrongAlias = structuredClone(payload);
      const alias = wrongAlias.years.flatMap(record => record.questions).find(question => question.sourceIdentity);
      alias.sourceIdentity.canonicalId = '2012-yuyanjichu:4';
      await assert.rejects(hydrateCanonicalProjection(wrongAlias, { site, loadQuestions: load }), /来源别名/);
    }
    const changed = structuredClone(payload);
    const first = changed[array].flatMap(record => record.questions || []).find(question => question.canonicalQuestionId);
    first.stem += 'changed';
    await assert.rejects(hydrateCanonicalProjection(changed, { site, loadQuestions: load }), /stem/);
    assert.equal(JSON.stringify(payload), before);
    const newerAnswer = structuredClone(payload);
    const answer = newerAnswer[array].flatMap(record => record.questions || []).find(question => question.canonicalQuestionId);
    answer.modelAnswers[answer.answerReview.currentVersion].text += 'newer accepted answer';
    await assert.rejects(hydrateCanonicalProjection(newerAnswer, { site, loadQuestions: load }), /modelAnswers/);
    const wrongSource = structuredClone(payload);
    wrongSource.answerAuthority.sha256 = '0'.repeat(64);
    await assert.rejects(hydrateCanonicalProjection(wrongSource, { site, loadQuestions: load }), /绑定统一来源/);
  });
}
