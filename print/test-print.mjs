// Print edition: markup, typographic normalisation, rendering, and the bindings that keep
// the committed PDFs in step with the published bank.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePaper, parseInline, inlineText } from './lib/markup.mjs';
import { paperHtml, inlineHtml } from './lib/render.mjs';
import { toChars, normalise, serialise } from './lib/chars.mjs';
import { loadPublished, bindingOf, printYears } from './lib/corpus.mjs';
import { sourceDigest } from './lib/edition.mjs';
import { execFileSync } from 'node:child_process';
import { verifyPrintSources, verifyPrintManifest, verifyPrintEdition, verifyPrintPlaintext } from './lib/verify.mjs';
import { validPapers, sizeLabel, loginUrl as clientLoginUrl, paperUrl } from '../assets/js/print-papers.js';
import { loginUrl as serverLoginUrl } from '../functions/papers/[[path]].js';

const clean = (text, options, normOptions) => serialise(normalise(toChars(text, options), normOptions));

test('inline marks parse, nest and refuse malformed input', () => {
  assert.deepEqual(parseInline('故{.当}执'), [{ t: 'text', v: '故' }, { t: 'dot', children: [{ t: 'text', v: '当' }] }, { t: 'text', v: '执' }]);
  assert.equal(inlineText(parseInline('{_今用{.执}有命}者{=10}，{=6:①}{+扌豕}{^①}')), '今用执有命者＿＿，＿＿扌豕①');
  assert.deepEqual(parseInline('{=6:①}')[0], { t: 'blank', width: 6, label: '①' });
  assert.deepEqual(parseInline('a\\{b\\}'), [{ t: 'text', v: 'a{b}' }]);
  for (const bad of ['{.当', '当}', '{x当}', '{=0}', '{=abc}', '{+扌}', '{?.}']) assert.throws(() => parseInline(bad), undefined, bad);
});

test('typographic normalisation keeps marks on their characters', () => {
  assert.deepEqual(clean('6.下列解释,不正确的一项是(3分)\nA.故当执有命者之言 当:面对', { marks: [{ type: 'dot', start: 22, end: 23 }] }, { gapForSingleSpace: true }),
    ['6．下列解释，不正确的一项是（3分）', 'A．故{.当}执有命者之言　　当：面对']);
  assert.deepEqual(clean('下以阻百姓*之*从事 / 是灭'), ['下以阻百姓{.之}从事　　/　　是灭']);
  assert.deepEqual(clean('借助 brGDGTs，完成1-5题;约3.5万,共1,000年--他说'), ['借助brGDGTs，完成1—5题；约3.5万，共1,000年——他说']);
  assert.deepEqual(clean('日日来。_____________, _____________。”'), ['日日来。{=10}，{=10}。”']);
  assert.deepEqual(clean('增加了            和           ，保留', { blanks: [[3, 15], [16, 27]] }), ['增加了{=7}和{=6}，保留']);
  assert.deepEqual(clean('今用执有命者之言,是覆', { marks: [{ type: 'underline', start: 0, end: 11 }] }), ['{_今用执有命者之言，是覆}']);
  assert.deepEqual(clean('《墨子.非命》'), ['《墨子{?.}非命》']);
  assert.deepEqual(clean('一项是（   ）'), ['一项是（　　）']);
  assert.throws(() => toChars('abc', { marks: [{ type: 'dot', start: 2, end: 9 }] }));
});

const SAMPLE = `@year 2024
@title 2024年普通高等学校招生全国统一考试（北京卷）
@subject 语文
@note 样例
@record 2024-guwen bind=0123456789abcdef
%% comment
# 二、本大题共5小题，共18分。
! 阅读下面文言文，完成6—10题。
<<< kai
= 题目
=- 作者
故{.当}执有命者之言【1】，{~表现了}{_画线句}。
-> （取材于《墨子·非命》）
>>>
~ 注释：①钧：转轮。
? choice
6．下列解释，不正确的一项是（3分）
A．故{.当}执　　当：面对
B．民未{.渝}　　渝：改变
C．甲　　乙
?.
? choice cols=2
7．下列理解，不正确的一项是（3分）
A．原句
  译文
B．原句
C．原句
?.
? open
10．简答。（6分）
||  | 模式 | 观点
|| 离身认知 | ① | {.②}
[lines 6]
[lines 2 相同点：]
?.
? fill
（1）“{=10}，{=10}。”
?.
? write
21．微写作（10分）
[grid 10]
[grid 60 title]
?.
@skip 2024-x bind=fedcba9876543210 reason=duplicate entry
`;

test('a paper parses into sections, materials, questions and answer areas', () => {
  const paper = parsePaper(SAMPLE);
  assert.equal(paper.year, 2024);
  assert.deepEqual(paper.notes, ['样例']);
  assert.deepEqual(paper.records.map(r => [r.id, r.bind, r.skip]), [['2024-guwen', '0123456789abcdef', false], ['2024-x', 'fedcba9876543210', true]]);
  const [heading, instruction, material, note, choice, second, open, fill, write] = paper.records[0].nodes;
  assert.deepEqual([heading.type, instruction.type, material.type, note.type], ['heading', 'instruction', 'material', 'note']);
  assert.deepEqual(material.items.map(i => i.type), ['title', 'byline', 'para', 'source']);
  assert.equal(choice.kind, 'choice');
  assert.deepEqual(choice.items.map(i => i.type), ['text', 'option', 'option', 'option']);
  assert.equal(choice.items[1].cells.length, 2);
  assert.equal(second.cols, 2);
  assert.deepEqual(second.items[1].cont.map(inlineText), ['译文']);
  assert.deepEqual(open.items.map(i => i.type), ['text', 'table', 'lines', 'lines']);
  assert.deepEqual(open.items[1].rows.map(row => row.map(inlineText)), [['', '模式', '观点'], ['离身认知', '①', '②']]);
  assert.equal(open.items[3].label[0].v, '相同点：');
  assert.equal(fill.kind, 'fill');
  assert.deepEqual(write.items.slice(1).map(i => [i.rows, i.title]), [[10, false], [60, true]]);
});

test('structural mistakes in a source are errors, not silent output', () => {
  const broken = [
    SAMPLE.replace('?.\n? open', '? open'),                    // question inside a question
    SAMPLE.replace('>>>\n', ''),                                // unterminated material
    SAMPLE.replace('@record 2024-guwen bind=0123456789abcdef', '@record 2024-guwen'),
    SAMPLE.replace('reason=duplicate entry', ''),
    SAMPLE.replace('[lines 6]', '[lines 99]'),
    SAMPLE.replace('|| 离身认知 | ① | {.②}', '|| 离身认知 | ①'),          // ragged table
    SAMPLE.replace('@year 2024\n', ''),
    `${SAMPLE}@record 2024-guwen bind=0123456789abcdef\n`,      // duplicate record
    SAMPLE.replace('10．简答。（6分）', '10．简答{?.}'),
    `${SAMPLE}stray text\n`,
  ];
  for (const source of broken) assert.throws(() => parsePaper(source));
});

test('rendering draws marks per character and gives every question its area', () => {
  assert.equal(inlineHtml(parseInline('{.当，前}')), '<i class="d">当</i>，<i class="d">前</i>');
  assert.equal(inlineHtml(parseInline('{~甲，{.乙}}')), '<i class="w">甲</i><i class="w">，</i><i class="d w">乙</i>');
  assert.match(inlineHtml(parseInline('言【1】'), { noteRefs: true }), /<sup class="ref">【1】<\/sup>/);
  assert.equal(inlineHtml(parseInline('<b>&')), '&lt;b&gt;&amp;');
  const html = paperHtml(parsePaper(SAMPLE), { css: '/*css*/', fontsUrl: 'file:///fonts', edition: 'gk.bdfz.net · test' });
  assert.equal((html.match(/class="abox"/g) || []).length, 2);
  assert.match(html, /<div class="opts opts-2">.*<p class="opt-cont">译文<\/p>/s);
  assert.equal((html.match(/class="rule"/g) || []).length, 8);
  assert.equal((html.match(/class="grid-row"/g) || []).length, 70);
  assert.match(html, /<span class="grid-count">1200<\/span>/);
  assert.match(html, /<table class="opts-table">/);
  assert.match(html, /<table class="tbl"><tr><td><\/td><td>模式<\/td><td>观点<\/td><\/tr><tr><td>离身认知<\/td><td>①<\/td><td><i class="d">②<\/i><\/td><\/tr><\/table>/);
  assert.match(html, /<span class="blank" style="width:10em"><\/span>/);
  assert.match(html, /2024年普通高等学校招生全国统一考试（北京卷） · 语文/);
  assert.doesNotMatch(html, /2024-x|comment/);
  assert.doesNotMatch(html, /https?:\/\/(?!gk\.bdfz\.net)/, 'the printed page loads nothing from the network');
});

test('the download list accepts only well-formed entries and both sides send readers to the same sign-in address', () => {
  const papers = validPapers({ schemaVersion: 1, papers: [
    { year: 2023, file: '2023.pdf', pages: 12, bytes: 600000 }, { year: 2024, file: '2024.pdf', pages: 13, bytes: 1500000 },
    { year: 2022, file: '../x.pdf', pages: 12, bytes: 1 }, { year: 1999, file: '1999.pdf', pages: 1, bytes: 1 }, { year: 2021, file: '2021.pdf', pages: 0, bytes: 1 }, null,
  ] });
  assert.deepEqual(papers.map(p => p.year), [2024, 2023]);
  assert.deepEqual(validPapers({ schemaVersion: 2, papers: [] }), []);
  assert.deepEqual(validPapers(null), []);
  assert.equal(sizeLabel(600000), '586 KB');
  assert.equal(sizeLabel(1500000), '1.4 MB');
  assert.equal(paperUrl(2024), '/papers/2024.pdf');
  assert.equal(clientLoginUrl(2024), serverLoginUrl(2024));
});

const context = loadPublished();

test('every published record of every exam year is printed or skipped, bound to its current bank content', () => {
  const { errors, sources, years } = verifyPrintSources(process.cwd(), context);
  assert.deepEqual(errors, []);
  assert.deepEqual([...sources.keys()], years);
  assert.deepEqual(years, printYears(context.records));
  assert.ok(years.length >= 25 && !years.includes(9999));
});

test('a bank change under a printed section is detected', () => {
  const record = structuredClone(context.records.find(r => r.id === '2024-guwen'));
  const before = bindingOf(record, context);
  record.questions[0].text += ' ';
  assert.notEqual(bindingOf(record, context), before);
  const moved = structuredClone(context.records.find(r => r.id === '2024-guwen'));
  moved.annotations[0].start += 1;
  assert.notEqual(bindingOf(moved, context), before);
  // Answers and review data are not part of the printed paper.
  const answers = structuredClone(context.records.find(r => r.id === '2024-guwen'));
  answers.ai_answers = {}; answers.reference_answer = 'x';
  assert.equal(bindingOf(answers, context), before);
});

test('each sealed PDF was printed from its current source and matches the manifest', async t => {
  const { sources } = verifyPrintSources(process.cwd(), context);
  const { errors, files, manifest } = verifyPrintManifest(process.cwd(), sources);
  assert.deepEqual(errors, []);
  assert.equal(files.length, sources.size);
  assert.ok(files.every(file => /^papers\/20\d{2}\.pdf\.enc$/.test(file)));
  assert.deepEqual(validPapers(manifest).map(p => p.year), manifest.papers.map(p => p.year));
  assert.equal(verifyPrintEdition(process.cwd(), context).length, files.length + 1);
  // Pages builds have no key; a local build opens every file and compares it with the manifest.
  if (!process.env.GK_PRINT_PAPERS_KEY) return t.diagnostic('GK_PRINT_PAPERS_KEY not set: sealed files checked by hash only');
  assert.deepEqual(await verifyPrintPlaintext(process.cwd(), manifest, process.env.GK_PRINT_PAPERS_KEY), []);
});

test('no readable PDF is tracked in the public repository', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.deepEqual(tracked.filter(path => /\.pdf$/i.test(path)), []);
  for (const path of tracked.filter(path => path.startsWith('papers/'))) {
    assert.match(path, /^papers\/20\d{2}\.pdf\.enc$/);
    assert.equal(readFileSync(path).subarray(0, 4).toString('latin1'), 'GKP1');
  }
});

test('a comment-only change keeps the print binding; a printed change breaks it', () => {
  const css = readFileSync('print/print.css', 'utf8');
  const source = readFileSync('print/src/2024.txt', 'utf8');
  const withNote = source.replace('\n# ', '\n%% provenance note\n# ');
  assert.notEqual(withNote, source);
  assert.equal(sourceDigest(withNote, css), sourceDigest(source, css));
  assert.notEqual(sourceDigest(source.replace('（3分）', '（4分）'), css), sourceDigest(source, css));
  assert.notEqual(sourceDigest(source, css + ' '), sourceDigest(source, css));
});

test('printed sources carry no unresolved drafting marks or answer keys', () => {
  for (const year of printYears(context.records)) {
    // Comments (%%) are proofreading notes and are never printed.
    const printed = readFileSync(`print/src/${year}.txt`, 'utf8').split('\n').filter(line => !line.startsWith('%%')).join('\n');
    assert.doesNotMatch(printed, /\{\?\.\}/, `${year}: unresolved full stop`);
    assert.doesNotMatch(printed, /参考答案|【答案】|【解析】/, `${year}: answers do not belong in the question paper`);
  }
});
