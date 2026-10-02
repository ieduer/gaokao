import { readFileSync } from 'node:fs';
import { validateAuthority } from './lib/answer-authority.mjs';

const records = JSON.parse(readFileSync(new URL('../data/all.json',import.meta.url)));
const authority = JSON.parse(readFileSync(new URL('../data/answer-authority.json',import.meta.url)));
console.log(JSON.stringify(validateAuthority(records, authority, { requireComplete:process.argv.includes('--require-complete') })));
