import {createHash} from 'node:crypto';
import {validateAuthority,projectAuthority,questionIndex,qualifiedReleaseBlocker} from './answer-authority.mjs';

export const scopeDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function scopedAnswerInputs(records,authority,scope,preserved){
  validateAuthority(records,authority);
  const fail=message=>{throw Error(`Invalid release scope: ${message}`);};
  if(scope?.schemaVersion!==1||scope.id!=='beijing-only-20261006'||!scope.authorization?.trim()
    || !/^[a-f0-9]{40}$/.test(scope.acceptedBaseline?.sourceCommit||'')
    || !Array.isArray(scope.activeQuestionIds)||!scope.activeQuestionIds.length
    || !Array.isArray(scope.parkedRecords)||!Array.isArray(preserved))fail('metadata');
  if(scopeDigest(preserved)!==scope.preservedRecordsSha256)fail('preserved baseline changed');
  const active=new Set(scope.activeQuestionIds),parked=new Map(scope.parkedRecords.map(x=>[x.id,x]));
  if(active.size!==scope.activeQuestionIds.length||parked.size!==scope.parkedRecords.length)fail('duplicate identity');
  const baseline=new Map(preserved.map(x=>[x.id,x]));
  if(baseline.size!==preserved.length||baseline.size!==parked.size)fail('baseline coverage');
  const all=questionIndex(records),selected=[];
  for(const id of active)if(!all.has(id))fail(`unknown active identity ${id}`);
  for(const [id,row]of parked){
    const current=records.find(x=>x.id===id),kept=baseline.get(id);
    if(!current||!kept||!row.reason?.trim()||scopeDigest(kept)!==row.acceptedRecordSha256)fail(`parked record ${id}`);
    if(JSON.stringify(current.questions.map(q=>q.qIndex))!==JSON.stringify(kept.questions.map(q=>q.qIndex)))fail(`parked question identity ${id}`);
    if(current.questions.some(q=>active.has(`${id}:${q.qIndex}`)))fail(`mixed active/parked record ${id}`);
  }
  for(const record of records){
    if(parked.has(record.id))continue;
    if(!record.questions?.length||record.questions.some(q=>!active.has(`${record.id}:${q.qIndex}`)))fail(`unaccounted question in ${record.id}`);
    selected.push(record);
  }
  const omitted=new Set();
  for(const disposition of scope.parkedBlockers||[]){
    const blocker=authority.releaseBlockers?.find(x=>x.id===disposition.id);
    if(omitted.has(disposition.id)||!blocker||scopeDigest(blocker)!==disposition.sha256
      ||!blocker.recordIds?.length||blocker.recordIds.some(id=>!parked.has(id)))fail(`unsafe blocker exclusion ${disposition.id}`);
    omitted.add(disposition.id);
  }
  const selectedAuthority={...authority,questions:authority.questions.filter(q=>active.has(q.id)),
    releaseBlockers:(authority.releaseBlockers||[]).filter(b=>!omitted.has(b.id))};
  return {records:selected,authority:selectedAuthority,baseline,active,parked};
}

export function validateScopedAnswers(records,authority,scope,preserved,{requireComplete=true}={}){
  const inputs=scopedAnswerInputs(records,authority,scope,preserved);
  const coverage=validateAuthority(inputs.records,inputs.authority,{requireComplete});
  const open=inputs.authority.releaseBlockers.filter(b=>b.status!=='resolved');
  const qualified=requireComplete?open.filter(b=>qualifiedReleaseBlocker(inputs.records,inputs.authority,b)).length:0;
  return {...coverage,scope:scope.id,parkedQuestions:records.reduce((n,r)=>n+(inputs.parked.has(r.id)?r.questions.length:0),0),
    openReleaseBlockers:open.length-qualified,qualifiedSourceLimitations:qualified,unverifiedSourceIssues:open.length,
    preservedBaseline:scope.acceptedBaseline.sourceCommit};
}

export function projectScopedAnswers(records,authority,scope,preserved,{requireComplete=true}={}){
  validateScopedAnswers(records,authority,scope,preserved,{requireComplete});
  const inputs=scopedAnswerInputs(records,authority,scope,preserved);
  const projected=new Map(projectAuthority(inputs.records,inputs.authority).map(r=>[r.id,r]));
  return records.map(r=>structuredClone(inputs.baseline.get(r.id)||projected.get(r.id)));
}
