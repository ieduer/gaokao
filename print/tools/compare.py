#!/usr/bin/env python3
"""Proofreading aid: compare one print source with an independent transcript of the same paper.

    python3 print/tools/compare.py print/src/2024.txt second-source.txt [--punct]

For every printed paragraph, option and stem it finds the matching passage in the
second transcript and lists the character differences. It only reports; deciding
which side is right is the proofreader's job. Without --punct only characters,
letters and digits are compared; with --punct sentence punctuation is compared too.
"""
import re
import sys
import difflib
import unicodedata

PUNCT_MAP = {',': '，', ';': '；', ':': '：', '?': '？', '!': '！', '(': '（', ')': '）', '．': '。', '.': '。',
             '﹣': '—', '－': '—', '-': '—', '–': '—', '―': '—', '─': '—', '"': '”', '“': '”', "'": '’', '‘': '’',
             '「': '”', '」': '”', '『': '’', '』': '’', '〈': '《', '〉': '》', '•': '·', '・': '·', '‧': '·', '∙': '·'}
KEEP_PUNCT = set('，。；：？！、（）《》”’—…·')


def strip_markup(line):
    line = re.sub(r'\{=[^}]*\}', '', line)
    line = re.sub(r'\{[._~+^]', '', line)
    return line.replace('}', '')


def norm(text, punct):
    out, back = [], []
    for i, ch in enumerate(text):
        ch = unicodedata.normalize('NFKC', ch) if '！' <= ch <= '～' and ch not in '，；：？！（）' else ch
        ch = PUNCT_MAP.get(ch, ch)
        for c in ch:
            if c.isalnum() or '㐀' <= c <= '鿿':
                out.append(c.lower()); back.append(i)
            elif punct and c in KEEP_PUNCT:
                out.append(c); back.append(i)
    return ''.join(out), back


def units(source):
    record = '?'
    for number, raw in enumerate(source.split('\n'), 1):
        line = raw.strip()
        if line.startswith('@record') or line.startswith('@more'):
            record = line.split()[1]
            continue
        if not line or line.startswith(('@', '%%', '<<<', '>>>', '?', '[')):
            continue
        line = re.sub(r'^(# |! |== |=- |= |\| |-> |~ )', '', line)
        yield number, record, strip_markup(line)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    punct = '--punct' in sys.argv
    source = open(args[0], encoding='utf-8').read()
    other_raw = open(args[1], encoding='utf-8').read()
    other, back = norm(other_raw, punct)
    k = 5
    index = {}
    for i in range(len(other) - k + 1):
        index.setdefault(other[i:i + k], []).append(i)
    missing = 0
    for number, record, text in units(source):
        mine, mine_back = norm(text, punct)
        core = re.sub(r'[，。；：？！、（）《》”’—…·]', '', mine)
        if len(core) < 8:
            continue
        votes = {}
        for i in range(0, max(1, len(mine) - k + 1)):
            for pos in index.get(mine[i:i + k], ())[:40]:
                offset = (pos - i) // 12
                votes[offset] = votes.get(offset, 0) + 1
        if not votes:
            missing += 1
            print(f'L{number} [{record}] NOT FOUND: {text[:60]}')
            continue
        best = max(votes, key=votes.get)
        start = max(0, best * 12 - 30)
        window = other[start:start + len(mine) + 90]
        matcher = difflib.SequenceMatcher(None, mine, window, autojunk=False)
        blocks = [b for b in matcher.get_matching_blocks() if b.size]
        if not blocks:
            continue
        first, last = blocks[0], blocks[-1]
        covered = sum(b.size for b in blocks) / max(1, len(mine))
        if covered < 0.55:
            missing += 1
            print(f'L{number} [{record}] WEAK MATCH {covered:.0%}: {text[:60]}')
            continue
        diffs = []
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == 'equal':
                continue
            if j2 <= first.b and i2 <= first.a:
                continue
            if j1 >= last.b + last.size and i1 >= last.a + last.size:
                # unmatched tail of the print line is a real difference; extra window text is not
                if i1 >= len(mine):
                    continue
            if i1 == 0 and i2 <= first.a and tag != 'replace':
                # leading numbering / score differences
                pass
            ctx_a = mine[max(0, i1 - 6):i1] + '【' + mine[i1:i2] + '】' + mine[i2:i2 + 6]
            ctx_b = window[max(0, j1 - 6):j1] + '【' + window[j1:j2] + '】' + window[j2:j2 + 6]
            if j1 >= last.b + last.size and tag == 'insert':
                continue
            if j2 <= first.b and tag == 'insert':
                continue
            ours_part, theirs_part = mine[i1:i2], window[j1:j2]
            # Alignment overflow and score/number bookkeeping are not text differences.
            if len(theirs_part) > 14 and len(ours_part) <= 8:
                continue
            if re.fullmatch(r'[（）共\d分。—]*', ours_part) and re.fullmatch(r'[（）共\d分。各题—a-g]*', theirs_part):
                continue
            diffs.append(f'    ours {ctx_a}   |   theirs {ctx_b}')
        if diffs:
            print(f'L{number} [{record}] {text[:28]}…')
            print('\n'.join(diffs))
    print(f'-- units without a counterpart: {missing}')


if __name__ == '__main__':
    main()
