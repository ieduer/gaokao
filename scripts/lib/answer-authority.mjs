import { createHash } from 'node:crypto';

export function questionDigest(record, question) {
  // The passage and complete stem bind the decision, including option order.
  return createHash('sha256').update(JSON.stringify({
    recordId: record.id, qIndex: question.qIndex,
    materials: record.materials, topic: record.topic, question: question.text,
  })).digest('hex');
}

export function questionContextDigest(record, question) {
  // v1 did not include record-level notes. Keep that identity hash for older
  // evidence, and require this complete context hash for a finished release.
  return createHash('sha256').update(JSON.stringify({
    recordId: record.id, qIndex: question.qIndex,
    materials: record.materials, topic: record.topic, annotation: record.annotation ?? null,
    question: question.text,
  })).digest('hex');
}

export function snapshotReview(record, question, review) {
  if (`${record.id}:${question.qIndex}` !== review.id || questionDigest(record, question) !== review.inputSha256)
    throw Error(`Cannot archive mismatched review: ${review.id}`);
  const archived = structuredClone(review);
  delete archived.history;
  return { source: structuredClone({ id: record.id, materials: record.materials,
    topic: record.topic, annotation: record.annotation ?? null, questions: [question] }), review: archived };
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
    const contextDigest = questionContextDigest(source.record, source.question);
    if (review.inputContextSha256 && review.inputContextSha256 !== contextDigest)
      throw Error(`Question context changed: ${review.id}`);
    const archivedContexts = new Set();
    for (const archived of review.history || []) {
      if (archived.review?.id !== review.id || archived.review?.history?.length || archived.source?.questions?.length !== 1)
        throw Error(`Invalid historical review: ${review.id}`);
      const oldContext = questionContextDigest(archived.source, archived.source.questions[0]);
      if (archivedContexts.has(oldContext) || oldContext === contextDigest)
        throw Error(`Repeated historical context: ${review.id}`);
      archivedContexts.add(oldContext);
      validateAuthority([archived.source], { schemaVersion: 1, revision: 'historical', questions: [archived.review] });
    }
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
      if (model.inputContextSha256 && !/^[a-f0-9]{64}$/.test(model.inputContextSha256))
        throw Error(`Invalid model context: ${review.id}/${version}`);
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
      const source = index.get(review.id), context = questionContextDigest(source.record, source.question);
      const completeModels = models.filter(x => x.inputContextSha256 === context);
      if (review.inputContextSha256 !== context
        || !completeModels.some(x => x.modelId === 'gpt-6-astra' && x.provenance.kind === 'codex_turn')
        || !completeModels.some(x => x.modelId.startsWith('claude-') && x.provenance.kind === 'cli_response')
        || review.modelAnswers[review.currentVersion]?.inputContextSha256 !== context)
        throw Error(`Incomplete full-context evidence: ${review.id}`);
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
      inputContextSha256: review.inputContextSha256 || null,
      assessments: Object.fromEntries(Object.entries(review.modelAnswers || {}).filter(([,m])=>m.assessment).map(([v,m])=>[v,m.assessment])),
      ...(review.scoringPolicy ? {scoringPolicy:review.scoringPolicy} : {}) };
    record.ai_answer_versions ||= {};
    if (review.history?.length) {
      record.answer_review_history ||= {};
      record.answer_review_history[key] = review.history.map(archived => ({ ...structuredClone(archived),
        contextSha256: questionContextDigest(archived.source, archived.source.questions[0]) }));
      for (const archived of review.history) {
        const context = questionContextDigest(archived.source, archived.source.questions[0]);
        for (const [version, model] of Object.entries(archived.review.modelAnswers || {})) {
          const historyKey = `${version}_source_${context}`;
          const label = `${model.label}（旧题面）`;
          const slot = record.ai_answer_versions[historyKey] ||= { label, model: model.modelId, answers: {}, provenance: {} };
          if (slot.model !== model.modelId || (slot.answers[key] && slot.answers[key] !== model.text))
            throw Error(`Historical model collision: ${historyKey}`);
          slot.answers[key] = model.text;
          slot.provenance[key] = { ...model.provenance, label, generatedAt: model.generatedAt,
            inputSha256: model.inputSha256, inputContextSha256: model.inputContextSha256 || null,
            historicalSourceContext: context };
        }
      }
    }
    for (const [version, model] of Object.entries(review.modelAnswers || {})) {
      const slot = record.ai_answer_versions[version] ||= { label: model.label, model: model.modelId, answers: {}, provenance: {} };
      if (slot.model !== model.modelId) throw Error(`Model version collision: ${version}`);
      slot.answers[key] = model.text;
      slot.provenance ||= {};
      slot.provenance[key] = { ...model.provenance, label:model.label, generatedAt: model.generatedAt,
        inputSha256: model.inputSha256, inputContextSha256: model.inputContextSha256 || null };
    }
    // Original model slots remain intact; only the current per-question view advances.
    record.ai_answers[key] = review.status === 'disputed'
      ? `答案待核查，暂停确定判分。\n${review.explanation}`
      : review.modelAnswers[review.currentVersion].text;
  }
  return output;
}
