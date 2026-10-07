import test from 'node:test';
import assert from 'node:assert/strict';
import { questionDigest, questionContextDigest, questionPresentationDigest, snapshotReview, validateAuthority, validateSourceAliases, projectAuthority } from './lib/answer-authority.mjs';
import { versionsForQuestion } from '../assets/js/answer-versions.js';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import {fileURLToPath} from 'node:url';
import {sourceAssets} from './lib/source-assets.mjs';

const records = [{id:'2009-sanwen',topic:'阅读',materials:[{key:'m1',text:'完整材料'}],questions:[{qIndex:1,text:'选两项：A甲 B乙 C丙 D丁 E戊'}],
  ai_answers:{1:'旧解析'},ai_answer_current_version:'old',ai_answer_versions:{old:{label:'历史模型',model:'old-model',answers:{1:'旧解析'}}}}];
function fixture() {
  const inputSha256=questionDigest(records[0],records[0].questions[0]);
  const inputContextSha256=questionContextDigest(records[0],records[0].questions[0]);
  const inputPresentationSha256=questionPresentationDigest(records[0],records[0].questions[0]);
  return {schemaVersion:1,revision:'test',questions:[{id:'2009-sanwen:1',inputSha256,inputContextSha256,inputPresentationSha256,status:'reviewed',kind:'multiple_choice',
    correctOptions:['B','E'],explanation:'逐项比较',reviewedBy:'test-reviewer',reviewedAt:'2026-10-02T23:00:00Z',sources:[{type:'test_fixture'}],
    currentVersion:'gpt_6_astra',modelAnswers:{gpt_6_astra:{modelId:'gpt-6-astra',label:'GPT-6 Astra',text:'答案：B、E',
      inputSha256,inputContextSha256,inputPresentationSha256,generatedAt:'2026-10-02T23:00:00Z',provenance:{kind:'codex_turn',evidence:'test fixture'}}}}]};
}

test('legacy source labels bind their own proof and invalid aliases fail closed', () => {
  const data=JSON.parse(readFileSync(new URL('../data/all.json',import.meta.url)));
  validateSourceAliases(data);
  const record=data.find(r=>r.id==='2005-yuyanjichu-2'), question=record.questions[2];
  const canonical=data.find(r=>r.id==='2003-yuyanjichu-2');
  assert.equal(question.text,canonical.questions[2].text);
  assert.notEqual(questionPresentationDigest(record,question),questionPresentationDigest(canonical,canonical.questions[2]));
  const before=questionPresentationDigest(record,question);
  question.sourceIdentity.sourceScore=7;
  assert.notEqual(questionPresentationDigest(record,question),before);
  question.sourceIdentity.canonicalId='missing:1';
  assert.throws(()=>validateSourceAliases(data),/Invalid legacy source mapping/);
  question.sourceIdentity.canonicalId='2005-yuyanjichu-2:3';
  assert.throws(()=>validateSourceAliases(data),/Invalid legacy source mapping/);
});

test('a new source supplement cannot inherit a legacy model result or leave the release denominator', () => {
  const a=fixture(),data=structuredClone(records);
  data.push({id:'new-source',materials:[],topic:'新补录',questions:[{qIndex:1,text:'新题'}],ai_answers:{},ai_answer_versions:{},answer_policy:'authority_only'});
  assert.throws(()=>validateAuthority(data,a,{requireComplete:true}),/Incomplete review: 1\/2/);
  const copied=structuredClone(a.questions[0]);copied.id='new-source:1';a.questions.push(copied);
  assert.throws(()=>validateAuthority(data,a),/Question changed/);
});
test('retains old answers and IDs while projecting complete multiple-choice key',()=>{
  const original=structuredClone(records),out=projectAuthority(records,fixture());
  assert.deepEqual(records,original);assert.deepEqual(out[0].questions,records[0].questions);
  assert.equal(out[0].ai_answer_versions.old.answers[1],'旧解析');
  assert.deepEqual(out[0].answer_reviews[1].correctOptions,['B','E']);
  assert.equal(out[0].ai_answers[1],'答案：B、E');
});

test('consumer projection retains current and historical visual observations without sharing references',()=>{
  const source=structuredClone(records),a=fixture(),review=a.questions[0];
  const model=review.modelAnswers.gpt_6_astra;
  model.visualEvidence={observations:['synthetic current observation'],limitations:['synthetic uncertainty']};
  model.provenance.imageInputs=[{material:'m1',sha256:'a'.repeat(64),mode:'pixels',evidence:'synthetic fixture only'}];
  const old=snapshotReview(source[0],source[0].questions[0],review);
  old.review.modelAnswers.gpt_6_astra.visualEvidence.observations=['synthetic earlier observation'];
  source[0].annotation='新上下文';review.inputContextSha256=questionContextDigest(source[0],source[0].questions[0]);
  review.inputPresentationSha256=questionPresentationDigest(source[0],source[0].questions[0]);
  model.inputContextSha256=review.inputContextSha256;model.inputPresentationSha256=review.inputPresentationSha256;
  review.history=[old];
  const out=projectAuthority(source,a),slot=out[0].ai_answer_versions.gpt_6_astra;
  assert.deepEqual(slot.visualEvidence[1],model.visualEvidence);
  assert.deepEqual(slot.provenance[1].imageInputs,model.provenance.imageInputs);
  const historical=Object.entries(out[0].ai_answer_versions).find(([id])=>id.startsWith('gpt_6_astra_source_'))[1];
  assert.deepEqual(historical.visualEvidence[1].observations,['synthetic earlier observation']);
  slot.visualEvidence[1].observations.push('projection mutation');
  assert.equal(model.visualEvidence.observations.length,1);
  const staleSource=structuredClone(source);staleSource[0].ai_answer_versions.gpt_6_astra=structuredClone(slot);
  delete model.visualEvidence;
  assert.equal(projectAuthority(staleSource,a)[0].ai_answer_versions.gpt_6_astra.visualEvidence[1],undefined);
});
test('fails before projection on changed passage or reordered options',()=>{
  for(const mutate of [x=>x[0].materials[0].text+='异文',x=>x[0].questions[0].text='选两项：A乙 B甲 C丙 D丁 E戊']) {
    const changed=structuredClone(records);mutate(changed);assert.throws(()=>projectAuthority(changed,fixture()),/Question changed/);
  }
});
test('rejects dropped multiple-choice option, duplicate and unknown question',()=>{
  const a=fixture();a.questions[0].correctOptions=['B'];assert.throws(()=>validateAuthority(records,a),/Truncated/);
  const b=fixture();b.questions.push(b.questions[0]);assert.throws(()=>validateAuthority(records,b),/repeated/);
  const c=fixture();c.questions[0].id='unknown:1';assert.throws(()=>validateAuthority(records,c),/Unknown/);
});
test('unavailable Claude response cannot pass dual-model completion',()=>{
  assert.throws(()=>validateAuthority(records,fixture(),{requireComplete:true}),/Incomplete dual-model/);
  const a=fixture();a.questions[0].modelAnswers.claude={...a.questions[0].modelAnswers.gpt_6_astra,
    modelId:'claude-test',provenance:{kind:'cli_response',evidence:'test fixture',responseModel:'another-model'}};
  assert.throws(()=>validateAuthority(records,a),/Response model mismatch/);
});
test('draft review leaves current answers unchanged; disputed review cannot grade',()=>{
  const a=fixture();a.questions[0].status='draft';assert.deepEqual(projectAuthority(records,a),records);
  a.questions[0].status='disputed';assert.throws(()=>projectAuthority(records,a),/Dispute/);
  a.questions[0].correctOptions=[];assert.match(projectAuthority(records,a)[0].ai_answers[1],/暂停确定判分/);
});
test('unresolved source or evidence issue blocks even complete dual-model coverage',()=>{
  const a=fixture();a.questions[0].modelAnswers.claude={...a.questions[0].modelAnswers.gpt_6_astra,
    modelId:'claude-opus-5-5',provenance:{kind:'cli_response',evidence:'test fixture',responseModel:'claude-opus-5-5'}};
  validateAuthority(records,a,{requireComplete:true});
  a.releaseBlockers=[{id:'source',status:'open'}];
  assert.throws(()=>validateAuthority(records,a,{requireComplete:true}),/Unresolved source/);
});
test('new model names and per-question dates display without a hardcoded list',()=>{
  const out=projectAuthority(records,fixture());const versions=versionsForQuestion(out[0],1);
  assert.equal(versions[0].model,'gpt-6-astra');assert.equal(versions[0].current,true);
  assert.equal(versions[0].generatedAt,'2026-10-02T23:00:00Z');assert.equal(versions[1].text,'旧解析');
});
test('annotation-only source change cannot reuse full-context approval',()=>{
  const changed=structuredClone(records);changed[0].annotation='说明选项含义的新注释';
  assert.equal(questionDigest(changed[0],changed[0].questions[0]),fixture().questions[0].inputSha256);
  assert.throws(()=>validateAuthority(changed,fixture()),/Question context changed/);
});
test('omitted notes do not qualify as complete dual-model context',()=>{
  const a=fixture(),review=a.questions[0];
  review.modelAnswers.claude={...review.modelAnswers.gpt_6_astra,modelId:'claude-opus-5-5',
    provenance:{kind:'cli_response',evidence:'test fixture',responseModel:'claude-opus-5-5'}};
  delete review.modelAnswers.claude.inputContextSha256;
  assert.throws(()=>validateAuthority(records,a,{requireComplete:true}),/Incomplete full-context evidence/);
});
function markedFixture() {
  const source=structuredClone(records),a=fixture(),review=a.questions[0];
  source[0].materials[0].text='甲之乙之丙';
  source[0].annotations=[{qIndex:1,material:'m1',type:'dot',start:1,end:2,anchor:'之'}];
  review.inputSha256=questionDigest(source[0],source[0].questions[0]);
  review.inputContextSha256=questionContextDigest(source[0],source[0].questions[0]);
  review.inputPresentationSha256=questionPresentationDigest(source[0],source[0].questions[0]);
  Object.assign(review.modelAnswers.gpt_6_astra,{inputSha256:review.inputSha256,
    inputContextSha256:review.inputContextSha256,inputPresentationSha256:review.inputPresentationSha256});
  review.modelAnswers.claude={...review.modelAnswers.gpt_6_astra,modelId:'claude-opus-5-5',
    provenance:{kind:'cli_response',evidence:'test fixture',responseModel:'claude-opus-5-5'}};
  return {source,a,review};
}

test('hashes or a textual picture description cannot substitute for two actual-image proofs',()=>{
  const {source,a,review}=markedFixture();
  source[0].materials[0].image={asset:'assets/img/fixture.jpg',sha256:'a'.repeat(64),required:true,mimeType:'image/jpeg'};
  review.inputSha256=questionDigest(source[0],source[0].questions[0]);review.inputContextSha256=questionContextDigest(source[0],source[0].questions[0]);review.inputPresentationSha256=questionPresentationDigest(source[0],source[0].questions[0]);
  for(const model of Object.values(review.modelAnswers))Object.assign(model,{inputSha256:review.inputSha256,inputContextSha256:review.inputContextSha256,inputPresentationSha256:review.inputPresentationSha256});
  assert.throws(()=>validateAuthority(source,a,{requireComplete:true}),/Incomplete actual-image/);
  const root=review.modelAnswers.gpt_6_astra;
  root.visualEvidence={observations:['synthetic visible fixture'],limitations:[]};root.provenance.imageInputs=[{material:'m1',sha256:'a'.repeat(64),mode:'pixels',evidence:'synthetic fixture only'}];
  assert.throws(()=>validateAuthority(source,a,{requireComplete:true}),/Incomplete actual-image/);
  const claude=review.modelAnswers.claude;claude.visualEvidence=structuredClone(root.visualEvidence);claude.provenance.imageInputs=structuredClone(root.provenance.imageInputs);
  validateAuthority(source,a,{requireComplete:true});
  claude.provenance.imageInputs[0].sha256='b'.repeat(64);
  assert.throws(()=>validateAuthority(source,a,{requireComplete:true}),/Incomplete actual-image/);
});

test('source assets are local allowlisted files with matching bytes, never a private path or unverified URL',()=>{
  const data=JSON.parse(readFileSync(new URL('../data/all.json',import.meta.url))),root=fileURLToPath(new URL('../',import.meta.url));
  assert.deepEqual(sourceAssets(data,root),['assets/img/beijing-2008-q21-clock.jpg']);
  const image=data.find(r=>r.id==='2008-yuyan-image').materials[0].image;
  image.sha256='a'.repeat(64);assert.throws(()=>sourceAssets(data,root),/hash mismatch/);
  image.asset='../../private.jpg';assert.throws(()=>sourceAssets(data,root),/Invalid source image/);
});

test('practice scoring cannot silently rescale legacy values, omit component points or attach to a different input',()=>{
  const data=JSON.parse(readFileSync(new URL('../data/all.json',import.meta.url))),a=JSON.parse(readFileSync(new URL('../data/answer-authority.json',import.meta.url)));
  validateAuthority(data,a);
  const review=a.questions.find(q=>q.id==='2019-feilian:5'),guide=structuredClone(review.practiceScoring);
  review.practiceScoring.total=3;assert.throws(()=>validateAuthority(data,a),/Invalid practice scoring guide/);
  review.practiceScoring=structuredClone(guide);review.practiceScoring.legacyScore=10;assert.throws(()=>validateAuthority(data,a),/Invalid practice scoring guide/);
  review.practiceScoring=structuredClone(guide);review.practiceScoring.inputPresentationSha256='a'.repeat(64);assert.throws(()=>validateAuthority(data,a),/Invalid practice scoring guide/);
  review.practiceScoring=structuredClone(guide);review.kind='single_choice';review.correctOptions=['B'];assert.throws(()=>validateAuthority(data,a),/Invalid practice scoring guide/);
});
test('matching text with another marked occurrence cannot reuse current review',()=>{
  const {source,a}=markedFixture();validateAuthority(source,a,{requireComplete:true});
  for(const patch of [{start:3,end:4},{type:'underline'},{start:0,end:2,anchor:'甲之'}]){
    const changed=structuredClone(source);Object.assign(changed[0].annotations[0],patch);
    assert.equal(questionContextDigest(changed[0],changed[0].questions[0]),a.questions[0].inputContextSha256);
    assert.throws(()=>projectAuthority(changed,a),/Question emphasis changed/);
  }
});
test('v2 model proof and a newly attached review hash are insufficient for publication',()=>{
  const {source,a,review}=markedFixture();delete review.modelAnswers.claude.inputPresentationSha256;
  validateAuthority(source,a);
  assert.throws(()=>validateAuthority(source,a,{requireComplete:true}),/Incomplete rendered-emphasis evidence/);
  delete review.inputPresentationSha256;delete review.modelAnswers.gpt_6_astra.inputPresentationSha256;
  assert.throws(()=>validateAuthority(source,a,{requireComplete:true}),/Incomplete rendered-emphasis evidence/);
});
test('invalid display anchors fail even when answer text has not changed',()=>{
  const {source,a}=markedFixture();source[0].annotations[0].start=0;
  assert.throws(()=>validateAuthority(source,a),/Invalid question emphasis/);
});
test('marking-only source changes preserve old ranges and model proof separately',()=>{
  const {source,a,review}=markedFixture(),old=review.inputPresentationSha256;
  review.history=[snapshotReview(source[0],source[0].questions[0],review)];
  Object.assign(source[0].annotations[0],{start:3,end:4});
  review.inputPresentationSha256=questionPresentationDigest(source[0],source[0].questions[0]);
  for(const model of Object.values(review.modelAnswers))model.inputPresentationSha256=review.inputPresentationSha256;
  const out=projectAuthority(source,a),history=out[0].answer_review_history[1][0];
  assert.equal(history.source.annotations[0].start,1);
  assert.equal(history.review.modelAnswers.gpt_6_astra.inputPresentationSha256,old);
  assert.notEqual(history.contextSha256,review.inputPresentationSha256);
  assert.deepEqual(projectAuthority(out,a),out);
  assert.equal(versionsForQuestion(out[0],1).filter(v=>v.historicalSource).length,2);
});
test('changed source retains exact old inputs and model results outside current approval',()=>{
  const changed=structuredClone(records),a=fixture(),review=a.questions[0];
  const history=snapshotReview(records[0],records[0].questions[0],review);
  changed[0].materials[0].text='改正后的完整材料';
  review.history=[history];review.inputSha256=questionDigest(changed[0],changed[0].questions[0]);
  review.inputContextSha256=questionContextDigest(changed[0],changed[0].questions[0]);
  review.inputPresentationSha256=questionPresentationDigest(changed[0],changed[0].questions[0]);
  review.modelAnswers.gpt_6_astra={...review.modelAnswers.gpt_6_astra,inputSha256:review.inputSha256,
    inputContextSha256:review.inputContextSha256,inputPresentationSha256:review.inputPresentationSha256,text:'新题面重新核对后的答案'};
  const out=projectAuthority(changed,a),oldSlot=Object.entries(out[0].ai_answer_versions).find(([k])=>k.includes('_source_'));
  assert.equal(oldSlot[1].answers[1],'答案：B、E');
  assert.equal(oldSlot[1].provenance[1].inputSha256,history.review.inputSha256);
  assert.equal(out[0].answer_review_history[1][0].source.materials[0].text,'完整材料');
  assert.ok(!out[0].answer_reviews[1].modelVersions.includes(oldSlot[0]));
  const version=versionsForQuestion(out[0],1).find(v=>v.key===oldSlot[0]);
  assert.equal(version.historicalSource.materials[0].text,'完整材料');
  assert.equal(version.inReview,false);
  assert.deepEqual(projectAuthority(out,a),out);
  a.questions[0].history[0].source.materials[0].text='偷换旧输入';
  assert.throws(()=>projectAuthority(changed,a),/Question changed/);
});
test('source snapshots retain question text needed to validate historical emphasis',()=>{
  const source=structuredClone(records),a=fixture(),review=a.questions[0],q=source[0].questions[0];
  source[0].question1=q.text;
  const start=q.text.indexOf('A甲');
  source[0].annotations=[{qIndex:1,material:'question1',type:'dot',start,end:start+2,anchor:'A甲'}];
  review.inputPresentationSha256=questionPresentationDigest(source[0],q);
  review.modelAnswers.gpt_6_astra.inputPresentationSha256=review.inputPresentationSha256;
  review.history=[snapshotReview(source[0],q,review)];
  assert.equal(review.history[0].source.question1,q.text);
  source[0].annotation='New qualified source note';
  review.inputContextSha256=questionContextDigest(source[0],q);
  review.inputPresentationSha256=questionPresentationDigest(source[0],q);
  Object.assign(review.modelAnswers.gpt_6_astra,{inputContextSha256:review.inputContextSha256,inputPresentationSha256:review.inputPresentationSha256});
  validateAuthority(source,a);
  const projected=projectAuthority(source,a);
  assert.equal(projected[0].answer_review_history[1][0].source.question1,q.text);
  review.history[0].source.question1=q.text.replace('A甲','A乙');
  assert.throws(()=>validateAuthority(source,a),/Invalid question emphasis/);
});
test('release build refuses incomplete reviews before writing output',()=>{
  const root=new URL('../',import.meta.url).pathname;
  const candidate=JSON.parse(readFileSync(new URL('../data/answer-authority.json',import.meta.url)));
  const data=JSON.parse(readFileSync(new URL('../data/all.json',import.meta.url)));
  if(candidate.questions.length===data.reduce((n,r)=>n+r.questions.length,0))return;
  const target=`/private/tmp/cf-task-answers-six-sites-20261002/refused-gk-output-${process.pid}`;
  assert.equal(existsSync(target),false);
  const result=spawnSync(process.execPath,['scripts/build-pages.mjs',target],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Incomplete review/);
  assert.equal(existsSync(target),false);
});
