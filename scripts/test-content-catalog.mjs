import {mountQuestionParts,questionParts} from '../assets/js/question-parts.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {answerVersionSpecs, versionsForQuestion, reviewForQuestion} from '../assets/js/answer-versions.js';
import {validateScopedAnswers, projectScopedAnswers} from './lib/answer-release-scope.mjs';
import {buildContentCatalog, verifyContentCatalog, CATALOG_PATH} from './lib/content-catalog.mjs';

const load=name=>JSON.parse(readFileSync(new URL(`../data/${name}`,import.meta.url)));
const [records,authority,scope,preserved]=['all.json','answer-authority.json','answer-release-scope.json','answer-release-preserved.json'].map(load);
validateScopedAnswers(records,authority,scope,preserved);
const projected=projectScopedAnswers(records,authority,scope,preserved);
const filesA=buildContentCatalog(projected),catalogA=JSON.parse(filesA.get(CATALOG_PATH));
const sha=text=>createHash('sha256').update(text).digest('hex');
const appSource=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const IMPORTS=["import { mountQuestionParts, questionParts } from './question-parts.js';","import { answerVersionSpecs, versionsForQuestion, reviewForQuestion } from './answer-versions.js';"];
const app=IMPORTS.reduce((source,line)=>source.replace(line,''),appSource);
const HTML='<!doctype html><html lang="zh-CN"><title>AI 高考</title></html>';

// A deployment's static files; a path it does not have answers with the site HTML, as Pages does.
function page({files=filesA,legacy={},items=[]}={}){
  const server={files},fetches=[],flashes=[];
  const respond=text=>({ok:true,text:async()=>text,arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
  const storage=new Map([['gaokao_read_progress',JSON.stringify(legacy)]]);
  const context=vm.createContext({console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,TextDecoder,
    answerVersionSpecs,versionsForQuestion,reviewForQuestion,mountQuestionParts,questionParts,
    window:{BdfzIdentity:{api:async()=>({items})}},
    document:{readyState:'loading',addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    fetch:async(url,options={})=>{fetches.push({url,cache:options.cache});const gate=server.gate?.(url);if(gate)await gate;return respond(server.files.get(url)??HTML);}});
  vm.runInContext(app,context);
  context.flashes=flashes;
  vm.runInContext('renderRecord=()=>{};refreshCatalogStatus=()=>{};flashStatus=m=>flashes.push(m);state.identityAuthenticated=true;',context);
  const run=code=>vm.runInContext(code,context);
  return {run,fetches,flashes,server,storage,version:id=>run(`recordContentVersion.get(state.byId.get('${id}'))`),
    resourceVersion:(id,qIndex=1)=>run(`state.currentRecord=state.byId.get('${id}');state.currentQIndex=${qIndex};detailedContext().resourceVersion`)};
}
const partOf=(catalog,year)=>catalog.parts.find(p=>p.year===year);
const reviewedId=year=>projected.find(r=>r.year===year&&Object.keys(r.answer_reviews||{}).length).id;

test('the published corpus is unchanged and the catalog names its exact bytes',()=>{
  assert.equal(filesA.get('data/all.json'),JSON.stringify(projected,null,2)+'\n');
  assert.equal(catalogA.contentVersion,`sha256:${sha(filesA.get('data/all.json'))}`);
  assert.equal(catalogA.parts.length,new Set(projected.map(r=>r.year)).size);
  assert.deepEqual(catalogA.records.map(r=>r.id),projected.map(r=>r.id));
  for(const part of catalogA.parts)assert.equal(part.path,`data/parts/${part.year}.${sha(filesA.get(part.path)).slice(0,16)}.json`);
  assert.ok(Buffer.byteLength(filesA.get(CATALOG_PATH))<200_000);
});

test('tampered parts, catalog order, summaries or version fail closed',()=>{
  const part=catalogA.parts[0];
  for(const mutate of [
    files=>files.set(part.path,files.get(part.path).replace('"','\'')),
    files=>{const c=JSON.parse(files.get(CATALOG_PATH));[c.records[0],c.records[1]]=[c.records[1],c.records[0]];files.set(CATALOG_PATH,JSON.stringify(c));},
    files=>{const c=JSON.parse(files.get(CATALOG_PATH));c.records[0].questionCount+=1;files.set(CATALOG_PATH,JSON.stringify(c));},
    files=>{const c=JSON.parse(files.get(CATALOG_PATH));c.contentVersion=`sha256:${'0'.repeat(64)}`;files.set(CATALOG_PATH,JSON.stringify(c));},
    files=>files.set('data/all.json',files.get('data/all.json')+' '),
  ]){
    const files=new Map(filesA);mutate(files);
    assert.throws(()=>verifyContentCatalog(files));
  }
});

test('boot reads only the catalog; opening a record loads one verified year with the corpus version',async()=>{
  const p=page();
  await p.run('loadContent()');
  assert.deepEqual(p.fetches,[{url:'data/catalog.json',cache:'no-cache'}]);
  assert.equal(p.run('state.data.length'),projected.length);
  assert.equal(p.run('state.data.every(r=>contentStore.lite.has(r))'),true);
  const id=reviewedId(2023);
  assert.equal(await p.run(`selectRecord('${id}')`),true);
  assert.deepEqual(p.fetches.slice(1),[{url:partOf(catalogA,2023).path,cache:'force-cache'}]);
  assert.equal(p.resourceVersion(id),catalogA.contentVersion);
  assert.equal(p.run('state.data.filter(r=>!contentStore.lite.has(r)).every(r=>r.year===2023)'),true);
  assert.equal(await p.run('selectYearExam(2023)'),true);
  assert.equal(p.fetches.length,2);
  const q=p.run(`buildYearExam(2023).questions.find(q=>q.origRecId==='${id}')`);
  assert.equal(p.run(`state.currentQIndex=${q.qIndex};detailedContext().resourceVersion`),catalogA.contentVersion);
});

test('catalog and full-corpus loading give the same version, year list, default view and restored progress',async()=>{
  const legacy=Object.fromEntries(projected.filter(r=>r.legacy_progress_key).slice(0,40).map((r,i)=>[`${r.key}-${r.year}`,i%2?'done':'in_progress']));
  const items=[...projected.filter(r=>r.legacy_progress_key).slice(20,80).flatMap((r,i)=>[
    {siteKey:'gk',itemKey:`question-${r.legacy_progress_key}`,state:i%3?'in_progress':'completed'},
    {siteKey:'gk',itemKey:`paper-${r.id}`,state:'in_progress',meta:{progressPercent:i%4?30:100}}]),
    {siteKey:'gk',itemKey:'paper-exam-2023',state:'done'}];
  const catalogPage=page({legacy,items}),fullPage=page({legacy,items,files:new Map([['data/all.json',filesA.get('data/all.json')]])});
  await catalogPage.run('loadContent()');await fullPage.run('loadContent()');
  assert.equal(fullPage.run('contentStore.catalog'),null);
  assert.equal(fullPage.run('SOURCE_CONTENT_VERSION'),catalogA.contentVersion);
  assert.equal(catalogPage.run('SOURCE_CONTENT_VERSION'),catalogA.contentVersion);
  const years=[...new Set(projected.map(r=>r.year))];
  for(const year of years){
    const exam=fullPage.run(`buildYearExam(${year})`);
    assert.deepEqual(JSON.parse(JSON.stringify(catalogPage.run(`yearSummary(${year})`))),{collectionComplete:exam.collectionComplete,questionCount:exam.questions.length});
  }
  await catalogPage.run('hydrateProgressFromServer()');await fullPage.run('hydrateProgressFromServer()');
  assert.deepEqual(catalogPage.run('JSON.stringify(state.readProgress)'),fullPage.run('JSON.stringify(state.readProgress)'));
  assert.ok(Object.keys(JSON.parse(fullPage.run('JSON.stringify(state.readProgress)'))).length>40);
  for(const p of [catalogPage,fullPage]){
    p.run('for(const f of ["initDetailedCapture","initThemePicker","initCustomDialog","initPassageDelegate","initWorkpadBindings","initQuestionNavigation","initCatalog"])globalThis[f]=()=>{};state.readProgress={};');
    await p.run('init()');
  }
  assert.equal(catalogPage.run('state.currentRecord.id'),fullPage.run('state.currentRecord.id'));
  const id=reviewedId(2025);
  for(const p of [catalogPage,fullPage]){await p.run(`selectRecord('${id}')`);assert.equal(p.resourceVersion(id),catalogA.contentVersion);}
  for(const year of years)await catalogPage.run(`ensureYear(${year})`);
  assert.equal(catalogPage.run('JSON.stringify(state.data)'),fullPage.run('JSON.stringify(state.data)'));
  assert.equal(catalogPage.run(`state.data.every(r=>recordContentVersion.get(r)===${JSON.stringify(catalogA.contentVersion)})`),true);
  assert.ok(catalogPage.run("state.data.filter(r=>r.source_review?.schema==='gk-answer-review-v1').length")>0);
});

test('a part that fails verification is fetched again, then refused without a version',async()=>{
  const files=new Map(filesA),part=partOf(catalogA,2024);
  files.set(part.path,files.get(part.path).replace('"','\''));
  const p=page({files});
  await p.run('loadContent()');
  assert.equal(await p.run(`selectRecord('${reviewedId(2024)}')`),false);
  assert.deepEqual(p.fetches.slice(1).map(f=>[f.url,f.cache]),[[part.path,'force-cache'],[part.path,'reload'],['data/catalog.json','no-cache']]);
  assert.match(p.flashes.at(-1),/2024 年题目校验失败/);
  assert.equal(p.version(reviewedId(2024)),undefined);
  assert.equal(p.run('state.currentRecord'),null);
});

test('a tab open across a deploy adopts the new catalog without mixing versions inside a year',async()=>{
  const changed=structuredClone(projected),target=changed.find(r=>r.year===2024&&Object.keys(r.answer_reviews||{}).length);
  target.annotation=`${target.annotation || ''}。`;
  const filesB=buildContentCatalog(changed),catalogB=JSON.parse(filesB.get(CATALOG_PATH));
  assert.notEqual(catalogB.contentVersion,catalogA.contentVersion);
  assert.equal(partOf(catalogB,2023).path,partOf(catalogA,2023).path);
  assert.notEqual(partOf(catalogB,2024).path,partOf(catalogA,2024).path);
  const p=page(),earlier=reviewedId(2023);
  await p.run('loadContent()');
  await p.run(`selectRecord('${earlier}')`);
  p.server.files=filesB;
  assert.equal(await p.run(`selectRecord('${target.id}')`),true);
  assert.deepEqual(p.fetches.slice(2).map(f=>[f.url,f.cache]),[[partOf(catalogA,2024).path,'force-cache'],[partOf(catalogA,2024).path,'reload'],['data/catalog.json','no-cache'],[partOf(catalogB,2024).path,'force-cache']]);
  assert.equal(p.resourceVersion(target.id),catalogB.contentVersion);
  assert.match(p.run(`state.byId.get('${target.id}').annotation`),/。$/);
  assert.equal(p.run(`state.data.filter(r=>r.year===2024).every(r=>recordContentVersion.get(r)===${JSON.stringify(catalogB.contentVersion)})`),true);
  assert.equal(p.resourceVersion(earlier),catalogA.contentVersion);
});

test('an older deployment without a catalog falls back to the full corpus and the same version',async()=>{
  const p=page({files:new Map([['data/all.json',filesA.get('data/all.json')]])});
  await p.run('loadContent()');
  assert.deepEqual(p.fetches.map(f=>f.url),['data/catalog.json','data/all.json']);
  const id=reviewedId(2022);
  assert.equal(await p.run(`selectRecord('${id}')`),true);
  assert.equal(p.fetches.length,2);
  assert.equal(p.resourceVersion(id),catalogA.contentVersion);
});

test('only the latest selection renders when an earlier year arrives later',async()=>{
  const p=page(),slow=partOf(catalogA,2019).path;let release;
  p.server.gate=url=>url===slow?new Promise(resolve=>{release=resolve;}):null;
  await p.run('loadContent()');
  const first=p.run(`selectRecord('${reviewedId(2019)}')`);
  assert.equal(await p.run(`selectRecord('${reviewedId(2020)}')`),true);
  release();
  assert.equal(await first,false);
  assert.equal(p.run('state.currentRecord.id'),reviewedId(2020));
});

test('the page adds no import that a cached older sibling module could lack',()=>{
  assert.deepEqual(appSource.split('\n').filter(line=>/^\s*import\b/.test(line)),IMPORTS);
});
