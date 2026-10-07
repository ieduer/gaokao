// Presentation only: every part retains the parent's source and evidence identity.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function questionParts(question) {
  const layout = question?.questionParts, text = question?.stem ?? question?.text;
  if (!layout) return [];
  if (layout.version !== 1 || typeof text !== 'string' || !Array.isArray(layout.parts) || layout.parts.length < 2
      || !Number.isInteger(layout.introductionEnd) || layout.introductionEnd < 0
      || !/^[a-f0-9]{64}$/.test(layout.sourceTextSha256 || '')) throw Error('Invalid question parts');
  let end = layout.introductionEnd;
  const ids = new Set(), labels = new Set();
  for (const part of layout.parts) {
    if (!/^p\d+$/.test(part.id) || ids.has(part.id) || !part.label?.trim() || labels.has(part.label)
        || part.start !== end || !Number.isInteger(part.end) || part.end <= part.start || part.end > text.length
        || !['open','single_choice'].includes(part.kind)) throw Error('Invalid question part boundary');
    ids.add(part.id); labels.add(part.label); end = part.end;
  }
  if (end !== text.length) throw Error('Incomplete question parts');
  return layout.parts.map(part => ({...part, text:text.slice(part.start,part.end)}));
}

export function serializePartAnswers(question, values) {
  const parts = questionParts(question);
  if (!parts.some(p => String(values[p.id] ?? '').trim())) return '';
  return parts.map(p => `【${p.label}】\n${String(values[p.id] ?? '').trim() || '（未作答）'}`).join('\n\n');
}

export function parsePartAnswers(question, answer) {
  const parts = questionParts(question), values = {};
  if (!answer) return Object.fromEntries(parts.map(p => [p.id,'']));
  let cursor = 0;
  for (let i=0;i<parts.length;i++) {
    const marker = `${i ? '\n\n' : ''}【${parts[i].label}】\n`;
    if (!answer.startsWith(marker,cursor)) return null;
    const start = cursor + marker.length;
    const next = i+1<parts.length ? answer.indexOf(`\n\n【${parts[i+1].label}】\n`,start) : answer.length;
    if (next < 0) return null;
    const value = answer.slice(start,next);
    values[parts[i].id] = value === '（未作答）' ? '' : value;
    cursor = next;
  }
  return values;
}

export function partFeedbackInstruction(question) {
  const parts = questionParts(question);
  return parts.length ? `本题包含${parts.length}个分别作答的分问：${parts.map(p=>p.label).join('、')}。保持原题的限选要求，未选的可选题不扣分。除整题结果外，JSON必须有 part_feedback 数组，严格按以上顺序逐项返回 {label,feedback}；feedback说明该项答案与依据。未作答也须明确说明，不能只评第一项。没有已核定分项分值时不得拆分或均分分数。` : '';
}

export function partExplanationInstruction(question) {
  const parts = questionParts(question);
  return parts.length ? `请按 ${parts.map(p=>p.label).join('、')} 的顺序分别讲解，每项说明答案、依据和改进建议；遵守原题限选要求，区分未选与未答。用中文分段回答，不需要JSON。分值或范围未核实的题目不报分、不猜测分配。` : '';
}

export function qualitativePartPrompt(question, answer) {
  return `${partExplanationInstruction(question)}\n本次只讲解，不计分、不据此宣称完成批阅。我的分项作答：\n${answer}`;
}

export function validPartFeedback(question, result) {
  const parts = questionParts(question);
  return !parts.length || (Array.isArray(result?.part_feedback) && result.part_feedback.length === parts.length
    && parts.every((part,index) => result.part_feedback[index]?.label === part.label
      && typeof result.part_feedback[index].feedback === 'string' && result.part_feedback[index].feedback.trim()));
}

export function partFeedbackMarkup(result) {
  return Array.isArray(result?.part_feedback) ? result.part_feedback.map(p=>`<section class="part-feedback"><h4>${esc(p.label)}</h4><p>${esc(p.feedback).replace(/\n/g,'<br>')}</p></section>`).join('') : '';
}

// The existing textarea remains the single draft/submission channel. Its own
// value accessor also hydrates the fields when existing restoration code runs.
// Nothing is saved or submitted until the user changes an answer or submits.
export function mountQuestionParts(input, question) {
  if (!input) return null;
  input._unmountQuestionParts?.();
  const parts = questionParts(question);
  if (!parts.length) return null;
  const doc = input.ownerDocument, view = doc.defaultView;
  const descriptor = Object.getOwnPropertyDescriptor(view.HTMLTextAreaElement.prototype,'value');
  const box = doc.createElement('section'); box.className = 'question-parts';
  const note = doc.createElement('p'); note.className = 'source-note';
  note.textContent = '请按小题分别作答，限选题按原题要求选择。整组提交一次，历史成绩保持不变。完整解析见参考答案。'; box.append(note);
  const introduction = (question.stem ?? question.text).slice(0,question.questionParts.introductionEnd);
  if (introduction.trim()) { const p=doc.createElement('p');p.textContent=introduction;box.append(p); }
  const fields = new Map();
  for (const part of parts) {
    const fieldset=doc.createElement('fieldset');fieldset.className='question-part';
    const legend=doc.createElement('legend');legend.textContent=part.label;
    const stem=doc.createElement('div');stem.className='part-stem';stem.textContent=part.text;
    const area=doc.createElement('textarea');area.className='part-answer';area.rows=part.kind==='single_choice'?2:4;
    area.setAttribute('aria-label',`${part.label} 作答`);area.dataset.partId=part.id;
    area.placeholder=part.kind==='single_choice'?'填一个选项，并写出判断依据':'写下这一小题的答案';
    fieldset.append(legend,stem,area);box.append(fieldset);fields.set(part.id,area);
  }
  const legacy=doc.createElement('details');const summary=doc.createElement('summary');summary.textContent='先前整组作答（完整保留）';
  const old=doc.createElement('pre');old.style.whiteSpace='pre-wrap';legacy.append(summary,old);box.append(legacy);legacy.hidden=true;
  input.before(box);
  const previousDisplay=input.style.display;
  const hydrate = value => {
    const values=parsePartAnswers(question,String(value));
    legacy.hidden=!!values;old.textContent=values?'':String(value);
    for(const [id,area] of fields) area.value=values?.[id]||'';
  };
  const initial=descriptor.get.call(input);hydrate(initial);input.style.display='none';
  Object.defineProperty(input,'value',{configurable:true,get(){return descriptor.get.call(this);},set(value){descriptor.set.call(this,value);hydrate(descriptor.get.call(this));}});
  for (const area of fields.values()) area.addEventListener('input',()=>{
    const answer=serializePartAnswers(question,Object.fromEntries([...fields].map(([id,field])=>[id,field.value])));
    descriptor.set.call(input,answer);
    input.dispatchEvent(new view.Event('input',{bubbles:true}));
  });
  const originalFocus=input.focus;
  input.focus=()=>fields.values().next().value.focus();
  input._unmountQuestionParts=()=>{delete input.value;input.focus=originalFocus;input.style.display=previousDisplay;box.remove();delete input._unmountQuestionParts;};
  return box;
}
