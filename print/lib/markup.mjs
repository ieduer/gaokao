// Parser for the print sources (print/src/<year>.txt).
//
// Line prefixes
//   @year / @title / @subject / @note      paper header fields (@note may repeat)
//   @record <id> bind=<hash>               start of the section printed from one bank record
//   @skip <id> bind=<hash> reason=<text>   bank record deliberately not printed
//   @more <id>                             a later part of an earlier @record, printed at this place
//   %% …                                   comment
//   # …                                    section heading          ! …   instruction line
//   <<< kai|poem|song [spaced]   …  >>>    reading material block
//       == label   = title   =- byline   | centred line   -> source line (right)   [image <asset> <mm>]
//   ~ …                                    note line (small type)
//   ? choice|open|fill|write [cols=N] [nobox]   …  ?.      question
//       lines starting with A．…G． are options; an option line may hold cells split by two ideographic spaces
//       [lines N [label]]   [grid ROWS [title|heading]]   [space MM]
//   || a | b | c                           one row of a ruled table (consecutive rows form the table; an empty cell is allowed)
//   [pagebreak]
// Inline marks
//   {.x} dotted   {_x} underlined   {~x} wavy   {=N} blank N em wide   {=N:①} labelled blank
//   {+扌豕} two components set as one character   {^x} superscript   \{ \} literal braces

const fail = (message, where) => { throw Error(`${where ? `${where}: ` : ''}${message}`); };

export function parseInline(source, where = '') {
  let i = 0;
  const read = closing => {
    const nodes = []; let text = '';
    const flush = () => { if (text) { nodes.push({ t: 'text', v: text }); text = ''; } };
    while (i < source.length) {
      const c = source[i];
      if (c === '\\' && (source[i + 1] === '{' || source[i + 1] === '}')) { text += source[i + 1]; i += 2; continue; }
      if (c === '}') { if (!closing) fail('unbalanced }', where); flush(); i += 1; return nodes; }
      if (c !== '{') { text += c; i += 1; continue; }
      flush();
      const kind = source[i + 1]; i += 2;
      if (kind === '=') {
        const end = source.indexOf('}', i); if (end < 0) fail('unterminated blank', where);
        const [width, label = ''] = source.slice(i, end).split(':');
        if (!/^\d{1,2}(\.\d)?$/.test(width) || Number(width) < 1 || Number(width) > 40) fail(`bad blank width "${width}"`, where);
        nodes.push({ t: 'blank', width: Number(width), label }); i = end + 1; continue;
      }
      if (kind === '+') {
        const end = source.indexOf('}', i); if (end < 0) fail('unterminated composed character', where);
        const parts = [...source.slice(i, end)]; if (parts.length !== 2) fail('a composed character takes two components', where);
        nodes.push({ t: 'compose', parts }); i = end + 1; continue;
      }
      const type = { '.': 'dot', '_': 'ul', '~': 'wave', '^': 'sup' }[kind];
      if (!type) fail(`unknown mark {${kind}`, where);
      nodes.push({ t: type, children: read(true) });
    }
    if (closing) fail('unterminated mark', where);
    flush();
    return nodes;
  };
  return read(false);
}

export const inlineText = nodes => nodes.map(n => n.t === 'text' ? n.v : n.t === 'blank' ? '＿＿' : n.t === 'compose' ? n.parts.join('') : inlineText(n.children)).join('');

const OPTION = /^([A-G])．/;
const directive = line => line.match(/^\[(lines|grid|space|image|pagebreak)(?:\s+([^\]]*))?\]$/);

export function parsePaper(source, name = 'paper') {
  const paper = { year: null, title: '', subject: '', notes: [], records: [] };
  let record = null, block = null, question = null;
  const rows = source.split('\n');
  const target = () => (question ? question.items : record ? record.nodes : fail('content before the first @record'));
  rows.forEach((rawLine, index) => {
    const where = `${name}:${index + 1}`;
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim() || line.startsWith('%%')) return;
    if (block) {
      if (line === '>>>') { block = null; return; }
      const image = directive(line);
      if (image?.[1] === 'image') {
        const [asset, width] = (image[2] || '').split(/\s+/);
        if (!/^assets\/img\/[a-z0-9-]+\.jpg$/.test(asset) || !/^\d{2,3}$/.test(width || '')) fail('bad image directive', where);
        block.items.push({ type: 'image', asset, width: Number(width) }); return;
      }
      const prefixes = [['== ', 'label'], ['=- ', 'byline'], ['= ', 'title'], ['| ', 'line'], ['-> ', 'source']];
      const hit = prefixes.find(([prefix]) => line.startsWith(prefix));
      block.items.push(hit ? { type: hit[1], inline: parseInline(line.slice(hit[0].length), where) } : { type: 'para', inline: parseInline(line, where) });
      return;
    }
    if (line.startsWith('@')) {
      const [, key, rest = ''] = line.match(/^@(\w+)\s*(.*)$/) || fail('bad header line', where);
      if (key === 'year') paper.year = Number(rest);
      else if (key === 'title') paper.title = rest;
      else if (key === 'subject') paper.subject = rest;
      else if (key === 'note') paper.notes.push(rest);
      else if (key === 'record' || key === 'skip') {
        if (question) fail('@record inside a question', where);
        const match = rest.match(/^(\S+)\s+bind=([a-f0-9]{16})(?:\s+reason=(.+))?$/) || fail(`bad @${key}`, where);
        record = { id: match[1], bind: match[2], skip: key === 'skip', reason: match[3] || '', nodes: [], line: index + 1 };
        if (record.skip && !record.reason) fail('@skip needs a reason', where);
        if (paper.records.some(r => r.id === record.id)) fail(`duplicate record ${record.id}`, where);
        paper.records.push(record);
      } else if (key === 'more') {
        // A later part of a record that the paper prints in two places (for example questions 1–6 and 23–25 of one bank unit).
        if (question) fail('@more inside a question', where);
        if (!paper.records.some(r => r.id === rest && !r.skip && !r.more)) fail(`@more ${rest} has no earlier @record`, where);
        record = { id: rest, more: true, skip: false, nodes: [], line: index + 1 };
        paper.records.push(record);
      } else fail(`unknown header @${key}`, where);
      return;
    }
    if (!record || record.skip) fail('content outside a printed @record', where);
    if (line.startsWith('<<<')) {
      const [, kind = 'kai', spaced] = line.match(/^<<<\s*(kai|poem|song)?\s*(spaced)?$/) || fail('bad material opener', where);
      block = { type: 'material', kind, spaced: Boolean(spaced), items: [] };
      target().push(block); return;
    }
    if (line.startsWith('? ')) {
      if (question) fail('question inside a question', where);
      const [, kind, attrs = ''] = line.match(/^\? (choice|open|fill|write)\b\s*(.*)$/) || fail('bad question opener', where);
      const cols = attrs.match(/\bcols=(\d)\b/);
      question = { type: 'question', kind, cols: cols ? Number(cols[1]) : null, nobox: /\bnobox\b/.test(attrs), items: [], line: index + 1 };
      record.nodes.push(question); return;
    }
    if (line === '?.') { if (!question) fail('?. without a question', where); question = null; return; }
    const d = directive(line);
    if (d) {
      const [, name, args = ''] = d;
      if (name === 'pagebreak') { target().push({ type: 'pagebreak' }); return; }
      if (name === 'lines') {
        const [, count, label = ''] = args.match(/^(\d{1,2})(?:\s+(.+))?$/) || fail('bad [lines]', where);
        if (Number(count) < 1 || Number(count) > 30) fail('line count out of range', where);
        target().push({ type: 'lines', count: Number(count), label: label ? parseInline(label, where) : null }); return;
      }
      if (name === 'grid') {
        const [, rowsCount, flag] = args.match(/^(\d{1,3})(?:\s+(title|heading))?$/) || fail('bad [grid]', where);
        if (Number(rowsCount) < 1 || Number(rowsCount) > 80) fail('grid rows out of range', where);
        target().push({ type: 'grid', rows: Number(rowsCount), title: flag === 'title', heading: flag === 'heading' }); return;
      }
      if (name === 'space') {
        if (!/^\d{1,3}$/.test(args)) fail('bad [space]', where);
        target().push({ type: 'space', mm: Number(args) }); return;
      }
      fail(`[${name}] is not allowed here`, where);
    }
    if (line.startsWith('|| ')) {
      // Consecutive "|| a | b | c" lines form one ruled table.
      const cells = line.slice(3).split(' | ').map(cell => parseInline(cell.trim(), where));
      const list = target(), last = list[list.length - 1];
      if (last?.type === 'table' && last.endLine === index) { if (cells.length !== last.rows[0].length) fail('table rows differ in width', where); last.rows.push(cells); last.endLine = index + 1; }
      else list.push({ type: 'table', rows: [cells], endLine: index + 1 });
      return;
    }
    if (line.startsWith('# ')) { if (question) fail('heading inside a question', where); record.nodes.push({ type: 'heading', inline: parseInline(line.slice(2), where) }); return; }
    if (line.startsWith('! ')) { target().push({ type: 'instruction', inline: parseInline(line.slice(2), where) }); return; }
    if (line.startsWith('~ ')) { target().push({ type: 'note', inline: parseInline(line.slice(2), where) }); return; }
    if (!question) fail('text outside a question or material block', where);
    if (OPTION.test(line)) {
      const cells = line.split('\u3000\u3000').map(cell => parseInline(cell.trim(), where));
      question.items.push({ type: 'option', letter: line[0], cells, cont: [] }); return;
    }
    const last = question.items[question.items.length - 1];
    if (last?.type === 'option' && /^\s/.test(rawLine)) { last.cont.push(parseInline(line.trim(), where)); return; }
    question.items.push({ type: 'text', inline: parseInline(line.trim(), where) });
  });
  if (block) fail('unterminated material block', name);
  if (question) fail('unterminated question', name);
  if (!Number.isInteger(paper.year) || !paper.title || !paper.subject) fail('missing @year, @title or @subject', name);
  return paper;
}
