import {safeURL} from './model.js';
// Client guidance complements the server validation; it never grants access.
export class FieldError extends Error {
 constructor(field,message){super(message);this.field=field;}
}
export function validateEditor(form,kind,values,old){
 const fail=(field,message)=>{throw new FieldError(field,message);};
 for(const input of form.querySelectorAll?.('input,select,textarea')||[]){
  if(input.disabled||!input.willValidate||input.validity.valid)continue;
  const label=[...(input.labels?.[0]?.childNodes||[])].filter(node=>node.nodeType===3).map(node=>node.textContent).join('').trim()||'값';
  if(input.validity.valueMissing)fail(input.name,({title:'제목을 입력해 주세요.',projectId:'연결할 프로젝트를 선택해 주세요.'})[input.name]||`${label} 항목을 입력하거나 선택해 주세요.`);
  if(input.validity.typeMismatch)fail(input.name,input.type==='url'?'https://로 시작하는 올바른 링크를 입력해 주세요.':'올바른 형식으로 입력해 주세요.');
  if(input.validity.rangeUnderflow||input.validity.rangeOverflow)fail(input.name,`${input.min||0} ~ ${input.max||'허용 범위'} 사이의 값을 입력해 주세요.`);
  if(input.validity.badInput)fail(input.name,'숫자 또는 날짜를 올바르게 입력해 주세요.');
  fail(input.name,'입력 형식과 허용 길이를 확인해 주세요.');
 }
 if(['task','project','artifact','kpi'].includes(kind)&&!values.title?.trim())fail('title','제목을 입력해 주세요.');
 if(values.url&&!safeURL(values.url))fail('url','http:// 또는 https://로 시작하는 올바른 링크를 입력해 주세요.');
 if(['task','project'].includes(kind)){
  if(values.start&&values.due&&values.due<values.start)fail('due','마감일은 시작일과 같거나 이후여야 합니다.');
 }
 if(kind==='task'&&form.dataset?.sharedLink!=='true'&&values.visibility==='shared'&&!values.projectId)fail('projectId','공유 업무를 연결할 프로젝트를 선택해 주세요.');
}
export function clearFieldError(input){
 if(!input?.hasAttribute?.('aria-invalid'))return;
 const form=input.form,id=input.dataset.fieldError;
 if(id){form?.querySelector('#'+id)?.remove();const refs=(input.getAttribute('aria-describedby')||'').split(' ').filter(x=>x&&x!==id);if(refs.length)input.setAttribute('aria-describedby',refs.join(' '));else input.removeAttribute('aria-describedby');delete input.dataset.fieldError;}
 input.removeAttribute('aria-invalid');
}
export function clearFieldErrors(form){
 for(const input of form.querySelectorAll?.('[aria-invalid="true"]')||[])clearFieldError(input);
}
export function showFieldError(form,field,message){
 if(!field)return false;
 const input=[...(form.querySelectorAll?.('[name]')||[])].find(x=>x.name===field&&!x.disabled);
 if(!input)return false;
 clearFieldError(input);
 const id='field-error-'+field,notice=document.createElement('p');notice.id=id;notice.className='field-error';notice.setAttribute('role','alert');notice.textContent='*'+message;
 input.setAttribute('aria-invalid','true');input.dataset.fieldError=id;
 input.setAttribute('aria-describedby',[input.getAttribute('aria-describedby'),id].filter(Boolean).join(' '));
 input.insertAdjacentElement('afterend',notice);
 let ancestor=input.parentElement;while(ancestor&&ancestor!==form){if(ancestor.tagName==='DETAILS')ancestor.open=true;ancestor=ancestor.parentElement;}
 input.scrollIntoView({block:'center',behavior:'smooth'});input.focus({preventScroll:true});return true;
}
