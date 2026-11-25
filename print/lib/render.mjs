// Print sources → one self-contained HTML document per year (printed to PDF by build.mjs).
import { inlineText } from './markup.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const width = text => [...text].reduce((n, c) => n + (/[\x20-\x7e]/.test(c) ? 0.5 : 1), 0);

// Dots and wavy lines are set one mark per character, drawn from glyphs, so they stay
// sharp in the PDF and follow justified spacing (browser wavy underlines print as coarse bitmaps).
const DOTLESS = /[\s\u3000，。；：？！、（）《》“”‘’—…·．,.;:?!()\/]/;
const perChar = (text, { dot, wave }) => [...text].map(c => {
  const cls = [dot && !DOTLESS.test(c) ? 'd' : '', wave && !/\s/.test(c) ? 'w' : ''].filter(Boolean).join(' ');
  return cls ? `<i class="${cls}">${esc(c)}</i>` : esc(c);
}).join('');

export function inlineHtml(nodes, { noteRefs = false, dot = false, wave = false } = {}) {
  return nodes.map(node => {
    if (node.t === 'text') {
      if (dot || wave) return perChar(node.v, { dot, wave });
      // A score such as （6分） never breaks across lines.
      const html = esc(node.v).replace(/（(?:共|每小题|各)?\d{1,3}分）/g, '<span class="nb">$&</span>');
      // Note references such as 【1】 or [1] sit above the line in reading materials.
      return noteRefs ? html.replace(/(【\d{1,2}】|\[\d{1,2}\])/g, '<sup class="ref">$1</sup>') : html;
    }
    if (node.t === 'blank') return `${node.label ? `<span class="blank-label">${esc(node.label)}</span>` : ''}<span class="blank${wave ? ' blank-w' : ''}" style="width:${node.width}em"></span>`;
    if (node.t === 'compose') return `<span class="cmp${dot ? ' d' : ''}">${node.parts.map(p => `<i>${esc(p)}</i>`).join('')}</span>`;
    if (node.t === 'dot') return inlineHtml(node.children, { noteRefs, dot: true, wave });
    if (node.t === 'wave') return inlineHtml(node.children, { noteRefs, dot, wave: true });
    const cls = { ul: 'ul', sup: 'sup' }[node.t];
    const tag = node.t === 'sup' ? 'sup' : 'span';
    return `<${tag} class="${cls}">${inlineHtml(node.children, { noteRefs, dot, wave })}</${tag}>`;
  }).join('');
}

function materialHtml(block) {
  const rows = block.items.map(item => {
    if (item.type === 'image') return `<figure class="fig"><img src="${esc(item.asset)}" style="width:${item.width}mm" alt=""></figure>`;
    const html = inlineHtml(item.inline, { noteRefs: true });
    if (item.type === 'label') return `<p class="m-label">${html}</p>`;
    if (item.type === 'title') return `<p class="m-title">${html}</p>`;
    if (item.type === 'byline') return `<p class="m-byline">${html}</p>`;
    if (item.type === 'line') return `<p class="m-line">${html}</p>`;
    if (item.type === 'source') return `<p class="m-source">${html}</p>`;
    return `<p class="m-para">${html}</p>`;
  }).join('\n');
  return `<div class="mat mat-${block.kind}${block.spaced ? ' mat-spaced' : ''}">\n${rows}\n</div>`;
}

const linesHtml = node => `<div class="lines">${Array.from({ length: node.count }, (_, i) =>
  `<div class="rule">${i === 0 && node.label ? `<span class="rule-label">${inlineHtml(node.label)}</span>` : ''}</div>`).join('')}</div>`;

// Printed under the title of every paper; a source file adds its own with @note.
export const COVER_NOTES = [
  '本卷据“AI 高考”（gk.bdfz.net）题库收录的北京卷语文真题精校排印，题号与分值依原卷；原卷满分150分，考试时长150分钟。',
  '答题区为练习而设：选择题答案填入题后方框，填空与简答写在横线上，微写作与作文写在方格内。',
];

const tableHtml = node => `<table class="tbl">${node.rows.map(row => `<tr>${row.map(cell => `<td>${inlineHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>`;

const GRID_COLS = 20;
function gridHtml(node) {
  const rows = Array.from({ length: node.rows }, (_, i) => {
    const count = (i + 1) * GRID_COLS;
    const mark = count % 100 === 0 ? `<span class="grid-count">${count}</span>` : '';
    return `<div class="grid-row"><svg viewBox="0 0 160 8" width="160mm" height="8mm" aria-hidden="true"><use href="#grid-row"/></svg>${mark}</div>`;
  }).join('');
  // title: an essay with a choice of topics; heading: one topic, only its title line.
  const title = node.title ? '<div class="grid-title"><span>我选择第（\u3000\u3000）题</span><span>题目：<i class="grid-title-rule"></i></span></div>'
    : node.heading ? '<div class="grid-title grid-title-only"><span>题目：<i class="grid-title-rule"></i></span></div>' : '';
  return `<div class="grid${node.title || node.heading ? ' grid-essay' : ''}">${title}${rows}</div>`;
}

function optionsHtml(options, cols) {
  const tabular = options.some(o => o.cells.length > 1);
  const multiline = options.some(o => o.cont.length);
  if (tabular && !multiline) {
    const span = Math.max(...options.map(o => o.cells.length));
    return `<table class="opts-table">${options.map(o => `<tr>${o.cells.map((cell, i) =>
      `<td${i === o.cells.length - 1 && o.cells.length < span ? ` colspan="${span - i}"` : ''}>${inlineHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>`;
  }
  const longest = Math.max(...options.map(o => width(o.cells.map(inlineText).join('\u3000\u3000'))));
  const auto = multiline ? 1 : longest <= 9.5 ? 4 : longest <= 20 ? 2 : 1;
  const n = cols || auto;
  return `<div class="opts opts-${n}">${options.map(o => `<div class="opt"><p>${o.cells.map(c => inlineHtml(c)).join('\u3000\u3000')}</p>${
    o.cont.map(c => `<p class="opt-cont">${inlineHtml(c)}</p>`).join('')}</div>`).join('')}</div>`;
}

function questionHtml(q) {
  const out = [];
  const firstOption = q.items.findIndex(item => item.type === 'option');
  // The answer box sits on the stem's own line (the first text line), not on a list that follows it.
  const boxAt = q.items.findIndex(item => item.type === 'text');
  let i = 0;
  while (i < q.items.length) {
    const item = q.items[i];
    if (item.type === 'option') {
      const group = [];
      while (i < q.items.length && q.items[i].type === 'option') { group.push(q.items[i]); i += 1; }
      out.push(optionsHtml(group, q.cols));
      continue;
    }
    if (item.type === 'text') {
      const box = q.kind === 'choice' && !q.nobox && i === boxAt ? '<span class="abox"></span>' : '';
      const text = inlineText(item.inline);
      const cls = /^(\d{1,2}．|（\d）|[①-⑳](?!.*[①-⑳]))/.test(text) && (firstOption < 0 || i < firstOption) ? 'stem' : 'stem stem-more';
      out.push(`<p class="${cls}">${inlineHtml(item.inline)}${box}</p>`);
    } else if (item.type === 'instruction') out.push(`<p class="ins">${inlineHtml(item.inline)}</p>`);
    else if (item.type === 'note') out.push(`<p class="note">${inlineHtml(item.inline)}</p>`);
    else if (item.type === 'material') out.push(materialHtml(item));
    else if (item.type === 'lines') out.push(linesHtml(item));
    else if (item.type === 'table') out.push(tableHtml(item));
    else if (item.type === 'grid') out.push(gridHtml(item));
    else if (item.type === 'space') out.push(`<div style="height:${item.mm}mm"></div>`);
    else if (item.type === 'pagebreak') out.push('<div class="pagebreak"></div>');
    i += 1;
  }
  const big = q.items.some(item => item.type === 'grid' || item.type === 'material' || (item.type === 'lines' && item.count > 8));
  return `<div class="q q-${q.kind}${big ? ' q-flow' : ''}">\n${out.join('\n')}\n</div>`;
}

export function paperHtml(paper, { css, fontsUrl, assetBase = '', edition = '' }) {
  const body = [];
  for (const record of paper.records) {
    if (record.skip) continue;
    const parts = record.nodes.map(node => {
      if (node.type === 'heading') return `<h2 class="sec">${inlineHtml(node.inline)}</h2>`;
      if (node.type === 'instruction') return `<p class="ins">${inlineHtml(node.inline)}</p>`;
      if (node.type === 'note') return `<p class="note">${inlineHtml(node.inline)}</p>`;
      if (node.type === 'material') return materialHtml(node);
      if (node.type === 'question') return questionHtml(node);
      if (node.type === 'lines') return linesHtml(node);
      if (node.type === 'table') return tableHtml(node);
      if (node.type === 'grid') return gridHtml(node);
      if (node.type === 'space') return `<div style="height:${node.mm}mm"></div>`;
      if (node.type === 'pagebreak') return '<div class="pagebreak"></div>';
      throw Error(`Unrenderable node ${node.type}`);
    });
    body.push(`<section class="rec" data-record="${esc(record.id)}">\n${parts.join('\n')}\n</section>`);
  }
  const running = `${paper.title} · ${paper.subject}`;
  const pageCss = `@page{size:A4;margin:17mm 20mm 18mm 20mm;
  @top-center{content:"${running.replace(/"/g, '\\"')}";font:8.5pt "PKai","PSong";color:#333;padding-bottom:2mm}
  @bottom-center{content:"第 " counter(page) " 页（共 " counter(pages) " 页）";font:9pt "PSong";padding-top:2mm}
  @bottom-right{content:"${esc(edition).replace(/"/g, '\\"')}";font:7.5pt "PSong";color:#555;padding-top:2mm}}
@page:first{@top-center{content:""}}`;
  const fonts = [['PSong', 'PSong-Regular.ttf', 400], ['PSong', 'PSong-Bold.ttf', 700], ['PHei', 'PHei-Medium.ttf', 500], ['PHei', 'PHei-Bold.ttf', 700], ['PKai', 'LXGWWenKaiGB-Regular.ttf', 400]]
    .map(([family, file, weight]) => `@font-face{font-family:"${family}";src:url("${fontsUrl}/${file}");font-weight:${weight}}`).join('\n');
  const allNotes = [...COVER_NOTES, ...paper.notes];
  const notes = `<ol class="cover-notes">${allNotes.map(n => `<li>${esc(n)}</li>`).join('')}</ol>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${esc(paper.title)} ${esc(paper.subject)}（精校打印版）</title>
<meta name="author" content="gk.bdfz.net">
${assetBase ? `<base href="${esc(assetBase)}">` : ''}
<style>
${fonts}
${pageCss}
${css}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><g id="grid-row" fill="none" stroke="#444" stroke-width="0.18">
<rect x="0.09" y="0.09" width="159.82" height="7.82"/>${Array.from({ length: GRID_COLS - 1 }, (_, i) => `<line x1="${(i + 1) * 8}" y1="0" x2="${(i + 1) * 8}" y2="8"/>`).join('')}
</g></defs></svg>
<header class="cover">
<p class="cover-title">${esc(paper.title)}</p>
<p class="cover-subject">${esc([...paper.subject].join('\u3000'))}</p>
<p class="cover-edition">gk.bdfz.net 真题精校打印版</p>
<div class="cover-fields"><span>姓名<i></i></span><span>班级<i></i></span><span>日期<i></i></span><span>用时<i></i></span><span>得分<i></i></span></div>
${notes}
</header>
${body.join('\n')}
</body>
</html>
`;
}
