import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{validateScopedAnswers,projectScopedAnswers}from'./lib/answer-release-scope.mjs';
const load=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url))),records=load('all.json'),authority=load('answer-authority.json'),scope=load('answer-release-scope.json'),preserved=load('answer-release-preserved.json');
const check=a=>validateScopedAnswers(records,a,scope,preserved);
test('qualified practice publication preserves open documentary issues and the parked baseline',()=>{
 const result=check(authority);assert.equal(result.reviewed,640);assert.equal(result.openReleaseBlockers,0);assert.equal(result.qualifiedSourceLimitations,27);assert.equal(result.unverifiedSourceIssues,27);
 assert.equal(authority.releaseQualification.originalPublicationVerified,false);assert.equal(authority.releaseQualification.officialRubricVerified,false);
 assert(authority.releaseQualification.dispositions.every(d=>authority.releaseBlockers.find(b=>b.id===d.blockerId).status==='open'));
 const projected=projectScopedAnswers(records,authority,scope,preserved);for(const r of preserved)assert.deepEqual(projected.find(x=>x.id===r.id),r);
 for(const r of projected.filter(r=>!preserved.some(p=>p.id===r.id)))for(const review of Object.values(r.answer_reviews)){assert(review.publicationQualification.notice);assert(review.explanation.includes(review.publicationQualification.notice));}
});
test('an absent disposition or a newly found issue still blocks complete model coverage',()=>{
 const missing=structuredClone(authority);missing.releaseQualification.dispositions.shift();assert.throws(()=>check(missing),/Unresolved source/);
 const unknown=structuredClone(authority);unknown.releaseBlockers.push({id:'new-publication-defect',status:'open'});assert.throws(()=>check(unknown),/Unresolved source/);
});
test('classification cannot assert original certification or hide its public warning',()=>{
 for(const field of ['originalPublicationVerified','officialRubricVerified']){const changed=structuredClone(authority);changed.releaseQualification[field]=true;assert.throws(()=>check(changed),/Invalid qualified source/);}
 const changed=structuredClone(authority),q=changed.questions.find(q=>q.id===scope.activeQuestionIds[0]);q.explanation=q.explanation.replace(q.publicationQualification.notice,'');assert.throws(()=>check(changed),/Invalid qualified source/);
});
test('new source facts, answer changes, scoring rules and omitted affected records invalidate a disposition',()=>{
 for(const mutation of ['blocker','answer','score','records']){const changed=structuredClone(authority);
  if(mutation==='blocker')changed.releaseBlockers.find(b=>b.status==='open'&&b.id!=='9999-authored-reading-source-review').detail+=' newly found issue';
  if(mutation==='answer')changed.questions.find(q=>q.id==='2008-yuyan-image:1').modelAnswers[changed.questions.find(q=>q.id==='2008-yuyan-image:1').currentVersion].text+=' changed interpretation';
  if(mutation==='score')changed.questions.find(q=>q.id==='2014-sanwen:1').practiceScoring.mode='component_feedback';
  if(mutation==='records')changed.releaseQualification.dispositions[0].recordIds.pop();
  assert.throws(()=>check(changed),/Invalid qualified source/);
 }
});
test('a qualified source never substitutes for actual independent image responses',()=>{
 const changed=structuredClone(authority),q=changed.questions.find(q=>q.id==='2008-yuyan-image:1');for(const[k,v]of Object.entries(q.modelAnswers))if(v.modelId.startsWith('claude-'))delete q.modelAnswers[k];assert.throws(()=>check(changed),/Incomplete dual-model/);
});
