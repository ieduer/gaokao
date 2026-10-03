import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAuthority, projectAuthority } from './lib/answer-authority.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const records=JSON.parse(readFileSync(resolve(root,'data/all.json')));
const authority=JSON.parse(readFileSync(resolve(root,'data/answer-authority.json')));
const args=process.argv.slice(2), preview=args.includes('--preview');
const output=args[args.indexOf('--output')+1];
if(!args.includes('--output')||!output)throw Error('--output is required');
if(preview && resolve(output).startsWith(resolve(root)+ '/'))throw Error('Partial preview cannot overwrite source files');
const coverage=validateAuthority(records,authority,{requireComplete:!preview});
writeFileSync(resolve(output),JSON.stringify(projectAuthority(records,authority),null,2)+'\n');
console.log(JSON.stringify({output:resolve(output),preview,...coverage}));
