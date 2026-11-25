#!/usr/bin/env python3
"""Audit aid: list every character-level difference between a proofread print source and a
fresh draft of the same year from the bank.

    node print/tools/draft.mjs <draftDir>            # fresh drafts, outside print/src
    python3 print/tools/audit.py <draftDir> [year ...]

Typographic normalisation is the same on both sides, so what remains is exactly what proofreading
changed in the text: corrections, removed placeholders, a lead-in printed once instead of twice,
and — the reason this tool exists — anything dropped or altered by mistake.
"""
import difflib
import re
import sys
from pathlib import Path

SKIP = ('@', '%%', '<<<', '>>>', '?', '[')
PREFIX = re.compile(r'^(# |! |== |=- |= |\|\| |\| |-> |~ )')


def sections(path):
    out, current = {}, None
    for raw in Path(path).read_text(encoding='utf-8').split('\n'):
        line = raw.strip()
        if line.startswith('@more'):
            current = line.split()[1]
            continue
        if line.startswith('@record') or line.startswith('@skip'):
            current = line.split()[1]
            out[current] = [] if line.startswith('@record') else None
            continue
        if current is None or out[current] is None or not line or line.startswith(SKIP):
            continue
        line = PREFIX.sub('', line)
        line = re.sub(r'\{=[^}]*\}', '＿', line)
        line = re.sub(r'\{[._~+^?]', '', line).replace('}', '')
        out[current].append(re.sub(r'[\s　]+', '', line))
    return {key: (None if value is None else '\n'.join(value)) for key, value in out.items()}


def main():
    draft_dir = Path(sys.argv[1])
    years = sys.argv[2:] or sorted(p.stem for p in Path('print/src').glob('*.txt'))
    for year in years:
        final, draft = sections(f'print/src/{year}.txt'), sections(draft_dir / f'{year}.txt')
        print(f'===== {year}')
        for record in sorted(set(final) | set(draft)):
            a, b = draft.get(record), final.get(record)
            if record not in final:
                print(f'[{record}] MISSING from the proofread source'); continue
            if record not in draft:
                print(f'[{record}] not in the draft'); continue
            if a is None or b is None:
                if (a is None) != (b is None):
                    print(f'[{record}] skip status changed: draft {"skipped" if a is None else "printed"}, final {"skipped" if b is None else "printed"}')
                continue
            if a == b:
                continue
            flat_a, flat_b = a.replace('\n', ''), b.replace('\n', '')
            matcher = difflib.SequenceMatcher(None, flat_a, flat_b, autojunk=False)
            for tag, i1, i2, j1, j2 in matcher.get_opcodes():
                if tag == 'equal':
                    continue
                before, after = flat_a[i1:i2], flat_b[j1:j2]
                context = flat_a[max(0, i1 - 8):i1] + '【' + before + '→' + after + '】' + flat_a[i2:i2 + 8]
                print(f'[{record}] {tag:7} {context}')


if __name__ == '__main__':
    main()
