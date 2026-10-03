export function answerVersionSpecs(record) {
  return Object.entries(record.ai_answer_versions || {}).map(([key, value]) => ({
    key, label: value.label || value.model || key, model: value.model || null,
  }));
}

export function reviewForQuestion(record, qIndex) {
  return record.answer_reviews?.[String(qIndex)] || null;
}

export function preferredAnswer(record, qIndex) {
  return record.ai_answers?.[String(qIndex)] || '';
}

export function versionsForQuestion(record, qIndex) {
  const key = String(qIndex), review = reviewForQuestion(record, qIndex);
  const current = review?.currentVersion || record.ai_answer_current_versions?.[key] || record.ai_answer_current_version;
  const versions = answerVersionSpecs(record).flatMap(spec => {
    const slot = record.ai_answer_versions[spec.key], text = slot.answers?.[key];
    if (!text) return [];
    const historicalContext = slot.provenance?.[key]?.historicalSourceContext;
    const historicalSource = historicalContext
      ? record.answer_review_history?.[key]?.find(entry => entry.contextSha256 === historicalContext)?.source : null;
    return [{ ...spec, label:slot.provenance?.[key]?.label || spec.label,
      historicalSource: historicalSource || null,
      text, current: spec.key === current, independentlyReviewed: (review?.modelVersions?.includes(spec.key) && slot.provenance?.[key]?.stage !== 'source_review') || false,
      inReview:review?.modelVersions?.includes(spec.key) || false, assessment:review?.assessments?.[spec.key] || null,
      generatedAt: slot.provenance?.[key]?.generatedAt || slot.generated_at || null }];
  });
  if (!versions.length && preferredAnswer(record, qIndex))
    versions.push({key:'current', label:'现有 AI 解析', model:null, text:preferredAnswer(record,qIndex), current:true});
  return versions.sort((a,b) => Number(b.current)-Number(a.current));
}
