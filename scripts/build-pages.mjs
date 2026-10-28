import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateScopedAnswers, projectScopedAnswers } from './lib/answer-release-scope.mjs';
import { sourceAssets } from './lib/source-assets.mjs';
import { buildContentCatalog, verifyContentCatalog } from './lib/content-catalog.mjs';
import { buildQuestionBlanksModule, QUESTION_BLANKS_PATH } from './lib/question-blanks.mjs';

// Reject incomplete reviews before touching an existing release directory.
const records=JSON.parse(await readFile('data/all.json','utf8'));
const authority=JSON.parse(await readFile('data/answer-authority.json','utf8'));
const scope=JSON.parse(await readFile('data/answer-release-scope.json','utf8'));
const preserved=JSON.parse(await readFile('data/answer-release-preserved.json','utf8'));
const coverage=validateScopedAnswers(records,authority,scope,preserved);
const projected=projectScopedAnswers(records,authority,scope,preserved);
// data/all.json stays published byte-identical; the page reads the catalog and one year's part.
const content=buildContentCatalog(projected);
const blankDefinition=JSON.parse(await readFile('data/question-blanks.json','utf8'));
const blankModule=buildQuestionBlanksModule(projected,blankDefinition);
if (await readFile(QUESTION_BLANKS_PATH,'utf8') !== blankModule) throw Error('Regenerate the canonical question-blanks module before building');

// Pages must never publish the repository root or source/data backups.
const output = resolve(process.argv[2] || '.pages-output');
const files = ['_headers', 'index.html', 'assets/js/app.js', 'assets/js/answer-versions.js', 'assets/js/learning-records.js', 'assets/js/question-parts.js', 'assets/js/canonical-question-source.js', QUESTION_BLANKS_PATH, 'assets/css/style.css',
  'assets/fonts/HuWenMingChaoTi.woff', 'assets/fonts/HuWenMingChaoTi.woff2',
  'assets/img/bg.webp', 'assets/img/gaokao.jpeg', ...content.keys()];
files.push(...sourceAssets(projected, process.cwd()));
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
  if (file === QUESTION_BLANKS_PATH) await writeFile(dest,blankModule);
  else if(content.has(file))await writeFile(dest,content.get(file));
  else await copyFile(file, dest);
}
verifyContentCatalog(new Map(await Promise.all([...content.keys()].map(async path => [path, await readFile(resolve(output,path),'utf8')]))));
const sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const rows = await Promise.all(files.map(async path => ({path, sha256:createHash('sha256').update(await readFile(resolve(output,path))).digest('hex')})));
await writeFile(resolve(output,'release.json'), JSON.stringify({schemaVersion:1,project:'gaokao',release:authority.revision,answerCoverage:coverage,sourceCommit:sha,files:rows},null,2)+'\n');
console.log(JSON.stringify({output, files}));
