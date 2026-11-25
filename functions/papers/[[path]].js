// Signed-in download of the print edition (/papers/<year>.pdf).
//
// Every request under /papers/ runs this function before any static file is served. The papers are
// published only as sealed files (papers/<year>.pdf.enc); this function opens one with the project's
// key after User Center has confirmed the reader's session. The session cookie the browser sends to
// *.bdfz.net is forwarded to User Center and nowhere else. Anything that cannot be confirmed is refused:
// no cookie, an unknown answer, a slow or failing User Center, a missing key.
import { importPaperKey, openPaper, isSealedPaper } from '../_shared/print-paper-crypto.js';

const SITE_ORIGIN = 'https://gk.bdfz.net';
const USER_CENTER_ORIGIN = 'https://my.bdfz.net';
const SESSION_COOKIE = 'bdfz_uc_session';
const PAPER_PATH = /^\/papers\/(20\d{2})\.pdf$/;
const SESSION_TIMEOUT_MS = 6000;
const MAX_SEALED_BYTES = 20_000_000;

const baseHeaders = () => ({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' });
const json = (body, status, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...baseHeaders(), 'Content-Type': 'application/json; charset=utf-8', ...extra } });

export function sessionToken(cookieHeader) {
  for (const part of String(cookieHeader || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(index + 1).trim();
    // One bounded cookie value; nothing else from the request reaches User Center.
    return /^[A-Za-z0-9._~%+/=-]{16,4096}$/.test(value) ? value : '';
  }
  return '';
}

export const loginUrl = year => `${USER_CENTER_ORIGIN}/?returnTo=${encodeURIComponent(`${SITE_ORIGIN}/?print=${year}`)}`;

// → { state: 'signed_in' | 'signed_out' | 'unavailable', setCookies: string[] }
export async function resolveSession(token, fetcher = fetch) {
  if (!token) return { state: 'signed_out', setCookies: [] };
  let response;
  try {
    response = await fetcher(`${USER_CENTER_ORIGIN}/api/session`, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(SESSION_TIMEOUT_MS),
      headers: { Cookie: `${SESSION_COOKIE}=${token}`, Accept: 'application/json' },
    });
  } catch { return { state: 'unavailable', setCookies: [] }; }
  if (response.status !== 200) return { state: response.status >= 500 || response.status === 429 ? 'unavailable' : 'signed_out', setCookies: [] };
  let payload;
  try { payload = await response.json(); } catch { return { state: 'unavailable', setCookies: [] }; }
  if (payload?.authenticated !== true || typeof payload.user?.slug !== 'string' || !payload.user.slug) return { state: 'signed_out', setCookies: [] };
  // User Center may renew the session here; the renewed cookie has to reach the browser.
  const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return { state: 'signed_in', setCookies: setCookies.filter(cookie => cookie.startsWith(`${SESSION_COOKIE}=`)) };
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'GET, HEAD' });
  const match = url.pathname.match(PAPER_PATH);
  if (!match) return json({ ok: false, error: 'not_found' }, 404);
  const year = match[1];
  const session = await resolveSession(sessionToken(request.headers.get('Cookie')));
  if (session.state === 'unavailable') return json({ ok: false, error: 'session_check_unavailable', message: '暂时无法确认登录状态，请稍后再试。' }, 503, { 'Retry-After': '30' });
  if (session.state !== 'signed_in') {
    const navigation = request.headers.get('Sec-Fetch-Mode') === 'navigate' || /\btext\/html\b/.test(request.headers.get('Accept') || '');
    if (navigation) return new Response(null, { status: 302, headers: { ...baseHeaders(), Location: loginUrl(year) } });
    return json({ ok: false, error: 'login_required', message: '登录后才能下载打印版。', loginUrl: loginUrl(year) }, 401);
  }
  const unavailable = () => json({ ok: false, error: 'paper_unavailable', message: '打印版暂时无法提供，请稍后再试。' }, 503, { 'Retry-After': '300' });
  if (!env?.ASSETS?.fetch || !env.PRINT_PAPERS_KEY) return unavailable();
  let key;
  try { key = await importPaperKey(env.PRINT_PAPERS_KEY); } catch { return unavailable(); }
  const asset = await env.ASSETS.fetch(new Request(new URL(`/papers/${year}.pdf.enc`, url.origin), { method: 'GET' }));
  // A missing file on Pages answers 200 with the site HTML, so the content is checked, not the status alone.
  const length = Number(asset.headers.get('Content-Length') || 0);
  if (asset.status !== 200 || length > MAX_SEALED_BYTES) return json({ ok: false, error: 'not_found', message: '这一年的打印版尚未提供。' }, 404);
  const sealed = new Uint8Array(await asset.arrayBuffer());
  if (!isSealedPaper(sealed) || sealed.length > MAX_SEALED_BYTES) return json({ ok: false, error: 'not_found', message: '这一年的打印版尚未提供。' }, 404);
  let pdf;
  try { pdf = await openPaper(key, year, sealed); } catch { return unavailable(); }
  if (pdf.length < 5 || String.fromCharCode(...pdf.subarray(0, 5)) !== '%PDF-') return unavailable();
  const headers = new Headers(baseHeaders());
  headers.set('Content-Type', 'application/pdf');
  headers.set('Content-Length', String(pdf.length));
  headers.set('Accept-Ranges', 'none');
  const disposition = url.searchParams.get('view') === '1' ? 'inline' : 'attachment';
  const name = `${year}年北京高考语文真题（精校打印版）.pdf`;
  headers.set('Content-Disposition', `${disposition}; filename="gk-beijing-yuwen-${year}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`);
  for (const cookie of session.setCookies) headers.append('Set-Cookie', cookie);
  return new Response(request.method === 'HEAD' ? null : pdf, { status: 200, headers });
}
