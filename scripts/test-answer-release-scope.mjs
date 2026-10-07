import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeDigest,scopedAnswerInputs,validateScopedAnswers,projectScopedAnswers} from './lib/answer-release-scope.mjs';
const load=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url)));
const records=load('all.json'),authority=load('answer-authority.json'),scope=load('answer-release-scope.json'),preserved=load('answer-release-preserved.json');
test('Beijing has an exact explicit denominator and remains incomplete on its own missing evidence',()=>{
  const coverage=validateScopedAnswers(records,authority,scope,preserved,{requireComplete:false});
  assert.equal(coverage.questions,640);assert.equal(coverage.parkedQuestions,6);
  const missing=structuredClone(authority);
  missing.questions=missing.questions.filter(q=>q.id!==scope.activeQuestionIds[0]);
  assert.throws(()=>validateScopedAnswers(records,missing,scope,preserved),/Incomplete review/);
  const inputs=scopedAnswerInputs(records,authority,scope,preserved);
  assert.deepEqual(inputs.authority.releaseBlockers,
    authority.releaseBlockers.filter(b=>!scope.parkedBlockers.some(p=>p.id===b.id)));
  assert.ok(inputs.authority.releaseBlockers.some(b=>b.id==='historical-moxie-transcription'));
});
test('parked output is the exact accepted baseline while the unreleased candidate remains unchanged',()=>{
  const before=scopeDigest(records),oldAuthority=scopeDigest(authority);
  const projected=projectScopedAnswers(records,authority,scope,preserved,{requireComplete:false});
  for(const kept of preserved){assert.deepEqual(projected.find(r=>r.id===kept.id),kept);assert.notDeepEqual(records.find(r=>r.id===kept.id),kept);}
  assert.equal(scopeDigest(records),before);assert.equal(scopeDigest(authority),oldAuthority);
  assert.equal(projected.length,records.length);
  assert.equal(projected.find(r=>r.id==='2009-shici').answer_reviews['1'].status,'reviewed');
});
test('unclassified additions, omitted active IDs and partial record parking fail closed',()=>{
  const added=structuredClone(records);added.push({id:'new-question',questions:[{qIndex:1,text:'新增'}],materials:[],ai_answers:{}});
  assert.throws(()=>validateScopedAnswers(added,authority,scope,preserved,{requireComplete:false}),/unaccounted question/);
  const omitted=structuredClone(scope);omitted.activeQuestionIds.pop();
  assert.throws(()=>validateScopedAnswers(records,authority,omitted,preserved,{requireComplete:false}),/unaccounted question/);
  const mixed=structuredClone(scope);mixed.activeQuestionIds.push('9999-feilian:1');
  assert.throws(()=>validateScopedAnswers(records,authority,mixed,preserved,{requireComplete:false}),/mixed active\/parked/);
});
test('an active blocker cannot be hidden by scope, even with its correct hash',()=>{
  for(const id of ['2009-source-coverage-and-marking','historical-moxie-transcription']){
    const changed=structuredClone(scope),blocker=authority.releaseBlockers.find(b=>b.id===id);
    changed.parkedBlockers.push({id,sha256:scopeDigest(blocker)});
    assert.throws(()=>validateScopedAnswers(records,authority,changed,preserved,{requireComplete:false}),/unsafe blocker exclusion/);
  }
});
test('unknown source blockers still participate in the active completeness check',()=>{
  const changed=structuredClone(authority);changed.releaseBlockers.push({id:'new-source-gap',status:'open'});
  const inputs=scopedAnswerInputs(records,changed,scope,preserved);
  assert.equal(inputs.authority.releaseBlockers.at(-1).id,'new-source-gap');
});
test('baseline content, identities and excluded blocker evidence cannot drift silently',()=>{
  const bad=structuredClone(preserved);bad[0].ai_answers['1']='changed';
  assert.throws(()=>validateScopedAnswers(records,authority,scope,bad,{requireComplete:false}),/baseline changed/);
  const changed=structuredClone(authority);changed.releaseBlockers.find(b=>b.id===scope.parkedBlockers[0].id).recordIds.push('2009-shici');
  assert.throws(()=>validateScopedAnswers(records,changed,scope,preserved,{requireComplete:false}),/unsafe blocker exclusion/);
  const renamed=structuredClone(scope);renamed.activeQuestionIds[0]='unknown:1';
  assert.throws(()=>validateScopedAnswers(records,authority,renamed,preserved,{requireComplete:false}),/unknown active/);
});
