// One-off drafting aid: turns published bank records into the print markup.
// Its output is a starting point that is then proofread and edited by hand in
// print/src/<year>.txt; the build never runs this tool.
//
//   node print/tools/draft.mjs <outDir> [year ...]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPublished, bindingOf, printYears } from '../lib/corpus.mjs';
import { toChars, normalise, serialise, plain, visualLength } from '../lib/chars.mjs';

const [outDir, ...yearArgs] = process.argv.slice(2);
if (!outDir) throw Error('usage: draft.mjs <outDir> [year ...]');
const context = loadPublished();
const TYPE_ORDER = ['feilian', 'guwen', 'shici', 'lunyu', 'moxie', 'honglou', 'sanwen', 'yuyanjichu', 'weixiezuo', 'dazuowen'];
const HEADING = /^[一二三四五六七八九十]+、/;
const EDITORIAL = /来源限定|来源说明|题面格式说明|转录|Gzy|未取得|旧入口|旧收录|待核|校勘|重复入口|补记|修复|另存|学习记录|分类重复|缺证|不擅改|保留原|仅在|已另行|tmshow|预览|重排|互证|题图|扫描|出版链|历史去重|旧进度|原卷[^，。]*未知/;
const SOURCE_LINE = /^（(取材于|选自|节选自|摘自|改编自|有删改|根据|原载|据)[^）]*）$|^（[^）]{2,40}）$/;

const lines = (raw, opts = {}, normOpts = {}) => serialise(normalise(toChars(raw, opts), normOpts)).map(s => s.trim());
const squash = s => plain(s).replace(/[\s\u3000＿]/g, '');
const dedupeMarks = marks => [...new Map(marks.map(m => [`${m.type}:${m.start}:${m.end}`, m])).values()];

function firstNumber(record) {
  const real = (record.questions || []).filter(q => !q.sourceIdentity);
  const candidates = [record.topic, ...real.map(q => q.text)];
  for (const text of candidates) {
    const match = String(text || '').match(/(?:^|\n)\s*(\d{1,2})\s*[．.、]/) || String(text || '').match(/完成\s*(\d{1,2})/);
    if (match) return Number(match[1]);
  }
  const evidence = record.source_evidence;
  if (Number.isFinite(evidence?.originalNumber)) return evidence.originalNumber;
  if (Array.isArray(evidence?.originalQuestionNumbers) && evidence.originalQuestionNumbers.length) return Number(evidence.originalQuestionNumbers[0]);
  return null;
}

function linesForScore(score) {
  if (!Number.isFinite(score)) return 4;
  if (score <= 2) return 2;
  if (score <= 6) return score;
  if (score <= 8) return 8;
  return 10;
}

function splitAnnotation(record) {
  const sources = [], notes = [], dropped = [];
  for (const raw of lines(record.annotation || '')) {
    if (!raw) continue;
    let line = raw;
    const lead = line.match(/^（(?:取材于|选自|节选自|摘自|改编自)[^）]*）/);
    if (lead) { sources.push(lead[0]); line = line.slice(lead[0].length).trim(); if (!line) continue; }
    if (/^注释|^注[:：①]|^[①-⑳【\[]/.test(line) && !EDITORIAL.test(line)) { notes.push(line); continue; }
    if (SOURCE_LINE.test(line) && !EDITORIAL.test(line)) { sources.push(line); continue; }
    dropped.push(line);
  }
  return { sources, notes, dropped };
}

function materialBlock(record, material, sources) {
  const marks = dedupeMarks((record.annotations || []).filter(a => a.material === material.key && Number.isFinite(a.start)));
  const body = lines(material.text || '', { marks });
  const kind = record.key === 'shici' ? 'poem' : 'kai';
  const spaced = /断句|斜线/.test(record.topic || '') ? ' spaced' : '';
  const out = [`<<< ${kind}${spaced}`];
  const content = body.filter(Boolean);
  const longest = Math.max(0, ...content.map(visualLength));
  let seenBody = false;
  content.forEach((line, index) => {
    const text = plain(line), length = visualLength(line);
    if (/^(材料[一二三四五六七八九十]|【[甲乙丙丁]】|（[一二三四五六]）|[甲乙丙丁])$/.test(text)) { out.push(`== ${line}`); return; }
    if (SOURCE_LINE.test(text) && index >= content.length - 2) { out.push(`-> ${line}`); return; }
    const ends = /[。！？；，、：”’）…—]$/.test(text);
    if (!seenBody && !ends && length <= 24 && content.length > 1 && !/^其[一二三四五六七八九十]/.test(text)) {
      const titled = out.some(l => l.startsWith('= '));
      if (!titled) { out.push(`= ${line}`); return; }
      if (length <= 8 && !out.some(l => l.startsWith('=- '))) { out.push(`=- ${line}`); return; }
    }
    seenBody = true;
    if (kind === 'poem' && longest <= 30) out.push(`| ${line}`);
    else out.push(line);
  });
  if (material.image?.asset) out.push(`[image ${material.image.asset} 70]`);
  for (const source of sources) out.push(`-> ${source}`);
  out.push('>>>');
  return out;
}

const OPTION = /^([A-G])．/;

function questionLines(record, question) {
  const key = `question${question.qIndex}`;
  const marks = dedupeMarks([
    ...(record.annotations || []).filter(a => a.material === key && Number(a.qIndex) === Number(question.qIndex) && Number.isFinite(a.start)),
    ...(context.sourceMarks.get(`${record.id}:${question.qIndex}`) || []),
  ]);
  const blanks = context.blanks.get(`${record.id}:${question.qIndex}`) || [];
  const raw = lines(question.text || '', { marks, blanks }, { gapForSingleSpace: true });
  const out = [];
  for (let line of raw) {
    if (!line) continue;
    line = line.split('\u3000\u3000/\u3000\u3000').join('\u3000\u3000'); // "甲 / 乙" pairs become two columns
    // "A．…\u3000\u3000B．…" on one line
    const parts = line.split(/\u3000\u3000(?=[A-G]．)/);
    if (parts.length > 1 && OPTION.test(parts[0])) { out.push(...parts.map(s => s.trim())); continue; }
    // In a running sentence an unregistered wide gap is a fill blank (older papers);
    // gaps before ①②… or between short phrases are column spacing and stay.
    if (!OPTION.test(line) && /[，。；？]/.test(plain(line)) && !/^[①-⑳]/.test(plain(line)))
      line = line.replace(/\u3000\u3000(?![①-⑳A-G（])/g, '{=5}');
    // "相同点：" on its own line asks for a written answer there.
    const label = line.match(/^([^，。；？：]{2,8}：)(?:\{=\d+\})?$/);
    if (label && !/^(要求|注|说明|提示)/.test(label[1])) { out.push(`[lines 2 ${label[1]}]`); continue; }
    out.push(line);
  }
  return out;
}

function draftQuestion(record, question, { lead = [] } = {}) {
  let body = [...lead, ...questionLines(record, question)];
  const optionCount = body.filter(l => OPTION.test(l)).length;
  const isChoice = optionCount >= 3;
  const answerLine = l => /^答[:：]?(\s|\u3000)*([\[【〔（][\s\u3000]*[\]】〕）](\s|\u3000)*)*$/.test(l);
  const answerSlots = body.filter(answerLine).length;
  const out = [];
  if (isChoice) {
    body = body.filter(l => !answerLine(l)).map(l => l.replace(/(?:\u3000)*（\u3000\u3000）$/, '').replace(/答[:：][\s\u3000]*[\[【〔][\s\u3000]*[\]】〕]$/, '').trim()).filter(Boolean);
    let seenOption = false;
    out.push('? choice', ...body.map(l => { if (OPTION.test(l)) { seenOption = true; return l; } return seenOption ? `  ${l}` : l; }), '?.');
    return out;
  }
  const hasBlank = body.some(l => /\{=/.test(l));
  const total = linesForScore(question.score);
  if (answerSlots) {
    const each = Math.max(2, Math.round(total / answerSlots));
    out.push(`? ${hasBlank ? 'fill' : 'open'}`);
    for (const l of body) out.push(answerLine(l) ? `[lines ${each}]` : l);
    out.push('?.');
    return out;
  }
  if (hasBlank) return ['? fill', ...body, '?.'];
  return ['? open', ...body, `[lines ${total}]`, '?.'];
}

function draftRecord(record) {
  const out = [];
  const real = (record.questions || []).filter(q => !q.sourceIdentity);
  if (!real.length) return { skip: 'all questions moved to their source year' };
  const questionText = real.map(q => squash(lines(q.text || '').join('')));
  const allQuestions = questionText.join('');
  // Topic
  const topicLines = lines(record.topic || '').filter(Boolean);
  const editorialTopic = /旧收录入口|重复入口|^原\d+题/.test(topicLines.join(''));
  if (editorialTopic && /重复入口/.test(topicLines.join(''))) return { skip: `duplicate entry: ${topicLines.join(' ')}` };
  const lead = [];
  for (const line of topicLines) {
    if (editorialTopic) { out.push(`%% topic (editorial, not printed): ${line}`); continue; }
    if (HEADING.test(plain(line))) {
      const cut = line.indexOf('。');
      if (cut > 0 && cut < line.length - 1 && /本大题|小题|分/.test(line.slice(0, cut))) { out.push(`# ${line.slice(0, cut + 1)}`, `! ${line.slice(cut + 1)}`); }
      else out.push(`# ${line}`);
      continue;
    }
    if (allQuestions.includes(squash(line))) continue; // repeated as the question's own first line
    lead.push(line);
  }
  const { sources, notes, dropped } = splitAnnotation(record);
  for (const line of dropped) out.push(`%% note not printed: ${line}`);
  const materials = (record.materials || []).filter(m => !allQuestions.includes(squash(lines(m.text || '').join(''))));
  const writing = record.key === 'weixiezuo' || record.key === 'dazuowen';
  const stemLead = lead.length && /^\d{1,2}．/.test(plain(lead[0]));
  if (!stemLead) for (const line of lead) out.push(`! ${line}`);
  const perMaterial = sources.length === materials.length && materials.length > 1;
  const blocks = [];
  materials.forEach((material, index) => blocks.push(...materialBlock(record, material, perMaterial ? [sources[index]] : index === materials.length - 1 ? sources : [])));
  if (!materials.length) for (const source of sources) notes.unshift(source);
  const noteLines = notes.map(n => `~ ${n.replace(/^注释\s*(?=[①【\[])/, '注释：').replace(/^注[:：]\s*/, '注释：')}`);
  if (writing) {
    const limit = Number((record.topic || '').match(/(\d{2,4})\s*字/)?.[1]) || null;
    out.push('? write');
    if (stemLead) out.push(...lead);
    out.push(...blocks.map(l => l), ...noteLines);
    for (const q of real) out.push(...questionLines(record, q));
    if (record.key === 'weixiezuo') out.push(`[grid ${Math.max(8, Math.ceil((limit || 150) / 20) + 2)}]`);
    else out.push('[grid 60 title]');
    out.push('?.');
    return { lines: out };
  }
  if (stemLead && real.length === 1) {
    // "24．…" lead-in, its material, then the question text continuing the same item.
    const q = draftQuestion(record, real[0], { lead });
    out.push(q[0], ...lead.length ? [] : [], ...q.slice(1, 1 + lead.length), ...blocks, ...noteLines, ...q.slice(1 + lead.length));
    return { lines: out };
  }
  if (stemLead) for (const line of lead) out.push(`! ${line}`);
  out.push(...blocks, ...noteLines);
  for (const q of real) out.push(...draftQuestion(record, q));
  return { lines: out };
}

const years = yearArgs.length ? yearArgs.map(Number) : printYears(context.records);
mkdirSync(resolve(outDir), { recursive: true });
for (const year of years) {
  const records = context.records.filter(r => Number(r.year) === year);
  const ordered = records.map((record, index) => ({ record, index, number: firstNumber(record) }))
    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99) || TYPE_ORDER.indexOf(a.record.key) - TYPE_ORDER.indexOf(b.record.key) || a.index - b.index);
  const out = [`@year ${year}`, `@title ${year}年普通高等学校招生全国统一考试（北京卷）`, '@subject 语文', ''];
  for (const { record, number } of ordered) {
    const drafted = draftRecord(record), bind = bindingOf(record, context);
    if (drafted.skip) { out.push(`@skip ${record.id} bind=${bind} reason=${drafted.skip}`, ''); continue; }
    out.push(`@record ${record.id} bind=${bind}`, `%% ${record.typeLabel}; first question ${number ?? '?'}`, ...drafted.lines, '');
  }
  const target = resolve(outDir, `${year}.txt`);
  // Proofread sources are never regenerated: a draft may only be written beside them.
  if (resolve(outDir) === resolve('print/src') && existsSync(target)) throw Error(`${target} exists; draft into another directory and merge by hand`);
  writeFileSync(target, out.join('\n'));
  console.log(year, ordered.map(o => `${o.record.id.replace(`${year}-`, '')}:${o.number ?? '?'}`).join(' '));
}
