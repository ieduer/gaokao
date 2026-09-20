#!/usr/bin/env node
// Static data integrity checks for gk.bdfz.net.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, "..", "data", "all.json");

const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const errors = [];
let legacyBackupRecords = 0;
let legacyBackupKeys = 0;

function err(message) { errors.push(message); }
function answerKeys(obj) {
  return new Set(Object.keys(obj || {}).map(String));
}

const ids = new Set();
let questionCount = 0;
let annotationCount = 0;
let currentAnswerCount = 0;
let claudeAnswerCount = 0;
let gptAnswerCount = 0;
let codexAnswerCount = 0;

for (const rec of data) {
  if (!rec.id) err("record missing id");
  if (ids.has(rec.id)) err(`duplicate record id: ${rec.id}`);
  ids.add(rec.id);

  if (!Array.isArray(rec.questions)) err(`${rec.id}: questions is not an array`);
  if (!Array.isArray(rec.materials)) err(`${rec.id}: materials is not an array`);
  if (!Array.isArray(rec.annotations)) err(`${rec.id}: annotations is not an array`);

  const qKeys = new Set((rec.questions || []).map((q) => String(q.qIndex)));
  const currentKeys = answerKeys(rec.ai_answers);
  const claude = rec.ai_answer_versions?.claude_opus_4_8?.answers || {};
  const gpt = rec.ai_answer_versions?.gpt_5_5_pro?.answers || {};
  const codex = rec.ai_answer_versions?.openai_codex_gpt_5?.answers || {};
  const claudeKeys = answerKeys(claude);
  const gptKeys = answerKeys(gpt);
  const codexKeys = answerKeys(codex);
  const isCodexBeijing2026 = rec.year === 2026
    && rec.source_evidence?.jurisdiction === "CN-BJ"
    && rec.source_evidence?.coverage_sha256
      === "c6171cc5bdbf4032cf940734a0a5c0e6d60e35adc7585131006036def204a593";

  if (
    (!isCodexBeijing2026 && rec.ai_answer_current_version !== "gpt_5_5_pro")
    || (isCodexBeijing2026 && rec.ai_answer_current_version !== "openai_codex_gpt_5")
  ) {
    err(`${rec.id}: current answer version does not match its verified source policy`);
  }

  for (const q of rec.questions || []) {
    questionCount += 1;
    const key = String(q.qIndex);
    if (!q.text || typeof q.text !== "string") err(`${rec.id}#${key}: empty question text`);
    if (!currentKeys.has(key)) err(`${rec.id}#${key}: missing current ai_answers entry`);
    if (!isCodexBeijing2026 && !claudeKeys.has(key)) err(`${rec.id}#${key}: missing Claude Opus 4.8 answer`);
    if (!isCodexBeijing2026 && !gptKeys.has(key)) err(`${rec.id}#${key}: missing GPT-5.5 pro answer`);
    if (isCodexBeijing2026 && !codexKeys.has(key)) err(`${rec.id}#${key}: missing OpenAI Codex (GPT-5) answer`);
    if (currentKeys.has(key)) currentAnswerCount += 1;
    if (claudeKeys.has(key)) claudeAnswerCount += 1;
    if (gptKeys.has(key)) gptAnswerCount += 1;
    if (codexKeys.has(key)) codexAnswerCount += 1;
    if (gpt[key] && !String(gpt[key]).startsWith("GPT-5.5 pro 版本答案：")) {
      err(`${rec.id}#${key}: GPT answer missing version label`);
    }
    if (codex[key] && !String(codex[key]).startsWith("OpenAI Codex（GPT-5）本任务独立作答")) {
      err(`${rec.id}#${key}: Codex answer missing model disclosure`);
    }
  }

  for (const key of currentKeys) {
    if (!qKeys.has(key)) err(`${rec.id}: current ai_answers has extra key ${key}`);
  }
  for (const key of gptKeys) {
    if (!qKeys.has(key)) err(`${rec.id}: GPT answers has extra key ${key}`);
  }
  for (const key of codexKeys) {
    if (!qKeys.has(key)) err(`${rec.id}: Codex answers has extra key ${key}`);
  }

  const materialByKey = new Map((rec.materials || []).map((m) => [m.key, m.text]));
  for (const ann of rec.annotations || []) {
    annotationCount += 1;
    const qKey = String(ann.qIndex);
    if (!qKeys.has(qKey)) err(`${rec.id}: annotation points to missing qIndex ${qKey}`);
    const material = materialByKey.get(ann.material) || rec[ann.material];
    if (typeof material !== "string" || !material) {
      err(`${rec.id}: annotation material missing: ${ann.material}`);
      continue;
    }
    if (!["dot", "underline", "wave", "highlight"].includes(ann.type)) {
      err(`${rec.id}: annotation has invalid type ${ann.type}`);
    }
    if (!Number.isInteger(ann.start) || !Number.isInteger(ann.end) || ann.start < 0 || ann.end <= ann.start) {
      err(`${rec.id}: annotation has invalid range q${qKey} ${ann.start}-${ann.end}`);
      continue;
    }
    const actual = material.slice(ann.start, ann.end);
    if (actual !== ann.anchor) {
      err(`${rec.id}: annotation anchor mismatch q${qKey}: expected "${ann.anchor}", got "${actual}"`);
    }
  }

  const legacyUnmapped = Object.keys(rec.ai_answer_versions?.claude_opus_4_7?.unmapped_legacy_answers || {});
  if (legacyUnmapped.length) {
    legacyBackupRecords += 1;
    legacyBackupKeys += legacyUnmapped.length;
  }
}

console.log(JSON.stringify({
  records: data.length,
  questions: questionCount,
  annotations: annotationCount,
  currentAnswerCount,
  claudeAnswerCount,
  gptAnswerCount,
  codexAnswerCount,
  legacyBackupRecords,
  legacyBackupKeys,
  errors: errors.length,
}, null, 2));

if (errors.length) {
  console.error("\nerrors:");
  for (const e of errors.slice(0, 120)) console.error(`- ${e}`);
  if (errors.length > 120) console.error(`- ... ${errors.length - 120} more`);
  process.exit(1);
}
