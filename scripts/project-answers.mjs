import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAuthority, projectAuthority } from './lib/answer-authority.mjs';
import { validateScopedAnswers, projectScopedAnswers } from './lib/answer-release-scope.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const records=JSON.parse(readFileSync(resolve(root,'data/all.json')));
const authority=JSON.parse(readFileSync(resolve(root,'data/answer-authority.json')));
const args=process.argv.slice(2), preview=args.includes('--preview');
const output=args[args.indexOf('--output')+1];
if(!args.includes('--output')||!output)throw Error('--output is required');
if(preview && resolve(output).startsWith(resolve(root)+ '/'))throw Error('Partial preview cannot overwrite source files');
const scope=JSON.parse(readFileSync(resolve(root,'data/answer-release-scope.json')));
const preserved=JSON.parse(readFileSync(resolve(root,'data/answer-release-preserved.json')));
const coverage=preview?validateAuthority(records,authority):validateScopedAnswers(records,authority,scope,preserved);
const projected=preview?projectAuthority(records,authority):projectScopedAnswers(records,authority,scope,preserved);
writeFileSync(resolve(output),JSON.stringify(projected,null,2)+'\n');
console.log(JSON.stringify({output:resolve(output),preview,...coverage}));
