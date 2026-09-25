import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Pages must never publish the repository root or source/data backups.
const output = resolve(process.argv[2] || '.pages-output');
const files = ['index.html', 'assets/js/app.js', 'assets/js/learning-records.js', 'assets/css/style.css',
  'assets/fonts/HuWenMingChaoTi.woff', 'assets/fonts/HuWenMingChaoTi.woff2',
  'assets/img/bg.webp', 'assets/img/gaokao.jpeg', 'data/all.json'];
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
await writeFile(resolve(output,'release.json'), JSON.stringify({schemaVersion:1,project:'gaokao',release:'20260920-chinese-three-source-fix',sourceCommit:sha,files:rows},null,2)+'\n');
console.log(JSON.stringify({output, files}));
