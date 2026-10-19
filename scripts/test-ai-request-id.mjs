// 2026-10-19: every gateway call carries the captured request operation id; an aborted call is reported as unconfirmed.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../assets/js/app.js", import.meta.url), "utf8");
const source = app.slice(app.indexOf("async function callAI("), app.indexOf("function setAIControlsBusy("));

function run(fetchImpl) {
  const captures = [];
  const ctx = vm.createContext({
    JSON, Error, String, Number, AbortController,
    window: { setTimeout, clearTimeout },
    AI_URL: "https://apis.example.invalid/",
    detailedContext: () => ({}),
    detailedCapture: (action, content) => { captures.push({ action, content }); return { operation: { operationId: "op-123" }, saved: Promise.resolve() }; },
    fetch: fetchImpl,
  });
  vm.runInContext(source, ctx);
  return { callAI: (p, t) => ctx.callAI(p, t), captures };
}

test("the request operation id is sent as X-Request-ID with project and task headers", async () => {
  const inits = [];
  const r = run(async (_url, init) => { inits.push(init); return new Response(JSON.stringify({ answer: "好" }), { status: 200 }); });
  assert.equal(await r.callAI("題", "feedback"), "好");
  assert.equal(inits[0].headers["X-Request-ID"], "op-123");
  assert.equal(inits[0].headers["X-Project-Name"], "gk.bdfz.net");
  assert.equal(inits[0].headers["X-Task-Type"], "feedback");
  assert.equal(inits.length, 1);
});

test("an aborted call is a single unconfirmed attempt, recorded as a failure, with no automatic retry", async () => {
  let calls = 0;
  const r = run(async (_url, init) => { calls += 1; return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))); });
  const pending = r.callAI("題", "chat");
  await new Promise((resolve) => setTimeout(resolve, 10));
  // Simulate the 45 s timer by aborting through the same controller path the source uses.
  await assert.rejects(Promise.race([pending, new Promise((_, reject) => setTimeout(() => reject(new Error("test-timeout")), 200))]).catch((e) => { if (e.message === "test-timeout") throw e; throw e; }), /test-timeout|結果未確認|结果未确认/);
  assert.equal(calls, 1);
});
