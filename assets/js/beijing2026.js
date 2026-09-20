/* 2026 北京卷 · 全科真题浏览页 */
(() => {
  "use strict";

  const BASE = "data/beijing-2026";
  const $ = (sel, root = document) => root.querySelector(sel);
  const state = { manifest: null, slug: null, tab: "paper" };

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function subjectBySlug(slug) {
    return (state.manifest?.subjects || []).find((s) => s.slug === slug) || null;
  }

  function renderGrid() {
    const grid = $("#p26-grid");
    grid.textContent = "";
    for (const s of state.manifest.subjects) {
      const btn = el("button", { type: "button", "data-slug": s.slug },
        el("span", { class: "p26-name", text: s.name }),
        el("span", { class: "p26-meta", text: `${s.sat}　${s.score} 分 / ${s.minutes} 分钟` }),
        el("span", { class: "p26-tagrow" },
          el("span", { class: "p26-tag", text: s.mode === "interactive" ? "可在线作答" : `试卷 ${s.questionPages.length} 页` }),
          s.answerPages.length ? el("span", { class: "p26-tag", text: `网传答案 ${s.answerPages.length} 页` }) : null,
          el("span", { class: "p26-tag", text: `来源 ${s.sources.length} 处` })
        )
      );
      btn.addEventListener("click", () => {
        location.hash = `#${s.slug}`;
      });
      grid.append(el("li", { class: "p26-card" }, btn));
    }
  }

  function pageFigures(slug, files, labelPrefix) {
    if (!files.length) {
      return el("p", { class: "p26-note", text: "本科目未收录该部分的图像版本。" });
    }
    const wrap = el("div", { class: "p26-pages" });
    files.forEach((file, i) => {
      wrap.append(el("figure", {},
        el("img", {
          src: `${BASE}/${slug}/${file}`,
          alt: `${labelPrefix}第 ${i + 1} 页`,
          loading: "lazy",
          decoding: "async",
        }),
        el("figcaption", { text: `${labelPrefix}　第 ${i + 1} / ${files.length} 页` })
      ));
    });
    return wrap;
  }

  function sourcesPanel(s) {
    const frag = document.createDocumentFragment();
    frag.append(el("h3", { text: "来源", style: "margin:.2rem 0 .4rem;font-size:1rem;" }));
    const list = el("ul", { class: "p26-srclist" });
    for (const src of s.sources) {
      const title = src.url
        ? el("a", { href: src.url, target: "_blank", rel: "noopener noreferrer", text: src.publisher })
        : el("span", { text: src.publisher });
      list.append(el("li", {}, title,
        el("span", { class: "p26-kind", text: src.kind + (src.note ? `　${src.note}` : "") })));
    }
    frag.append(list);
    frag.append(el("h3", { text: "交叉核验", style: "margin:1rem 0 .4rem;font-size:1rem;" }));
    const checks = el("ul", { class: "p26-checklist" });
    for (const c of s.checks) checks.append(el("li", { text: c }));
    frag.append(checks);
    if (s.answer_note) {
      frag.append(el("p", { class: "p26-note", text: `答案说明：${s.answer_note}` }));
    }
    return frag;
  }

  function renderDetail() {
    const box = $("#p26-detail");
    const s = subjectBySlug(state.slug);
    if (!s) { box.hidden = true; box.textContent = ""; return; }
    box.hidden = false;
    box.textContent = "";

    box.append(el("div", { class: "p26-dhead" },
      el("h2", { text: `${s.name}　${state.manifest.examYear} 北京卷` }),
      el("p", { text: s.paper }),
      el("p", { text: `${s.sat}　满分 ${s.score} 分　时长 ${s.minutes} 分钟${s.pages ? `　全卷 ${s.pages} 页` : ""}` }),
      s.intro ? el("p", { text: s.intro }) : null,
      s.mode === "interactive"
        ? el("a", { class: "p26-cta", href: "/", text: "进入语文逐题练习与 AI 批阅 →" })
        : null
    ));

    const tabs = el("div", { class: "p26-tabs", role: "tablist" });
    const defs = [
      s.questionPages.length ? ["paper", `试卷（${s.questionPages.length} 页）`] : null,
      s.answerPages.length ? ["answer", `网传答案（${s.answerPages.length} 页）`] : null,
      ["source", `来源与核验（${s.sources.length} 处）`],
    ].filter(Boolean);
    if (!defs.some(([key]) => key === state.tab)) state.tab = defs[0][0];
    for (const [key, label] of defs) {
      const b = el("button", { type: "button", role: "tab", "aria-selected": String(state.tab === key), text: label });
      b.addEventListener("click", () => { state.tab = key; renderDetail(); });
      tabs.append(b);
    }
    box.append(tabs);

    const panel = el("div", { class: "p26-panel" });
    if (state.tab === "paper") panel.append(pageFigures(s.slug, s.questionPages, "试卷"));
    else if (state.tab === "answer") panel.append(pageFigures(s.slug, s.answerPages, "网传答案"));
    else panel.append(sourcesPanel(s));
    box.append(panel);

    const back = el("p", { class: "p26-back" },
      el("a", { href: "#", text: "← 返回科目列表" }));
    box.append(back);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function syncFromHash() {
    const slug = location.hash.replace(/^#/, "").trim();
    const next = subjectBySlug(slug) ? slug : null;
    if (next !== state.slug) state.tab = "paper";
    state.slug = next;
    renderDetail();
  }

  async function init() {
    try {
      const res = await fetch(`${BASE}/manifest.json`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.manifest = await res.json();
    } catch (err) {
      $("#p26-disclaimer").textContent = "试卷清单载入失败，请稍后重试。";
      return;
    }
    $("#p26-disclaimer").textContent = state.manifest.disclaimer;
    $("#p26-foot").textContent =
      `清单生成于 ${state.manifest.compiledAt}　·　共 ${state.manifest.subjects.length} 科　·　` +
      `试卷与答案图像 ${state.manifest.subjects.reduce((n, s) => n + s.questionPages.length + s.answerPages.length, 0)} 页`;
    renderGrid();
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
