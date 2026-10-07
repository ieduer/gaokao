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

export function questionEmphasis(record, question) {
  const material = new Map((record.materials || []).map(m => [m.key, m.text]));
  return (record.annotations || []).filter(a => Number(a.qIndex) === Number(question.qIndex)).map(a => {
    const text = material.get(a.material) ?? record[a.material];
    if (!['dot', 'underline', 'wave', 'highlight'].includes(a.type) || typeof text !== 'string'
      || !Number.isInteger(a.start) || !Number.isInteger(a.end) || a.start < 0 || a.end <= a.start
      || !a.anchor || text.slice(a.start, a.end) !== a.anchor)
      throw Error(`Invalid question emphasis: ${record.id}:${question.qIndex}`);
    return { qIndex: question.qIndex, material: a.material, type: a.type,
      start: a.start, end: a.end, anchor: a.anchor };
  });
}

export function questionPresentationDigest(record, question) {
  // v3 adds actual per-question display ranges. A matching letter elsewhere
  // in the passage is a different input even when the v2 text is identical.
  return createHash('sha256').update(JSON.stringify({ version: 3,
    contextSha256: questionContextDigest(record, question), emphasis: questionEmphasis(record, question),
    // Only mapped legacy entries have this additional displayed source. Leave
    // existing, unmapped evidence byte-compatible; never transplant its proof.
    ...(question.sourceIdentity ? { sourceIdentity: question.sourceIdentity } : {}),
  })).digest('hex');
}

export function validateSourceAliases(records) {
  const index = questionIndex(records);
  for (const [id, {record, question}] of index) {
    const source = question.sourceIdentity;
    if (!source) continue;
    const target = index.get(source.canonicalId);
    if (!target || source.canonicalId === id || target.question.sourceIdentity
      || source.year !== target.record.year || !Number.isInteger(source.originalNumber)
      || source.originalNumber < 1 || !Number.isFinite(source.sourceScore) || source.sourceScore <= 0
      || !['transcription', 'contemporary_scan'].includes(source.basis))
      throw Error(`Invalid legacy source mapping: ${id}`);
    if (!record.source_history?.some(old => old.id === record.id
      && old.questions?.some(q => q.qIndex === question.qIndex && q.score === question.score)))
      throw Error(`Missing legacy source history: ${id}`);
  }
}

function historicalContextDigest(source, question) {
  // Legacy snapshots did not preserve display ranges; do not invent them.
  return Object.hasOwn(source, 'annotations')
    ? questionPresentationDigest(source, question) : questionContextDigest(source, question);
}

export function snapshotReview(record, question, review) {
  if (`${record.id}:${question.qIndex}` !== review.id || questionDigest(record, question) !== review.inputSha256)
    throw Error(`Cannot archive mismatched review: ${review.id}`);
  const archived = structuredClone(review);
  delete archived.history;
  const emphasis = questionEmphasis(record, question);
  const materialKeys = new Set((record.materials || []).map(material => material.key));
  const markedText = Object.fromEntries(emphasis.filter(mark => !materialKeys.has(mark.material))
    .map(mark => [mark.material, record[mark.material]]));
  return { source: structuredClone({ ...markedText, id: record.id, materials: record.materials,
    topic: record.topic, annotation: record.annotation ?? null,
    annotations: emphasis, questions: [question] }), review: archived };
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
  validateSourceAliases(records);
  return validateReviews(records, authority, { requireComplete });
}

export const releaseQualificationDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// A qualified learning edition does not certify an institutional original or
// an official rubric. Keep the original issue open and bind its separately
// reviewed publication disposition to the exact visible source and feedback.
export function qualificationBindings(records, authority, recordIds) {
  const selected = new Set(recordIds), reviews = new Map(authority.questions.map(q => [q.id, q]));
  return [...questionIndex(records)].filter(([,s]) => selected.has(s.record.id)).map(([id,s]) => {
    const q = reviews.get(id);
    return [id, questionPresentationDigest(s.record,s.question), s.question.score,
      q?.status, q?.kind, q?.correctOptions, q?.currentVersion,
      q?.modelAnswers?.[q?.currentVersion]?.text, q?.publicationQualification,
      q?.practiceScoring ?? null, q?.scoringPolicy ?? null];
  }).sort((a,b) => a[0].localeCompare(b[0], 'en'));
}

export function qualifiedReleaseBlocker(records, authority, blocker) {
  const policy = authority.releaseQualification;
  const disposition = policy?.dispositions?.find(row => row.blockerId === blocker.id);
  if (!disposition) return false;
  const fail = () => { throw Error(`Invalid qualified source disposition: ${blocker.id}`); };
  if (policy.schemaVersion !== 1 || policy.contract !== 'qualified-learning-reference-v1'
    || policy.scope !== 'beijing-only-20261006' || !policy.authorization?.trim()
    || policy.originalPublicationVerified !== false || policy.officialRubricVerified !== false
    || !Number.isFinite(Date.parse(policy.reviewedAt)) || !policy.reviewedBy?.trim()
    || disposition.status !== 'qualified_for_practice' || !disposition.remainingUnverified?.length
    || disposition.remainingUnverified.some(x => typeof x !== 'string' || !x.trim())
    || !disposition.resolvedForPractice?.length || !disposition.evidence?.length
    || disposition.evidence.some(x => !x.path?.trim() || !/^[a-f0-9]{64}$/.test(x.sha256 || ''))
    || disposition.originalBlockerSha256 !== releaseQualificationDigest(blocker)) fail();
  if (new Set(policy.dispositions.map(row => row.blockerId)).size !== policy.dispositions.length) fail();
  const recordIds = disposition.recordIds;
  if (!Array.isArray(recordIds) || !recordIds.length || new Set(recordIds).size !== recordIds.length
    || recordIds.some(id => !records.some(r => r.id === id))) fail();
  const requiredRecords = blocker.recordIds?.length
    ? blocker.recordIds.filter(id => records.some(r => r.id === id)) : records.map(r => r.id);
  if (requiredRecords.some(id => !recordIds.includes(id))) fail();
  const rows = qualificationBindings(records, authority, recordIds);
  if (!rows.length || rows.length !== disposition.questionCount
    || releaseQualificationDigest(rows) !== disposition.currentBindingsSha256) fail();
  const selected = new Set(recordIds);
  for (const [id,s] of questionIndex(records)) {
    if (!selected.has(s.record.id)) continue;
    const q = authority.questions.find(q => q.id === id), note = q?.publicationQualification;
    if (q?.status !== 'reviewed' || note?.contract !== policy.contract
      || note.originalPublicationVerified !== false || note.officialRubricVerified !== false
      || !note.notice?.trim() || !q.explanation.includes(note.notice)
      || !q.sources.some(source => source.type === 'publication_qualification' && source.label === note.notice)) fail();
    if (q.kind === 'multiple_choice' && q.scoringPolicy?.kind !== 'exact_set'
      && Number.isFinite(s.question.score) && s.question.score > 0
      && q.practiceScoring?.mode !== 'qualitative_only') fail();
  }
  return true;
}

function validateReviews(records, authority, { requireComplete = false } = {}) {
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
    const presentationDigest = questionPresentationDigest(source.record, source.question);
    if (review.inputPresentationSha256 && review.inputPresentationSha256 !== presentationDigest)
      throw Error(`Question emphasis changed: ${review.id}`);
    const archivedContexts = new Set();
    for (const archived of review.history || []) {
      if (archived.review?.id !== review.id || archived.review?.history?.length || archived.source?.questions?.length !== 1)
        throw Error(`Invalid historical review: ${review.id}`);
      const oldContext = historicalContextDigest(archived.source, archived.source.questions[0]);
      const currentContext = presentationDigest;
      if (archivedContexts.has(oldContext) || oldContext === currentContext)
        throw Error(`Repeated historical context: ${review.id}`);
      archivedContexts.add(oldContext);
      validateReviews([archived.source], { schemaVersion: 1, revision: 'historical', questions: [archived.review] });
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
    if(review.practiceScoring){
      const scoring=review.practiceScoring;
      if(!['component_feedback','qualitative_only'].includes(scoring.mode) || scoring.basis!=='practice'
        || scoring.inputPresentationSha256!==presentationDigest || scoring.legacyScore!==source.question.score
        || !Number.isFinite(scoring.total) || scoring.total<=0 || !Array.isArray(scoring.components)
        || !scoring.components.length || scoring.components.some(p=>!p.label?.trim()||!Number.isFinite(p.points)||p.points<=0)
        || scoring.components.reduce((n,p)=>n+p.points,0)!==scoring.total || !scoring.note?.trim()
        || (scoring.components.length>1&&(review.kind!=='open'||options.length)))
        throw Error(`Invalid practice scoring guide: ${review.id}`);
    }
    for (const [version, model] of Object.entries(review.modelAnswers || {})) {
      if (!model.modelId?.trim() || !model.label?.trim() || !model.text?.trim()
        || !Number.isFinite(Date.parse(model.generatedAt)) || model.inputSha256 !== review.inputSha256
        || !['codex_turn', 'cli_response'].includes(model.provenance?.kind) || !model.provenance?.evidence?.trim())
        throw Error(`Unproven model result: ${review.id}/${version}`);
      if (model.inputContextSha256 && !/^[a-f0-9]{64}$/.test(model.inputContextSha256))
        throw Error(`Invalid model context: ${review.id}/${version}`);
      if (model.inputPresentationSha256 && !/^[a-f0-9]{64}$/.test(model.inputPresentationSha256))
        throw Error(`Invalid model presentation: ${review.id}/${version}`);
      if (model.provenance.kind === 'cli_response' && model.provenance.responseModel !== model.modelId)
        throw Error(`Response model mismatch: ${review.id}/${version}`);
    }
    if (review.status === 'reviewed' && !review.modelAnswers?.[review.currentVersion])
      throw Error(`Current model answer missing: ${review.id}`);
  }
  if (requireComplete) {
    if (seen.size !== index.size) throw Error(`Incomplete review: ${seen.size}/${index.size}`);
    if(authority.releaseBlockers?.some(x=>x.status!=='resolved' && !qualifiedReleaseBlocker(records,authority,x)))
      throw Error('Unresolved source or evidence blockers');
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
      const presentation = questionPresentationDigest(source.record, source.question);
      const presentedModels = completeModels.filter(x => x.inputPresentationSha256 === presentation);
      if (review.inputPresentationSha256 !== presentation
        || !presentedModels.some(x => x.modelId === 'gpt-6-astra' && x.provenance.kind === 'codex_turn')
        || !presentedModels.some(x => x.modelId.startsWith('claude-') && x.provenance.kind === 'cli_response')
        || review.modelAnswers[review.currentVersion]?.inputPresentationSha256 !== presentation)
        throw Error(`Incomplete rendered-emphasis evidence: ${review.id}`);
      const images=(source.record.materials || []).filter(m=>m.image?.required);
      if(images.length){
        const viewed=presentedModels.filter(model=>Array.isArray(model.visualEvidence?.observations)
          && model.visualEvidence.observations.some(x=>typeof x==='string'&&x.trim())
          && Array.isArray(model.visualEvidence?.limitations)
          && images.every(material=>model.provenance.imageInputs?.some(i=>i.material===material.key
            && i.sha256===material.image.sha256 && i.mode==='pixels' && typeof i.evidence==='string' && i.evidence.trim())));
        if(!viewed.some(m=>m.modelId==='gpt-6-astra'&&m.provenance.kind==='codex_turn')
          || !viewed.some(m=>m.modelId.startsWith('claude-')&&m.provenance.kind==='cli_response')
          || !viewed.includes(review.modelAnswers[review.currentVersion]))
          throw Error(`Incomplete actual-image evidence: ${review.id}`);
      }
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
      inputPresentationSha256: review.inputPresentationSha256 || null,
      assessments: Object.fromEntries(Object.entries(review.modelAnswers || {}).filter(([,m])=>m.assessment).map(([v,m])=>[v,m.assessment])),
      ...(review.scoringPolicy ? {scoringPolicy:review.scoringPolicy} : {}) };
    if(review.practiceScoring)record.answer_reviews[key].practiceScoring=structuredClone(review.practiceScoring);
    if(review.publicationQualification)record.answer_reviews[key].publicationQualification=structuredClone(review.publicationQualification);
    record.ai_answer_versions ||= {};
    if (review.history?.length) {
      record.answer_review_history ||= {};
      record.answer_review_history[key] = review.history.map(archived => ({ ...structuredClone(archived),
        contextSha256: historicalContextDigest(archived.source, archived.source.questions[0]) }));
      for (const archived of review.history) {
        const context = historicalContextDigest(archived.source, archived.source.questions[0]);
        for (const [version, model] of Object.entries(archived.review.modelAnswers || {})) {
          const historyKey = `${version}_source_${context}`;
          const label = `${model.label}（旧题面）`;
          const slot = record.ai_answer_versions[historyKey] ||= { label, model: model.modelId, answers: {}, provenance: {} };
          if (slot.model !== model.modelId || (slot.answers[key] && slot.answers[key] !== model.text))
            throw Error(`Historical model collision: ${historyKey}`);
          slot.answers[key] = model.text;
          slot.provenance[key] = { ...model.provenance, label, generatedAt: model.generatedAt,
            inputSha256: model.inputSha256, inputContextSha256: model.inputContextSha256 || null,
            inputPresentationSha256: model.inputPresentationSha256 || null,
            historicalSourceContext: context };
          if(model.visualEvidence){
            slot.visualEvidence ||= {};
            slot.visualEvidence[key] = structuredClone(model.visualEvidence);
          }
        }
      }
    }
    for (const [version, model] of Object.entries(review.modelAnswers || {})) {
      const slot = record.ai_answer_versions[version] ||= { label: model.label, model: model.modelId, answers: {}, provenance: {} };
      if (slot.model !== model.modelId) throw Error(`Model version collision: ${version}`);
      slot.answers[key] = model.text;
      slot.provenance ||= {};
      slot.provenance[key] = { ...model.provenance, label:model.label, generatedAt: model.generatedAt,
        inputSha256: model.inputSha256, inputContextSha256: model.inputContextSha256 || null,
        inputPresentationSha256: model.inputPresentationSha256 || null };
      if(model.visualEvidence){
        slot.visualEvidence ||= {};
        slot.visualEvidence[key] = structuredClone(model.visualEvidence);
      } else if(slot.visualEvidence) delete slot.visualEvidence[key];
    }
    // Original model slots remain intact; only the current per-question view advances.
    record.ai_answers[key] = review.status === 'disputed'
      ? `答案待核查，暂停确定判分。\n${review.explanation}`
      : review.modelAnswers[review.currentVersion].text;
  }
  return output;
}
