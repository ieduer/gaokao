import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const recorderSource=readFileSync(new URL('../assets/js/learning-records.js',import.meta.url),'utf8');
const helper=app.slice(app.indexOf('async function readyCaptureScope('),app.indexOf('function initDetailedCapture('));
// The real shared recorder wrapper with an in-memory inbox; the identity SDK can arrive late.
function page({identityDelay=0,authenticated=true}={}){
  const rows=[],root={document:{currentScript:{dataset:{siteKey:'gk'}}},crypto:globalThis.crypto,addEventListener(){},setTimeout,clearTimeout};
  vm.createContext(root);vm.runInContext(recorderSource,root);
  const inbox={add:async row=>{rows.push(row);return true;},list:async()=>[...rows],remove:async()=>{}};
  root.BdfzLearningRecords=root.BdfzLearningRecordsFactory.createService(inbox);
  const identity={getSession:async()=>({authenticated}),createLearningRecorder:async()=>({scope:'owner-553',record:async()=>{},flush:async()=>{},retry:async()=>{},close(){}})};
  if(identityDelay===0)root.BdfzIdentity=identity;else setTimeout(()=>{root.BdfzIdentity=identity;},identityDelay);
  const c={window:root,setTimeout,Date,Promise};vm.createContext(c);vm.runInContext(helper,c);
  return {root,rows,ready:c.readyCaptureScope};
}
test('a first ask made before the identity SDK loaded is captured with the student scope',async()=>{
  const p=page({identityDelay:400});
  await assert.rejects(p.root.BdfzLearningRecords.prepare(),{code:'LEARNING_RECORDER_NOT_READY'}); // the page-load prepare that used to be the only one
  assert.equal(p.root.BdfzLearningRecords.scope,null);
  const scope=await p.ready(4000);
  assert.equal(scope,'owner-553');
  const s=p.root.BdfzLearningRecords,op=s.build('question.submit',{text:'synthetic'},{resourceKey:'question:1',captureScope:scope});
  await s.record(op);
  assert.equal(p.rows[0].scope,'owner-553');
});
test('the old synchronous read on the same page would have left the capture unattributed',async()=>{
  const p=page({identityDelay:400});
  await p.root.BdfzLearningRecords.prepare().catch(()=>{});
  const s=p.root.BdfzLearningRecords,op=s.build('question.submit',{text:'synthetic'},{resourceKey:'question:1',captureScope:s.scope||null});
  await s.record(op);
  assert.equal(p.rows[0].scope,null);
});
test('a signed-out reader is not waited on and stays unattributed',async()=>{
  const p=page({authenticated:false}),t=Date.now();
  assert.equal(await p.ready(4000),null);
  assert(Date.now()-t<1000);
});
test('the wait is bounded when the identity SDK never arrives',async()=>{
  const p=page({identityDelay:60000}),t=Date.now();
  assert.equal(await p.ready(600),null);
  assert(Date.now()-t<1600);
});
test('chat and grading resolve the scope before their first capture and pass it explicitly',()=>{
  for(const [fn,action] of [['async function dispatchChat(','question.submit'],['async function gradeUserAnswer(','answer.submit']]){
    const body=app.slice(app.indexOf(fn),app.indexOf('\n}\n',app.indexOf(fn)));
    const wait=body.indexOf('await readyCaptureScope('),first=body.indexOf("detailedMessage('user'"),capture=body.indexOf(`detailedCapture('${action}'`);
    assert(wait>0&&wait<first&&first<capture,fn);
    assert.match(body.slice(capture,body.indexOf('\n',capture)),/detailedContext\(captureScope\)\)/);
    assert.doesNotMatch(body,/const captureScope=window\.BdfzLearningRecords\?\.scope/);
  }
});
test('page load keeps retrying the recorder instead of a single prepare',()=>{
  const init=app.slice(app.indexOf('function initDetailedCapture('),app.indexOf('function debounce('));
  assert.match(init,/readyCaptureScope\(15000\)/);assert.doesNotMatch(init,/service\.prepare\(\)/);
});
