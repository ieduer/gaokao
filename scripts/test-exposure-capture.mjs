import {mountQuestionParts,questionParts} from '../assets/js/question-parts.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {answerVersionSpecs, versionsForQuestion, reviewForQuestion} from '../assets/js/answer-versions.js';
import {validateScopedAnswers, projectScopedAnswers} from './lib/answer-release-scope.mjs';
import {buildContentCatalog, CATALOG_PATH} from './lib/content-catalog.mjs';

const load=name=>JSON.parse(readFileSync(new URL(`../data/${name}`,import.meta.url)));
const [records,authority,scope,preserved]=['all.json','answer-authority.json','answer-release-scope.json','answer-release-preserved.json'].map(load);
validateScopedAnswers(records,authority,scope,preserved);
const files=buildContentCatalog(projectScopedAnswers(records,authority,scope,preserved)),catalog=JSON.parse(files.get(CATALOG_PATH));
const IMPORTS=["import { mountQuestionParts, questionParts } from './question-parts.js';","import { answerVersionSpecs, versionsForQuestion, reviewForQuestion } from './answer-versions.js';"];
const app=IMPORTS.reduce((source,line)=>source.replace(line,''),readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8'));
const recorderSource=readFileSync(new URL('../assets/js/learning-records.js',import.meta.url),'utf8');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const element=()=>({innerHTML:'',textContent:'',hidden:false,open:false,disabled:false,dataset:{},style:{},className:'',title:'',
  appendChild(){},setAttribute(){},addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null,scrollIntoView(){},scrollTo(){},focus(){},
  classList:{add(){},remove(){},toggle(){}},getBoundingClientRect:()=>({top:0}),offsetHeight:0});

// The real page: app.js, the shared capture service from learning-records.js and an identity SDK that may load late,
// refuse a signed-out reader or switch accounts. Captured rows are kept exactly as the inbox receives them.
function page({identityDelay=0,authenticated=true,lastPosition=null}={}){
  const listeners=new Map(),rows=[],storage=new Map(lastPosition ? [['gk_last_position',JSON.stringify(lastPosition)]] : []);
  const root={document:{currentScript:{dataset:{siteKey:'gk'}}},crypto:webcrypto,setTimeout,clearTimeout,matchMedia:()=>({matches:false}),scrollTo(){},scrollY:0,
    addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);}};
  vm.createContext(root);vm.runInContext(recorderSource,root);
  root.BdfzLearningRecords=root.BdfzLearningRecordsFactory.createService({add:async row=>{rows.push(row);return true;},list:async()=>[],remove:async()=>{}});
  const identity={account:'owner-a',getSession:async()=>({authenticated}),
    createLearningRecorder:async()=>({scope:identity.account,record:async()=>{},flush:async()=>{},retry:async()=>{},close(){}})};
  if(identityDelay)setTimeout(()=>{root.BdfzIdentity=identity;},identityDelay);else root.BdfzIdentity=identity;
  const document={readyState:'loading',addEventListener(){},querySelector:()=>element(),querySelectorAll:()=>[],createElement:()=>element(),getElementById:()=>null,
    body:{classList:{toggle(){}}},documentElement:{setAttribute(){}}};
  const context=vm.createContext({console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,TextDecoder,window:root,document,getComputedStyle:()=>({paddingTop:'0'}),
    answerVersionSpecs,versionsForQuestion,reviewForQuestion,mountQuestionParts:()=>null,questionParts,
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    fetch:async url=>{const text=files.get(url)??'<!doctype html>';return {ok:true,text:async()=>text,arrayBuffer:async()=>new TextEncoder().encode(text).buffer};}});
  vm.runInContext(app,context);
  vm.runInContext('renderPassageForQuestion=()=>{};renderWorkpad=()=>{};refreshCatalogStatus=()=>{};flashStatus=()=>{};',context);
  const run=code=>vm.runInContext(code,context);
  const exposures=()=>rows.filter(row=>row.operation.action==='question.exposure')
    .map(row=>({scope:row.scope,key:row.operation.resourceKey,version:row.operation.resourceVersion,at:row.operation.occurredAt,id:row.operation.operationId}));
  return {run,root,identity,exposures,focus:()=>(listeners.get('focus')||[]).forEach(fn=>fn({}))};
}
const feilian=n=>`question:2026-feilian:${n}`;

test('an exposure made before the identity SDK loads is owned by the student, with the time it was shown',async()=>{
  const p=page({identityDelay:400});
  await p.run('loadContent()');
  const shownAt=new Date().toISOString();
  assert.equal(await p.run("selectRecord('2026-feilian')"),true);
  assert.equal(p.exposures().length,0);
  await wait(1200);
  const [row]=p.exposures();
  assert.equal(p.exposures().length,1);
  assert.equal(row.scope,'owner-a');
  assert.equal(row.key,feilian(1));
  assert.equal(row.version,catalog.contentVersion);
  assert.ok(row.at>=shownAt && Date.parse(row.at)<Date.parse(shownAt)+400,'occurredAt is the moment it was shown, not when the owner resolved');
});

test('an exposure right after a window focus is owned instead of stored without an owner',async()=>{
  const p=page();
  await p.run('loadContent()');
  await p.root.BdfzLearningRecords.prepare();
  await p.run("selectRecord('2026-feilian')");
  p.focus();
  assert.equal(p.root.BdfzLearningRecords.scope,null);
  p.run('selectQuestion(2)');
  await wait(800);
  assert.deepEqual(p.exposures().map(x=>[x.key,x.scope]),[[feilian(1),'owner-a'],[feilian(2),'owner-a']]);
});

test('an account switch during the wait is not adopted',async()=>{
  const p=page();
  await p.run('loadContent()');
  await p.root.BdfzLearningRecords.prepare();
  await p.run("selectRecord('2026-feilian')");
  p.identity.account='owner-b';
  p.focus();
  p.run('selectQuestion(2)');
  await wait(800);
  assert.deepEqual(p.exposures().map(x=>[x.key,x.scope]),[[feilian(1),'owner-a'],[feilian(2),null]]);
  p.run('selectQuestion(3)');
  await wait(300);
  assert.equal(p.exposures().at(-1).scope,'owner-b','once the new recorder is ready, its own exposures are owned');
});

test('a signed-out reader stays unattributed without a long wait',async()=>{
  const p=page({authenticated:false});
  await p.run('loadContent()');
  const started=Date.now();
  await p.run("selectRecord('2026-feilian')");
  await wait(600);
  assert.deepEqual(p.exposures().map(x=>x.scope),[null]);
  assert.ok(Date.now()-started<1500);
});

test('moving on while the owner resolves keeps each exposure on its own question and time',async()=>{
  const p=page({identityDelay:400});
  await p.run('loadContent()');
  await p.run("selectRecord('2026-feilian')");
  p.run('selectQuestion(2)');p.run('selectQuestion(3)');
  await wait(1200);
  const rows=p.exposures().sort((a,b)=>a.at<b.at?-1:a.at>b.at?1:0);
  assert.deepEqual(rows.map(x=>[x.key,x.scope]),[[feilian(1),'owner-a'],[feilian(2),'owner-a'],[feilian(3),'owner-a']]);
  assert.equal(new Set(rows.map(x=>x.id)).size,3);
});

test('restoring a last position records one exposure, for the restored question only',async()=>{
  for(const [lastPosition,key] of [[{recordId:'exam-2026',qIndex:3},feilian(3)],[{recordId:'exam-2026',qIndex:1},feilian(1)],[{recordId:'2025-guwen',qIndex:2},'question:2025-guwen:2']]){
    const p=page({lastPosition});
    await p.run('loadContent()');
    await p.root.BdfzLearningRecords.prepare();
    await p.run('restoreLastPosition()');
    await wait(300);
    assert.deepEqual(p.exposures().map(x=>x.key),[key],JSON.stringify(lastPosition));
    assert.equal(p.run('state.currentQIndex'),lastPosition.qIndex);
  }
});

test('a restored question that no longer exists falls back to the first one, once',async()=>{
  const p=page({lastPosition:{recordId:'2026-feilian',qIndex:99}});
  await p.run('loadContent()');
  await p.root.BdfzLearningRecords.prepare();
  await p.run('restoreLastPosition()');
  await wait(300);
  assert.deepEqual(p.exposures().map(x=>x.key),[feilian(1)]);
});
