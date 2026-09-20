import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Pages must never publish the repository root or source/data backups.
const output = resolve(process.argv[2] || '.pages-output');
const files = ['index.html', '2026.html', 'assets/js/app.js', 'assets/js/beijing2026.js',
  'assets/css/style.css',
  'assets/fonts/HuWenMingChaoTi.woff', 'assets/fonts/HuWenMingChaoTi.woff2',
  'assets/img/bg.webp', 'assets/img/gaokao.jpeg', 'data/all.json',
  'data/beijing-2026/manifest.json'];
// 2026 北京卷全科试卷／答案页面图像：只收 data/beijing-2026/<科目>/*.webp，不接受其他扩展名
for (const entry of await readdir('data/beijing-2026', {recursive:true, withFileTypes:true})) {
  if (!entry.isFile() || !entry.name.endsWith('.webp')) continue;
  files.push(`${resolve(entry.parentPath, entry.name).slice(resolve('.').length+1)}`);
}
files.sort();
try {
  for (const file of await readdir(output, {recursive:true, withFileTypes:true})) {
    if (!file.isFile()) continue;
    const path = resolve(file.parentPath, file.name).slice(output.length+1);
    if (![...files, 'release.json', '_worker.js', '_routes.json'].includes(path)) throw Error(`Unexpected output: ${path}`);
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const file of files) {
  const dest = resolve(output, file);
  await mkdir(resolve(dest, '..'), {recursive:true});
  await copyFile(file, dest);
}
const sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const rows = await Promise.all(files.map(async path => ({path, sha256:createHash('sha256').update(await readFile(resolve(output,path))).digest('hex')})));
await writeFile(resolve(output,'release.json'), JSON.stringify({schemaVersion:1,project:'gaokao',release:'20260920-beijing-2026-all-subjects',sourceCommit:sha,files:rows},null,2)+'\n');
console.log(JSON.stringify({output, fileCount: files.length}));
