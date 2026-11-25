// Proofreading aid: mechanical checks on print sources. It reports; it changes nothing.
//
//   node print/tools/lint.mjs [year ...]
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePaper, inlineText } from '../lib/markup.mjs';

const dir = resolve('print/src');
const years = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter(f => /^\d{4}\.txt$/.test(f)).map(f => f.slice(0, 4));
const CHECKS = [
  [/[,;:?!()]/, 'half-width punctuation'],
  [/(?<![0-9A-Za-z])\.(?![0-9])|[A-Za-z]\.(?=[一-鿿])/, 'ASCII full stop'],
  [/--|－－|﹣﹣/, 'dash written with hyphens: use ——'],
  [/(?<!…)…(?!…)/, 'single ellipsis character: use ……'],
  [/^答[:：]|\s答[:：]\s*$/, 'left-over 答： placeholder: replace it with [lines N]'],
  [/[\[【〔][\s\u3000]*[\]】〕]|（[\s\u3000]*）\s*$/, 'left-over answer bracket'],
  [/\*/, 'asterisk mark: use {.x}'],
  [/_{2,}|＿{2,}/, 'underscore blank: use {=N}'],
  [/ {2,}|\t/, 'ASCII space run'],
  [/[一-鿿] [一-鿿]/, 'ASCII space between characters'],
  [/([一-鿿]{2,6})\1/, null],
  [/[，。；：？！、]{2,}/, 'doubled punctuation'],
  [/(?<![0-9])[０-９]|[Ａ-Ｚａ-ｚ]/, 'full-width digit or letter'],
];
const balanced = (text, open, close) => [...text].filter(c => c === open).length === [...text].filter(c => c === close).length;
let problems = 0;
const report = (year, line, message, text) => { problems += 1; console.log(`${year}:${line} ${message}${text ? ` — ${text.slice(0, 70)}` : ''}`); };
for (const year of years) {
  const source = readFileSync(resolve(dir, `${year}.txt`), 'utf8');
  let paper;
  try { paper = parsePaper(source, `${year}.txt`); } catch (error) { report(year, 0, `PARSE ERROR ${error.message}`); continue; }
  const rows = source.split('\n');
  rows.forEach((row, index) => {
    if (!row.trim() || row.startsWith('%%') || row.startsWith('@')) return;
    const body = row.replace(/^(# |! |== |=- |= |\|\| |\| |-> |~ )/, '');
    if (/^\[(lines|grid|space|image|pagebreak)\b[^\]]*\]$/.test(body.trim()) || /^(<<<|>>>|\? |\?\.)/.test(body)) return;
    if (/\{\?\.\}/.test(body)) report(year, index + 1, 'unresolved ASCII full stop: decide between · and 。', body);
    const text = body.replace(/\{=[^}]*\}/g, '▁').replace(/\{[._~+^?]/g, '').replace(/\}/g, '').trim();
    for (const [pattern, message] of CHECKS) if (message && pattern.test(text)) report(year, index + 1, message, text);
    for (const [open, close] of [['（', '）'], ['《', '》'], ['“', '”'], ['‘', '’']])
      if (!balanced(text, open, close)) report(year, index + 1, `unbalanced ${open}${close} (may be a quotation that runs over paragraphs)`, text);
    const repeat = text.match(/([一-鿿]{3,8})\1/);
    if (repeat) report(year, index + 1, `repeated phrase "${repeat[1]}"`, text);
    // A long line with no closing punctuation followed by a short one is usually a transcription line wrap.
    const next = rows[index + 1] || '';
    if (!/^(# |! |== |=- |= |\| |-> |~ |[A-G]．)/.test(row) && [...text].length >= 34 && !/[。！？；：”’）…—》]$/.test(text) && next.trim() && !/^(\[|\?|<|>|@|%|[A-G]．|（\d）|[①-⑳]|\d{1,2}．)/.test(next.trim()))
      report(year, index + 1, 'possible mid-sentence line break (join with the next line?)', text);
  });
  // Structure checks
  for (const record of paper.records.filter(r => !r.skip)) {
    for (const node of record.nodes) {
      if (node.type !== 'question') continue;
      const texts = node.items.filter(i => i.type === 'text').map(i => inlineText(i.inline));
      const options = node.items.filter(i => i.type === 'option');
      if (node.kind === 'choice' && options.length < 3) report(year, node.line, 'choice question with fewer than three options');
      if (node.kind === 'choice' && options.map(o => o.letter).join('') !== 'ABCDEFG'.slice(0, options.length)) report(year, node.line, `option letters out of order: ${options.map(o => o.letter).join('')}`);
      if (node.kind !== 'choice' && options.length >= 3) report(year, node.line, 'options inside a question that is not marked choice');
      if (node.kind === 'open' && !node.items.some(i => i.type === 'lines' || i.type === 'grid' || i.type === 'space')) report(year, node.line, 'open question without an answer area');
      if (node.kind === 'write' && !node.items.some(i => i.type === 'grid')) report(year, node.line, 'writing question without a grid');
      const hasBlank = nodes => (nodes || []).some(n => n.t === 'blank' || hasBlank(n.children));
      if (node.kind === 'fill' && !node.items.some(i => hasBlank(i.inline) || i.type === 'lines' || i.type === 'table' || (i.type === 'material' && i.items.some(m => hasBlank(m.inline))))) report(year, node.line, 'fill question without a blank');
      if (!texts.length) report(year, node.line, 'question without a stem');
    }
  }
}
console.log(problems ? `${problems} item(s) to review` : 'clean');
