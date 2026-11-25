import { createHash } from 'node:crypto';

// Shown in the page footer; change it when a new proofread edition is issued.
export const EDITION = '2026.11 精校版';

// Build inputs kept outside the repository (SIL OFL 1.1). sha256 of the exact files used: the four instances were made with
// fonttools 4.x varLib.instancer from google/fonts NotoSerifSC[wght].ttf (050080d9…) and NotoSansSC[wght].ttf (a3041811…).
export const FONT_FILES = {
  'PSong-Regular.ttf': '4cf1eeb647ccdd3c487345aba1dcbf9aa04cb09e39cf92e545412639290d06ea',
  'PSong-Bold.ttf': 'ba600affffabdb79e26f00bed827ec7a8cac2b4034eb5c6e1a87e35392ac144f',
  'PHei-Medium.ttf': '87eecb36e0479b8e1fa6cc9eb21d705c6d2352e7109ff9f65cf803f64a8b2f3b',
  'PHei-Bold.ttf': '4ac46ba42ccf41a461788b2dd61fd66e9c21d5790188626384393dad19511c7c',
  'LXGWWenKaiGB-Regular.ttf': '5561d48097d92e5ab99fe7b1459d381bbcdff533bfc479207b089c6860c3990e',
};

// Binds a committed PDF to the source and stylesheet it was printed from.
export const sourceDigest = (source, css) => createHash('sha256').update(JSON.stringify([EDITION, source, css])).digest('hex');
