import { renderQuestionBlanks } from './question-blanks.js';

export { renderQuestionBlanks };
export const CANONICAL_CONTENT_VERSION = 'sha256:7aeb9f57cbcb52178a2709d49e17c0afa9db6acb6ef94253f6f04a77c78284b3';
export const CANONICAL_CATALOG_SHA256 = '9cc4a27911b45b9385c8cdfa8ea35545425c42ac9d9e06f366660e015d4bae32';
export const CANONICAL_ORIGIN = 'https://gk.bdfz.net';
const PART_PATH = /^data\/parts\/\d+\.[a-f0-9]{16}\.json$/;
const clone = value => value === undefined ? undefined : structuredClone(value);
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const same = (actual, expected, label) => {
  if (stable(actual) !== stable(expected)) throw new Error(`题库版本不一致：${label}`);
};
async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// A client owns one immutable catalog snapshot. No retry or local-content fallback.
export function createCanonicalQuestionSource({ fetchImpl = globalThis.fetch, origin = CANONICAL_ORIGIN } = {}) {
  let catalogPromise;
  const parts = new Map();
  async function read(path) {
    const response = await fetchImpl(new URL(path, `${origin}/`).href, {
      cache: 'no-cache', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`统一题库读取失败：${response.status}`);
    return response.text();
  }
  function catalog() {
    return catalogPromise ||= (async () => {
      const text = await read('data/catalog.json');
      if (await sha256(text) !== CANONICAL_CATALOG_SHA256) throw new Error('统一题库目录完整性校验失败');
      const value = JSON.parse(text);
      if (value.schemaVersion !== 'gk-content-catalog-v1' || value.contentVersion !== CANONICAL_CONTENT_VERSION
          || !Array.isArray(value.records) || !Array.isArray(value.parts)
          || new Set(value.records.map(record => record.id)).size !== value.records.length
          || value.records.some(record => typeof record.id !== 'string' || !Number.isInteger(record.part)
            || value.parts[record.part]?.year !== record.year)) throw new Error('统一题库版本尚未匹配，请稍后刷新');
      return value;
    })();
  }
  async function loadPart(index, indexData) {
    if (!parts.has(index)) parts.set(index, (async () => {
      const part = indexData.parts[index];
      if (!part || !PART_PATH.test(part.path) || !/^[a-f0-9]{64}$/.test(part.sha256)
          || !part.path.includes(`/${part.year}.${part.sha256.slice(0, 16)}.`)) throw new Error('统一题库分片声明无效');
      const text = await read(part.path);
      if (new TextEncoder().encode(text).length !== part.bytes || await sha256(text) !== part.sha256)
        throw new Error('统一题库完整性校验失败');
      const records = JSON.parse(text), expectedIds = indexData.records.filter(row => row.part === index).map(row => row.id);
      if (!Array.isArray(records) || records.length !== part.records || records.some(record => record.year !== part.year))
        throw new Error('统一题库分片内容无效');
      same(records.map(record => record.id), expectedIds, '分片题目身份');
      return records;
    })());
    return parts.get(index);
  }
  return async function loadCanonicalQuestions(ids) {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !/^.+:[1-9]\d*$/.test(id)))
      throw new Error('统一题库题目身份无效');
    if (!ids.length) return new Map();
    const indexData = await catalog(), entries = new Map(indexData.records.map(record => [record.id, record]));
    const requested = [...new Set(ids)].map(id => {
      const at = id.lastIndexOf(':'), recordId = id.slice(0, at), qIndex = Number(id.slice(at + 1));
      const entry = entries.get(recordId);
      if (!entry) throw new Error(`统一题库没有题目：${id}`);
      return { id, recordId, qIndex, part: entry.part };
    });
    const needed = [...new Set(requested.map(question => question.part))];
    // Avoid opening every year's connection at once when a consumer validates its cache.
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, needed.length) }, async () => {
      while (cursor < needed.length) await loadPart(needed[cursor++], indexData);
    }));
    const result = new Map(), recordCopies = new Map();
    for (const item of requested) {
      const records = await loadPart(item.part, indexData), record = records.find(record => record.id === item.recordId);
      const matches = record?.questions?.filter(question => question.qIndex === item.qIndex) || [];
      if (matches.length !== 1) throw new Error(`统一题库题目索引不一致：${item.id}`);
      if (!recordCopies.has(record.id)) recordCopies.set(record.id, clone(record));
      const copiedRecord = recordCopies.get(record.id);
      result.set(item.id, { record: copiedRecord, question: copiedRecord.questions.find(question => question.qIndex === item.qIndex), contentVersion: indexData.contentVersion });
    }
    return result;
  };
}

const defaultLoader = createCanonicalQuestionSource();
export function loadCanonicalQuestions(ids, options) {
  return options ? createCanonicalQuestionSource(options)(ids) : defaultLoader(ids);
}

function reviewedFields(record, question) {
  const key = String(question.qIndex), review = record.answer_reviews?.[key];
  if (!review || !['reviewed', 'disputed'].includes(review.status) || !Array.isArray(review.modelVersions))
    throw new Error(`统一题库缺少已核答案：${record.id}:${key}`);
  const models = {};
  for (const version of review.modelVersions) {
    const slot = record.ai_answer_versions?.[version], provenance = slot?.provenance?.[key];
    if (!slot?.answers?.[key] || !provenance) throw new Error('统一题库模型来源不完整');
    models[version] = { modelId: slot.model, label: provenance.label || slot.label, text: slot.answers[key],
      generatedAt: provenance.generatedAt, provenance, assessment: review.assessments?.[version],
      ...(slot.visualEvidence?.[key] ? { visualEvidence: slot.visualEvidence[key] } : {}) };
  }
  const current = models[review.currentVersion];
  if (!current) throw new Error('统一题库当前答案缺失');
  return { stem: question.text, questionParts: question.questionParts,
    canonicalLegacyScore: question.score ?? null, canonicalInputSha256: review.inputSha256,
    canonicalInputContextSha256: review.inputContextSha256, canonicalInputPresentationSha256: review.inputPresentationSha256,
    answerReview: review, modelAnswers: models, answerSourceHistory: record.answer_review_history?.[key] || [],
    kind: review.kind === 'open' ? 'subjective' : review.kind, answer: review.correctOptions.join(''),
    correctOptions: review.correctOptions, selectionCount: review.correctOptions.length || undefined,
    aiAnswer: review.status === 'disputed' ? `答案待核查，暂停确定判分。\n${review.explanation || ''}` : current.text,
    reviewStatus: review.status === 'disputed' ? 'review_required' : 'reviewed', contentRevision: review.revision,
    practiceScoring: review.practiceScoring, scoringPolicy: review.scoringPolicy };
}

// Local corpora are immutable generated compatibility caches. Validate every current
// content field before hydration; local IDs, scores, categories and histories survive.
export async function hydrateCanonicalProjection(payload, { site, loadQuestions = loadCanonicalQuestions } = {}) {
  const shape = { yyjc: 'years', flx: 'years', gksw: 'years', gwyw: 'years', shi: 'items' }[site];
  if (!shape || !Array.isArray(payload?.[shape]) || payload.answerAuthority?.sha256 !== CANONICAL_CONTENT_VERSION.slice(7))
    throw new Error('本站题库缓存没有绑定统一来源');
  const targets = [];
  for (const record of payload[shape]) {
    if (site === 'shi' && record.examGroup !== '北京') continue;
    for (const question of record.questions || []) {
      if (!question.canonicalQuestionId) throw new Error('本站题目缺少统一来源身份');
      targets.push({ record, question });
    }
  }
  if (!targets.length || targets.length !== payload.answerAuthority.totalQuestions
      || new Set(targets.map(({ question }) => question.canonicalQuestionId)).size !== targets.length)
    throw new Error('本站统一题目覆盖不完整');
  const canonical = await loadQuestions(targets.map(({ question }) => question.canonicalQuestionId));
  const out = clone(payload), copies = new Map();
  for (const record of out[shape]) for (const question of record.questions || [])
    if (question.canonicalQuestionId) copies.set(question.canonicalQuestionId, { record, question });
  for (const { record, question } of targets) {
    const id = question.canonicalQuestionId, source = canonical.get(id);
    if (!source || source.contentVersion !== CANONICAL_CONTENT_VERSION) throw new Error(`统一题库题目版本缺失：${id}`);
    same(`${source.record.id}:${source.question.qIndex}`, id, `${id} 来源身份`);
    same(record.sourceRecordId || record.id, source.record.id, `${id} 记录映射`);
    same(record.year, source.record.year, `${id} 年份`);
    if (question.canonicalQIndex !== undefined) same(question.canonicalQIndex, source.question.qIndex, `${id} 原题号映射`);
    else same(question.qIndex, source.question.qIndex, `${id} 题号映射`);
    same(question.sourceIdentity, source.question.sourceIdentity, `${id} 来源别名`);
    if (question.practiceIdentity !== undefined)
      same(question.practiceIdentity, source.question.sourceIdentity?.canonicalId || id, `${id} 练习身份`);
    same(record.materials, source.record.materials, `${id} 材料`);
    same(record.topic, source.record.topic, `${id} 原题说明`);
    same(record.annotation || '', source.record.annotation || '', `${id} 注释`);
    same(site === 'shi' ? record.sourceAnnotations : record.annotations, source.record.annotations || [], `${id} 标记`);
    const current = reviewedFields(source.record, source.question);
    for (const [field, value] of Object.entries(current)) same(question[field], value, `${id} ${field}`);
    const copy = copies.get(id);
    for (const [field, value] of Object.entries(current)) {
      if (value === undefined) delete copy.question[field];
      else copy.question[field] = clone(value);
    }
    copy.record.materials = clone(source.record.materials);
    copy.record.topic = source.record.topic;
    copy.record.annotation = source.record.annotation || '';
    copy.record[site === 'shi' ? 'sourceAnnotations' : 'annotations'] = clone(source.record.annotations || []);
    // referenceAnswer/answerHistory may contain labeled legacy material. They do not
    // replace the verified current answerReview/modelAnswers and are not rewritten.
    same(copy.question.score, question.score, `${id} 既有分值`);
  }
  return out;
}

export function installCanonicalQuestionStyles(document) {
  if (document.getElementById('canonical-question-blank-style')) return;
  const style = document.createElement('style');
  style.id = 'canonical-question-blank-style';
  style.textContent = '.question-blank{display:inline-block;min-width:3em;max-width:100%;border-bottom:1px solid currentColor;text-align:center;line-height:1.25;white-space:nowrap}';
  document.head.append(style);
}
