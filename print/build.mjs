// Builds the per-year print PDFs from print/src/<year>.txt with headless Chrome.
// Local step only (needs Chrome and the open fonts). The PDFs themselves stay out of the public
// repository: each is sealed with the print paper key into papers/<year>.pdf.enc, and
// data/print-papers.json lists them. Pages publishes the sealed files; functions/papers opens them.
//
//   GK_PRINT_FONTS=<dir> GK_PRINT_PAPERS_KEY=<base64 key> node print/build.mjs [--years 2024,2025]
//   … --out <dir>          where the readable PDFs are written (default .print-work/pdf)
//   … --no-manifest        proofreading preview: readable PDFs only, nothing sealed, no key needed
//   … --src <dir> --work <dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parsePaper } from './lib/markup.mjs';
import { paperHtml } from './lib/render.mjs';
import { FONT_FILES, sourceDigest, EDITION } from './lib/edition.mjs';
import { importPaperKey, sealPaper, openPaper } from '../functions/_shared/print-paper-crypto.js';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const root = process.cwd();
const srcDir = resolve(option('src', 'print/src'));
const workDir = resolve(option('work', '.print-work'));
const outDir = resolve(option('out', join(workDir, 'pdf')));
const fontsDir = resolve(process.env.GK_PRINT_FONTS || option('fonts', ''));
const chrome = process.env.GK_PRINT_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const only = option('years', '') ? new Set(option('years').split(',').map(Number)) : null;
const publish = !args.includes('--no-manifest');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

for (const [file, digest] of Object.entries(FONT_FILES)) {
  const path = join(fontsDir, file);
  if (!existsSync(path)) throw Error(`Missing font ${file} in ${fontsDir} (see print/README.md)`);
  if (digest && sha256(readFileSync(path)) !== digest) throw Error(`Font ${file} differs from the recorded build input`);
}
const key = publish ? await importPaperKey(process.env.GK_PRINT_PAPERS_KEY) : null;
const css = readFileSync(resolve(root, 'print/print.css'), 'utf8');
mkdirSync(outDir, { recursive: true }); mkdirSync(workDir, { recursive: true });
if (publish) mkdirSync(resolve(root, 'papers'), { recursive: true });
const profile = join(workDir, `chrome-profile-${process.pid}`);
const built = [];
try {
  for (const file of readdirSync(srcDir).filter(name => /^\d{4}\.txt$/.test(name)).sort()) {
    const year = Number(file.slice(0, 4));
    if (only && !only.has(year)) continue;
    const source = readFileSync(join(srcDir, file), 'utf8');
    const paper = parsePaper(source, file);
    if (paper.year !== year) throw Error(`${file}: @year ${paper.year}`);
    const html = paperHtml(paper, { css, fontsUrl: pathToFileURL(fontsDir).href, assetBase: pathToFileURL(root).href + '/', edition: `gk.bdfz.net · ${EDITION}` });
    const htmlPath = join(workDir, `${year}.html`), pdfPath = join(workDir, `${year}.pdf`);
    writeFileSync(htmlPath, html);
    rmSync(pdfPath, { force: true });
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--no-pdf-header-footer',
      `--user-data-dir=${profile}`, `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href], { stdio: ['ignore', 'ignore', 'ignore'], timeout: 120000 });
    if (!existsSync(pdfPath) || statSync(pdfPath).size < 20000) throw Error(`Chrome did not produce ${year}.pdf`);
    const pages = Number(execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' }).match(/^Pages:\s+(\d+)/m)?.[1]);
    if (!Number.isInteger(pages) || pages < 2) throw Error(`${year}.pdf has an implausible page count`);
    copyFileSync(pdfPath, join(outDir, `${year}.pdf`));
    const pdf = new Uint8Array(readFileSync(join(outDir, `${year}.pdf`)));
    const row = { year, file: `${year}.pdf`, pages, bytes: pdf.length, sha256: sha256(pdf), sourceSha256: sourceDigest(source, css) };
    if (publish) {
      const sealed = await sealPaper(key, String(year), pdf);
      if (sha256(await openPaper(key, String(year), sealed)) !== row.sha256) throw Error(`${year}: the sealed file does not open to the printed PDF`);
      writeFileSync(resolve(root, 'papers', `${year}.pdf.enc`), sealed);
      row.encSha256 = sha256(sealed);
    }
    built.push(row);
    console.log(`${year}: ${pages} pages, ${(pdf.length / 1024).toFixed(0)} KB`);
  }
} finally { rmSync(profile, { recursive: true, force: true }); }
if (publish) {
  const manifestPath = resolve(root, 'data/print-papers.json');
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).papers : [];
  const papers = [...new Map([...previous, ...built].map(row => [row.year, row])).values()].sort((a, b) => b.year - a.year);
  writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, edition: EDITION, papers }, null, 2) + '\n');
}
