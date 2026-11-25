// Character model for the print edition drafts.
//
// Bank text carries its marks as index ranges (annotations, reviewed fill blanks,
// source marks) and as inline asterisks. Typographic clean-up changes offsets, so
// every character keeps its own marks while the text is normalised; the result is
// serialised into the print markup ({.x} dot, {_x} underline, {~x} wave, {=N} blank).

export const DOT = 1, UNDERLINE = 2, WAVE = 4;
const MARK_BITS = { dot: DOT, underline: UNDERLINE, wave: WAVE };

const isHan = c => /[㐀-鿿豈-﫿]/u.test(c);
const isAlnum = c => /[A-Za-z0-9]/.test(c);
const isDigit = c => /[0-9]/.test(c);
const isSpace = c => c === ' ' || c === '\u3000' || c === '\u00a0' || c === '\t';
const FW_PUNCT = '，。；：？！、）》”’』」〕】—…·';
const OPEN_PUNCT = '（《“‘『「〔【';

// ranges: [{start,end,type}] on raw indices; blanks: [[start,end]] on raw indices.
export function toChars(raw, { marks = [], blanks = [] } = {}) {
  const text = String(raw ?? '');
  const bits = new Uint8Array(text.length);
  for (const mark of marks) {
    const bit = MARK_BITS[mark.type];
    if (!bit) throw Error(`Unknown mark type ${mark.type}`);
    if (!(mark.start >= 0 && mark.end <= text.length && mark.start < mark.end)) throw Error(`Mark out of range ${JSON.stringify(mark)}`);
    for (let i = mark.start; i < mark.end; i += 1) bits[i] |= bit;
  }
  // Inline asterisk pairs are the older dotted-word convention.
  const drop = new Uint8Array(text.length);
  for (const match of text.matchAll(/\*([^*\n]{1,12})\*/g)) {
    drop[match.index] = 1; drop[match.index + match[0].length - 1] = 1;
    for (let i = match.index + 1; i < match.index + match[0].length - 1; i += 1) if (!isSpace(text[i])) bits[i] |= DOT;
  }
  const blankAt = new Map(blanks.map(([start, end]) => [start, end]));
  const out = [];
  for (let i = 0; i < text.length; i += 1) {
    if (blankAt.has(i)) {
      const end = blankAt.get(i), body = text.slice(i, end);
      const label = body.replace(/[ \t\r\n\u3000]/g, '');
      out.push({ c: '\ue000', blank: { width: Math.max(4, Math.min(14, Math.round(body.replace(/\n/g, '').length * 0.55))), label }, m: 0 });
      if (/\n/.test(body) && !/\n/.test(text[end] || '')) out.push({ c: '\n', m: 0 });
      i = end - 1;
      continue;
    }
    if (drop[i]) continue;
    out.push({ c: text[i], m: bits[i] });
  }
  return out;
}

// Underscore runs are fill blanks as well.
function collapseUnderscores(chars) {
  const out = [];
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i].c === '_' || chars[i].c === '＿') {
      let j = i;
      while (j < chars.length && (chars[j].c === '_' || chars[j].c === '＿')) j += 1;
      if (j - i >= 2) {
        out.push({ c: '\ue000', blank: { width: Math.max(4, Math.min(14, Math.round((j - i) * 0.75))), label: '' }, m: 0 });
        i = j - 1;
        continue;
      }
    }
    out.push(chars[i]);
  }
  return out;
}

const HALF_TO_FULL = { ',': '，', ';': '；', ':': '：', '?': '？', '!': '！', '(': '（', ')': '）' };

export function normalise(input, { gapForSingleSpace = false } = {}) {
  let chars = collapseUnderscores(input).map(ch => (ch.c === '\u00a0' || ch.c === '\t' ? { ...ch, c: ' ' } : ch));
  // Pass 1: punctuation width and dashes.
  const pass1 = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i], c = ch.c;
    const prev = pass1.length ? pass1[pass1.length - 1].c : '\n';
    const next = chars[i + 1]?.c ?? '\n';
    if (ch.blank) { pass1.push(ch); continue; }
    if (HALF_TO_FULL[c]) {
      // Keep digit groups and clock times as they are (1,000 / 8:30).
      if ((c === ',' || c === ':') && isDigit(prev) && isDigit(next)) pass1.push(ch);
      else pass1.push({ ...ch, c: HALF_TO_FULL[c] });
      continue;
    }
    if (c === '-' && next === '-') {
      let j = i; while (chars[j]?.c === '-') j += 1;
      pass1.push({ ...ch, c: '—' }, { ...ch, c: '—' });
      i = j - 1; continue;
    }
    if (c === '-' && isDigit(prev) && isDigit(next)) { pass1.push({ ...ch, c: '—' }); continue; }
    if ((c === '~' || c === '～') && isDigit(prev)) { pass1.push({ ...ch, c: '～' }); continue; }
    if (c === '•' || c === '・' || c === '･' || c === '‧' || c === '∙') { pass1.push({ ...ch, c: '·' }); continue; }
    if (c === '［') { pass1.push({ ...ch, c: '〔' }); continue; }
    if (c === '］') { pass1.push({ ...ch, c: '〕' }); continue; }
    pass1.push(ch);
  }
  chars = pass1;
  // Pass 2: the ASCII full stop.
  const pass2 = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i], c = ch.c;
    if (c !== '.') { pass2.push(ch); continue; }
    const prev = pass2.length ? pass2[pass2.length - 1].c : '\n';
    const next = chars[i + 1]?.c ?? '\n';
    let k = pass2.length - 1; while (k >= 0 && isDigit(pass2[k].c)) k -= 1;
    const beforeNumber = k >= 0 ? pass2[k].c : '\n';
    const numberLead = isDigit(prev) && pass2.length - 1 - k <= 2 && (beforeNumber === '\n' || isSpace(beforeNumber));
    const letterLead = /[A-G]/.test(prev) && (pass2.length < 2 || pass2[pass2.length - 2].c === '\n' || isSpace(pass2[pass2.length - 2].c) || isHan(pass2[pass2.length - 2].c) || FW_PUNCT.includes(pass2[pass2.length - 2].c));
    if (isDigit(prev) && isDigit(next)) { pass2.push(ch); continue; }          // 3.5
    if (numberLead || letterLead) { pass2.push({ ...ch, c: '．' }); continue; }  // 6．  A．
    if (prev === '）' ) continue;                                               // （2）. 请在 → （2）请在
    if (isHan(prev) && isHan(next)) { pass2.push({ ...ch, c: '\ue001' }); continue; } // reviewed by hand: · or 。
    if (isHan(prev) || FW_PUNCT.includes(prev)) { pass2.push({ ...ch, c: '。' }); continue; }
    pass2.push(ch);
  }
  chars = pass2;
  // Pass 3: spaces.
  const pass3 = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (!isSpace(ch.c)) { pass3.push(ch); continue; }
    let j = i; let wide = false;
    while (j < chars.length && isSpace(chars[j].c)) { if (chars[j].c === '\u3000') wide = true; j += 1; }
    const run = j - i;
    const prev = pass3.length ? pass3[pass3.length - 1] : { c: '\n' };
    const next = chars[j] ?? { c: '\n' };
    i = j - 1;
    if (prev.c === '\n' || next.c === '\n') continue;                              // line edges
    if (prev.c === '（' && next.c === '）') { pass3.push({ c: '\u3000', m: 0 }, { c: '\u3000', m: 0 }); continue; } // answer bracket
    if (run >= 2 || wide) { pass3.push({ c: '\ue002', m: 0 }); continue; }           // column gap
    const p = prev.c, n = next.c;
    if (prev.blank || next.blank) continue;
    if (FW_PUNCT.includes(p) || OPEN_PUNCT.includes(p) || FW_PUNCT.includes(n) || OPEN_PUNCT.includes(n) || p === '．' || n === '．') continue;
    if ((isHan(p) && isAlnum(n)) || (isAlnum(p) && isHan(n))) continue;
    if (isAlnum(p) && isAlnum(n)) { pass3.push({ c: ' ', m: 0 }); continue; }
    if (isHan(p) && isHan(n)) { pass3.push({ c: gapForSingleSpace ? '\ue002' : '\ue003', m: 0 }); continue; }
    if (n === '/' || p === '/') { pass3.push({ c: '\ue002', m: 0 }); continue; }
    pass3.push({ c: ' ', m: 0 });
  }
  return pass3;
}

const esc = c => (c === '{' || c === '}' ? `\\${c}` : c);

// One markup string per source line.
export function serialise(chars) {
  const lines = [[]];
  for (const ch of chars) { if (ch.c === '\n') lines.push([]); else lines[lines.length - 1].push(ch); }
  return lines.map(line => {
    let out = '', open = 0;
    const close = () => { if (open & DOT) out += '}'; if (open & WAVE) out += '}'; if (open & UNDERLINE) out += '}'; open = 0; };
    for (const ch of line) {
      const marks = ch.blank || ch.c === '\ue002' ? ch.m & (UNDERLINE | WAVE) : ch.m;
      if (marks !== open) {
        close();
        if (marks & UNDERLINE) out += '{_';
        if (marks & WAVE) out += '{~';
        if (marks & DOT) out += '{.';
        open = marks;
      }
      if (ch.blank) out += `{=${ch.blank.width}${ch.blank.label ? ':' + ch.blank.label : ''}}`;
      else if (ch.c === '\ue002') out += '\u3000\u3000';
      else if (ch.c === '\ue003') out += '\u3000';
      else if (ch.c === '\ue001') out += '{?.}';
      else out += esc(ch.c);
    }
    close();
    return out;
  });
}

export const plain = markup => markup.replace(/\{=[^}]*\}/g, '＿＿').replace(/\{[._~+^?]/g, '').replace(/\}/g, '');
export const visualLength = markup => [...plain(markup)].reduce((n, c) => n + (/[\x20-\x7e]/.test(c) ? 0.5 : 1), 0);
