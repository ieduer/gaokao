/* AI 高考 — 新前端
 * 单页：目录 / 原文 / 题目 / AI 答案 / 用户答案 / 对话
 * - 简体中文界面
 * - data/all.json 已带 ai_answers / annotations 字段（由 scripts/generate-content.mjs 生成）
 * - 用户登录态由 https://my.bdfz.net/site-auth.js 注入的 BdfzIdentity 提供
 *   - 进度: syncProgress
 *   - 答案文本: syncProgress meta.text
 *   - 对话存档: recordConversation
 *   - 偏好/最后位置: recordEvent
 */

const SITE_KEY = "gk";
const AI_URL = "https://apis.bdfz.net/";
const DISCUSSION_API = "/api/question-discussions";

const TYPES = [
  { key: "feilian",     label: "非连文本" },
  { key: "guwen",       label: "古文" },
  { key: "shici",       label: "诗词" },
  { key: "lunyu",       label: "论语" },
  { key: "moxie",       label: "默写" },
  { key: "honglou",     label: "红楼梦" },
  { key: "sanwen",      label: "散文" },
  { key: "yuyanjichu",  label: "语言基础运用" },
  { key: "weixiezuo",   label: "微写作" },
  { key: "dazuowen",    label: "大作文" },
];

const THEMES = ["mono"];

/* =========================================================
 * 全局状态
 * ======================================================= */
const state = {
  data: [],
  byId: new Map(),
  currentRecord: null,
  currentQIndex: null,
  readProgress: {},        // { recordId: 'in_progress' | 'done' }
  userAnswers: {},         // { 'recordId#qIndex': text }
  conversations: {},       // { 'recordId#qIndex': [{role,content}] }
  conversationKey: "",
  isThinking: false,
  catalogMode: "type",     // 'type' | 'year'
  discussionLoadSeq: 0,
  identityAuthenticated: false,
};

/* =========================================================
 * 工具
 * ======================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function getIdentity() { return window.BdfzIdentity || null; }

function getAuthedIdentity() {
  const id = getIdentity();
  return state.identityAuthenticated && id && typeof id === "object" ? id : null;
}

async function refreshIdentityAuthentication() {
  const id = getIdentity();
  if (!id?.getSession) {
    state.identityAuthenticated = false;
    return false;
  }
  const session = await id.getSession().catch(() => null);
  state.identityAuthenticated = Boolean(session?.authenticated);
  return state.identityAuthenticated;
}

function debounce(fn, ms = 600) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function answerStorageKey(recordId, qIndex) {
  return `gk:answer:${recordId}#${qIndex}`;
}

function chatStorageKey(recordId, qIndex) {
  return `gk:chat:${recordId}#${qIndex}`;
}

function discussionNameStorageKey() {
  return "gk:discussion:name";
}

function progressItemKey(recordId, qIndex) {
  return `answer-${recordId}-q${qIndex}`;
}

function setText(node, text) {
  if (node) node.textContent = String(text ?? "");
}

async function copyText(text, successMsg = "已复制") {
  try {
    await navigator.clipboard.writeText(text);
    flashStatus(successMsg);
  } catch (e) {
    console.warn("copy failed", e);
    flashStatus("复制失败，请手动选择");
  }
}

function flashStatus(msg) {
  const node = $("#answer-status");
  if (!node) return;
  node.textContent = msg;
  clearTimeout(flashStatus._t);
  flashStatus._t = setTimeout(() => { node.textContent = ""; }, 2200);
}

function recordLabel(rec) {
  if (!rec) return "高考真题";
  if (rec.isExam) return rec.typeLabel;
  return `${rec.year === 9999 ? "样卷" : rec.year + " 年"} ${rec.typeLabel || rec.key}`;
}

function recordSubtitle(rec) {
  if (!rec?.topic) return "";
  return rec.topic.split("\n")[0].slice(0, 80);
}

function questionLabel(rec, qIndex) {
  return `${recordLabel(rec)} · 第 ${qIndex} 题`;
}

function questionIdentity(rec, qIndex) {
  const displayQuestion = (rec?.questions || []).find((q) => Number(q.qIndex) === Number(qIndex)) || null;
  if (rec?.isExam && displayQuestion?.origRecId) {
    const sourceRecord = state.byId.get(displayQuestion.origRecId) || rec;
    return {
      displayQuestion,
      sourceRecord,
      sourceRecordId: displayQuestion.origRecId,
      sourceQIndex: Number(displayQuestion.origQIndex) || 1,
    };
  }
  return {
    displayQuestion,
    sourceRecord: rec,
    sourceRecordId: rec?.id || "unknown",
    sourceQIndex: Number(qIndex) || 1,
  };
}

function activeTypeKey() {
  const rec = state.currentRecord;
  if (!rec) return null;
  if (!rec.isExam) return rec.key;
  return findExamSectionForQ(rec, state.currentQIndex || 1)?.key || null;
}

function currentQuestionIdentity() {
  return questionIdentity(state.currentRecord, state.currentQIndex || 1);
}

/* =========================================================
 * Theme
 * ======================================================= */
function applyTheme(theme = "mono") {
  const nextTheme = THEMES.includes(theme) ? theme : "mono";
  document.documentElement.setAttribute("data-theme", nextTheme);
}

function loadStoredTheme() {
  return "mono";
}

/* =========================================================
 * 数据：加载 / 索引 / 进度
 * ======================================================= */
async function loadData() {
  const res = await fetch("data/all.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  state.data = data;
  state.byId = new Map(data.map((rec) => [rec.id, rec]));
  restoreLegacyLocalProgress();
  return data;
}

function loadLocalProgress() {
  try {
    state.readProgress = JSON.parse(localStorage.getItem("gk_progress") || "{}") || {};
  } catch (_) { state.readProgress = {}; }
}

function saveLocalProgress() {
  try { localStorage.setItem("gk_progress", JSON.stringify(state.readProgress)); } catch (_) {}
}

function loadLocalAnswer(recordId, qIndex) {
  try { return localStorage.getItem(answerStorageKey(recordId, qIndex)) || ""; } catch (_) { return ""; }
}

function saveLocalAnswer(recordId, qIndex, text) {
  try {
    if (text) localStorage.setItem(answerStorageKey(recordId, qIndex), text);
    else localStorage.removeItem(answerStorageKey(recordId, qIndex));
  } catch (_) {}
}

function loadLocalChat(recordId, qIndex) {
  try {
    const raw = localStorage.getItem(chatStorageKey(recordId, qIndex));
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function saveLocalChat(recordId, qIndex, messages) {
  try {
    localStorage.setItem(chatStorageKey(recordId, qIndex), JSON.stringify(messages.slice(-40)));
  } catch (_) {}
}

/* =========================================================
 * Catalog
 * ======================================================= */
function buildCatalog(filterText = "") {
  const tree = $("#catalog-tree");
  if (!tree) return;
  tree.innerHTML = "";

  const ft = filterText.trim().toLowerCase();

  if (state.catalogMode === "year") {
    buildCatalogByYear(tree, ft);
  } else {
    buildCatalogByType(tree, ft);
  }
}

function setCatalogOpen(open) {
  const catalog = $("#catalog");
  const toggle = $("#open-catalog-btn");
  const backdrop = $("#catalog-backdrop");
  if (!catalog) return;
  if (open && backdrop) backdrop.hidden = false;
  catalog.classList.toggle("open", Boolean(open));
  catalog.setAttribute("aria-hidden", String(!open));
  document.body.classList.toggle("catalog-open", Boolean(open));
  toggle?.setAttribute("aria-expanded", String(Boolean(open)));
  if (toggle) {
    toggle.setAttribute("aria-label", open ? "关闭题库" : "打开题库");
    toggle.title = open ? "关闭题库" : "打开题库";
  }
  if (open) {
    window.setTimeout(() => $("#catalog-search")?.focus(), 80);
  } else {
    window.setTimeout(() => {
      if (backdrop && !catalog.classList.contains("open")) backdrop.hidden = true;
    }, 200);
    toggle?.focus({ preventScroll: true });
  }
}

function suppressCatalogHover() {
  // 旧版依赖 hover 展开侧栏；新版抽屉只由明确的打开/关闭操作控制。
}

function enableCatalogAccordion(det, tree) {
  det.addEventListener("toggle", () => {
    if (!det.open) return;
    $$(".catalog-group", tree).forEach((group) => {
      if (group !== det) group.open = false;
    });
  });
}

function attachItemClick(li, recordId) {
  li.addEventListener("click", () => {
    selectRecord(recordId);
    setCatalogOpen(false);
    suppressCatalogHover();
    $("#passage")?.focus({ preventScroll: true });
  });
}

function makeCatalogItem(rec, labelText) {
  const li = document.createElement("li");
  li.className = "catalog-item";
  li.dataset.recordId = rec.id;
  li.setAttribute("role", "treeitem");
  li.innerHTML = `<span>${escapeHtml(labelText)}</span><span class="read-dot" aria-hidden="true"></span>`;
  const status = state.readProgress[rec.id];
  if (status === "done") li.classList.add("read");
  else if (status === "in_progress") li.classList.add("in-progress");
  if (state.currentRecord?.id === rec.id) li.setAttribute("aria-current", "true");
  attachItemClick(li, rec.id);
  return li;
}

function buildCatalogByType(tree, ft) {
  const groupsByType = new Map();
  for (const t of TYPES) groupsByType.set(t.key, { ...t, items: [] });

  for (const rec of state.data) {
    const g = groupsByType.get(rec.key);
    if (!g) continue;
    const text = `${rec.year ?? ""} ${rec.typeLabel || ""} ${rec.topic || ""}`.toLowerCase();
    if (ft && !text.includes(ft)) continue;
    g.items.push(rec);
  }

  for (const [, g] of groupsByType) {
    g.items.sort((a, b) => Number(b.year) - Number(a.year));
  }

  let totalShown = 0;
  for (const t of TYPES) {
    const g = groupsByType.get(t.key);
    if (!g.items.length) continue;
    totalShown += g.items.length;

    const det = document.createElement("details");
    det.className = "catalog-group";
    det.open = ft ? true : (activeTypeKey() ? activeTypeKey() === t.key : t.key === "guwen");
    det.innerHTML = `
      <summary>
        <span>${escapeHtml(t.label)}</span>
        <span class="catalog-count">${g.items.length}</span>
      </summary>
    `;
    const ul = document.createElement("ul");
    ul.className = "catalog-items";
    ul.setAttribute("role", "group");
    for (const rec of g.items) {
      const yearText = rec.year === 9999 ? "样卷" : `${rec.year} 年`;
      ul.appendChild(makeCatalogItem(rec, yearText));
    }
    det.appendChild(ul);
    tree.appendChild(det);
    enableCatalogAccordion(det, tree);
  }

  if (totalShown === 0) {
    const empty = document.createElement("p");
    empty.className = "catalog-empty";
    empty.textContent = "未找到匹配的试题";
    tree.appendChild(empty);
  }
}

function buildCatalogByYear(tree, ft) {
  const byYear = new Map();
  for (const rec of state.data) {
    const text = `${rec.year ?? ""} ${rec.typeLabel || ""} ${rec.topic || ""}`.toLowerCase();
    if (ft && !text.includes(ft)) continue;
    if (!byYear.has(rec.year)) byYear.set(rec.year, []);
    byYear.get(rec.year).push(rec);
  }

  if (!byYear.size) {
    const empty = document.createElement("p");
    empty.className = "catalog-empty";
    empty.textContent = "未找到匹配的年份";
    tree.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "catalog-exam-list";
  const years = [...byYear.keys()].sort((a, b) => Number(b) - Number(a));
  for (const year of years) {
    const items = byYear.get(year);
    const exam = buildYearExam(year);
    if (!exam) continue;
    const yearText = year === 9999 ? "样卷" : `${year} 年`;
    const examBtn = document.createElement("button");
    examBtn.type = "button";
    examBtn.className = "catalog-exam-btn";
    examBtn.dataset.examYear = String(year);
    examBtn.setAttribute("role", "treeitem");
    examBtn.innerHTML = `
      <span class="catalog-exam-year">${escapeHtml(yearText)}</span>
      <span class="catalog-exam-status">${exam.collectionComplete ? "整套练习" : "已收录题目"}</span>
      <span class="catalog-exam-meta">${items.length} 题型 · ${exam.questions.length} 题</span>
    `;
    examBtn.addEventListener("click", () => {
      selectYearExam(Number(year));
      setCatalogOpen(false);
      $("#active-question")?.focus({ preventScroll: true });
    });
    if (state.currentRecord?.examYear === Number(year)) examBtn.setAttribute("aria-current", "true");
    list.appendChild(examBtn);
  }
  tree.appendChild(list);
}

function refreshCatalogStatus() {
  $$("#catalog-tree .catalog-item").forEach((li) => {
    const id = li.dataset.recordId;
    li.classList.remove("read", "in-progress");
    li.removeAttribute("aria-current");
    const status = state.readProgress[id];
    if (status === "done") li.classList.add("read");
    else if (status === "in_progress") li.classList.add("in-progress");
    if (state.currentRecord?.id === id) li.setAttribute("aria-current", "true");
  });
  $$("#catalog-tree .catalog-exam-btn").forEach((button) => {
    const active = Number(button.dataset.examYear) === Number(state.currentRecord?.examYear);
    if (active) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
}

/* =========================================================
 * Annotations: 渲染原文（在文中插入 <span class="anno ...">）
 * ======================================================= */
function effectiveAnnoType(ann, anchorLen) {
  // AI 偶尔会把整句标成 "dot"（加点字），实际超过 3 字的应该是画线／波浪
  if (ann.type === "dot" && anchorLen > 3) return "underline";
  if (ann.type === "highlight" && anchorLen > 12) return "wave";
  return ann.type;
}

function renderMaterialWithAnnotations(text, materialKey, allAnnos, qIndex) {
  const annos = allAnnos.filter((a) => a.material === materialKey && Number.isFinite(a.start) && Number.isFinite(a.end));
  if (!annos.length) return escapeHtml(text);
  annos.sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  let out = "";
  for (const ann of annos) {
    if (ann.start < cursor) continue;
    const before = text.slice(cursor, ann.start);
    const mid = text.slice(ann.start, ann.end);
    out += escapeHtml(before);
    const eff = effectiveAnnoType(ann, mid.length);
    const cls = `anno anno-${eff}`;
    const active = qIndex && Number(ann.qIndex) === Number(qIndex) ? " active" : "";
    out += `<span class="${cls}${active}" data-q-index="${ann.qIndex}" data-anno-type="${eff}" title="${escapeHtml(ann.rationale || "")}">${escapeHtml(mid)}</span>`;
    cursor = ann.end;
  }
  out += escapeHtml(text.slice(cursor));
  return out;
}

/* =========================================================
 * 渲染：原文 / 题目 / 工作区
 * ======================================================= */
function renderRecord(rec) {
  const passage = $("#passage");
  const questions = $("#questions");
  const toolbar = $("#reader-toolbar");
  passage.innerHTML = "";
  questions.innerHTML = "";
  toolbar.hidden = false;
  $("#question-nav").hidden = false;
  setText($("#paper-year"), rec.year === 9999 ? "样卷" : `${rec.year} 年`);
  setText($("#paper-type"), rec.isExam ? (rec.collectionComplete ? "整套试卷" : "已收录题目") : (rec.typeLabel || rec.key));

  const displayQuestions = rec.questions?.length
    ? rec.questions
    : [{ qIndex: 1, text: rec.topic || rec.material1 || "见材料与原文", score: null }];
  for (const q of displayQuestions) questions.appendChild(makeQuestionCard(q));

  const lastQ = state.currentRecord?.id === rec.id ? state.currentQIndex : null;
  const firstQ = displayQuestions[0]?.qIndex || 1;
  if (window.matchMedia("(max-width: 820px)").matches) $("#source-block").open = false;
  selectQuestion(lastQ || firstQ, { skipScroll: true });
}

function renderPassageBody(passage, rec, annos) {
  if (rec.materials?.length) {
    for (const m of rec.materials) {
      const block = document.createElement("section");
      block.className = "material-block";
      block.dataset.material = m.key;
      block.innerHTML = `
        <header class="material-label">
          <span>${escapeHtml(m.label)}</span>
          <button class="ghost-btn small" type="button" data-action="copy-material" data-material="${m.key}">复制</button>
        </header>
        <div class="material-text" data-material="${m.key}">${renderMaterialWithAnnotations(m.text, m.key, annos, state.currentQIndex)}</div>
      `;
      passage.appendChild(block);
    }
  } else {
    const block = document.createElement("section");
    block.className = "material-block source-empty";
    block.innerHTML = `
      <div class="material-text">本题没有独立阅读材料，完整题干与作答要求已显示在上方。</div>
    `;
    passage.appendChild(block);
  }

  if (rec.annotation) {
    const ann = document.createElement("div");
    ann.className = "annotation-note";
    ann.textContent = rec.annotation;
    passage.appendChild(ann);
  }
}

function makeQuestionCard(q, opts = {}) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "question-card";
  card.dataset.qIndex = String(q.qIndex);
  const sectionLabel = opts.sectionLabel || q.sectionLabel;
  card.textContent = String(q.qIndex);
  card.title = `第 ${q.qIndex} 题${sectionLabel ? ` · ${sectionLabel}` : ""}`;
  card.setAttribute("aria-label", card.title);
  card.addEventListener("click", () => selectQuestion(q.qIndex));
  return card;
}

function renderPassageForQuestion(rec, qIndex) {
  const passage = $("#passage");
  passage.innerHTML = "";
  let sourceRec = rec;
  let annos = Array.isArray(rec.annotations) ? rec.annotations : [];
  let summary = rec.typeLabel || rec.key;
  if (rec.isExam) {
    const sec = findExamSectionForQ(rec, qIndex);
    if (sec) {
      summary = sec.label;
      sourceRec = {
        materials: sec.materials || [],
        annotation: sec.annotation || "",
        topic: sec.topic || "",
      };
      annos = annos.filter((a) => Number(a.qIndex) >= sec.qStart && Number(a.qIndex) <= sec.qEnd);
    }
  }
  setText($("#source-summary"), summary || "与当前题相关");
  if (sourceRec.topic) {
    const topic = document.createElement("p");
    topic.className = "passage-topic";
    topic.textContent = sourceRec.topic;
    passage.appendChild(topic);
  }
  renderPassageBody(passage, sourceRec, annos);
}

function formatQuestionBody(text) {
  if (!text) return "";
  // 把题目里的 *字* 标记渲染成加点字外观
  return escapeHtml(text)
    .replace(/\*([^*\n]{1,10})\*/g, '<em class="qmark">$1</em>')
    .replace(/\n/g, "<br>");
}

function scrollCurrentQuestionIntoView() {
  const active = $("#active-question");
  const reader = $("#reader");
  const nav = $("#question-nav");
  if (!active || !reader || !nav) return;
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  if (window.matchMedia("(min-width: 1101px)").matches) {
    const readerPadding = Number.parseFloat(getComputedStyle(reader).paddingTop) || 0;
    const target = active.getBoundingClientRect().top - reader.getBoundingClientRect().top + reader.scrollTop - nav.offsetHeight - readerPadding - 8;
    reader.scrollTo({ top: Math.max(0, target), behavior });
    return;
  }
  const headerHeight = $(".site-header")?.offsetHeight || 0;
  const absoluteTop = active.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: Math.max(0, absoluteTop - headerHeight - nav.offsetHeight - 8), behavior });
}

function selectQuestion(qIndex, { skipScroll = false } = {}) {
  if (!state.currentRecord) return;
  const rec = state.currentRecord;
  const allQuestions = rec.questions?.length
    ? rec.questions
    : [{ qIndex: 1, text: rec.topic || rec.material1 || "见材料与原文" }];
  const requested = Number(qIndex) || 1;
  state.currentQIndex = allQuestions.some((q) => Number(q.qIndex) === requested)
    ? requested
    : Number(allQuestions[0].qIndex);
  let activeCard = null;
  $$(".question-card", $("#questions")).forEach((card) => {
    const match = Number(card.dataset.qIndex) === state.currentQIndex;
    card.setAttribute("aria-selected", String(match));
    card.setAttribute("aria-current", match ? "true" : "false");
    if (match) activeCard = card;
  });
  renderPassageForQuestion(rec, state.currentQIndex);
  renderWorkpad();
  const position = allQuestions.findIndex((q) => Number(q.qIndex) === state.currentQIndex);
  setText($("#question-position"), `${position + 1} / ${allQuestions.length}`);
  $("#prev-question-btn").disabled = position <= 0;
  $("#next-question-btn").disabled = position >= allQuestions.length - 1;
  setText($("#header-context"), `${rec.year === 9999 ? "样卷" : rec.year + " 年"} · ${rec.isExam ? (rec.collectionComplete ? "整套试卷" : "已收录题目") : (rec.typeLabel || rec.key)}`);
  activeCard?.scrollIntoView({ behavior: skipScroll ? "auto" : "smooth", inline: "center", block: "nearest" });
  if (!skipScroll) scrollCurrentQuestionIntoView();
  rememberLastPosition();
}

function findExamSectionForQ(examRec, qIndex) {
  if (!examRec?.sections) return null;
  return examRec.sections.find((s) => qIndex >= s.qStart && qIndex <= s.qEnd) || null;
}

const ANSWER_VERSION_ORDER = [
  { key: "openai_codex_gpt_5", label: "OpenAI Codex（GPT-5）本任务独立作答" },
  { key: "claude_opus_4_8", label: "Claude Opus 4.8版本答案" },
  { key: "gpt_5_5_pro", label: "GPT-5.5 pro 版本答案" },
];

function stripAnswerVersionPrefix(text, label) {
  const normalizedLabel = label.replace("版本答案", " 版本答案").replace(/\s+/g, " ").trim();
  return String(text || "")
    .replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[:：]?\\s*`), "")
    .replace(new RegExp(`^${normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[:：]?\\s*`), "")
    .trim();
}

function getAnswerVersions(rec, qIndex) {
  const key = String(qIndex);
  const versions = [];
  for (const spec of ANSWER_VERSION_ORDER) {
    const raw = rec.ai_answer_versions?.[spec.key]?.answers?.[key];
    if (!raw) continue;
    versions.push({ ...spec, text: stripAnswerVersionPrefix(raw, spec.label) });
  }
  if (!versions.length) {
    const fallback = rec.ai_answers?.[key];
    if (fallback) versions.push({ key: "current", label: "AI 答案", text: fallback });
  }
  return versions;
}

function renderAnswerVersions(aiBody, rec, qIndex) {
  const versions = getAnswerVersions(rec, qIndex);
  if (!versions.length) {
    aiBody.innerHTML = `<em style="color:var(--text-muted)">本题暂无预生成的 AI 答案。点击"让 AI 再讲一遍"现场生成。</em>`;
    appendAIAnswerNote(aiBody);
    return;
  }
  aiBody.innerHTML = "";
  for (const version of versions) {
    const section = document.createElement("section");
    section.className = "ai-version";
    const title = document.createElement("h4");
    title.textContent = version.label;
    const text = document.createElement("div");
    text.className = "ai-version-text";
    text.textContent = version.text;
    section.append(title, text);
    aiBody.appendChild(section);
  }
  appendAIAnswerNote(aiBody);
}

function appendAIAnswerNote(aiBody) {
  const note = document.createElement("p");
  note.className = "ai-answer-note";
  note.textContent = "AI 答案可能不对，尤其古文古诗题目";
  aiBody.appendChild(note);
}

/* ============  Workpad（右侧面板）  ============ */
function renderWorkpad() {
  const rec = state.currentRecord;
  if (!rec) {
    $("#workpad-title").textContent = "—";
    $("#active-question").hidden = true;
    $("#ai-answer-block").hidden = true;
    $("#copy-question-btn").hidden = true;
    renderDiscussionPanel();
    return;
  }
  const qIndex = state.currentQIndex || 1;
  const q = (rec.questions || []).find((item) => Number(item.qIndex) === Number(qIndex)) || {
    qIndex,
    text: rec.topic || rec.material1 || "见材料与原文",
    score: null,
  };
  const identity = questionIdentity(rec, qIndex);

  $("#workpad-title").textContent = questionLabel(rec, qIndex);

  const activeBox = $("#active-question");
  activeBox.hidden = false;
  activeBox.innerHTML = `
    <header class="active-question-header">
      <span class="active-question-number">第 ${qIndex} 题</span>
      <span class="active-question-section">${q.sectionLabel ? `${escapeHtml(q.sectionLabel)}${q.score ? ` · ${q.score} 分` : ""}` : (q.score ? `${q.score} 分` : "完整题干")}</span>
    </header>
    <div class="active-question-body">${formatQuestionBody(q.text)}</div>
  `;
  $("#copy-question-btn").hidden = false;
  $("#copy-question-btn").dataset.qIndex = String(qIndex);

  // AI 答案
  const aiBlock = $("#ai-answer-block");
  const aiBody = $("#ai-answer-body");
  setText($(".answer-count", aiBlock), `${getAnswerVersions(rec, qIndex).length} 个版本`);
  const wasOpen = aiBlock.open;
  aiBlock.hidden = false;
  aiBlock.open = wasOpen;
  renderAnswerVersions(aiBody, rec, qIndex);

  // 用户答案：从存储里恢复
  const storedAnswer = loadLocalAnswer(identity.sourceRecordId, identity.sourceQIndex);
  $("#user-answer").value = storedAnswer;
  $("#answer-status").textContent = storedAnswer ? "已自动保存" : "";

  // 对话：从存储里恢复
  state.conversationKey = `${identity.sourceRecordId}#${identity.sourceQIndex}`;
  const messages = loadLocalChat(identity.sourceRecordId, identity.sourceQIndex);
  state.conversations[state.conversationKey] = messages;
  renderChatMessages(messages);
  renderDiscussionPanel();
}

/* ============  对话渲染  ============ */
function renderChatMessages(messages) {
  const box = $("#chat-messages");
  box.innerHTML = "";
  if (!messages.length) {
    box.innerHTML = `<p style="color:var(--text-muted);font-size:.9rem;margin:.4rem 0">还没有对话。提交答案让 AI 批改，或直接在下方提问。</p>`;
    return;
  }
  for (const m of messages) {
    const div = document.createElement("div");
    div.className = `chat-message ${m.role === "user" ? "user" : "assistant"}`;
    div.textContent = m.content;
    box.appendChild(div);
  }
  box.scrollTop = box.scrollHeight;
}

function materialsForDiscussion(rec) {
  if (!rec) return [];
  const structured = Array.isArray(rec.materials) ? rec.materials : [];
  if (structured.length) {
    return structured
      .map((m) => ({
        label: m.label || m.key || "材料",
        text: m.text || "",
      }))
      .filter((m) => m.text);
  }
  return ["material1", "material2", "material3"]
    .map((key, idx) => ({
      label: `材料 ${idx + 1}`,
      text: rec[key] || "",
    }))
    .filter((m) => m.text);
}

function buildDiscussionContext(sourceRec, sourceQIndex, questionText) {
  if (!sourceRec) return null;
  const versions = getAnswerVersions(sourceRec, sourceQIndex);
  return {
    recordTitle: questionLabel(sourceRec, sourceQIndex),
    topic: sourceRec.topic || "",
    materials: materialsForDiscussion(sourceRec),
    sourceNote: sourceRec.annotation || "",
    questionText: questionText || "",
    answerVersions: versions.map((v) => ({
      label: v.label,
      text: v.text,
    })),
  };
}

function discussionTargetForCurrentQuestion() {
  const rec = state.currentRecord;
  if (!rec) return null;
  const qIndex = state.currentQIndex || 1;
  const q = (rec.questions || []).find((item) => Number(item.qIndex) === Number(qIndex));
  if (rec.isExam && q?.origRecId) {
    const origRec = state.byId.get(q.origRecId);
    const origQIndex = Number(q.origQIndex || 1);
    return {
      recordId: q.origRecId,
      qIndex: origQIndex,
      questionTitle: questionLabel(origRec || rec, origQIndex),
      questionText: q.text || "",
      context: buildDiscussionContext(origRec || rec, origQIndex, q.text || ""),
    };
  }
  return {
    recordId: rec.id,
    qIndex: Number(qIndex),
    questionTitle: questionLabel(rec, qIndex),
    questionText: q?.text || rec.topic || "",
    context: buildDiscussionContext(rec, qIndex, q?.text || rec.topic || ""),
  };
}

function discussionApiUrl(target) {
  const url = new URL(DISCUSSION_API, window.location.origin);
  url.searchParams.set("recordId", target.recordId);
  url.searchParams.set("qIndex", String(target.qIndex));
  return url.toString();
}

function isStaticLocalPreview() {
  return ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
}

function renderDiscussionPanel() {
  const shell = $("#discussion-shell");
  const panel = $("#question-discussion");
  if (!shell || !panel) return;
  const target = discussionTargetForCurrentQuestion();
  if (!target) {
    shell.hidden = true;
    panel.hidden = true;
    return;
  }

  shell.hidden = false;
  panel.hidden = !shell.open;
  panel.dataset.recordId = target.recordId;
  panel.dataset.qIndex = String(target.qIndex);
  $("#discussion-content").value = "";
  $("#discussion-status").textContent = "";
  const nameInput = $("#discussion-name");
  if (nameInput && !nameInput.value) {
    try { nameInput.value = localStorage.getItem(discussionNameStorageKey()) || ""; } catch (_) {}
  }

  if (shell.open) loadQuestionDiscussion(target);
}

async function loadQuestionDiscussion(target) {
  const seq = ++state.discussionLoadSeq;
  const itemsBox = $("#discussion-items");
  const issueLink = $("#discussion-issue-link");
  const forumLink = $("#discussion-forum-link");
  if (!itemsBox || !issueLink || !forumLink) return;

  issueLink.hidden = true;
  forumLink.hidden = true;
  if (isStaticLocalPreview()) {
    itemsBox.innerHTML = `<p class="discussion-empty">本地静态预览不加载 GitHub 讨论；部署到 gk.bdfz.net 后可读取本题 issue。</p>`;
    return;
  }
  itemsBox.innerHTML = `<p class="discussion-empty">正在载入本题公开讨论…</p>`;

  try {
    const res = await fetch(discussionApiUrl(target), { headers: { accept: "application/json" } });
    const data = await res.json().catch(() => ({}));
    if (seq !== state.discussionLoadSeq) return;
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);

    if (data.issue?.html_url) {
      issueLink.href = data.issue.html_url;
      issueLink.textContent = `issue #${data.issue.number}`;
      issueLink.hidden = false;
    }
    if (data.issue?.discourse_url) {
      forumLink.href = data.issue.discourse_url;
      forumLink.hidden = false;
    }
    renderDiscussionItems(Array.isArray(data.items) ? data.items : []);
  } catch (err) {
    if (seq !== state.discussionLoadSeq) return;
    itemsBox.innerHTML = `<p class="discussion-empty">本题讨论暂时无法载入。可以稍后重试；提交入口仍会把原题和现有 AI 答案同步到 GitHub 与论坛。</p>`;
    $("#discussion-status").textContent = err.message || "讨论服务暂不可用";
  }
}

function stripDiscussionMeta(body) {
  return String(body || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

function renderDiscussionItems(items) {
  const itemsBox = $("#discussion-items");
  if (!itemsBox) return;
  if (!items.length) {
    itemsBox.innerHTML = `<p class="discussion-empty">还没有公开讨论。你可以先写下本题答案的问题或自己的理解。</p>`;
    return;
  }

  itemsBox.innerHTML = "";
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "discussion-item";
    const typeLabel = item.type === "issue" ? "issue 正文" : "回覆";
    const time = item.created_at ? new Date(item.created_at).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }) : "";
    card.innerHTML = `
      <div class="discussion-item-meta">
        <span>${escapeHtml(item.author || "GitHub")} · ${escapeHtml(typeLabel)}</span>
        ${time ? `<a href="${escapeHtml(item.html_url || "#")}" target="_blank" rel="noopener">${escapeHtml(time)}</a>` : ""}
      </div>
      <div class="discussion-item-body"></div>
    `;
    $(".discussion-item-body", card).textContent = stripDiscussionMeta(item.body) || "（无正文）";
    itemsBox.appendChild(card);
  }
}

async function submitQuestionDiscussion() {
  const target = discussionTargetForCurrentQuestion();
  if (!target) {
    flashStatus("请先选择一道题");
    return;
  }

  const contentInput = $("#discussion-content");
  const nameInput = $("#discussion-name");
  const status = $("#discussion-status");
  const submitBtn = $("#submit-discussion-btn");
  const content = contentInput.value.trim();
  const displayName = nameInput.value.trim();

  if (!content) {
    status.textContent = "先写下讨论内容";
    contentInput.focus();
    return;
  }
  if (isStaticLocalPreview()) {
    status.textContent = "本地静态预览不能提交；部署后由 Pages Function 写入 GitHub issue。";
    return;
  }

  try {
    if (displayName) localStorage.setItem(discussionNameStorageKey(), displayName);
    else localStorage.removeItem(discussionNameStorageKey());
  } catch (_) {}

  submitBtn.disabled = true;
  status.textContent = "正在提交到 GitHub issue…";
  try {
    const res = await fetch(DISCUSSION_API, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        recordId: target.recordId,
        qIndex: target.qIndex,
        displayName,
        content,
        questionTitle: target.questionTitle,
        pageUrl: window.location.href,
        context: target.context,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    contentInput.value = "";
    if (data.discourse && data.discourse.ok === false) {
      status.textContent = `已提交 GitHub；论坛同步失败：${data.discourse.error || "unknown"}`;
    } else {
      status.textContent = data.action === "created" ? "已创建本题 issue 并同步论坛" : "已提交到本题 issue 并同步论坛";
    }
    loadQuestionDiscussion(target);
  } catch (err) {
    status.textContent = err.message || "提交失败";
  } finally {
    submitBtn.disabled = false;
  }
}

/* =========================================================
 * 整年试卷（compound record）
 * ======================================================= */
function buildYearExam(year) {
  const numYear = Number(year);
  const records = state.data.filter((r) => Number(r.year) === numYear);
  if (!records.length) return null;

  // 按真实卷子题型顺序排序
  const typeOrder = new Map(TYPES.map((t, i) => [t.key, i]));
  records.sort((a, b) => (typeOrder.get(a.key) ?? 99) - (typeOrder.get(b.key) ?? 99));

  const sections = [];
  const flatQuestions = [];
  const flatAnnotations = [];
  const flatAiAnswers = {};
  const flatAnswerVersions = {
    openai_codex_gpt_5: {
      label: "OpenAI Codex（GPT-5）本任务独立作答",
      model: "OpenAI Codex (GPT-5)",
      answers: {},
    },
    claude_opus_4_8: {
      label: "Claude Opus 4.8版本答案",
      model: "Claude Opus 4.8",
      answers: {},
    },
    gpt_5_5_pro: {
      label: "GPT-5.5 pro 版本答案",
      model: "GPT-5.5 pro",
      answers: {},
    },
  };
  let qCounter = 0;
  let totalScore = 0;

  for (const rec of records) {
    const sectionStart = qCounter + 1;
    const subQs = (rec.questions && rec.questions.length)
      ? rec.questions
      : [{ qIndex: 1, text: rec.topic || rec.material1 || "(详见原文)", score: null }];

    // 把每道小题映射到 flat qIndex
    const localQMap = new Map();    // origQIndex → newQIndex
    for (const q of subQs) {
      qCounter += 1;
      localQMap.set(q.qIndex, qCounter);
      flatQuestions.push({
        qIndex: qCounter,
        text: q.text,
        score: q.score || null,
        origRecId: rec.id,
        origQIndex: q.qIndex,
        sectionLabel: rec.typeLabel || rec.key,
      });
      // AI 答案搬运
      const ans = rec.ai_answers?.[String(q.qIndex)];
      if (ans) flatAiAnswers[String(qCounter)] = ans;
      for (const spec of ANSWER_VERSION_ORDER) {
        const versionAnswer = rec.ai_answer_versions?.[spec.key]?.answers?.[String(q.qIndex)];
        if (versionAnswer) flatAnswerVersions[spec.key].answers[String(qCounter)] = versionAnswer;
      }
      if (q.score) totalScore += q.score;
    }

    // 注释 qIndex 也要按 map 重写
    for (const ann of rec.annotations || []) {
      const newQ = localQMap.get(Number(ann.qIndex));
      if (!newQ) continue;
      flatAnnotations.push({ ...ann, qIndex: newQ });
    }

    sections.push({
      recId: rec.id,
      key: rec.key,
      label: rec.typeLabel || rec.key,
      topic: rec.topic || "",
      annotation: rec.annotation || "",
      materials: rec.materials || [],
      qStart: sectionStart,
      qEnd: qCounter,
      subQs,
    });
  }

  const collectionComplete = records.length >= 7;
  return {
    id: `exam-${numYear}`,
    isExam: true,
    examYear: numYear,
    year: numYear,
    key: "_exam",
    typeLabel: `${numYear === 9999 ? "样卷" : numYear + " 年"}${collectionComplete ? "整套试卷" : "已收录题目"}`,
    topic: `${records.length} 个题型，共 ${flatQuestions.length} 题。`,
    collectionComplete,
    sections,
    questions: flatQuestions,
    annotations: flatAnnotations,
    ai_answers: flatAiAnswers,
    ai_answer_versions: flatAnswerVersions,
    ai_answer_current_version: "gpt_5_5_pro",
    totalScore,
  };
}

function selectYearExam(year) {
  const exam = buildYearExam(year);
  if (!exam) { flashStatus("找不到该年的试卷"); return; }
  state.byId.set(exam.id, exam);
  state.currentRecord = exam;
  state.currentQIndex = 1;
  markRecordViewed(exam);
  renderRecord(exam);
  refreshCatalogStatus();
  $("#passage")?.scrollTo({ top: 0, behavior: "smooth" });
  rememberLastPosition();
}

/* =========================================================
 * 选中记录
 * ======================================================= */
function selectRecord(recordId) {
  const rec = state.byId.get(recordId);
  if (!rec) return;
  state.currentRecord = rec;
  state.currentQIndex = rec.questions?.[0]?.qIndex || 1;
  markRecordViewed(rec);
  renderRecord(rec);
  refreshCatalogStatus();
  $("#passage")?.scrollTo({ top: 0, behavior: "smooth" });
  rememberLastPosition();
}

function markRecordViewed(rec) {
  if (state.readProgress[rec.id] !== "done") {
    state.readProgress[rec.id] = "in_progress";
    saveLocalProgress();
  }
  syncProgressUpstream(rec, "in_progress", 30);
}

function markRecordDone(rec) {
  state.readProgress[rec.id] = "done";
  saveLocalProgress();
  syncProgressUpstream(rec, "done", 100);
}

function syncProgressUpstream(rec, recState, percent) {
  getAuthedIdentity()?.syncProgress?.({
    siteKey: SITE_KEY,
    itemKey: `paper-${rec.id}`,
    itemTitle: recordLabel(rec),
    itemGroup: rec.typeLabel || rec.key,
    itemType: "paper",
    state: recState,
    progressPercent: percent,
    meta: { recordId: rec.id, year: rec.year, key: rec.key },
  })?.catch?.(() => {});
}

function rememberLastPosition() {
  if (!state.currentRecord) return;
  // 本地立刻持久化，刷新可恢复
  try {
    localStorage.setItem("gk_last_position", JSON.stringify({
      recordId: state.currentRecord.id,
      qIndex: state.currentQIndex,
    }));
  } catch (_) {}
  // 同步到 user-center
  getAuthedIdentity()?.recordEvent?.({
    siteKey: SITE_KEY,
    recordKey: "gk-last-position",
    title: `最近阅读 ${recordLabel(state.currentRecord)}`,
    summary: `第 ${state.currentQIndex} 题`,
    itemGroup: "navigation",
    itemType: "last-position",
    payload: {
      recordId: state.currentRecord.id,
      qIndex: state.currentQIndex,
    },
  })?.catch?.(() => {});
}

/* =========================================================
 * AI 调用
 * ======================================================= */
async function callAI(prompt, taskType = "chat") {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Project-Name": "gk.bdfz.net",
        "X-Task-Type": taskType,
        "X-Thinking-Level": "low",
      },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = j?.error || JSON.stringify(j); }
      catch (_) { detail = await res.text(); }
      throw new Error(`HTTP ${res.status}: ${String(detail).slice(0, 220)}`);
    }
    const json = await res.json();
    if (!json?.answer) throw new Error("AI 没有返回内容");
    return json.answer;
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("请求超过 45 秒，请重试");
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

function setAIControlsBusy(busy, status = "") {
  for (const selector of ["#grade-btn", "#regenerate-ai-btn", "#chat-submit-btn"]) {
    const button = $(selector);
    if (button) button.disabled = busy;
  }
  $("#workpad")?.setAttribute("aria-busy", String(busy));
  setText($("#chat-status"), status);
}

function buildContextPrompt(rec, qIndex, userTurn, mode = "chat") {
  const lines = [];
  lines.push("你是一位精通北京高考语文的资深教师，正在帮一位学生理解某一道真题。请用规范现代汉语（简体中文）作答，不要使用 **粗体** 或 *斜体* 这类格式标记，可以用普通的「标题：内容」分段。");
  lines.push("");

  // 整套试卷模式：只把当前小题所在的那个大题的原文带上，避免上下文过长
  if (rec.isExam) {
    const sec = findExamSectionForQ(rec, qIndex);
    lines.push(`【试卷】${rec.year} 年 北京高考 · 整套试卷（学生正在通做整年试题）`);
    if (sec) {
      lines.push(`【当前大题】${sec.label}${sec.topic ? `——${sec.topic}` : ""}`);
      for (const m of sec.materials || []) {
        lines.push(`【${m.label}】`);
        lines.push(m.text);
      }
      if (sec.annotation) lines.push(`【原书注释】${sec.annotation}`);
    }
  } else {
    lines.push(`【试卷】${rec.year} 年 北京高考 · ${rec.typeLabel || rec.key}`);
    if (rec.topic) lines.push(`【说明】${rec.topic}`);
    if (rec.materials?.length) {
      for (const m of rec.materials) {
        lines.push(`【${m.label}】`);
        lines.push(m.text);
      }
    }
    if (rec.annotation) lines.push(`【原书注释】${rec.annotation}`);
  }

  const activeQ = (rec.questions || []).find((q) => Number(q.qIndex) === Number(qIndex));
  if (activeQ) {
    lines.push(`【当前小题】第 ${qIndex} 题${activeQ.score ? `（${activeQ.score} 分）` : ""}：`);
    lines.push(activeQ.text);
  } else if (rec.topic) {
    lines.push(`【当前题目】${rec.topic}`);
  }

  // 题目对应的原文片段
  const annos = (rec.annotations || []).filter((a) => Number(a.qIndex) === Number(qIndex));
  if (annos.length) {
    lines.push(`【题目所考查的原文片段】`);
    for (const a of annos) {
      const tlabel = { dot: "加点字", underline: "画线句", wave: "关键句", highlight: "重点" }[a.type] || "原文";
      lines.push(`- ${tlabel}：${a.anchor}${a.rationale ? `（${a.rationale}）` : ""}`);
    }
  }

  // 用户已有答案
  const identity = questionIdentity(rec, qIndex);
  const userAnswer = loadLocalAnswer(identity.sourceRecordId, identity.sourceQIndex);
  if (userAnswer) {
    lines.push(`【学生当前的答案】`);
    lines.push(userAnswer);
  }

  // AI 已经给出的答案
  const aiAns = rec.ai_answers?.[String(qIndex)];
  if (aiAns) {
    lines.push(`【AI 之前给出的参考答案】`);
    lines.push(aiAns);
  }

  // 之前的对话
  const messages = state.conversations[state.conversationKey] || [];
  if (messages.length) {
    lines.push(`【此前的对话】`);
    for (const m of messages.slice(-12)) {
      lines.push(`${m.role === "user" ? "学生" : "AI"}：${m.content}`);
    }
  }

  lines.push("");
  if (mode === "review") {
    lines.push("【任务】请对学生当前的答案做批改，给出：");
    lines.push("1) 一行总评 + 推测得分（注明本题满分）；");
    lines.push("2) 答得好的地方（一两条）；");
    lines.push("3) 失分点（具体到要点）；");
    lines.push("4) 标准答案要点 / 答题区间，结合原文哪一句；");
    lines.push("5) 一句话改写示范或下一步训练建议。");
  } else if (mode === "regenerate") {
    lines.push("【任务】请重新给出本题的详细解析与答案，结构清晰，依据原文。");
  } else {
    lines.push(`【学生此时的追问】${userTurn}`);
    lines.push("【任务】请基于上述全部信息，自然、有针对性地回答学生的追问，并尽量结合原文具体句子或字词说明依据。");
  }
  return lines.join("\n");
}

async function dispatchChat(userTurn) {
  if (!state.currentRecord) {
    flashStatus("请先在左侧选一道题");
    return;
  }
  if (state.isThinking) return;
  state.isThinking = true;
  setAIControlsBusy(true, "AI 正在回应…");
  const rec = state.currentRecord;
  const qIndex = state.currentQIndex;
  const identity = questionIdentity(rec, qIndex);
  const conversationKey = `${identity.sourceRecordId}#${identity.sourceQIndex}`;
  const messages = state.conversations[conversationKey] || [];
  messages.push({ role: "user", content: userTurn });
  state.conversations[conversationKey] = messages;
  renderChatMessages(messages);
  saveLocalChat(identity.sourceRecordId, identity.sourceQIndex, messages);

  const thinking = document.createElement("div");
  thinking.className = "chat-message assistant thinking";
  thinking.textContent = "AI 正在思考……";
  $("#chat-messages").appendChild(thinking);
  $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;

  const prompt = buildContextPrompt(rec, qIndex, userTurn, "chat");
  try {
    const answer = await callAI(prompt, "chat");
    thinking.remove();
    messages.push({ role: "assistant", content: answer });
    state.conversations[conversationKey] = messages;
    if (state.conversationKey === conversationKey) renderChatMessages(messages);
    saveLocalChat(identity.sourceRecordId, identity.sourceQIndex, messages);
    archiveConversation(identity, messages);
  } catch (err) {
    thinking.remove();
    const errMsg = `跟 AI 的连接出了点问题：${err.message || err}。试着再发一遍？`;
    messages.push({ role: "assistant", content: errMsg });
    state.conversations[conversationKey] = messages;
    if (state.conversationKey === conversationKey) renderChatMessages(messages);
    saveLocalChat(identity.sourceRecordId, identity.sourceQIndex, messages);
  } finally {
    state.isThinking = false;
    setAIControlsBusy(false, "");
  }
}

async function gradeUserAnswer() {
  if (!state.currentRecord) return;
  if (state.isThinking) return;
  const text = $("#user-answer").value.trim();
  if (!text) {
    flashStatus("先把答案写下来再让 AI 批改");
    $("#user-answer").focus();
    return;
  }
  const rec = state.currentRecord;
  const qIndex = state.currentQIndex;
  const identity = questionIdentity(rec, qIndex);
  const conversationKey = `${identity.sourceRecordId}#${identity.sourceQIndex}`;
  // 视为一次"由 AI 批改"事件
  const messages = state.conversations[conversationKey] || [];
  messages.push({ role: "user", content: `(请批改我的答案)\n${text}` });
  state.conversations[conversationKey] = messages;
  renderChatMessages(messages);
  saveLocalChat(identity.sourceRecordId, identity.sourceQIndex, messages);

  const thinking = document.createElement("div");
  thinking.className = "chat-message assistant thinking";
  thinking.textContent = "AI 正在批改你的答案……";
  $("#chat-messages").appendChild(thinking);
  $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;

  const prompt = buildContextPrompt(rec, qIndex, "", "review");
  state.isThinking = true;
  setAIControlsBusy(true, "AI 正在批改…");
  try {
    const answer = await callAI(prompt, "feedback");
    thinking.remove();
    messages.push({ role: "assistant", content: answer });
    state.conversations[conversationKey] = messages;
    if (state.conversationKey === conversationKey) renderChatMessages(messages);
    saveLocalChat(identity.sourceRecordId, identity.sourceQIndex, messages);
    markRecordDone(rec);
    refreshCatalogStatus();
    syncAnswerUpstream(rec, qIndex, text);
    archiveConversation(identity, messages);
  } catch (err) {
    thinking.remove();
    messages.push({ role: "assistant", content: `批改失败：${err.message || err}。再试一次？` });
    if (state.conversationKey === conversationKey) renderChatMessages(messages);
    saveLocalChat(identity.sourceRecordId, identity.sourceQIndex, messages);
  } finally {
    state.isThinking = false;
    setAIControlsBusy(false, "");
  }
}

async function regenerateAIAnswer() {
  if (!state.currentRecord) return;
  if (state.isThinking) return;
  const rec = state.currentRecord;
  const qIndex = state.currentQIndex;
  const aiBody = $("#ai-answer-body");
  const original = aiBody.textContent;
  aiBody.innerHTML = `<em style="color:var(--text-muted)">AI 正在重新讲解……</em>`;
  const prompt = buildContextPrompt(rec, qIndex, "", "regenerate");
  state.isThinking = true;
  setAIControlsBusy(true, "AI 正在生成解析…");
  try {
    const answer = await callAI(prompt, "feedback");
    // 写入 in-memory（不落到 data 文件）
    if (!rec.ai_answers) rec.ai_answers = {};
    rec.ai_answers[String(qIndex)] = answer;
    if (state.currentRecord === rec && Number(state.currentQIndex) === Number(qIndex)) {
      aiBody.textContent = answer;
      appendAIAnswerNote(aiBody);
    }
  } catch (err) {
    if (state.currentRecord === rec && Number(state.currentQIndex) === Number(qIndex)) {
      aiBody.textContent = `生成失败：${err.message || err}\n\n${original}`;
      appendAIAnswerNote(aiBody);
    }
  } finally {
    state.isThinking = false;
    setAIControlsBusy(false, "");
  }
}

function syncAnswerUpstream(rec, qIndex, text) {
  const identity = questionIdentity(rec, qIndex);
  const sourceRec = identity.sourceRecord;
  getAuthedIdentity()?.syncProgress?.({
    siteKey: SITE_KEY,
    itemKey: progressItemKey(identity.sourceRecordId, identity.sourceQIndex),
    itemTitle: questionLabel(sourceRec, identity.sourceQIndex),
    itemGroup: sourceRec?.typeLabel || sourceRec?.key,
    itemType: "answer",
    state: "done",
    progressPercent: 100,
    meta: {
      recordId: identity.sourceRecordId,
      qIndex: identity.sourceQIndex,
      text: text.slice(0, 8000),
    },
  })?.catch?.(() => {});
}

function archiveConversation(identity = currentQuestionIdentity(), providedMessages = null) {
  if (!identity?.sourceRecordId) return;
  const rec = identity.sourceRecord;
  const qIndex = identity.sourceQIndex;
  const key = `${identity.sourceRecordId}#${qIndex}`;
  const messages = providedMessages || state.conversations[key];
  if (!messages.length) return;
  getAuthedIdentity()?.recordConversation?.({
    siteKey: SITE_KEY,
    sessionKey: `${SITE_KEY}-${identity.sourceRecordId}-q${qIndex}`,
    title: questionLabel(rec, qIndex).slice(0, 80),
    summary: messages[messages.length - 1]?.content?.slice(0, 120) || "高考对话",
    sourceUrl: window.location.href,
    messages: messages.map((m, i) => ({ id: String(i + 1), role: m.role, content: m.content })),
    meta: { recordId: identity.sourceRecordId, qIndex },
  })?.catch?.(() => {});
}

/* =========================================================
 * 自定义题（日常作业）
 * ======================================================= */
async function submitCustomAssignment(form) {
  const data = Object.fromEntries(new FormData(form));
  const questionText = String(data.questionText || "").trim();
  const referenceAnswer = String(data.referenceAnswer || "").trim();
  const userAnswer = String(data.userAnswer || "").trim();
  const score = Number(data.score) || 0;
  if (!questionText || !userAnswer || !score) {
    flashStatus("请填写完整");
    return;
  }
  // 把自定义题展示在 workpad 里，并发起一次批改
  state.currentRecord = {
    id: `custom-${Date.now().toString(36)}`,
    year: "日常",
    key: "custom",
    typeLabel: "日常作业",
    topic: questionText.slice(0, 100),
    materials: [],
    questions: [{ qIndex: 1, text: questionText, score }],
    ai_answers: {},
    annotations: [],
    customMeta: { referenceAnswer, score, userAnswer },
  };
  state.byId.set(state.currentRecord.id, state.currentRecord);
  state.currentQIndex = 1;
  renderRecord(state.currentRecord);
  $("#user-answer").value = userAnswer;
  saveLocalAnswer(state.currentRecord.id, 1, userAnswer);
  // 触发批改
  await gradeUserAnswer();
}

/* =========================================================
 * 初始化 / 事件绑定
 * ======================================================= */
function initThemePicker() {
  applyTheme(loadStoredTheme());
}

function initCatalog() {
  buildCatalog("");
  const search = $("#catalog-search");
  if (search) {
    search.addEventListener("input", debounce((e) => buildCatalog(e.target.value), 200));
  }
  $("#open-catalog-btn")?.setAttribute("aria-controls", "catalog");
  $("#open-catalog-btn")?.setAttribute("aria-expanded", "false");
  $("#open-catalog-btn")?.addEventListener("click", () => {
    setCatalogOpen(!$("#catalog")?.classList.contains("open"));
  });
  $("#close-catalog-btn")?.addEventListener("click", () => {
    setCatalogOpen(false);
  });
  $("#catalog-backdrop")?.addEventListener("click", () => setCatalogOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#catalog")?.classList.contains("open")) {
      setCatalogOpen(false);
    }
  });
  // 题型 / 年份 切换
  $$(".catalog-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.catalogMode = btn.dataset.mode;
      $$(".catalog-tab").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      buildCatalog(search?.value || "");
    });
  });
}

function initWorkpadBindings() {
  // 答案自动保存
  const answerInput = $("#user-answer");
  const debouncedSave = debounce(({ text, identity, rec, qIndex }) => {
    saveLocalAnswer(identity.sourceRecordId, identity.sourceQIndex, text);
    syncAnswerUpstream(rec, qIndex, text);
    flashStatus("已自动保存");
  }, 800);
  answerInput?.addEventListener("input", (e) => {
    if (e.target.value) flashStatus("……");
    if (!state.currentRecord) return;
    debouncedSave({
      text: e.target.value,
      identity: currentQuestionIdentity(),
      rec: state.currentRecord,
      qIndex: state.currentQIndex,
    });
  });

  $("#save-answer-btn")?.addEventListener("click", () => {
    if (!state.currentRecord) return;
    const text = answerInput.value;
    const identity = currentQuestionIdentity();
    saveLocalAnswer(identity.sourceRecordId, identity.sourceQIndex, text);
    syncAnswerUpstream(state.currentRecord, state.currentQIndex, text);
    flashStatus("已保存到本地与账号");
  });

  $("#copy-answer-btn")?.addEventListener("click", () => {
    if (!answerInput.value) { flashStatus("还没写答案"); return; }
    copyText(answerInput.value, "我的答案已复制");
  });

  $("#grade-btn")?.addEventListener("click", () => gradeUserAnswer());

  $("#copy-question-btn")?.addEventListener("click", () => {
    const rec = state.currentRecord; if (!rec) return;
    const q = (rec.questions || []).find((x) => Number(x.qIndex) === Number(state.currentQIndex));
    const txt = q ? q.text : (rec.topic || "");
    copyText(txt, "题目已复制");
  });

  $("#copy-ai-answer-btn")?.addEventListener("click", () => {
    const txt = $("#ai-answer-body").innerText;
    copyText(txt, "AI 答案已复制");
  });

  $("#regenerate-ai-btn")?.addEventListener("click", () => regenerateAIAnswer());

  $("#copy-chat-btn")?.addEventListener("click", () => {
    const messages = state.conversations[state.conversationKey] || [];
    if (!messages.length) { flashStatus("没有可复制的对话"); return; }
    const txt = messages.map((m) => `${m.role === "user" ? "我" : "AI"}：\n${m.content}`).join("\n\n----\n\n");
    copyText(txt, "对话已复制");
  });

  $("#chat-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#chat-input");
    const v = input.value.trim();
    if (!v) return;
    input.value = "";
    dispatchChat(v);
  });

  $("#chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("#chat-form").requestSubmit();
    }
  });

  $("#discussion-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitQuestionDiscussion();
  });

  $("#discussion-shell")?.addEventListener("toggle", (e) => {
    if (!e.currentTarget.open) {
      $("#question-discussion").hidden = true;
      state.discussionLoadSeq += 1;
      return;
    }
    renderDiscussionPanel();
  });
}

function initQuestionNavigation() {
  const move = (delta) => {
    const rec = state.currentRecord;
    if (!rec) return;
    const questions = rec.questions?.length ? rec.questions : [{ qIndex: 1 }];
    const current = questions.findIndex((q) => Number(q.qIndex) === Number(state.currentQIndex));
    const next = questions[current + delta];
    if (next) selectQuestion(next.qIndex);
  };
  $("#prev-question-btn")?.addEventListener("click", () => move(-1));
  $("#next-question-btn")?.addEventListener("click", () => move(1));
}

function initPassageDelegate() {
  // 点击原文中的 annotation -> 选择对应题目
  $("#passage")?.addEventListener("click", (e) => {
    const span = e.target.closest(".anno");
    if (span && span.dataset.qIndex) {
      selectQuestion(Number(span.dataset.qIndex));
    }
    const copyBtn = e.target.closest('[data-action="copy-material"]');
    if (copyBtn) {
      const rec = state.currentRecord; if (!rec) return;
      const m = rec.materials?.find((x) => x.key === copyBtn.dataset.material);
      if (m) copyText(m.text, `${m.label}已复制`);
    }
    const copyQBtn = e.target.closest('[data-action="copy-inline-q"]');
    if (copyQBtn) {
      const rec = state.currentRecord; if (!rec) return;
      const q = rec.questions?.find((x) => Number(x.qIndex) === Number(copyQBtn.dataset.qIndex));
      if (q) copyText(q.text, `第 ${q.qIndex} 题已复制`);
    }
    const copyExamBtn = e.target.closest('[data-action="copy-exam"]');
    if (copyExamBtn) {
      const rec = state.currentRecord; if (!rec?.isExam) return;
      const parts = [];
      parts.push(`【${rec.typeLabel}】`);
      for (const sec of rec.sections) {
        parts.push(`\n── ${sec.label} ──`);
        if (sec.topic) parts.push(sec.topic);
        for (const m of sec.materials) parts.push(`【${m.label}】\n${m.text}`);
        if (sec.annotation) parts.push(sec.annotation);
        for (const q of rec.questions.filter((x) => x.qIndex >= sec.qStart && x.qIndex <= sec.qEnd)) {
          parts.push(`\n第 ${q.qIndex} 题${q.score ? `（${q.score} 分）` : ""}：${q.text}`);
        }
      }
      copyText(parts.join("\n"), "整套题目已复制");
    }
  });
}

function initCustomDialog() {
  const dlg = $("#custom-dialog");
  $("#open-custom-btn")?.addEventListener("click", () => {
    dlg?.showModal();
  });
  dlg?.querySelector('[data-action="cancel"]')?.addEventListener("click", () => dlg.close());
  dlg?.querySelector("form")?.addEventListener("submit", (e) => {
    if (e.submitter?.dataset?.action === "cancel") return;
    e.preventDefault();
    submitCustomAssignment(e.target);
    dlg.close();
  });
}

async function init() {
  initThemePicker();
  initCustomDialog();
  initPassageDelegate();
  initWorkpadBindings();
  initQuestionNavigation();

  loadLocalProgress();

  try {
    await loadData();
  } catch (err) {
    $("#catalog-tree").innerHTML = `<p class="catalog-empty" style="color:var(--danger)">题目数据加载失败：${escapeHtml(err.message)}</p>`;
    return;
  }
  initCatalog();

  await refreshIdentityAuthentication();

  // 挂载 user-center 浮窗
  try { getIdentity()?.mount?.({ siteKey: SITE_KEY }); } catch (_) {}

  // 拉远端进度（如果已登录）
  await hydrateProgressFromServer();

  // 尝试恢复上次位置
  await restoreLastPosition();
  if (!state.currentRecord) {
    const availableYears = [...new Set(state.data.map((rec) => Number(rec.year)))]
      .filter((year) => Number.isFinite(year) && year !== 9999)
      .sort((a, b) => b - a);
    const defaultYear = availableYears.find((year) => buildYearExam(year)?.collectionComplete);
    if (defaultYear) selectYearExam(defaultYear);
    else if (state.data[0]) selectRecord(state.data[0].id);
  }
}

function progressState(item) {
  if (item?.state === "done" || item?.state === "completed") return "done";
  if (item?.state !== "in_progress") return null;
  return Number(item.meta?.progressPercent ?? item.progressPercent) >= 100 ? "done" : "in_progress";
}

function mergeReadProgress(recordId, status) {
  if (status && state.readProgress[recordId] !== "done") state.readProgress[recordId] = status;
}

function restoreLegacyLocalProgress() {
  try {
    const legacy = JSON.parse(localStorage.getItem("gaokao_read_progress") || "{}");
    const groups = new Map();
    for (const rec of state.data) {
      const key = `${rec.key}-${rec.year}`;
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    for (const rec of state.data) {
      const key = `${rec.key}-${rec.year}`;
      if (groups.get(key) !== 1) continue;
      const status = legacy[key];
      if (status === "done" || status === "in_progress") mergeReadProgress(rec.id, status);
    }
    saveLocalProgress();
  } catch (_) {}
}

async function hydrateProgressFromServer() {
  const id = getAuthedIdentity();
  if (!id?.api) return;
  try {
    const res = await id.api(`/api/progress?site=${encodeURIComponent(SITE_KEY)}`);
    if (!Array.isArray(res?.items)) return;
    const aliases = new Map();
    const legacyCounts = new Map();
    for (const rec of state.data) {
      const key = rec.legacy_progress_key;
      if (key) legacyCounts.set(key, (legacyCounts.get(key) || 0) + 1);
    }
    for (const rec of state.data) {
      aliases.set(`paper-${rec.id}`, rec.id);
      if (legacyCounts.get(rec.legacy_progress_key) === 1) {
        for (const prefix of ["question", "answer"]) aliases.set(`${prefix}-${rec.legacy_progress_key}`, rec.id);
      }
    }
    const years = new Set(state.data.map((rec) => Number(rec.year)));
    for (const it of res.items) {
      if (it?.siteKey !== SITE_KEY) continue;
      let recId = aliases.get(it.itemKey);
      const exam = String(it.itemKey || "").match(/^paper-exam-(\d+)$/);
      if (!recId && exam && years.has(Number(exam[1]))) recId = `exam-${exam[1]}`;
      if (recId) mergeReadProgress(recId, progressState(it));
    }
    saveLocalProgress();
    refreshCatalogStatus();
  } catch (_) {}
}

async function restoreLastPosition() {
  // 用户已经手动选择了题目就别覆盖
  if (state.currentRecord) return;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("gk_last_position") || "null"); } catch (_) {}
  const restorePayload = (payload) => {
    if (!payload?.recordId) return false;
    const examMatch = String(payload.recordId).match(/^exam-(\d+)$/);
    if (examMatch) {
      selectYearExam(Number(examMatch[1]));
      if (payload.qIndex) selectQuestion(payload.qIndex, { skipScroll: true });
      return true;
    }
    if (!state.byId.has(payload.recordId)) return false;
    selectRecord(payload.recordId);
    if (payload.qIndex) selectQuestion(payload.qIndex, { skipScroll: true });
    return true;
  };
  if (saved?.recordId) {
    if (state.currentRecord) return;  // 又被用户抢先选了
    if (restorePayload(saved)) return;
  }
  const id = getAuthedIdentity();
  if (id?.api) {
    try {
      const res = await id.api(`/api/data-records?site=${encodeURIComponent(SITE_KEY)}&recordKey=gk-last-position`);
      if (state.currentRecord) return;
      const item = res?.items?.[0];
      const payload = item?.payload || {};
      restorePayload(payload);
    } catch (_) {}
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// 调试入口（生产可保留，体积可忽略）
window.gkState = state;
window.gkSelectRecord = selectRecord;
window.gkSelectQuestion = selectQuestion;
