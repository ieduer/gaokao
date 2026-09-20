const GITHUB_OWNER = "ieduer";
const GITHUB_REPO = "gaokao";
const ISSUE_PREFIX = "[gk-discussion]";
const MAX_CONTENT_LENGTH = 4000;
const MAX_CONTEXT_FIELD_LENGTH = 12000;
const MAX_CONTEXT_TOTAL_LENGTH = 36000;
const DISCOURSE_BASE_URL = "https://forum.rdfzer.com";
const DISCOURSE_CATEGORY_ID = 25;
const DISCOURSE_CATEGORY_URL = `${DISCOURSE_BASE_URL}/c/25-category/25`;
const DISCOURSE_META_RE = /<!--\s*gk-discourse-topic\s+id="(\d+)"\s+url="([^"]+)"\s*-->/;
const CONTEXT_START = "<!-- gk-question-context-start -->";
const CONTEXT_END = "<!-- gk-question-context-end -->";
const CONTEXT_RE = /<!--\s*gk-question-context-start\s*-->[\s\S]*?<!--\s*gk-question-context-end\s*-->/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalizeRecordId(value) {
  const s = String(value || "").trim();
  if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(s)) return "";
  return s;
}

function normalizeQIndex(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 300) return "";
  return String(n);
}

function cleanSingleLine(value, max = 120) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanContent(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, MAX_CONTENT_LENGTH);
}

function cleanContextText(value, max = MAX_CONTEXT_FIELD_LENGTH) {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 20)).trimEnd()}\n\n[内容过长，已截断]`;
}

function issueKey(recordId, qIndex) {
  return `${recordId}#${qIndex}`;
}

function issueTitle(recordId, qIndex, questionTitle) {
  const suffix = cleanSingleLine(questionTitle || "", 90);
  return `${ISSUE_PREFIX} ${issueKey(recordId, qIndex)}${suffix ? ` ${suffix}` : ""}`;
}

function discourseTitle(recordId, qIndex, questionTitle) {
  const suffix = cleanSingleLine(questionTitle || "", 90);
  return `高考题目讨论：${issueKey(recordId, qIndex)}${suffix ? ` ${suffix}` : ""}`;
}

function githubHeaders(env, write = false) {
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "gk-bdfz-question-discussions",
  };
  if (env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function githubFetch(url, env, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...githubHeaders(env, init.method && init.method !== "GET"),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) {
    const message = data?.message || text || `GitHub request failed with ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function discourseHeaders(env) {
  if (!env.DISCOURSE_API_KEY) {
    throw new Error("missing DISCOURSE_API_KEY");
  }
  return {
    accept: "application/json",
    "content-type": "application/json",
    "api-key": env.DISCOURSE_API_KEY,
    "api-username": env.DISCOURSE_API_USERNAME || "system",
    "user-agent": "gk-bdfz-question-discussions",
  };
}

async function discourseFetch(path, env, init = {}) {
  const res = await fetch(`${DISCOURSE_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...discourseHeaders(env),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) {
    const message = data?.errors?.join("; ") || data?.error || data?.message || text || `Discourse request failed with ${res.status}`;
    throw new Error(message);
  }
  return data;
}

async function findIssue(env, recordId, qIndex) {
  const key = `${ISSUE_PREFIX} ${issueKey(recordId, qIndex)}`;
  const query = `repo:${GITHUB_OWNER}/${GITHUB_REPO} is:issue in:title "${key}"`;
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=created&order=asc&per_page=10`;
  const data = await githubFetch(url, env);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.find((issue) => String(issue.title || "").startsWith(key)) || null;
}

async function issueComments(env, issue) {
  if (!issue?.comments_url) return [];
  const url = `${issue.comments_url}?per_page=50`;
  return await githubFetch(url, env);
}

function normalizeContext(raw) {
  if (!raw || typeof raw !== "object") return null;
  const recordTitle = cleanSingleLine(raw.recordTitle || "", 160);
  const topic = cleanContextText(raw.topic || "", 2500);
  const questionText = cleanContextText(raw.questionText || "", 8000);
  const sourceNote = cleanContextText(raw.sourceNote || raw.annotation || "", 3000);

  let remainingMaterial = 18000;
  const materials = [];
  for (const item of Array.isArray(raw.materials) ? raw.materials : []) {
    if (!item || typeof item !== "object" || remainingMaterial <= 0) continue;
    const label = cleanSingleLine(item.label || item.key || "材料", 80);
    const text = cleanContextText(item.text || "", Math.min(MAX_CONTEXT_FIELD_LENGTH, remainingMaterial));
    if (!text) continue;
    remainingMaterial -= text.length;
    materials.push({ label, text });
  }

  const answerVersions = [];
  for (const item of Array.isArray(raw.answerVersions) ? raw.answerVersions : []) {
    if (!item || typeof item !== "object") continue;
    const label = cleanSingleLine(item.label || "AI 答案", 80);
    const text = cleanContextText(item.text || "", 9000);
    if (!text) continue;
    answerVersions.push({ label, text });
  }

  if (!recordTitle && !topic && !questionText && !materials.length && !answerVersions.length && !sourceNote) return null;
  return { recordTitle, topic, questionText, materials, sourceNote, answerVersions };
}

function renderQuestionContext(context) {
  if (!context) return "";
  const lines = [
    CONTEXT_START,
    "",
    "## 原题目与现有 AI 答案",
    "",
  ];
  if (context.recordTitle) {
    lines.push(`题目定位：${context.recordTitle}`, "");
  }
  if (context.topic) {
    lines.push("### 题组说明", context.topic, "");
  }
  if (context.materials?.length) {
    lines.push("### 原文材料");
    for (const item of context.materials) {
      lines.push("", `#### ${item.label}`, item.text);
    }
    lines.push("");
  }
  if (context.sourceNote) {
    lines.push("### 原注", context.sourceNote, "");
  }
  if (context.questionText) {
    lines.push("### 本题题干", context.questionText, "");
  }
  if (context.answerVersions?.length) {
    lines.push("### 现有 AI 全部答案");
    for (const item of context.answerVersions) {
      lines.push("", `#### ${item.label}`, item.text);
    }
    lines.push("");
  }
  lines.push(CONTEXT_END);
  const block = lines.filter((line, idx, arr) => line !== "" || arr[idx - 1] !== "").join("\n").trim();
  if (block.length <= MAX_CONTEXT_TOTAL_LENGTH) return block;
  return `${block.slice(0, MAX_CONTEXT_TOTAL_LENGTH - CONTEXT_END.length - 30).trimEnd()}\n\n[上下文过长，已截断]\n${CONTEXT_END}`;
}

function upsertQuestionContext(body, contextBlock) {
  if (!contextBlock) return String(body || "");
  const base = String(body || "");
  if (CONTEXT_RE.test(base)) {
    return base.replace(CONTEXT_RE, contextBlock).trim();
  }
  return `${base.trim()}\n\n---\n\n${contextBlock}`.trim();
}

function renderSubmissionBody({ recordId, qIndex, displayName, content, questionTitle, pageUrl, context }) {
  const name = cleanSingleLine(displayName || "匿名用户", 40) || "匿名用户";
  const title = cleanSingleLine(questionTitle || "", 140);
  const url = cleanSingleLine(pageUrl || "", 240);
  const contextBlock = renderQuestionContext(context);
  const lines = [
    `<!-- gk-discussion recordId="${recordId}" qIndex="${qIndex}" -->`,
    `**${name}：**`,
    "",
    content,
    "",
    "---",
    `题目：${title || `${recordId}#${qIndex}`}`,
    url ? `页面：${url}` : "",
  ];
  if (contextBlock) {
    lines.push("", "---", "", contextBlock);
  }
  return lines.filter((line) => line !== null && line !== undefined).join("\n").trim();
}

function renderDiscourseRaw({ recordId, qIndex, displayName, content, questionTitle, pageUrl, issue, context }) {
  const name = cleanSingleLine(displayName || "匿名用户", 40) || "匿名用户";
  const title = cleanSingleLine(questionTitle || "", 140);
  const url = cleanSingleLine(pageUrl || "", 240);
  const contextBlock = renderQuestionContext(context);
  const lines = [
    `**${name}：**`,
    "",
    content,
    "",
    "---",
    `题目：${title || `${recordId}#${qIndex}`}`,
    url ? `页面：${url}` : "",
    issue?.html_url ? `GitHub issue：${issue.html_url}` : "",
    `讨论分类：${DISCOURSE_CATEGORY_URL}`,
  ];
  if (contextBlock) {
    lines.push("", "---", "", contextBlock);
  }
  return lines.filter((line) => line !== null && line !== undefined).join("\n").trim();
}

function parseDiscourseMeta(issue) {
  const m = String(issue?.body || "").match(DISCOURSE_META_RE);
  if (!m) return null;
  return { id: Number(m[1]), url: m[2] };
}

function appendDiscourseMeta(body, topic) {
  const meta = `<!-- gk-discourse-topic id="${topic.topic_id}" url="${topic.topic_url}" -->`;
  const base = String(body || "").replace(DISCOURSE_META_RE, "").trim();
  return `${base}\n\n${meta}`.trim();
}

function discourseTopicFromPost(post) {
  const topicId = Number(post.topic_id);
  const topicSlug = post.topic_slug || post.topic_slug_url || "";
  const topicUrl = topicSlug
    ? `${DISCOURSE_BASE_URL}/t/${topicSlug}/${topicId}`
    : `${DISCOURSE_BASE_URL}/t/${topicId}`;
  return { topic_id: topicId, topic_url: topicUrl };
}

async function createDiscourseTopic(env, issue, submission) {
  const post = await discourseFetch("/posts.json", env, {
    method: "POST",
    body: JSON.stringify({
      title: discourseTitle(submission.recordId, submission.qIndex, submission.questionTitle),
      raw: renderDiscourseRaw({ ...submission, issue }),
      category: DISCOURSE_CATEGORY_ID,
    }),
  });
  return discourseTopicFromPost(post);
}

async function replyToDiscourseTopic(env, topicId, issue, submission) {
  const post = await discourseFetch("/posts.json", env, {
    method: "POST",
    body: JSON.stringify({
      topic_id: topicId,
      raw: renderDiscourseRaw({ ...submission, issue }),
    }),
  });
  return discourseTopicFromPost(post);
}

async function ensureDiscourseTopic(env, issue, submission) {
  const existing = parseDiscourseMeta(issue);
  if (existing?.id) return existing;

  const topic = await createDiscourseTopic(env, issue, submission);
  const patchedBody = appendDiscourseMeta(issue.body || "", topic);
  await githubFetch(issue.url, env, {
    method: "PATCH",
    body: JSON.stringify({ body: patchedBody }),
  });
  issue.body = patchedBody;
  return { id: topic.topic_id, url: topic.topic_url };
}

async function syncSubmissionToDiscourse(env, issue, submission, { isNewIssue = false } = {}) {
  if (!env.DISCOURSE_API_KEY) {
    return { ok: false, skipped: true, error: "missing_discourse_api_key" };
  }
  try {
    if (isNewIssue) {
      const topic = await ensureDiscourseTopic(env, issue, submission);
      return { ok: true, action: "created_topic", topic_id: topic.id, topic_url: topic.url };
    }

    const topic = await ensureDiscourseTopic(env, issue, submission);
    const replyTopic = await replyToDiscourseTopic(env, topic.id, issue, submission);
    return { ok: true, action: "replied_topic", topic_id: replyTopic.topic_id, topic_url: replyTopic.topic_url || topic.url };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function discussionItemFromIssue(issue) {
  const discourse = parseDiscourseMeta(issue);
  return {
    id: `issue-${issue.number}`,
    type: "issue",
    author: issue.user?.login || "GitHub",
    body: issue.body || "",
    html_url: issue.html_url,
    discourse_url: discourse?.url || "",
    created_at: issue.created_at,
    updated_at: issue.updated_at,
  };
}

function discussionItemFromComment(comment) {
  return {
    id: `comment-${comment.id}`,
    type: "comment",
    author: comment.user?.login || "GitHub",
    body: comment.body || "",
    html_url: comment.html_url,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const recordId = normalizeRecordId(url.searchParams.get("recordId"));
  const qIndex = normalizeQIndex(url.searchParams.get("qIndex"));
  if (!recordId || !qIndex) {
    return json({ error: "invalid_question" }, 400);
  }

  try {
    const issue = await findIssue(env, recordId, qIndex);
    if (!issue) {
      return json({ issue: null, items: [] });
    }
    const comments = await issueComments(env, issue);
    return json({
      issue: {
        number: issue.number,
        title: issue.title,
        html_url: issue.html_url,
        state: issue.state,
        discourse_url: parseDiscourseMeta(issue)?.url || "",
      },
      items: [
        discussionItemFromIssue(issue),
        ...comments.map(discussionItemFromComment),
      ],
    });
  } catch (err) {
    return json({ error: "github_read_failed", message: err.message || String(err) }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_TOKEN) {
    return json({
      error: "missing_github_token",
      message: "匿名讨论提交需要在 Cloudflare Pages production 配置 GITHUB_TOKEN。",
    }, 503);
  }

  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "invalid_json" }, 400);
  }

  const recordId = normalizeRecordId(body.recordId);
  const qIndex = normalizeQIndex(body.qIndex);
  const content = cleanContent(body.content);
  const displayName = cleanSingleLine(body.displayName || "", 40);
  const questionTitle = cleanSingleLine(body.questionTitle || "", 140);
  const pageUrl = cleanSingleLine(body.pageUrl || "", 240);
  const context = normalizeContext(body.context);

  if (!recordId || !qIndex || !content) {
    return json({ error: "invalid_submission" }, 400);
  }

  const submissionBody = renderSubmissionBody({
    recordId,
    qIndex,
    displayName,
    content,
    questionTitle,
    pageUrl,
    context,
  });
  const submission = { recordId, qIndex, displayName, content, questionTitle, pageUrl, context };

  try {
    const issue = await findIssue(env, recordId, qIndex);
    if (issue) {
      const contextBlock = renderQuestionContext(context);
      if (contextBlock) {
        const patchedBody = upsertQuestionContext(issue.body || "", contextBlock);
        if (patchedBody !== (issue.body || "")) {
          await githubFetch(issue.url, env, {
            method: "PATCH",
            body: JSON.stringify({ body: patchedBody }),
          });
          issue.body = patchedBody;
        }
      }
      const comment = await githubFetch(issue.comments_url, env, {
        method: "POST",
        body: JSON.stringify({ body: submissionBody }),
      });
      const discourse = await syncSubmissionToDiscourse(env, issue, submission);
      return json({
        ok: true,
        action: "commented",
        issue: {
          number: issue.number,
          title: issue.title,
          html_url: issue.html_url,
          state: issue.state,
          discourse_url: parseDiscourseMeta(issue)?.url || discourse.topic_url || "",
        },
        discourse,
        item: discussionItemFromComment(comment),
      });
    }

    const createdIssue = await githubFetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, env, {
      method: "POST",
      body: JSON.stringify({
        title: issueTitle(recordId, qIndex, questionTitle),
        body: submissionBody,
      }),
    });
    const discourse = await syncSubmissionToDiscourse(env, createdIssue, submission, { isNewIssue: true });
    return json({
      ok: true,
      action: "created",
      issue: {
        number: createdIssue.number,
        title: createdIssue.title,
        html_url: createdIssue.html_url,
        state: createdIssue.state,
        discourse_url: discourse.topic_url || "",
      },
      discourse,
      item: discussionItemFromIssue(createdIssue),
    });
  } catch (err) {
    return json({ error: "github_write_failed", message: err.message || String(err) }, 502);
  }
}
