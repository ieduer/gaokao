#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const records = JSON.parse(await readFile(resolve(ROOT, "data/all.json"), "utf8"));
const expected = new Map([
  ["feilian", 5], ["guwen", 5], ["shici", 3], ["moxie", 1], ["honglou", 1],
  ["sanwen", 4], ["yuyanjichu", 2], ["weixiezuo", 3], ["dazuowen", 2],
]);
const selected = records.filter((record) => record.year === 2026 && expected.has(record.key));
const failures = [];
if (selected.length !== expected.size) failures.push(`expected ${expected.size} components, got ${selected.length}`);
for (const [key, count] of expected) {
  const matches = selected.filter((record) => record.key === key);
  if (matches.length !== 1) {
    failures.push(`${key}: expected exactly one record`);
    continue;
  }
  const record = matches[0];
  if (record.questions?.length !== count) failures.push(`${key}: expected ${count} questions`);
  if (Object.keys(record.ai_answers || {}).length !== count) failures.push(`${key}: incomplete answers`);
  if (record.questions?.some((question) => !question.text || question.text.includes("undefined"))) failures.push(`${key}: invalid question text`);
  if (Object.values(record.ai_answers || {}).some((answer) => /答案：\s*$/.test(answer))) failures.push(`${key}: empty answer`);
  if (record.ai_answer_versions?.openai_codex_gpt_5?.model !== "OpenAI Codex (GPT-5)") failures.push(`${key}: model mismatch`);
  if (record.source_evidence?.jurisdiction !== "CN-BJ" || record.source_evidence?.language !== "zh-CN") failures.push(`${key}: identity mismatch`);
  if (record.source_evidence?.visual_review_percent !== 100) failures.push(`${key}: visual review mismatch`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, components: selected.length, questions: selected.reduce((sum, record) => sum + record.questions.length, 0), model: "OpenAI Codex (GPT-5)" }));
