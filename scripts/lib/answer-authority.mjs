import { createHash } from 'node:crypto';

export function questionDigest(record, question) {
  // The passage and complete stem bind the decision, including option order.
  return createHash('sha256').update(JSON.stringify({
    recordId: record.id, qIndex: question.qIndex,
    materials: record.materials, topic: record.topic, question: question.text,
  })).digest('hex');
}

export function questionIndex(records) {
  const index = new Map();
  for (const record of records) for (const question of record.questions || []) {
    const key = `${record.id}:${question.qIndex}`;
    if (index.has(key)) throw Error(`Duplicate question: ${key}`);
    index.set(key, { record, question, digest: questionDigest(record, question) });
  }
  return index;
}

export function validateAuthority(records, authority, { requireComplete = false } = {}) {
  if (authority.schemaVersion !== 1 || !authority.revision || !Array.isArray(authority.questions))
    throw Error('Invalid answer authority schema');
  const index = questionIndex(records), seen = new Set();
  for (const review of authority.questions) {
    const source = index.get(review.id);
    if (!source || seen.has(review.id)) throw Error(`Unknown or repeated review: ${review.id}`);
    seen.add(review.id);
    if (source.digest !== review.inputSha256) throw Error(`Question changed: ${review.id}`);
    if (!['draft', 'reviewed', 'disputed'].includes(review.status)) throw Error(`Invalid review status: ${review.id}`);
    if (!Array.isArray(review.sources) || !review.sources.length) throw Error(`Missing source: ${review.id}`);
    if (!review.explanation?.trim() || !review.reviewedBy?.trim()) throw Error(`Missing review: ${review.id}`);
    if (!['single_choice', 'multiple_choice', 'open'].includes(review.kind)) throw Error(`Invalid question kind: ${review.id}`);
    const options = review.correctOptions || [];
    if (new Set(options).size !== options.length || options.some(x => !/^[A-F]$/.test(x)))
      throw Error(`Invalid option set: ${review.id}`);
    if (review.status === 'reviewed' && ((review.kind === 'single_choice' && options.length !== 1)
      || (review.kind === 'multiple_choice' && options.length < 2))) throw Error(`Truncated choice key: ${review.id}`);
    if (review.status === 'disputed' && options.length) throw Error(`Dispute cannot carry a grading key: ${review.id}`);
    if (review.scoringPolicy && (review.kind !== 'multiple_choice' || review.scoringPolicy.kind !== 'exact_set'
      || review.scoringPolicy.basis !== 'practice')) throw Error(`Unsupported scoring policy: ${review.id}`);
    for (const [version, model] of Object.entries(review.modelAnswers || {})) {
      if (!model.modelId?.trim() || !model.label?.trim() || !model.text?.trim()
        || !Number.isFinite(Date.parse(model.generatedAt)) || model.inputSha256 !== review.inputSha256
        || !['codex_turn', 'cli_response'].includes(model.provenance?.kind) || !model.provenance?.evidence?.trim())
        throw Error(`Unproven model result: ${review.id}/${version}`);
      if (model.provenance.kind === 'cli_response' && model.provenance.responseModel !== model.modelId)
        throw Error(`Response model mismatch: ${review.id}/${version}`);
    }
    if (review.status === 'reviewed' && !review.modelAnswers?.[review.currentVersion])
      throw Error(`Current model answer missing: ${review.id}`);
  }
  if (requireComplete) {
    if (seen.size !== index.size) throw Error(`Incomplete review: ${seen.size}/${index.size}`);
    if(authority.releaseBlockers?.some(x=>x.status!=='resolved'))throw Error('Unresolved source or evidence blockers');
    for (const review of authority.questions) {
      const models = Object.values(review.modelAnswers || {});
      if (review.status === 'draft' || !models.some(x => x.modelId === 'gpt-6-astra')
        || !models.some(x => x.provenance.kind === 'cli_response' && x.modelId.startsWith('claude-')))
        throw Error(`Incomplete dual-model review: ${review.id}`);
    }
  }
  return { questions: index.size, reviewed: authority.questions.filter(q => q.status === 'reviewed').length,
    disputed: authority.questions.filter(q => q.status === 'disputed').length,
    draft: authority.questions.filter(q => q.status === 'draft').length };
}

export function projectAuthority(records, authority) {
  validateAuthority(records, authority);
  const output = structuredClone(records), index = questionIndex(output);
  for (const review of authority.questions) {
    if (review.status === 'draft') continue;
    const { record, question } = index.get(review.id), key = String(question.qIndex);
    record.answer_reviews ||= {};
    record.answer_reviews[key] = { revision: authority.revision, status: review.status,
      kind: review.kind, correctOptions: review.correctOptions, explanation: review.explanation,
      sources: review.sources, currentVersion: review.currentVersion, reviewedAt: review.reviewedAt,
      inputSha256: review.inputSha256, modelVersions: Object.keys(review.modelAnswers || {}),
      assessments: Object.fromEntries(Object.entries(review.modelAnswers || {}).filter(([,m])=>m.assessment).map(([v,m])=>[v,m.assessment])),
      ...(review.scoringPolicy ? {scoringPolicy:review.scoringPolicy} : {}) };
    record.ai_answer_versions ||= {};
    for (const [version, model] of Object.entries(review.modelAnswers || {})) {
      const slot = record.ai_answer_versions[version] ||= { label: model.label, model: model.modelId, answers: {}, provenance: {} };
      if (slot.model !== model.modelId) throw Error(`Model version collision: ${version}`);
      slot.answers[key] = model.text;
      slot.provenance ||= {};
      slot.provenance[key] = { ...model.provenance, label:model.label, generatedAt: model.generatedAt, inputSha256: model.inputSha256 };
    }
    // Original model slots remain intact; only the current per-question view advances.
    record.ai_answers[key] = review.status === 'disputed'
      ? `答案待核查，暂停确定判分。\n${review.explanation}`
      : review.modelAnswers[review.currentVersion].text;
  }
  return output;
}
