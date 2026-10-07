import { readFileSync } from 'node:fs';
import { validateAuthority } from './lib/answer-authority.mjs';
import { validateScopedAnswers } from './lib/answer-release-scope.mjs';

const records = JSON.parse(readFileSync(new URL('../data/all.json',import.meta.url)));
const authority = JSON.parse(readFileSync(new URL('../data/answer-authority.json',import.meta.url)));
const result=process.argv.includes('--require-complete')
  ? validateScopedAnswers(records,authority,
    JSON.parse(readFileSync(new URL('../data/answer-release-scope.json',import.meta.url))),
    JSON.parse(readFileSync(new URL('../data/answer-release-preserved.json',import.meta.url))))
  : validateAuthority(records,authority);
console.log(JSON.stringify(result));
