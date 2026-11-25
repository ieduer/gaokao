// The print PDFs are published sealed and are opened only for a session that User Center confirms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, sessionToken, loginUrl, resolveSession } from '../functions/papers/[[path]].js';
import { importPaperKey, sealPaper, openPaper, isSealedPaper, SEAL_OVERHEAD } from '../functions/_shared/print-paper-crypto.js';

const TOKEN = 'v2.abcdefghijklmnopqrstuvwxyz0123456789';
const PDF = new TextEncoder().encode('%PDF-1.4\n% print edition test body\n%%EOF\n');
const KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');
const sealed = async (year = '2024', secret = KEY, plain = PDF) => sealPaper(await importPaperKey(secret), year, plain);

async function harness({ session = { authenticated: true, user: { slug: 'seiue-1' } }, sessionStatus = 200, sessionThrows = false, setCookie = null, asset, assetType = 'application/octet-stream', key = KEY } = {}) {
  const body = asset === undefined ? await sealed() : asset;
  const calls = { session: [], assets: [] };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    calls.session.push({ url: String(input), headers: { ...init.headers }, redirect: init.redirect });
    if (sessionThrows) throw new Error('network');
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (setCookie) headers.append('Set-Cookie', setCookie);
    return new Response(typeof session === 'string' ? session : JSON.stringify(session), { status: sessionStatus, headers });
  };
  const env = { ...(key ? { PRINT_PAPERS_KEY: key } : {}), ASSETS: { fetch: async request => {
    calls.assets.push({ url: request.url, method: request.method });
    return new Response(body, { status: 200, headers: { 'Content-Type': assetType, 'Content-Length': String(body.length) } });
  } } };
  const call = (path, { method = 'GET', cookie = `other=1; bdfz_uc_session=${TOKEN}`, headers = {} } = {}) =>
    onRequest({ request: new Request(`https://gk.bdfz.net${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } }), env });
  return { calls, call, restore: () => { globalThis.fetch = originalFetch; } };
}

test('a confirmed session gets the opened paper as an attachment and nothing is cached', async () => {
  const h = await harness();
  try {
    const response = await h.call('/papers/2024.pdf');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'application/pdf');
    assert.equal(response.headers.get('Content-Length'), String(PDF.length));
    assert.match(response.headers.get('Content-Disposition'), /^attachment; filename="gk-beijing-yuwen-2024\.pdf"; filename\*=UTF-8''2024%E5%B9%B4/);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PDF);
    assert.equal(h.calls.session.length, 1);
    assert.equal(h.calls.session[0].url, 'https://my.bdfz.net/api/session');
    // Only the session cookie value travels to User Center.
    assert.deepEqual(h.calls.session[0].headers, { Cookie: `bdfz_uc_session=${TOKEN}`, Accept: 'application/json' });
    assert.equal(h.calls.session[0].redirect, 'manual');
    assert.deepEqual(h.calls.assets, [{ url: 'https://gk.bdfz.net/papers/2024.pdf.enc', method: 'GET' }]);
  } finally { h.restore(); }
});

test('without a session cookie nothing is fetched: a page visit goes to sign-in, a script gets 401', async () => {
  const h = await harness();
  try {
    const page = await h.call('/papers/2024.pdf', { cookie: '', headers: { 'Sec-Fetch-Mode': 'navigate' } });
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('Location'), 'https://my.bdfz.net/?returnTo=https%3A%2F%2Fgk.bdfz.net%2F%3Fprint%3D2024');
    const script = await h.call('/papers/2024.pdf', { cookie: 'theme=mono' });
    assert.equal(script.status, 401);
    assert.equal((await script.json()).error, 'login_required');
    assert.equal(script.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(h.calls.session.length, 0);
    assert.equal(h.calls.assets.length, 0);
  } finally { h.restore(); }
});

test('a session User Center does not confirm is refused and the file is never read', async () => {
  for (const options of [
    { session: { authenticated: false, user: null } },
    { session: { authenticated: true, user: {} } },
    { session: { authenticated: 'true', user: { slug: 'x' } } },
    { session: { user: { slug: 'x' } } },
    { sessionStatus: 401 },
    { sessionStatus: 302 },
  ]) {
    const h = await harness(options);
    try {
      const response = await h.call('/papers/2024.pdf');
      assert.equal(response.status, 401, JSON.stringify(options));
      assert.equal(h.calls.assets.length, 0);
    } finally { h.restore(); }
  }
});

test('when the session check itself fails the answer is 503, never the file and never a sign-in loop', async () => {
  for (const options of [{ sessionThrows: true }, { sessionStatus: 500 }, { sessionStatus: 429 }, { session: '<html>' }]) {
    const h = await harness(options);
    try {
      const response = await h.call('/papers/2024.pdf', { headers: { 'Sec-Fetch-Mode': 'navigate' } });
      assert.equal(response.status, 503, JSON.stringify(options));
      assert.equal(response.headers.get('Retry-After'), '30');
      assert.equal(h.calls.assets.length, 0);
    } finally { h.restore(); }
  }
});

test('only /papers/<year>.pdf exists; other paths and methods never reach User Center or the files', async () => {
  const h = await harness();
  try {
    for (const path of ['/papers/', '/papers/index.json', '/papers/2024.pdf.enc', '/papers/2024.pdf/x', '/papers/1999.pdf', '/papers/2024.PDF', '/papers/20245.pdf', '/papers/2024.pdf%00.html'])
      assert.equal((await h.call(path)).status, 404, path);
    assert.equal((await h.call('/papers/2024.pdf', { method: 'POST' })).status, 405);
    assert.equal(h.calls.session.length, 0);
    assert.equal(h.calls.assets.length, 0);
  } finally { h.restore(); }
});

test('a year without a sealed file is 404 even though Pages answers a missing file with the site HTML', async () => {
  const h = await harness({ asset: new TextEncoder().encode('<!doctype html><title>AI 高考</title>'), assetType: 'text/html; charset=utf-8' });
  try {
    const response = await h.call('/papers/2031.pdf');
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  } finally { h.restore(); }
});

test('a paper that cannot be opened is never served: missing or wrong key, another year, altered bytes, not a PDF', async () => {
  const good = await sealed();
  const altered = Uint8Array.from(good); altered[altered.length - 20] ^= 1;
  for (const options of [
    { key: '' }, { key: 'not-base64!!' }, { key: Buffer.alloc(16, 1).toString('base64') }, { key: OTHER_KEY },
    { asset: await sealed('2023') }, { asset: altered }, { asset: await sealed('2024', KEY, new TextEncoder().encode('<html>not a pdf</html>')) },
  ]) {
    const h = await harness(options);
    try {
      const response = await h.call('/papers/2024.pdf');
      assert.equal(response.status, 503, JSON.stringify({ ...options, asset: options.asset ? '…' : undefined }));
      assert.equal((await response.json()).error, 'paper_unavailable');
    } finally { h.restore(); }
  }
});

test('a renewed session cookie is passed on; unrelated cookies from User Center are not', async () => {
  const h = await harness({ setCookie: 'bdfz_uc_session=v2.renewed; Path=/; Domain=.bdfz.net; HttpOnly; Secure; SameSite=None; Max-Age=604800' });
  try {
    const response = await h.call('/papers/2024.pdf');
    assert.deepEqual(response.headers.getSetCookie(), ['bdfz_uc_session=v2.renewed; Path=/; Domain=.bdfz.net; HttpOnly; Secure; SameSite=None; Max-Age=604800']);
  } finally { h.restore(); }
  const other = await harness({ setCookie: 'tracking=1; Path=/' });
  try { assert.deepEqual((await other.call('/papers/2024.pdf')).headers.getSetCookie(), []); } finally { other.restore(); }
});

test('HEAD answers with the headers only; ?view=1 shows the paper inline', async () => {
  const h = await harness();
  try {
    const head = await h.call('/papers/2024.pdf', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('Content-Length'), String(PDF.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.match((await h.call('/papers/2024.pdf?view=1')).headers.get('Content-Disposition'), /^inline;/);
  } finally { h.restore(); }
});

test('sealing binds the key, the year and every byte', async () => {
  const key = await importPaperKey(KEY), file = await sealPaper(key, '2024', PDF);
  assert.equal(file.length, PDF.length + SEAL_OVERHEAD);
  assert.equal(isSealedPaper(file), true);
  assert.equal(isSealedPaper(PDF), false);
  assert.deepEqual(await openPaper(key, '2024', file), PDF);
  assert.notDeepEqual(await sealPaper(key, '2024', PDF), file, 'a fresh nonce for every sealing');
  await assert.rejects(openPaper(key, '2025', file));
  await assert.rejects(openPaper(await importPaperKey(OTHER_KEY), '2024', file));
  await assert.rejects(openPaper(key, '2024', PDF));
  await assert.rejects(importPaperKey('short'));
  await assert.rejects(sealPaper(key, '24', PDF));
  // The sealed file shows nothing of the paper.
  assert.equal(Buffer.from(file).includes(Buffer.from('print edition')), false);
});

test('cookie parsing accepts one bounded token and nothing else', () => {
  assert.equal(sessionToken(`a=1; bdfz_uc_session=${TOKEN}; b=2`), TOKEN);
  assert.equal(sessionToken('bdfz_uc_session=short'), '');
  assert.equal(sessionToken('bdfz_uc_session=has space and more chars here'), '');
  assert.equal(sessionToken(`xbdfz_uc_session=${TOKEN}`), '');
  assert.equal(sessionToken(''), '');
  assert.equal(sessionToken(null), '');
  assert.equal(loginUrl('2026'), 'https://my.bdfz.net/?returnTo=https%3A%2F%2Fgk.bdfz.net%2F%3Fprint%3D2026');
});

test('resolveSession reports a missing token without a request', async () => {
  let called = false;
  assert.deepEqual(await resolveSession('', async () => { called = true; }), { state: 'signed_out', setCookies: [] });
  assert.equal(called, false);
});
