// Fail-closed checks that tie the print edition to what Pages publishes:
// source ↔ bank record (bind), sealed PDF ↔ source (sourceSha256), manifest ↔ sealed bytes.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parsePaper } from './markup.mjs';
import { bindingOf, printYears } from './corpus.mjs';
import { sourceDigest, EDITION } from './edition.mjs';
import { importPaperKey, openPaper, isSealedPaper, SEAL_OVERHEAD } from '../../functions/_shared/print-paper-crypto.js';

export const PRINT_MANIFEST_PATH = 'data/print-papers.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// context: { records, blanks, sourceMarks } from loadPublished()
export function verifyPrintSources(root, context) {
  const errors = [], sources = new Map();
  const srcDir = resolve(root, 'print/src');
  const years = printYears(context.records);
  const files = existsSync(srcDir) ? readdirSync(srcDir).filter(name => /^\d{4}\.txt$/.test(name)).map(name => Number(name.slice(0, 4))) : [];
  for (const year of files) if (!years.includes(year)) errors.push(`print/src/${year}.txt has no published records`);
  for (const year of years) {
    const path = join(srcDir, `${year}.txt`);
    if (!existsSync(path)) { errors.push(`${year}: no print source`); continue; }
    const text = readFileSync(path, 'utf8');
    let paper;
    try { paper = parsePaper(text, `${year}.txt`); } catch (error) { errors.push(error.message); continue; }
    if (paper.year !== year) errors.push(`${year}.txt declares @year ${paper.year}`);
    const published = new Map(context.records.filter(r => Number(r.year) === year).map(r => [r.id, r]));
    const printed = new Set();
    for (const section of paper.records) {
      if (section.more) { if (!printed.has(section.id)) errors.push(`${year}.txt:${section.line} @more ${section.id} before its @record`); if (!section.nodes.length) errors.push(`${year}.txt:${section.line} @more ${section.id} prints nothing`); continue; }
      printed.add(section.id);
      const record = published.get(section.id);
      if (!record) { errors.push(`${year}.txt:${section.line} ${section.id} is not a published record of ${year}`); continue; }
      const bind = bindingOf(record, context);
      if (section.bind !== bind) errors.push(`${year}.txt:${section.line} ${section.id} changed in the bank since it was proofread (bind ${section.bind}, now ${bind}): review the section, then update bind`);
      if (!section.skip && !section.nodes.length) errors.push(`${year}.txt:${section.line} ${section.id} prints nothing`);
      published.delete(section.id);
    }
    for (const id of published.keys()) errors.push(`${year}: published record ${id} is neither printed nor skipped`);
    sources.set(year, text);
  }
  return { errors, sources, years };
}

export const sealedPath = year => `papers/${year}.pdf.enc`;

// Structure only: the sealed files cannot be opened without the key, which Pages builds do not have.
export function verifyPrintManifest(root, sources) {
  const errors = [], files = [];
  const manifestPath = resolve(root, PRINT_MANIFEST_PATH);
  if (!existsSync(manifestPath)) return { errors: [`${PRINT_MANIFEST_PATH} is missing: run print/build.mjs`], files, manifest: null };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest?.schemaVersion !== 1 || manifest.edition !== EDITION || !Array.isArray(manifest.papers)) return { errors: ['print manifest: schema or edition'], files, manifest };
  if (Object.keys(manifest).sort().join(',') !== 'edition,papers,schemaVersion') errors.push('print manifest: unexpected fields');
  const css = readFileSync(resolve(root, 'print/print.css'), 'utf8');
  const seen = new Set();
  for (const paper of manifest.papers) {
    const { year, file, pages, bytes, sha256: digest, encSha256, sourceSha256 } = paper || {};
    if (Object.keys(paper || {}).sort().join(',') !== 'bytes,encSha256,file,pages,sha256,sourceSha256,year' || !Number.isInteger(year) || seen.has(year)
      || file !== `${year}.pdf` || !Number.isInteger(pages) || pages < 2 || !Number.isInteger(bytes) || bytes < 20000
      || !/^[a-f0-9]{64}$/.test(digest || '') || !/^[a-f0-9]{64}$/.test(encSha256 || '')) { errors.push(`print manifest: bad entry ${JSON.stringify(paper)}`); continue; }
    seen.add(year);
    if (!sources.has(year)) { errors.push(`print manifest lists ${year} without a source`); continue; }
    const path = resolve(root, sealedPath(year));
    if (!existsSync(path)) { errors.push(`${sealedPath(year)} is missing`); continue; }
    const sealed = readFileSync(path);
    if (!isSealedPaper(new Uint8Array(sealed)) || sealed.length !== bytes + SEAL_OVERHEAD || sha256(sealed) !== encSha256) errors.push(`${sealedPath(year)} does not match the manifest`);
    if (sealed.length > 20_000_000) errors.push(`${sealedPath(year)} is larger than the download function accepts`);
    if (sealed.includes('%PDF-')) errors.push(`${sealedPath(year)} is not sealed`);
    if (sourceSha256 !== sourceDigest(sources.get(year), css)) errors.push(`${year}: the sealed PDF was not printed from the current source or stylesheet: run print/build.mjs --years ${year}`);
    files.push(sealedPath(year));
  }
  for (const year of sources.keys()) if (!seen.has(year)) errors.push(`${year}: source has no printed PDF in the manifest`);
  if (JSON.stringify(manifest.papers.map(p => p.year)) !== JSON.stringify([...seen].sort((a, b) => b - a))) errors.push('print manifest: papers are not in descending year order');
  const papersDir = resolve(root, 'papers');
  // Only sealed files may sit in papers/: a readable PDF committed there would be public.
  if (existsSync(papersDir)) for (const name of readdirSync(papersDir)) if (!files.includes(`papers/${name}`)) errors.push(`papers/${name} is not a sealed paper of the manifest`);
  return { errors, files, manifest };
}

// With the key (local builds): every sealed file opens to the PDF the manifest describes.
export async function verifyPrintPlaintext(root, manifest, secret) {
  const errors = [], key = await importPaperKey(secret);
  for (const paper of manifest.papers) {
    let pdf;
    try { pdf = await openPaper(key, String(paper.year), new Uint8Array(readFileSync(resolve(root, sealedPath(paper.year))))); }
    catch { errors.push(`${sealedPath(paper.year)} does not open with this key`); continue; }
    if (Buffer.from(pdf.subarray(0, 5)).toString('latin1') !== '%PDF-' || pdf.length !== paper.bytes || sha256(pdf) !== paper.sha256) errors.push(`${sealedPath(paper.year)} opens to something other than the manifest's PDF`);
  }
  return errors;
}

// Returns the list of files Pages must publish for the print edition; throws on any mismatch.
export function verifyPrintEdition(root, context) {
  const sources = verifyPrintSources(root, context);
  const manifest = verifyPrintManifest(root, sources.sources);
  const errors = [...sources.errors, ...manifest.errors];
  if (errors.length) throw Error(`Print edition is not consistent:\n  ${errors.join('\n  ')}`);
  return [PRINT_MANIFEST_PATH, ...manifest.files];
}
