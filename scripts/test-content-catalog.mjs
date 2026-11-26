import { renderQuestionBlanks } from '../assets/js/question-blanks.js';
import {mountQuestionParts,questionParts} from '../assets/js/question-parts.js';
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {answerVersionSpecs, versionsForQuestion, reviewForQuestion} from '../assets/js/answer-versions.js';
import {validateScopedAnswers, projectScopedAnswers} from './lib/answer-release-scope.mjs';
import {buildContentCatalog, verifyContentCatalog, CATALOG_PATH, versionedCatalogPath, readPublishedArchive, archivedVersionFiles, verifyPublishedVersions} from './lib/content-catalog.mjs';
import {CANONICAL_CONTENT_VERSIONS} from '../assets/js/canonical-question-source.js';

const load=name=>JSON.parse(readFileSync(new URL(`../data/${name}`,import.meta.url)));
const [records,authority,scope,preserved]=['all.json','answer-authority.json','answer-release-scope.json','answer-release-preserved.json'].map(load);
validateScopedAnswers(records,authority,scope,preserved);
const projected=projectScopedAnswers(records,authority,scope,preserved);
const filesA=buildContentCatalog(projected),catalogA=JSON.parse(filesA.get(CATALOG_PATH));
const sha=text=>createHash('sha256').update(text).digest('hex');
const appSource=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const IMPORTS=["import { mountQuestionParts, questionParts } from './question-parts.js?v=20261028-question-blanks';","import { renderQuestionBlanks } from './question-blanks.js';","import { answerVersionSpecs, versionsForQuestion, reviewForQuestion } from './answer-versions.js';"];
const app=IMPORTS.reduce((source,line)=>source.replace(line,''),appSource);
const HTML='<!doctype html><html lang="zh-CN"><title>AI 高考</title></html>';

// A deployment's static files; a path it does not have answers with the site HTML, as Pages does.
function page({files=filesA,legacy={},items=[]}={}){
  const server={files},fetches=[],flashes=[];
  const respond=text=>({ok:true,text:async()=>text,arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
  const storage=new Map([['gaokao_read_progress',JSON.stringify(legacy)]]);
  const context=vm.createContext({console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,TextDecoder,
    renderQuestionBlanks,answerVersionSpecs,versionsForQuestion,reviewForQuestion,mountQuestionParts,questionParts,
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

test('the page versions the changed multipart module and declares the new blank module',()=>{
  assert.deepEqual(appSource.split('\n').filter(line=>/^\s*import\b/.test(line)),IMPORTS);
});

test('the current version is also published at its versioned catalog path, byte-identical and pinned',()=>{
  const path=versionedCatalogPath(catalogA.contentVersion);
  assert.equal(path,`data/catalogs/${catalogA.contentVersion.slice(7)}.json`);
  assert.equal(filesA.get(path),filesA.get(CATALOG_PATH));
  assert.equal(CANONICAL_CONTENT_VERSIONS[catalogA.contentVersion],sha(filesA.get(path)));
  const files=new Map(filesA);files.set(path,`${files.get(path)} `);
  assert.throws(()=>verifyContentCatalog(files),/versioned catalog differs/);
  files.delete(path);
  assert.throws(()=>verifyContentCatalog(files),/versioned catalog differs/);
  // The earlier pinned version must come from the archive; without it the build refuses to publish.
  assert.throws(()=>archivedVersionFiles(filesA,readPublishedArchive(join(tmpdir(),'gk-no-such-archive-'+process.pid)),CANONICAL_CONTENT_VERSIONS),/Pinned version has no published catalog/);
});

// The tracked archive: the 2026-10-28 version (sha256:7aeb9f57…, the default for unversioned callers) and the
// 2026-11-14 original-text version (sha256:efa9b0b3…) that the gwyw, yyjc, gksw and shi caches still bind.
const PREVIOUS={
  'sha256:7aeb9f57cbcb52178a2709d49e17c0afa9db6acb6ef94253f6f04a77c78284b3':'9cc4a27911b45b9385c8cdfa8ea35545425c42ac9d9e06f366660e015d4bae32',
  'sha256:efa9b0b3bbe5d7ae2bbdc45d1281a9f7f8e27bbe132dd2c21749466bdd07a2f5':'18582637a04befbc81adcf497479f1bda58eb686cfebbcba13436df04686f018',
  'sha256:6cbd3661c9fc15cdd9963e4679ae0535a9f700a14369c6feac86a43520a975ff':'79a1e39c8c77e04f27654cde4feffc4bbc9c0312d2e9d260bff86a9b4e27bffe',
};
const trackedArchive=readPublishedArchive(fileURLToPath(new URL('../data/published-archive',import.meta.url)));
function reassemble(files,catalogText){
  const catalog=JSON.parse(catalogText),loaded=catalog.parts.map(part=>JSON.parse(files.get(part.path))),cursor=loaded.map(()=>0);
  return JSON.stringify(catalog.records.map(entry=>loaded[entry.part][cursor[entry.part]++]),null,2)+'\n';
}

test('the previous versions are still served byte-identical from the tracked archive next to the current version',()=>{
  assert.deepEqual(Object.keys(CANONICAL_CONTENT_VERSIONS).sort(),[...Object.keys(PREVIOUS),catalogA.contentVersion].sort());
  assert.ok(!Object.hasOwn(PREVIOUS,catalogA.contentVersion));
  assert.deepEqual([...trackedArchive.catalogs.keys()].sort(),Object.keys(PREVIOUS).sort());
  const extra=archivedVersionFiles(filesA,trackedArchive,CANONICAL_CONTENT_VERSIONS),published=new Map([...filesA,...extra]);
  verifyPublishedVersions(published,CANONICAL_CONTENT_VERSIONS);
  for(const [version,catalogSha] of Object.entries(PREVIOUS)){
    const previousCatalog=published.get(versionedCatalogPath(version));
    assert.equal(previousCatalog,trackedArchive.catalogs.get(version));
    assert.equal(sha(previousCatalog),catalogSha);
    const previousCorpus=reassemble(published,previousCatalog);
    assert.equal(`sha256:${sha(previousCorpus)}`,version,'the archived catalog and parts reassemble the exact earlier corpus bytes');
    // Only parts whose bytes changed are archived; unchanged years are the same generated files.
    for(const part of JSON.parse(previousCatalog).parts){
      assert.equal(sha(published.get(part.path)),part.sha256);
      assert.equal(trackedArchive.parts.has(part.path),!filesA.has(part.path),part.path);
    }
  }
  assert.equal(published.get(CATALOG_PATH),filesA.get(CATALOG_PATH),'the page keeps reading the current version');
  assert.equal(published.get('data/all.json'),filesA.get('data/all.json'));
});

// Archive fixtures live in a temporary directory: the build is current version B (one 2024 annotation
// changed); the archive keeps version A, which consumer caches still bind.
const archiveRoot=mkdtempSync(join(tmpdir(),'gk-published-archive-'));
after(()=>rmSync(archiveRoot,{recursive:true,force:true}));
let archives=0;
function archiveOf(files,edit=()=>{}){
  const dir=join(archiveRoot,String(++archives)),catalog=JSON.parse(files.get(CATALOG_PATH));
  mkdirSync(join(dir,catalog.contentVersion.slice(7)),{recursive:true});mkdirSync(join(dir,'parts'));
  writeFileSync(join(dir,catalog.contentVersion.slice(7),'catalog.json'),files.get(CATALOG_PATH));
  for(const part of catalog.parts)writeFileSync(join(dir,part.path.replace('data/','')),files.get(part.path));
  edit(dir,catalog);
  return dir;
}
const changedB=structuredClone(projected);
changedB.find(r=>r.year===2024&&Object.keys(r.answer_reviews||{}).length).annotation+='。';
const filesB=buildContentCatalog(changedB),catalogB=JSON.parse(filesB.get(CATALOG_PATH));
const pinsAB={[catalogA.contentVersion]:sha(filesA.get(CATALOG_PATH)),[catalogB.contentVersion]:sha(filesB.get(CATALOG_PATH))};

test('an archived version publishes its catalog and only the parts the current build does not generate',()=>{
  const extra=archivedVersionFiles(filesB,readPublishedArchive(archiveOf(filesA)),pinsAB);
  const changedPart=partOf(catalogA,2024).path;
  assert.deepEqual([...extra.keys()].sort(),[versionedCatalogPath(catalogA.contentVersion),changedPart].sort());
  assert.equal(extra.get(versionedCatalogPath(catalogA.contentVersion)),filesA.get(CATALOG_PATH));
  assert.equal(extra.get(changedPart),filesA.get(changedPart));
  const published=new Map([...filesB,...extra]);
  verifyContentCatalog(published);
  verifyPublishedVersions(published,pinsAB);
  assert.equal(published.get(CATALOG_PATH),filesB.get(CATALOG_PATH),'data/catalog.json stays the current version');
  for(const part of catalogA.parts)assert.equal(published.get(part.path),filesA.get(part.path));
});

test('archived versions fail closed on changed, conflicting, missing, stray or unpinned content',()=>{
  const part2024=partOf(catalogA,2024).path.replace('data/',''),part2023=partOf(catalogA,2023).path.replace('data/','');
  const cases=[
    [dir=>writeFileSync(join(dir,part2023),'[]'),/differs from the generated file/],
    [dir=>writeFileSync(join(dir,part2024),readFileSync(join(dir,part2024),'utf8').replace('"','\'')),/do not match its name/],
    [dir=>rmSync(join(dir,part2024)),/Missing content file/],
    [dir=>writeFileSync(join(dir,'parts','1999.0123456789abcdef.json'),'[]'),/not used by an archived catalog/],
    [dir=>writeFileSync(join(dir,'parts','notes.txt'),''),/Unexpected archive file/],
    [dir=>writeFileSync(join(dir,'README.md'),''),/Unexpected archive entry/],
    [(dir,c)=>writeFileSync(join(dir,c.contentVersion.slice(7),'extra.json'),'{}'),/must hold only catalog.json/],
    [(dir,c)=>writeFileSync(join(dir,c.contentVersion.slice(7),'catalog.json'),filesA.get(CATALOG_PATH)+' '),/the shared client pins/],
  ];
  for(const [edit,error] of cases)
    assert.throws(()=>archivedVersionFiles(filesB,readPublishedArchive(archiveOf(filesA,edit)),pinsAB),error);
  const archive=readPublishedArchive(archiveOf(filesA));
  assert.throws(()=>archivedVersionFiles(filesB,archive,{[catalogB.contentVersion]:pinsAB[catalogB.contentVersion]}),/is not pinned by the shared client/);
  assert.throws(()=>archivedVersionFiles(filesB,archive,{[catalogA.contentVersion]:pinsAB[catalogA.contentVersion]}),new RegExp(`${catalogB.contentVersion.slice(7)}.json \\(catalog SHA-256 ${sha(filesB.get(CATALOG_PATH))}\\) is not pinned`));
  assert.throws(()=>archivedVersionFiles(filesB,readPublishedArchive(archiveOf(filesB)),pinsAB),/is the current build/);
  assert.throws(()=>archivedVersionFiles(filesB,{catalogs:new Map(),parts:new Map()},pinsAB),/Pinned version has no published catalog/);
  // A forged archived catalog that keeps the pinned version name but not its content cannot pass.
  const forged=readPublishedArchive(archiveOf(filesA));
  const forgedCatalog=JSON.parse(filesB.get(CATALOG_PATH));forgedCatalog.contentVersion=catalogA.contentVersion;
  forged.catalogs.set(catalogA.contentVersion,JSON.stringify(forgedCatalog));
  forged.parts.clear();
  assert.throws(()=>archivedVersionFiles(filesB,forged,{...pinsAB,[catalogA.contentVersion]:sha(JSON.stringify(forgedCatalog))}),/does not reassemble version/);
});
