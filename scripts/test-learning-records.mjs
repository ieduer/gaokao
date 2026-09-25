import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const callSource=app.slice(app.indexOf('async function callAI('),app.indexOf('function setAIControlsBusy('));
function fixture(){const records=[];let fetches=0;const c={AbortController,setTimeout,clearTimeout,window:{setTimeout,clearTimeout},AI_URL:'https://example.invalid',detailedContext:()=>({resourceKey:'question:1',captureScope:'a'}),detailedCapture:(action,content,options,context)=>{const operation={operationId:'synthetic-operation-'+records.length,action,content,options,context};records.push(operation);return{operation,saved:Promise.resolve({ok:true})};},fetch:async()=>{fetches++;return{ok:true,json:async()=>({answer:' synthetic < full\n',model:'reported-only'})};}};vm.createContext(c);vm.runInContext(callSource,c);return{c,records,calls:()=>fetches};}
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
