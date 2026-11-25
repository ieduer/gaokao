// The print edition is derived from exactly the records Pages publishes.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { projectScopedAnswers } from '../../scripts/lib/answer-release-scope.mjs';

const json = (root, path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

export function loadPublished(root = process.cwd()) {
  const records = projectScopedAnswers(json(root, 'data/all.json'), json(root, 'data/answer-authority.json'),
    json(root, 'data/answer-release-scope.json'), json(root, 'data/answer-release-preserved.json'));
  const blanks = new Map(), sourceMarks = new Map();
  for (const entry of json(root, 'data/question-blanks.json').sourceQuestions) blanks.set(`${entry.recordId}:${entry.qIndex}`, entry.ranges);
  for (const entry of json(root, 'data/question-source-marks.json').sourceQuestions) sourceMarks.set(`${entry.recordId}:${entry.qIndex}`, entry.ranges);
  return { records, blanks, sourceMarks };
}

// Everything a printed section is proofread against. A change to any of it
// requires the section to be reviewed again.
export function printInput(record, { blanks, sourceMarks }) {
  return {
    id: record.id, year: record.year, key: record.key, topic: record.topic ?? null,
    materials: (record.materials || []).map(m => ({ key: m.key, label: m.label ?? null, text: m.text ?? null, image: m.image ? { asset: m.image.asset, sha256: m.image.sha256 } : null })),
    annotation: record.annotation ?? null,
    questions: (record.questions || []).map(q => ({
      qIndex: q.qIndex, text: q.text ?? null, score: q.score ?? null, moved: q.sourceIdentity ? q.sourceIdentity.canonicalId || true : null,
      blanks: blanks.get(`${record.id}:${q.qIndex}`) || null, sourceMarks: sourceMarks.get(`${record.id}:${q.qIndex}`) || null,
    })),
    marks: (record.annotations || []).map(a => ({ qIndex: a.qIndex, material: a.material, type: a.type, start: a.start, end: a.end })),
  };
}

export const bindingOf = (record, context) => createHash('sha256').update(JSON.stringify(printInput(record, context))).digest('hex').slice(0, 16);

export const printYears = records => [...new Set(records.map(r => Number(r.year)))].filter(y => y >= 2000 && y < 2100).sort((a, b) => a - b);
