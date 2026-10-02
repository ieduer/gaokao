import test from 'node:test';
import assert from 'node:assert/strict';
import { questionDigest, validateAuthority, projectAuthority } from './lib/answer-authority.mjs';
import { versionsForQuestion } from '../assets/js/answer-versions.js';

const records = [{id:'2009-sanwen',topic:'阅读',materials:[{key:'m1',text:'完整材料'}],questions:[{qIndex:1,text:'选两项：A甲 B乙 C丙 D丁 E戊'}],
  ai_answers:{1:'旧解析'},ai_answer_current_version:'old',ai_answer_versions:{old:{label:'历史模型',model:'old-model',answers:{1:'旧解析'}}}}];
function fixture() {
  const inputSha256=questionDigest(records[0],records[0].questions[0]);
  return {schemaVersion:1,revision:'test',questions:[{id:'2009-sanwen:1',inputSha256,status:'reviewed',kind:'multiple_choice',
    correctOptions:['B','E'],explanation:'逐项比较',reviewedBy:'test-reviewer',reviewedAt:'2026-10-02T23:00:00Z',sources:[{type:'test_fixture'}],
    currentVersion:'gpt_6_astra',modelAnswers:{gpt_6_astra:{modelId:'gpt-6-astra',label:'GPT-6 Astra',text:'答案：B、E',
      inputSha256,generatedAt:'2026-10-02T23:00:00Z',provenance:{kind:'codex_turn',evidence:'test fixture'}}}}]};
}
test('retains old answers and IDs while projecting complete multiple-choice key',()=>{
  const original=structuredClone(records),out=projectAuthority(records,fixture());
  assert.deepEqual(records,original);assert.deepEqual(out[0].questions,records[0].questions);
  assert.equal(out[0].ai_answer_versions.old.answers[1],'旧解析');
  assert.deepEqual(out[0].answer_reviews[1].correctOptions,['B','E']);
  assert.equal(out[0].ai_answers[1],'答案：B、E');
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
test('new model names and per-question dates display without a hardcoded list',()=>{
  const out=projectAuthority(records,fixture());const versions=versionsForQuestion(out[0],1);
  assert.equal(versions[0].model,'gpt-6-astra');assert.equal(versions[0].current,true);
  assert.equal(versions[0].generatedAt,'2026-10-02T23:00:00Z');assert.equal(versions[1].text,'旧解析');
});
