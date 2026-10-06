import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function answerReviewContextHash(record) {
  const context = Object.fromEntries(Object.keys(record).sort()
    .filter(key => /^(topic|materials|material\d+|annotation|annotations)$/.test(key))
    .map(key => [key, record[key]]));
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}

export function validateAnswerReview(record) {
  const review = record.source_review;
  if (!review) return;
  const reject = reason => { throw Error(`${record.id}: answer review ${reason}`); };
  if (review.schema !== 'gk-answer-review-v1' || review.officialSource !== false
    || !['publisher_images_reviewed', 'reference_correction_original_scan_pending'].includes(review.status)
    || !review.sourceNote || !review.scope || !Number.isFinite(Date.parse(review.reviewedAt))) reject('metadata');
  if (!review.sources?.length || !Object.keys(review.answers || {}).length) reject('empty evidence or answers');
  if (review.sourceContextSha256 !== answerReviewContextHash(record)) reject('material mismatch');
  if (review.printedGroupScore != null && !(Number.isInteger(review.printedGroupScore) && review.printedGroupScore > 0)) reject('group score');
  if (review.scoreNote != null && (typeof review.scoreNote !== 'string' || !review.scoreNote.trim())) reject('score note');
  if (review.corrections != null && !Array.isArray(review.corrections)) reject('corrections');
  const fields = new Set();
  for (const correction of review.corrections || []) {
    const { field, from, to } = correction || {};
    if (!/^(topic|material[1-9]\d*)$/.test(field) || fields.has(field)
      || typeof from !== 'string' || !from || typeof to !== 'string' || from.length !== to.length || from === to
      || typeof record[field] !== 'string' || record[field].split(from).length !== 2) reject('correction target');
    fields.add(field);
    if (field !== 'topic') {
      const materials = record.materials?.filter(material => material.key === field) || [];
      if (materials.length !== 1 || materials[0].text !== record[field]) reject('correction material');
    }
  }
  for (const source of review.sources) {
    let url;
    try { url = new URL(source.url); } catch { reject('source URL'); }
    if (url.protocol !== 'https:' || url.username || url.password
      || !['img.eol.cn', 'gaokao.eol.cn', 'cdn.gaokzx.com'].includes(url.hostname)
      || !/^[a-f0-9]{64}$/.test(source.sha256) || !(source.bytes > 0) || !source.kind || !source.page) reject('source evidence');
  }
  for (const [key, answer] of Object.entries(review.answers)) {
    const question = record.questions?.find(q => String(q.qIndex) === key);
    if (!question || createHash('sha256').update(question.text).digest('hex') !== answer.questionSha256) reject(`question mismatch ${key}`);
    if (!answer.text?.trim() || !Array.isArray(answer.rejectedVersions)) reject(`answer metadata ${key}`);
    if (answer.printedScore != null && !(Number.isInteger(answer.printedScore) && answer.printedScore > 0
      && answer.printedScore <= review.printedGroupScore)) reject(`printed score ${key}`);
    for (const version of answer.rejectedVersions) {
      if (!record.ai_answer_versions?.[version]?.answers?.[key]) reject(`unknown historical version ${key}`);
    }
    for (const field of answer.supersededFields || []) {
      if (field !== 'reference_answer' || typeof record[field] !== 'string') reject(`unknown historical field ${key}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const records = JSON.parse(readFileSync(new URL('../data/all.json', import.meta.url)));
  records.forEach(validateAnswerReview);
  console.log(`answer reviews: ${records.filter(r => r.source_review).length} source-bound records`);
}
