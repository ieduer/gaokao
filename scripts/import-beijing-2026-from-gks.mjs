#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CF_ROOT = resolve(ROOT, "..");
const STRUCTURED = join(CF_ROOT, "gks/data/source-manifests/beijing/2026/chinese/structured");
const COVERAGE = join(CF_ROOT, "gks/data/source-manifests/beijing/2026/coverage.json");
const TARGET = join(ROOT, "data/all.json");

const EXPECTED_COVERAGE_SHA256 = "c6171cc5bdbf4032cf940734a0a5c0e6d60e35adc7585131006036def204a593";
const PAPER_SHA256 = "486b6c54ca01653daf9bd2a87d8e69129cd688002a932923005a7109331669ec";
const ANSWER_LABEL = "OpenAI Codex（GPT-5）本任务独立作答";
const GENERATED_AT = "2026-08-16T03:55:20.000Z";
const PARTS = [
  ["feilian", "非连文本"],
  ["guwen", "古文"],
  ["shici", "诗词"],
  ["moxie", "默写"],
  ["honglou", "名著阅读"],
  ["sanwen", "散文"],
  ["yuyanjichu", "语言基础"],
  ["weixiezuo", "微写作"],
  ["dazuowen", "大作文"],
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function renderOptions(options) {
  if (!options || typeof options !== "object") return "";
  return Object.entries(options)
    .map(([key, value]) => `${key}. ${Array.isArray(value) ? value.join(" / ") : value}`)
    .join("\n");
}

function renderAnswerValue(answer) {
  return Array.isArray(answer)
    ? answer.join("，")
    : typeof answer === "object" && answer !== null
      ? Object.entries(answer).map(([key, value]) => `${key} ${value}`).join("\n")
      : String(answer || "");
}

function renderQuestion(question) {
  const options = renderOptions(question.options);
  const subquestions = (question.subquestions || []).map((subquestion) => {
    const subOptions = renderOptions(subquestion.options);
    return `${subquestion.number} ${subquestion.stem}${subOptions ? `\n${subOptions}` : ""}`;
  }).join("\n");
  const body = [question.stem, subquestions].filter(Boolean).join("\n");
  return `${question.number}. ${body}${options ? `\n${options}` : ""}`;
}

function renderAnswer(question) {
  const answer = question.answer
    ? renderAnswerValue(question.answer)
    : (question.subquestions || [])
      .map((subquestion) => `${subquestion.number} ${renderAnswerValue(subquestion.answer)}`)
      .join("\n");
  const explanation = question.explanation ? `\n\n解析：${question.explanation}` : "";
  return `${ANSWER_LABEL}\n答案：${answer}${explanation}`;
}

function recordFromPart(part, typeLabel) {
  const materials = (part.materials || []).map((material, index) => ({
    key: `material${index + 1}`,
    label: material.label || material.title || `材料${index + 1}`,
    text: [material.title, material.author, material.text].filter(Boolean).join("\n"),
    ...(material.markup ? { markup: material.markup } : {}),
  }));
  const questions = (part.questions || []).map((question, index) => ({
    qIndex: index + 1,
    id: `q${index + 1}`,
    text: renderQuestion(question),
    score: question.score ?? null,
    sourceQuestionNumber: String(question.number),
    sourceType: question.type,
  }));
  const answers = Object.fromEntries(
    (part.questions || []).map((question, index) => [String(index + 1), renderAnswer(question)]),
  );

  return {
    year: 2026,
    key: part.key,
    topic: part.topic,
    material1: materials[0]?.text || null,
    material2: materials[1]?.text || null,
    annotation: `2026年普通高等学校招生全国统一考试（北京卷）语文；原卷逐页核对；${ANSWER_LABEL}`,
    question1: questions[0]?.text || null,
    question2: questions[1]?.text || null,
    question3: questions[2]?.text || null,
    question4: questions[3]?.text || null,
    question5: questions[4]?.text || null,
    reference_answer: "网传答案仅作交叉检查；下列答案均由 OpenAI Codex（GPT-5）在本任务中独立作答。",
    id: `2026-${part.key}`,
    typeLabel,
    materials,
    questions,
    annotations: [],
    ai_answers: answers,
    ai_generated_at: GENERATED_AT,
    ai_generator_version: "openai_codex_gpt_5",
    ai_answer_versions: {
      openai_codex_gpt_5: {
        label: ANSWER_LABEL,
        model: "OpenAI Codex (GPT-5)",
        source: "Hash-bound local transcription of the user-supplied 2026 Beijing Chinese visual scan.",
        generated_at: GENERATED_AT,
        answers,
      },
    },
    ai_answer_current_version: "openai_codex_gpt_5",
    ai_answer_version_labels: { openai_codex_gpt_5: ANSWER_LABEL },
    source_evidence: {
      jurisdiction: "CN-BJ",
      language: "zh-CN",
      paper_sha256: PAPER_SHA256,
      coverage_sha256: EXPECTED_COVERAGE_SHA256,
      question_range: part.questionRange,
      visual_review_percent: 100,
    },
  };
}

const coverageBytes = await readFile(COVERAGE);
if (sha256(coverageBytes) !== EXPECTED_COVERAGE_SHA256) {
  throw new Error("coverage.json changed; refuse to import an unbound Beijing paper");
}
const coverage = JSON.parse(coverageBytes);
const chinese = coverage.components?.find((component) => component.id === "2026-beijing-chinese-written");
if (chinese?.releaseStatus !== "approved_for_publication") {
  throw new Error("canonical Chinese component is not approved for publication");
}

const imported = [];
for (const [key, typeLabel] of PARTS) {
  const part = JSON.parse(await readFile(join(STRUCTURED, `${key}.json`), "utf8"));
  if (part.key !== key || part.year !== 2026 || part.region !== "北京" || part.language !== "zh-CN") {
    throw new Error(`${key}: invalid canonical identity`);
  }
  imported.push(recordFromPart(part, typeLabel));
}

const targetText = await readFile(TARGET, "utf8");
const existing = JSON.parse(targetText);
if (!Array.isArray(existing)) throw new Error("data/all.json must be an array");
const importedIds = new Set(imported.map((record) => record.id));
const existingImported = existing.filter((record) => importedIds.has(record?.id));
if (existingImported.length) {
  const expectedById = new Map(imported.map((record) => [record.id, record]));
  const exact = existingImported.length === imported.length
    && existingImported.every((record) => JSON.stringify(record) === JSON.stringify(expectedById.get(record.id)));
  if (!exact) throw new Error("existing 2026 Beijing projection differs; refuse to rewrite in place");
  console.log(JSON.stringify({ ok: true, unchanged: true, recordCount: existing.length }, null, 2));
  process.exit(0);
}

const arrayStart = targetText.indexOf("[");
if (arrayStart < 0) throw new Error("data/all.json is missing its array opener");
const importedBody = JSON.stringify(imported, null, 2).slice(1, -1).trimEnd();
const nextText = `${targetText.slice(0, arrayStart + 1)}${importedBody},${targetText.slice(arrayStart + 1)}`;
const next = JSON.parse(nextText);
await writeFile(TARGET, nextText, "utf8");
console.log(JSON.stringify({
  ok: true,
  target: TARGET,
  imported: imported.map((record) => record.id),
  recordCount: next.length,
  coverageSha256: EXPECTED_COVERAGE_SHA256,
  paperSha256: PAPER_SHA256,
}, null, 2));
