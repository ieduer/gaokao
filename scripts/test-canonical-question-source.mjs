import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanonicalQuestionSource, hydrateCanonicalProjection, loadCanonicalQuestions, CANONICAL_CONTENT_VERSION,
  CANONICAL_CONTENT_VERSIONS, CANONICAL_CATALOG_SHA256, renderQuestionBlanks } from '../assets/js/canonical-question-source.js';
import { projectScopedAnswers } from './lib/answer-release-scope.mjs';
import { buildContentCatalog, versionedCatalogPath, readPublishedArchive, archivedVersionFiles } from './lib/content-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const records = projectScopedAnswers(read('data/all.json'), read('data/answer-authority.json'),
  read('data/answer-release-scope.json'), read('data/answer-release-preserved.json'));
// What Pages publishes: the current build plus the archived earlier versions (data/published-archive).
const currentFiles = buildContentCatalog(records);
const files = new Map([...currentFiles, ...archivedVersionFiles(currentFiles,
  readPublishedArchive(resolve(root, 'data/published-archive')), CANONICAL_CONTENT_VERSIONS)]);
const CURRENT_VERSION = JSON.parse(currentFiles.get('data/catalog.json')).contentVersion;
// A version's catalog and its exact corpus, as a deployment that only served that version would publish them.
function versionFiles(contentVersion) {
  const catalogText = files.get(versionedCatalogPath(contentVersion)), catalog = JSON.parse(catalogText);
  const loaded = catalog.parts.map(part => JSON.parse(files.get(part.path))), cursor = loaded.map(() => 0);
  const corpus = JSON.stringify(catalog.records.map(entry => loaded[entry.part][cursor[entry.part]++]), null, 2) + '\n';
  assert.equal(`sha256:${createHash('sha256').update(corpus).digest('hex')}`, contentVersion);
  return new Map([...files, ['data/catalog.json', catalogText], ['data/all.json', corpus]]);
}
const defaultFiles = versionFiles(CANONICAL_CONTENT_VERSION);
const isCatalog = path => path.startsWith('data/catalogs/');
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
  const { load, calls } = transport((path, body) => isCatalog(path)
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
    if (!isCatalog(path)) return body;
    const catalog = JSON.parse(body);
    catalog.records.find(record => record.id === '2012-yuyanjichu').id = 'forged';
    return JSON.stringify(catalog);
  });
  await assert.rejects(load(['forged:4']), /目录完整性/);
});

test('catalog cannot replace part hashes while keeping its claimed contentVersion', async () => {
  const { load, calls } = transport((path, body) => {
    if (!isCatalog(path)) return body;
    const catalog = JSON.parse(body);
    catalog.parts[0].sha256 = '0'.repeat(64);
    assert.equal(catalog.contentVersion, CANONICAL_CONTENT_VERSION);
    return JSON.stringify(catalog);
  });
  await assert.rejects(load(['2012-yuyanjichu:4']), /目录完整性/);
  assert.equal(calls.length, 1);
});

// A second content version exists only in this test: one changed question in 2012.
const sha = text => createHash('sha256').update(text).digest('hex');
const CHANGED = '2012-yuyanjichu:4', MARK = '（第二内容版本）';
const changedRecords = structuredClone(records);
changedRecords.find(record => record.id === '2012-yuyanjichu').questions.find(question => question.qIndex === 4).text += MARK;
const filesB = buildContentCatalog(changedRecords), catalogB = JSON.parse(filesB.get('data/catalog.json'));
const VERSION_B = catalogB.contentVersion, CATALOG_B_SHA256 = sha(filesB.get('data/catalog.json'));
// What a deployment that still serves version A next to current version B publishes.
const servedBoth = new Map([...files, ...filesB]);
servedBoth.delete('data/catalog.json');
function server(served) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(new URL(url).pathname.slice(1));
    assert.equal(options.credentials, 'omit');
    const body = served.get(new URL(url).pathname.slice(1));
    return new Response(body === undefined ? 'missing' : body, { status: body === undefined ? 404 : 200 });
  };
  return { fetchImpl, calls };
}
// The real client with extra pinned versions; its internal reviewedFields is exported for building
// consistent synthetic caches. Written to a temporary directory, never published.
const fixtureDir = mkdtempSync(join(tmpdir(), 'gk-canonical-client-'));
after(() => rmSync(fixtureDir, { recursive: true, force: true }));
const clientSource = readFileSync(resolve(root, 'assets/js/canonical-question-source.js'), 'utf8');
let fixtures = 0;
async function clientWith(versions, fetchImpl) {
  const open = 'export const CANONICAL_CONTENT_VERSIONS = Object.freeze({\n', blanks = "from './question-blanks.js'";
  assert.ok(clientSource.includes(open) && clientSource.includes(blanks));
  const text = clientSource.replace(open, open + Object.entries(versions).map(([version, catalog]) => `  '${version}': '${catalog}',\n`).join(''))
    .replace(blanks, `from '${pathToFileURL(resolve(root, 'assets/js/question-blanks.js')).href}'`) + '\nexport { reviewedFields };\n';
  const file = join(fixtureDir, `client-${++fixtures}.mjs`);
  writeFileSync(file, text);
  // Loaders made inside the module (default and per-version) use the global fetch of their creation time.
  globalThis.fetch = fetchImpl;
  return import(pathToFileURL(file).href);
}
const realFetch = globalThis.fetch;
after(() => { globalThis.fetch = realFetch; });
function cachePayload(served, ids, reviewedFields) {
  const catalog = JSON.parse(served.get('data/catalog.json')), byId = new Map(JSON.parse(served.get('data/all.json')).map(record => [record.id, record]));
  const years = [];
  for (const id of ids) {
    const at = id.lastIndexOf(':'), record = byId.get(id.slice(0, at)), question = record.questions.find(item => item.qIndex === Number(id.slice(at + 1)));
    let out = years.find(item => item.id === record.id);
    if (!out) years.push(out = { id: record.id, year: record.year, topic: record.topic, annotation: record.annotation || '',
      materials: record.materials, annotations: record.annotations || [], questions: [] });
    out.questions.push({ canonicalQuestionId: id, qIndex: question.qIndex, sourceIdentity: question.sourceIdentity,
      score: question.score ?? null, ...reviewedFields(record, question) });
  }
  return JSON.parse(JSON.stringify({ answerAuthority: { sha256: catalog.contentVersion.slice(7), totalQuestions: ids.length }, years }));
}
const IDS = ['2012-yuyanjichu:3', CHANGED, '2012-shici:1', '2024-sanwen:2'];

test('default callers keep the pinned default version, its catalog SHA-256 and the frozen version map', () => {
  assert.equal(CANONICAL_CONTENT_VERSION, 'sha256:7aeb9f57cbcb52178a2709d49e17c0afa9db6acb6ef94253f6f04a77c78284b3');
  assert.equal(CANONICAL_CATALOG_SHA256, '9cc4a27911b45b9385c8cdfa8ea35545425c42ac9d9e06f366660e015d4bae32');
  assert.deepEqual({ ...CANONICAL_CONTENT_VERSIONS }, { [CANONICAL_CONTENT_VERSION]: CANONICAL_CATALOG_SHA256,
    'sha256:efa9b0b3bbe5d7ae2bbdc45d1281a9f7f8e27bbe132dd2c21749466bdd07a2f5': '18582637a04befbc81adcf497479f1bda58eb686cfebbcba13436df04686f018',
    'sha256:6cbd3661c9fc15cdd9963e4679ae0535a9f700a14369c6feac86a43520a975ff': '79a1e39c8c77e04f27654cde4feffc4bbc9c0312d2e9d260bff86a9b4e27bffe' });
  assert.ok(Object.isFrozen(CANONICAL_CONTENT_VERSIONS));
  // The current build is the newest pinned version; the default stays the earliest one for unversioned callers.
  assert.equal(CURRENT_VERSION, 'sha256:6cbd3661c9fc15cdd9963e4679ae0535a9f700a14369c6feac86a43520a975ff');
  assert.equal(sha(files.get(versionedCatalogPath(CURRENT_VERSION))), CANONICAL_CONTENT_VERSIONS[CURRENT_VERSION]);
  assert.equal(sha(files.get(versionedCatalogPath(CANONICAL_CONTENT_VERSION))), CANONICAL_CATALOG_SHA256);
});

test('the catalog is read from its versioned immutable path, never from data/catalog.json', async () => {
  const served = new Map(files);
  served.delete('data/catalog.json');
  const { fetchImpl, calls } = server(served);
  const loaded = await createCanonicalQuestionSource({ fetchImpl })([CHANGED]);
  assert.equal(loaded.get(CHANGED).contentVersion, CANONICAL_CONTENT_VERSION);
  assert.deepEqual(calls, [`data/catalogs/${CANONICAL_CONTENT_VERSION.slice(7)}.json`,
    JSON.parse(files.get(versionedCatalogPath(CANONICAL_CONTENT_VERSION))).parts.find(part => part.year === 2012).path]);
  const unversioned = server(new Map([...files].filter(([path]) => !isCatalog(path))));
  await assert.rejects(createCanonicalQuestionSource({ fetchImpl: unversioned.fetchImpl })([CHANGED]), /读取失败：404/);
});

test('callers that name no version read exactly what an explicit default-version source reads', async () => {
  const { fetchImpl, calls } = server(servedBoth);
  const client = await clientWith({}, fetchImpl);
  assert.equal(client.CANONICAL_CONTENT_VERSION, CANONICAL_CONTENT_VERSION);
  const unnamed = await client.loadCanonicalQuestions(IDS), named = await createCanonicalQuestionSource({ fetchImpl, contentVersion: CANONICAL_CONTENT_VERSION })(IDS);
  assert.deepEqual(unnamed, named);
  assert.ok([...unnamed.values()].every(item => item.contentVersion === CANONICAL_CONTENT_VERSION));
  assert.ok(!unnamed.get(CHANGED).question.text.endsWith(MARK));
  assert.deepEqual(await client.loadCanonicalQuestions(IDS, {}), unnamed);
  assert.ok(!calls.includes('data/catalog.json'));
});

test('two pinned versions load side by side, each from its own catalog and parts, with one cached source per version', async () => {
  const { fetchImpl, calls } = server(servedBoth);
  const client = await clientWith({ [VERSION_B]: CATALOG_B_SHA256 }, fetchImpl);
  const a = await client.loadCanonicalQuestions(IDS), b = await client.loadCanonicalQuestions(IDS, { contentVersion: VERSION_B });
  assert.ok([...a.values()].every(item => item.contentVersion === CANONICAL_CONTENT_VERSION));
  assert.ok([...b.values()].every(item => item.contentVersion === VERSION_B));
  assert.ok(!a.get(CHANGED).question.text.endsWith(MARK));
  assert.equal(b.get(CHANGED).question.text, `${a.get(CHANGED).question.text}${MARK}`);
  assert.deepEqual(b.get('2024-sanwen:2').question, a.get('2024-sanwen:2').question);
  const fetched = calls.length;
  await client.loadCanonicalQuestions([CHANGED]);
  await client.loadCanonicalQuestions([CHANGED], { contentVersion: VERSION_B });
  assert.equal(calls.length, fetched, 'each version keeps its cached catalog and parts');
  assert.equal(calls.filter(path => path === versionedCatalogPath(CANONICAL_CONTENT_VERSION)).length, 1);
  assert.equal(calls.filter(path => path === versionedCatalogPath(VERSION_B)).length, 1);
  const part2012 = catalog => JSON.parse(catalog).parts.find(part => part.year === 2012).path;
  assert.notEqual(part2012(files.get('data/catalog.json')), part2012(filesB.get('data/catalog.json')));
  assert.ok(calls.includes(part2012(files.get('data/catalog.json'))) && calls.includes(part2012(filesB.get('data/catalog.json'))));
  const explicit = await client.createCanonicalQuestionSource({ fetchImpl, contentVersion: VERSION_B })(IDS);
  assert.deepEqual(explicit, b);
});

test('an unpublished version is refused before any read, with no fallback to another version', async () => {
  const { fetchImpl, calls } = server(servedBoth);
  assert.throws(() => createCanonicalQuestionSource({ fetchImpl, contentVersion: VERSION_B }), /统一题库没有发布此版本/);
  for (const contentVersion of [VERSION_B, 'latest', CANONICAL_CONTENT_VERSION.slice(7), null])
    await assert.rejects(loadCanonicalQuestions([CHANGED], { contentVersion, fetchImpl }), /统一题库没有发布此版本/);
  await assert.rejects(loadCanonicalQuestions([CHANGED], { contentVersion: VERSION_B }), /统一题库没有发布此版本/);
  assert.equal(calls.length, 0);
  // A pinned version whose catalog bytes differ from its pin is refused, not replaced by the default.
  const forged = server(new Map([...servedBoth, [versionedCatalogPath(VERSION_B), files.get('data/catalog.json')]]));
  const client = await clientWith({ [VERSION_B]: CATALOG_B_SHA256 }, forged.fetchImpl);
  await assert.rejects(client.loadCanonicalQuestions([CHANGED], { contentVersion: VERSION_B }), /目录完整性/);
});

test('hydration reads the version the cache binds and refuses one that is not published', async () => {
  const { fetchImpl, calls } = server(servedBoth);
  const client = await clientWith({ [VERSION_B]: CATALOG_B_SHA256 }, fetchImpl);
  const payloadA = cachePayload(defaultFiles, IDS, client.reviewedFields), payloadB = cachePayload(filesB, IDS, client.reviewedFields);
  assert.equal(payloadB.answerAuthority.sha256, VERSION_B.slice(7));
  const hydratedA = await client.hydrateCanonicalProjection(payloadA, { site: 'gwyw' });
  const hydratedB = await client.hydrateCanonicalProjection(payloadB, { site: 'gwyw' });
  assert.deepEqual(JSON.parse(JSON.stringify(hydratedA)), payloadA);
  assert.deepEqual(JSON.parse(JSON.stringify(hydratedB)), payloadB);
  const stem = payload => payload.years.flatMap(record => record.questions).find(question => question.canonicalQuestionId === CHANGED).stem;
  assert.ok(stem(hydratedB).endsWith(MARK) && !stem(hydratedA).endsWith(MARK));
  assert.ok(calls.includes(versionedCatalogPath(CANONICAL_CONTENT_VERSION)) && calls.includes(versionedCatalogPath(VERSION_B)));
  const seen = [];
  await client.hydrateCanonicalProjection(payloadB, { site: 'gwyw', loadQuestions: (ids, options) => { seen.push(options); return client.loadCanonicalQuestions(ids, options); } });
  assert.deepEqual(seen, [{ contentVersion: VERSION_B }]);
  // A cache bound to A whose content is B's is not silently compared with B.
  const mislabeled = structuredClone(payloadB);
  mislabeled.answerAuthority.sha256 = CANONICAL_CONTENT_VERSION.slice(7);
  await assert.rejects(client.hydrateCanonicalProjection(mislabeled, { site: 'gwyw' }), /stem/);
  // A loader that answers with another version is refused.
  await assert.rejects(client.hydrateCanonicalProjection(payloadB, { site: 'gwyw', loadQuestions: ids => client.loadCanonicalQuestions(ids) }), /题目版本缺失/);
  for (const sha256 of ['0'.repeat(64), undefined, `sha256:${VERSION_B.slice(7)}`]) {
    const unbound = structuredClone(payloadB);
    unbound.answerAuthority.sha256 = sha256;
    await assert.rejects(client.hydrateCanonicalProjection(unbound, { site: 'gwyw' }), /绑定统一来源/);
  }
  // The published client (it does not pin B) refuses a cache bound to B before any read.
  const published = server(servedBoth);
  await assert.rejects(hydrateCanonicalProjection(payloadB, { site: 'gwyw', loadQuestions: createCanonicalQuestionSource({ fetchImpl: published.fetchImpl }) }), /绑定统一来源/);
  assert.equal(published.calls.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(await hydrateCanonicalProjection(payloadA, { site: 'gwyw',
    loadQuestions: createCanonicalQuestionSource({ fetchImpl: published.fetchImpl }) }))), payloadA);
});

// 2026-11-14: the current version restores the original exam text of 27 teaching revisions and withdraws
// 2014-moxie (not a question from the 2014 paper). The earlier default version stays served unchanged.
const RESTORED = ['2016-feilian:3', '2015-feilian:4', '2004-feilian:3', '2003-feilian:3', '2014-guangfu:2', '2024-guwen:2',
  '2022-guwen:2', '2008-guwen:3', '2007-guwen:4', '2007-guwen:5', '2005-guwen:2', '2003-guwen:3', '2003-guwen:5', '2002-guwen:5',
  '2025-guwen:3', '2025-shici:1', '2025-yuyanjichu:1', '2013-yuyanjichu:5', '2007-yuyanjichu:4', '2006-yuyanjichu:4',
  '2005-yuyanjichu:1', '2005-yuyanjichu:4', '2005-yuyanjichu:5', '2004-yuyanjichu:5', '2003-yuyanjichu:5', '2002-yuyanjichu:4', '2004-sanwen:1'];
const WITHDRAWN = '2014-moxie:1', BANNER = '【教学修订版';
const currentServed = versionFiles(CURRENT_VERSION);
// The 2026-11-14 original-text version, archived since 2026-11-22 and still bound by the gwyw, yyjc, gksw and shi caches.
const ORIGINAL_VERSION = 'sha256:efa9b0b3bbe5d7ae2bbdc45d1281a9f7f8e27bbe132dd2c21749466bdd07a2f5';
const originalServed = versionFiles(ORIGINAL_VERSION);
const corpusIds = served => JSON.parse(served.get('data/all.json')).flatMap(record => record.questions.map(question => `${record.id}:${question.qIndex}`));
// Everything a consumer reads for one question.
function questionView({ record, question }) {
  const key = String(question.qIndex);
  return { question, materials: record.materials, topic: record.topic, annotation: record.annotation ?? null,
    annotations: (record.annotations || []).filter(mark => mark.qIndex === question.qIndex), review: record.answer_reviews?.[key] ?? null,
    answer: record.ai_answers?.[key] ?? null, history: record.answer_review_history?.[key] ?? null,
    versions: Object.fromEntries(Object.entries(record.ai_answer_versions || {}).filter(([, slot]) => slot.answers?.[key] !== undefined)
      .map(([version, slot]) => [version, { label: slot.label, model: slot.model, text: slot.answers[key],
        provenance: slot.provenance?.[key] ?? null, visual: slot.visualEvidence?.[key] ?? null }])) };
}

test('the restored version has no teaching-revision stem and differs from the default version only in the 27 restored questions', async () => {
  const { fetchImpl } = server(files);
  const oldIds = corpusIds(defaultFiles), newIds = corpusIds(originalServed);
  assert.deepEqual(oldIds.filter(id => id !== WITHDRAWN), newIds);
  assert.ok(oldIds.includes(WITHDRAWN) && !newIds.includes(WITHDRAWN));
  const before = await createCanonicalQuestionSource({ fetchImpl })(oldIds);
  const after = await createCanonicalQuestionSource({ fetchImpl, contentVersion: ORIGINAL_VERSION })(newIds);
  assert.ok([...after.values()].every(item => item.contentVersion === ORIGINAL_VERSION));
  assert.deepEqual(oldIds.filter(id => before.get(id).question.text.includes(BANNER)).sort(), [...RESTORED].sort());
  // The earlier version publishes the preserved 7ce7271 copy of the historical supplement, which is not a 2014 paper question.
  assert.match(before.get(WITHDRAWN).question.text, /^三、本大题共1小题，共11分。\n14．在横线处填写作品原句。（共8分）\n（1）《滕王阁序》/);
  assert.deepEqual(newIds.filter(id => after.get(id).question.text.includes(BANNER)), []);
  assert.deepEqual(newIds.filter(id => JSON.stringify(questionView(before.get(id))) !== JSON.stringify(questionView(after.get(id)))).sort(),
    [...RESTORED].sort());
  const touched = new Set([...RESTORED, WITHDRAWN].map(id => id.slice(0, id.lastIndexOf(':'))));
  for (const id of newIds) if (!touched.has(after.get(id).record.id)) assert.deepEqual(after.get(id).record, before.get(id).record, id);
  for (const id of RESTORED) {
    const old = before.get(id), now = after.get(id), key = String(now.question.qIndex);
    assert.equal(now.question.score, old.question.score, `${id} score`);
    assert.equal(now.question.id, old.question.id);
    assert.equal(now.record.answer_reviews[key].status, 'reviewed');
    assert.ok(now.record.answer_review_history[key].some(entry => entry.source.questions[0].text === old.question.text), `${id} teaching stem kept in history`);
    assert.ok(Object.values(now.record.ai_answer_versions).some(slot => slot.label.endsWith('（旧题面）')
      && slot.answers[key] === old.record.ai_answers[key]), `${id} teaching answer kept as （旧题面）`);
  }
});

// 2026-11-22: the current version differs from the original-text version only in 2022-feilian:3, whose option A
// regains its label dot (option C loses a stray space). The reviewed answer D and both model answers are kept.
const TRANSCRIBED = '2022-feilian:3';
test('the current version differs from the original-text version only in the transcription of 2022-feilian:3', async () => {
  const { fetchImpl } = server(files);
  const ids = corpusIds(originalServed);
  assert.deepEqual(corpusIds(currentServed), ids);
  const before = await createCanonicalQuestionSource({ fetchImpl, contentVersion: ORIGINAL_VERSION })(ids);
  const after = await createCanonicalQuestionSource({ fetchImpl, contentVersion: CURRENT_VERSION })(ids);
  assert.ok([...after.values()].every(item => item.contentVersion === CURRENT_VERSION));
  assert.deepEqual(ids.filter(id => JSON.stringify(questionView(before.get(id))) !== JSON.stringify(questionView(after.get(id)))), [TRANSCRIBED]);
  for (const id of ids) if (after.get(id).record.id !== '2022-feilian') assert.deepEqual(after.get(id).record, before.get(id).record, id);
  const old = before.get(TRANSCRIBED), now = after.get(TRANSCRIBED), options = text => text.split('\n').slice(1).map(line => line.slice(0, 2));
  assert.deepEqual(options(old.question.text), ['A“', 'B.', 'C.', 'D.']);
  assert.deepEqual(options(now.question.text), ['A.', 'B.', 'C.', 'D.']);
  assert.equal(now.question.text, old.question.text.replace('\nA“苏子”', '\nA.“苏子”').replace('“OO” 。', '“OO”。'));
  assert.equal(now.question.score, old.question.score);
  assert.deepEqual(now.record.answer_reviews['3'].correctOptions ?? null, old.record.answer_reviews['3'].correctOptions ?? null);
  assert.equal(now.record.answer_reviews['3'].status, 'reviewed');
  assert.equal(now.record.ai_answers['3'], old.record.ai_answers['3']);
  assert.ok(now.record.answer_review_history['3'].some(entry => entry.source.questions[0].text === old.question.text), 'old transcription kept in history');
});

test('caches bound to the earlier version still hydrate; caches bound to the restored version hydrate against it', async () => {
  const { fetchImpl, calls } = server(files);
  const { reviewedFields } = await clientWith({}, fetchImpl);
  const loadQuestions = (ids, options) => loadCanonicalQuestions(ids, { ...options, fetchImpl });
  const ids = ['2016-feilian:3', '2024-guwen:2', '2003-yuyanjichu:5', '2004-sanwen:1', '2014-guangfu:2', '2012-yuyanjichu:4', '2012-shici:1'];
  const earlier = cachePayload(defaultFiles, ids, reviewedFields), restored = cachePayload(currentServed, ids, reviewedFields);
  assert.equal(earlier.answerAuthority.sha256, CANONICAL_CONTENT_VERSION.slice(7));
  assert.equal(restored.answerAuthority.sha256, CURRENT_VERSION.slice(7));
  for (const payload of [earlier, restored])
    assert.deepEqual(JSON.parse(JSON.stringify(await hydrateCanonicalProjection(payload, { site: 'gwyw', loadQuestions }))), payload);
  assert.ok(calls.includes(versionedCatalogPath(CANONICAL_CONTENT_VERSION)) && calls.includes(versionedCatalogPath(CURRENT_VERSION)));
  const stem = (payload, id) => payload.years.flatMap(record => record.questions).find(question => question.canonicalQuestionId === id).stem;
  assert.ok(stem(earlier, '2016-feilian:3').includes(BANNER) && !stem(restored, '2016-feilian:3').includes(BANNER));
  assert.equal(stem(earlier, '2012-yuyanjichu:4'), stem(restored, '2012-yuyanjichu:4'));
  for (const [payload, version] of [[restored, CANONICAL_CONTENT_VERSION], [earlier, CURRENT_VERSION]]) {
    const relabeled = structuredClone(payload);
    relabeled.answerAuthority.sha256 = version.slice(7);
    await assert.rejects(hydrateCanonicalProjection(relabeled, { site: 'gwyw', loadQuestions }), /题库版本不一致/);
  }
});

test('callers that name no version (gks) still read the earlier version exactly', async () => {
  const { fetchImpl } = server(files);
  const ids = corpusIds(defaultFiles), unnamed = await createCanonicalQuestionSource({ fetchImpl })(ids);
  const byId = new Map(JSON.parse(defaultFiles.get('data/all.json')).map(record => [record.id, record]));
  for (const id of ids) {
    const item = unnamed.get(id);
    assert.equal(item.contentVersion, CANONICAL_CONTENT_VERSION);
    assert.deepEqual(item.record, byId.get(item.record.id));
  }
  assert.ok(unnamed.get('2016-feilian:3').question.text.includes(BANNER) && unnamed.has(WITHDRAWN), 'the earlier version is served unchanged until gks moves');
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
