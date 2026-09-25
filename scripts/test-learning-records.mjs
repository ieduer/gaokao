import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const callSource=app.slice(app.indexOf('async function callAI('),app.indexOf('function setAIControlsBusy('));
function fixture(){const records=[];let fetches=0;const c={AbortController,setTimeout,clearTimeout,window:{setTimeout,clearTimeout},AI_URL:'https://example.invalid',detailedContext:()=>({resourceKey:'question:1',captureScope:'a'}),detailedCapture:(action,content,options,context)=>{const operation={operationId:'synthetic-operation-'+records.length,action,content,options,context};records.push(operation);return{operation,saved:Promise.resolve({ok:true})};},fetch:async()=>{fetches++;return Response.json({answer:' synthetic < full\n',model:'reported-only'});}};vm.createContext(c);vm.runInContext(callSource,c);return{c,records,calls:()=>fetches};}
test('provider waits for durable request and original resource/owner context survives late reply',async()=>{
 const f=fixture();let finish;const promise=new Promise(r=>finish=r);const capture=f.c.detailedCapture;
 f.c.detailedCapture=(...args)=>{const r=capture(...args);return args[0]==='ai.request'?{...r,saved:promise}:r;};
 const result=f.c.callAI('synthetic');await Promise.resolve();assert.equal(f.calls(),0);f.c.detailedContext=()=>({resourceKey:'question:2',captureScope:'b'});finish();assert.equal(await result,' synthetic < full\n');assert.equal(f.calls(),1);assert.equal(f.records[1].context.resourceKey,'question:1');assert.equal(f.records[1].context.captureScope,'a');assert.equal(f.records[1].options.assessment.modelProvenance,'response_declared');
});
test('failed persistence refuses provider call and provider failure is retained as a separate event',async()=>{
 const f=fixture();f.c.detailedCapture=()=>({operation:{operationId:'synthetic'},saved:Promise.reject(Error('storage failed'))});await assert.rejects(f.c.callAI('synthetic'),/storage/);assert.equal(f.calls(),0);
 const g=fixture();g.c.fetch=async()=>{throw new TypeError('synthetic network');};await assert.rejects(g.c.callAI('synthetic'),/network/);assert.equal(g.records.at(-1).action,'ai.failure');assert.equal(g.records.at(-1).options.parentOperationId,g.records[0].operationId);
});
test('new messages retain stable IDs/time and legacy snapshots are not sent across account owners',()=>{
 assert.match(app,/createdAt:new Date\(\)\.toISOString\(\)/);assert.match(app,/messages\.some\(message=>message\.captureScope!==owner\)/);assert.doesNotMatch(app,/messages: messages\.map\(\(m, i\) => \(\{ id: String\(i \+ 1\)/);
});
test('failed upstream response preserves complete original message separately from shortened UI error',async()=>{
 const f=fixture(),full='完整失敗原文\n'.repeat(100);f.c.fetch=async()=>Response.json({error:full,error_code:'UPSTREAM_UNAVAILABLE',answer:'partial original answer'},{status:503});
 await assert.rejects(f.c.callAI('synthetic'),/HTTP 503/);
 const response=f.records.find(r=>r.action==='ai.response.error');assert.equal(response.content.error,full);assert.equal(response.content.answer,'partial original answer');assert.equal(response.content.httpStatus,503);
 assert.equal(f.records.at(-1).action,'ai.failure');
});
test('non-JSON response keeps exact bytes as text without a success or fabricated grade',async()=>{
 const f=fixture(),raw='synthetic invalid response <full>\n';f.c.fetch=async()=>new Response(raw,{status:502});
 await assert.rejects(f.c.callAI('synthetic'),/格式/);const response=f.records.find(r=>r.action==='ai.response.unparsed');assert.equal(response.content.text,raw);assert.equal(response.content.httpStatus,502);assert(!f.records.some(r=>r.action==='assistant.reply'));
});
test('draft revisions never link across captured account scopes',()=>{
 const records=[],ctx={captureScope:'first',sessionKey:'page',resourceKey:'question:1'};
 const c={lastDetailedDrafts:new Map(),detailedContext:()=>({...ctx}),detailedCapture:(action,content,options)=>{const operation={operationId:'op-'+records.length,options};records.push(operation);return{operation};}};
 vm.createContext(c);vm.runInContext(app.slice(app.indexOf('function detailedDraft('),app.indexOf('function detailedMessage(')),c);
 c.detailedDraft('first','answer');c.detailedDraft('revision','answer');ctx.captureScope='second';c.detailedDraft('different owner','answer');
 assert.equal(records[1].options.revisesOperationId,'op-0');assert.equal(records[2].options.revisesOperationId,'');
});
