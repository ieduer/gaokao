import { createHash } from 'node:crypto';

export const QUESTION_BLANKS_PATH = 'assets/js/question-blanks.js';
const sha256 = text => createHash('sha256').update(text).digest('hex');

// The editable definition contains identities, exact source hashes and reviewed
// ranges only. Text is always derived from the same records Pages publishes.
export function validateQuestionBlanks(records, definition) {
  const fail = message => { throw Error(`Invalid question blanks: ${message}`); };
  if (definition?.schemaVersion !== 1 || !Array.isArray(definition.sourceQuestions) || !definition.sourceQuestions.length) fail('schema');
  if (Object.keys(definition).sort().join(',') !== 'schemaVersion,sourceQuestions') fail('definition fields');
  const source = new Map();
  for (const record of records) for (const question of record.questions || []) {
    const id = `${record.id}:${question.qIndex}`;
    if (source.has(id)) fail(`duplicate source ${id}`);
    source.set(id, question);
  }
  const ids = new Set(), texts = new Map();
  return definition.sourceQuestions.map(entry => {
    if (!entry || Object.keys(entry).sort().join(',') !== 'provenance,qIndex,ranges,recordId,sha256') fail('source fields');
    const { recordId, qIndex, sha256: expected, ranges, provenance } = entry;
    const id = `${recordId}:${qIndex}`, question = source.get(id), text = question?.text;
    if (typeof recordId !== 'string' || !recordId || !Number.isInteger(qIndex) || qIndex < 1 || ids.has(id)) fail(`identity ${id}`);
    if (typeof text !== 'string' || !/^[a-f0-9]{64}$/.test(expected || '') || sha256(text) !== expected) fail(`source hash ${id}`);
    if (texts.has(text) && texts.get(text) !== JSON.stringify(ranges)) fail(`conflicting text ranges ${id}`);
    if (!provenance || typeof provenance.basis !== 'string' || !provenance.basis.trim()) fail(`provenance ${id}`);
    if (!Array.isArray(ranges) || !ranges.length) fail(`ranges ${id}`);
    let previousEnd = 0;
    for (const range of ranges) {
      if (!Array.isArray(range) || range.length !== 2) fail(`range shape ${id}`);
      const [start, end] = range;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < previousEnd || end <= start || end > text.length) fail(`range bounds ${id}`);
      // Validation constrains reviewed ranges; it never discovers new ranges.
      if (!/^[ \t\r\n\u3000①-⑳]+$/u.test(text.slice(start, end))) fail(`range content ${id}`);
      previousEnd = end;
    }
    ids.add(id); texts.set(text, JSON.stringify(ranges));
    return { recordId, qIndex, text, sha256: expected, ranges: ranges.map(range => [...range]) };
  });
}

// Source marks are a separate authority: they never become answer blanks or
// edit the canonical question/answer payload. Punctuation is excluded explicitly.
export function validateQuestionSourceMarks(records, definition) {
  if (definition === undefined) return [];
  const fail = message => { throw Error(`Invalid question source marks: ${message}`); };
  if (definition?.schemaVersion !== 1 || Object.keys(definition).sort().join(',') !== 'schemaVersion,sourceQuestions'
      || !Array.isArray(definition.sourceQuestions) || !definition.sourceQuestions.length) fail('schema');
  const source = new Map(), ids = new Set(), texts = new Map();
  for (const record of records) for (const question of record.questions || []) {
    const id = `${record.id}:${question.qIndex}`;
    if (source.has(id)) fail(`duplicate source ${id}`);
    source.set(id, question);
  }
  return definition.sourceQuestions.map(entry => {
    if (!entry || Object.keys(entry).sort().join(',') !== 'provenance,qIndex,ranges,recordId,sha256') fail('source fields');
    const { recordId, qIndex, sha256: expected, ranges, provenance } = entry;
    const id = `${recordId}:${qIndex}`, text = source.get(id)?.text;
    if (typeof recordId !== 'string' || !recordId || !Number.isInteger(qIndex) || qIndex < 1 || ids.has(id)) fail(`identity ${id}`);
    if (typeof text !== 'string' || !/^[a-f0-9]{64}$/.test(expected || '') || sha256(text) !== expected) fail(`source hash ${id}`);
    if (!provenance || Object.keys(provenance).sort().join(',') !== 'basis,qualification,sourcePage,sourceSha256,sourceUrl'
      || typeof provenance.basis !== 'string' || !provenance.basis.trim()
      || provenance.qualification !== 'publisher-reproduction'
      || !/^https:\/\/[^\s]+$/.test(provenance.sourceUrl || '')
      || !/^[a-f0-9]{64}$/.test(provenance.sourceSha256 || '')
      || !Number.isInteger(provenance.sourcePage) || provenance.sourcePage < 1) fail(`provenance ${id}`);
    if (!Array.isArray(ranges) || !ranges.length) fail(`ranges ${id}`);
    let previousEnd = 0;
    for (const range of ranges) {
      if (!range || Object.keys(range).sort().join(',') !== 'end,group,start,type') fail(`range shape ${id}`);
      const { start, end, type, group } = range;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < previousEnd || end <= start || end > text.length) fail(`range bounds ${id}`);
      if (type !== 'dot' || !/^[A-Z]$/.test(group || '') || !/^\p{Script=Han}+$/u.test(text.slice(start, end))) fail(`range content ${id}`);
      previousEnd = end;
    }
    if (texts.has(text) && texts.get(text) !== JSON.stringify(ranges)) fail(`conflicting text ranges ${id}`);
    ids.add(id); texts.set(text, JSON.stringify(ranges));
    return { recordId, qIndex, text, sha256: expected, ranges: ranges.map(range => ({ ...range })) };
  });
}

// Kept here so the tracked browser module is completely reproducible from its
// canonical inputs and cannot acquire an independently edited copy of a stem.
const RUNTIME = String.raw`
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const byText = new Map(QUESTION_BLANKS.map(entry => [entry.text, entry]));
const marksByText = new Map(QUESTION_SOURCE_MARKS.map(entry => [entry.text, entry]));
export function findQuestionBlanks(text) {
  return byText.get(text) || null;
}
export function findQuestionSourceMarks(text) {
  return marksByText.get(text) || null;
}
export function renderQuestionBlanks(text, renderFragment = escapeHtml, range) {
  const source = String(text ?? ''), start = range?.start ?? 0, end = range?.end ?? source.length;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length) throw RangeError('Invalid question display range');
  const entry = findQuestionBlanks(source), marks = findQuestionSourceMarks(source);
  if (!entry && !marks) return renderFragment(source.slice(start, end), start, end);
  const spans = [
    ...(entry?.ranges || []).map(([start, end]) => ({ start, end, type: 'blank' })),
    ...(marks?.ranges || []),
  ].sort((a, b) => a.start - b.start);
  let cursor = start, html = '';
  for (const span of spans) {
    if (span.end <= start || span.start >= end) continue;
    const from = Math.max(start, span.start), to = Math.min(end, span.end);
    if (cursor < from) html += renderFragment(source.slice(cursor, from), cursor, from);
    if (span.type === 'dot') {
      html += '<span class="question-source-dot" data-source-mark-group="' + escapeHtml(span.group) + '">'
        + renderFragment(source.slice(from, to), from, to) + '</span>';
      cursor = to;
      continue;
    }
    const blankText = source.slice(from, to), label = blankText.replace(/[ \t\r\n\u3000]/g, '');
    html += '<span class="question-blank" aria-label="填空' + escapeHtml(label) + '">' + (escapeHtml(label) || '&nbsp;') + '</span>';
    // A few reviewed blanks span lines or occupy an otherwise empty line.
    // Preserve those source breaks so text after a blank never joins the stem.
    for (const match of blankText.matchAll(/\r\n|\r|\n/g)) {
      const offset = from + match.index;
      html += renderFragment(match[0], offset, offset + match[0].length);
    }
    cursor = to;
  }
  if (cursor < end) html += renderFragment(source.slice(cursor, end), cursor, end);
  return html;
}
`;

export function buildQuestionBlanksModule(records, definition, sourceMarks) {
  const entries = validateQuestionBlanks(records, definition);
  const marks = validateQuestionSourceMarks(records, sourceMarks);
  for (const entry of marks) for (const blank of entries.filter(blank => blank.text === entry.text)) {
    if (entry.ranges.some(mark => blank.ranges.some(([start, end]) => start < mark.end && end > mark.start))) throw Error('Source marks overlap question blanks');
  }
  // Escaping separators and < also makes the generated module safe if a future
  // source formatter embeds it in HTML, while runtime text stays byte-identical.
  const json = JSON.stringify(entries, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const markJson = JSON.stringify(marks, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return '// Generated from published canonical records and data/question-{blanks,source-marks}.json. Do not edit.\n'
    + `export const QUESTION_BLANKS = Object.freeze(${json}.map(entry => Object.freeze({...entry, ranges: Object.freeze(entry.ranges.map(range => Object.freeze(range)))})));\n`
    + `export const QUESTION_SOURCE_MARKS = Object.freeze(${markJson}.map(entry => Object.freeze({...entry, ranges: Object.freeze(entry.ranges.map(range => Object.freeze(range)))})));\n`
    + RUNTIME;
}
