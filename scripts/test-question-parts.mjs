import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {questionParts,serializePartAnswers,parsePartAnswers,validPartFeedback} from '../assets/js/question-parts.js';
const records=JSON.parse(readFileSync(new URL('../data/all.json',import.meta.url)));
const find=id=>{const split=id.lastIndexOf(':');return records.find(r=>r.id===id.slice(0,split)).questions.find(q=>q.qIndex===Number(id.slice(split+1)));};

test('2014 language has six distinct source parts and one unchanged parent identity',()=>{
 const q=find('2014-yuyanjichu:4');assert.deepEqual(questionParts(q).map(p=>p.label),['原4','原5','原6①','原6②','原7①','原7②']);assert.equal(q.score,2);assert.equal(q.id,'q4');
 assert.ok(questionParts(q).every(p=>p.kind==='single_choice'));
});
test('every segmented source reconstructs exactly including instructions and annotation offsets',()=>{
 let count=0;
 for(const r of records)for(const q of r.questions||[]){if(!q.questionParts)continue;count++;const parts=questionParts(q);
  assert.equal(q.text.slice(0,q.questionParts.introductionEnd)+parts.map(p=>p.text).join(''),q.text);
  assert.equal(createHash('sha256').update(q.text).digest('hex'),q.questionParts.sourceTextSha256);
 }
 assert.equal(count,59);
});
test('all original source, score, review and history fields survive unchanged',()=>{
 // Source fields accepted at d11a8d9, then the 2026-11-14 original exam text restoration of 27 teaching
 // revisions (gk-originals-20261114), then the 2026-11-22 transcription correction of 2022-feilian:3 option labels
 // (gk-feilian-option-a-20261122; previous value ee08e37b…1dd3b), then the 2026-11-26 original-paper check of 2026-guwen and
 // 2007-sanwen (gk-bank-fix-20261126; previous value bbb48f01…2a53), then the 2026-11-27 original-paper headings and sub-question scores
 // of 2026 questions 14 and 15 (gks-gk-2026-score-headings-20261127; previous value 117d133e…c9fc); no Git-history dependency in Pages builds.
 const after=structuredClone(records);for(const r of after)for(const q of r.questions||[])delete q.questionParts;
 assert.equal(createHash('sha256').update(JSON.stringify(after)).digest('hex'),'d078b8e98f19053f1f8baf1ae8b6e5f1b3ccae7c48e690f9899a49eb8c29bb9c');
});
test('option combinations and writing instructions are not treated as separate responses',()=>{
 for(const id of ['2026-yuyanjichu:1','2019-guwen:1','2003-yuyanjichu:5','2007-yuyanjichu-2:1','2006-yuyanjichu-2:3']){
  assert.equal(questionParts(find(id)).length,id==='2003-yuyanjichu:5'?2:0,id);
 }
 assert.equal(questionParts(find('2002-yuyanjichu:5')).length,6);
});
test('separate responses retain order; optional and empty parts do not create another submission',()=>{
 const q=find('2014-yuyanjichu:4');assert.equal(serializePartAnswers(q,{}),'');
 const answer=serializePartAnswers(q,{p1:'D',p3:'C\n原因'});assert.equal(answer.match(/【/g).length,6);
 assert.deepEqual(parsePartAnswers(q,answer),{p1:'D',p2:'',p3:'C\n原因',p4:'',p5:'',p6:''});
 assert.equal(parsePartAnswers(q,'旧答案 D，不要丢弃'),null);
});
test('incomplete, reordered or blank per-part feedback fails closed',()=>{
 const q=find('2014-yuyanjichu:4'),part_feedback=questionParts(q).map(p=>({label:p.label,feedback:'依据与解析'}));
 assert.equal(validPartFeedback(q,{part_feedback}),true);
 for(const bad of [part_feedback.slice(0,1),[...part_feedback].reverse(),part_feedback.map((p,i)=>i===5?{...p,feedback:''}:p)])assert.equal(validPartFeedback(q,{part_feedback:bad}),false);
 const drift=structuredClone(q);drift.questionParts.parts[1].start++;assert.throws(()=>questionParts(drift));
});
