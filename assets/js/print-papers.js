// 真题打印版：按年份下载精校 PDF。文件只发给已登录的读者（functions/papers/[[path]].js 逐次向用户中心核对），
// 这里的登录状态只决定界面怎么提示，不是权限判断。
const MANIFEST_URL = 'data/print-papers.json';
const SITE_ORIGIN = 'https://gk.bdfz.net';
const USER_CENTER_ORIGIN = 'https://my.bdfz.net';

export const paperUrl = year => `/papers/${year}.pdf`;
export const loginUrl = year => `${USER_CENTER_ORIGIN}/?returnTo=${encodeURIComponent(`${SITE_ORIGIN}/?print=${year || 1}`)}`;
export const sizeLabel = bytes => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function validPapers(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.papers)) return [];
  return manifest.papers
    .filter(p => Number.isInteger(p?.year) && p.year >= 2000 && p.year < 2100 && p.file === `${p.year}.pdf` && Number.isInteger(p.pages) && p.pages > 0 && Number.isInteger(p.bytes) && p.bytes > 0)
    .sort((a, b) => b.year - a.year);
}

async function signedIn() {
  const identity = window.BdfzIdentity;
  if (!identity?.getSession) return null; // unknown: the server decides
  const session = await identity.getSession().catch(() => null);
  return session ? Boolean(session.authenticated) : null;
}

function element(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

function buildDialog() {
  const close = element('button', { type: 'button', class: 'icon-btn', 'data-action': 'close', text: '关闭' });
  const status = element('p', { class: 'print-status', role: 'status', text: '正在读取…' });
  const list = element('ul', { class: 'print-list' });
  const dialog = element('dialog', { id: 'print-dialog', class: 'custom-dialog print-dialog', 'aria-labelledby': 'print-dialog-title' }, [
    element('div', { class: 'print-panel' }, [
      element('header', { class: 'print-head' }, [element('h2', { id: 'print-dialog-title', text: '真题打印版' }), close]),
      element('p', { class: 'print-intro', text: '历年北京高考语文真题的精校 PDF，按年份下载。A4 版面，题后留有答题区，微写作与作文附方格稿纸，可直接打印。' }),
      status,
      list,
    ]),
  ]);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  return { dialog, status, list };
}

let ui = null;
let manifestPromise = null;

async function loadPapers() {
  manifestPromise ||= fetch(MANIFEST_URL, { cache: 'no-cache' }).then(response => {
    if (!response.ok || !/json/.test(response.headers.get('Content-Type') || '')) throw new Error('manifest');
    return response.json();
  }).then(validPapers);
  try { return await manifestPromise; } catch (error) { manifestPromise = null; throw error; }
}

async function render(focusYear) {
  const { status, list } = ui;
  list.replaceChildren();
  let papers;
  try { papers = await loadPapers(); } catch {
    status.textContent = '打印版目录暂时读取不到，请稍后再试。';
    return;
  }
  if (!papers.length) { status.textContent = '打印版尚未提供。'; return; }
  const authenticated = await signedIn();
  status.replaceChildren();
  if (authenticated === false) {
    status.append('登录后才能下载。', element('a', { class: 'primary-btn print-login', href: loginUrl(focusYear), text: '登录' }));
  } else if (authenticated) status.textContent = `已登录，共 ${papers.length} 个年份可下载。`;
  else status.textContent = `共 ${papers.length} 个年份；下载时需要登录。`;
  for (const paper of papers) {
    const href = authenticated === false ? loginUrl(paper.year) : paperUrl(paper.year);
    const link = element('a', { class: 'secondary-btn print-download', href, text: authenticated === false ? '登录后下载' : '下载 PDF' });
    if (authenticated !== false) link.setAttribute('download', '');
    const row = element('li', { class: 'print-row', 'data-year': String(paper.year) }, [
      element('span', { class: 'print-year', text: `${paper.year} 年` }),
      element('span', { class: 'print-meta', text: `${paper.pages} 页 · ${sizeLabel(paper.bytes)}` }),
      link,
    ]);
    if (paper.year === focusYear) row.classList.add('is-focus');
    list.append(row);
  }
  const focus = focusYear && list.querySelector(`[data-year="${focusYear}"] a`);
  if (focus) { focus.scrollIntoView({ block: 'center' }); focus.focus(); }
}

export function openPrintDialog(focusYear = null) {
  ui ||= buildDialog();
  if (!ui.dialog.open) ui.dialog.showModal();
  return render(focusYear);
}

function init() {
  document.getElementById('open-print-btn')?.addEventListener('click', () => openPrintDialog());
  // Returning from sign-in (?print=<year>) reopens the list at that year.
  const params = new URLSearchParams(window.location.search);
  if (params.has('print')) {
    const year = Number(params.get('print'));
    params.delete('print');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    openPrintDialog(Number.isInteger(year) && year >= 2000 && year < 2100 ? year : null);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}
