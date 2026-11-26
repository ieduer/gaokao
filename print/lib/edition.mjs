import { createHash } from 'node:crypto';

// Shown in the page footer; change it when a new proofread edition is issued.
export const EDITION = '2026.11 精校版';

// Build inputs kept outside the repository (SIL OFL 1.1). sha256 of the exact files used: the four instances were made with
// fonttools varLib.instancer --no-recalc-timestamp (reproducible bytes) from google/fonts NotoSerifSC[wght].ttf (050080d9…)
// and NotoSansSC[wght].ttf (a3041811…). Years printed before 2026-11-25 23:40Z used instances that differed only in head.modified.
export const FONT_FILES = {
  'PSong-Regular.ttf': '15ec0fa3bd82b3c98e981b1ef12c30ac380caff6b5ab2998e2d77daba3ab2732',
  'PSong-Bold.ttf': '45da267af99d7b1aa79398f4589fcf8f852d339b2592f68a91fd12a8f7bb3e8e',
  'PHei-Medium.ttf': '55215c6c9d56715430a51b2e71b4b0e9617daed929358ed0831dfc359683e55e',
  'PHei-Bold.ttf': '984cc8f1b8463689f39f653c783188a3914b2ea4bc084db240569d5e6473d035',
  'LXGWWenKaiGB-Regular.ttf': '5561d48097d92e5ab99fe7b1459d381bbcdff533bfc479207b089c6860c3990e',
};

// The lines of a source that reach the page: %% comments (proofreading notes, provenance) and the bank
// binding (bind=) of each section are never printed.
export const printedSource = source => source.split('\n').filter(line => !line.startsWith('%%'))
  .map(line => (/^@(record|skip) /.test(line) ? line.replace(/ bind=[a-f0-9]{16}/, '') : line)).join('\n');

// Binds a sealed PDF to the printed content of the source and the stylesheet it was printed from,
// so a change to a comment alone needs no re-print.
export const sourceDigest = (source, css) => createHash('sha256').update(JSON.stringify([EDITION, printedSource(source), css])).digest('hex');
