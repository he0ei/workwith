import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateEditor,showFieldError,clearFieldErrors} from '../src/form-validation.js';
import {filterTasks} from '../src/model.js';
test('schedule errors point to due; a schedule change reason is optional',()=>{
 const form={},old={start:'2026-10-11',due:'2026-10-17'},value={title:'기획',visibility:'shared',projectId:'p',start:'2026-10-12',due:'2026-10-18'};
 assert.doesNotThrow(()=>validateEditor(form,'task',value,old));
 assert.doesNotThrow(()=>validateEditor(form,'task',{...value,reason:'일정 조정'},old));
 assert.throws(()=>validateEditor(form,'project',{...value,due:'2026-10-10'},old),e=>e.field==='due');
 assert.throws(()=>validateEditor(form,'task',{...value,projectId:''}),e=>e.field==='projectId');
 assert.throws(()=>validateEditor(form,'task',{...value,title:' '}),e=>e.field==='title');
});
test('inline error expands collapsed fields, associates readable message, focuses and scrolls without losing values',()=>{
 const attributes={'aria-describedby':'hint'},detail={tagName:'DETAILS',open:false},form={querySelectorAll:selector=>selector==='[name]'||selector.includes('aria-invalid')?[input]:[],querySelector:()=>notice};detail.parentElement=form;
 const input={name:'reason',value:'',dataset:{},parentElement:detail,form,disabled:false,setAttribute:(k,v)=>attributes[k]=v,getAttribute:k=>attributes[k],hasAttribute:k=>k in attributes,removeAttribute:k=>delete attributes[k],insertAdjacentElement:(where,node)=>{notice=node;},scrollIntoView:()=>scrolled=true,focus:()=>focused=true};
 let notice,scrolled=false,focused=false;globalThis.document={createElement:()=>({setAttribute(){},remove(){notice=null;}})};
 assert.equal(showFieldError(form,'reason','일정 변경 시 사유를 입력해야 합니다.'),true);
 assert.equal(attributes['aria-invalid'],'true');assert.equal(attributes['aria-describedby'],'hint field-error-reason');assert.equal(notice.textContent,'*일정 변경 시 사유를 입력해야 합니다.');assert.equal(detail.open,true);assert.ok(scrolled&&focused);assert.equal(input.value,'');
 clearFieldErrors(form);assert.equal(attributes['aria-invalid'],undefined);assert.equal(attributes['aria-describedby'],'hint');assert.equal(notice,null);
 assert.equal(showFieldError(form,undefined,'연결 오류'),false);
});
test('weekly task filter agrees with Sunday-first calendar at both boundaries',()=>{
 const tasks=['2026-10-10','2026-10-11','2026-10-17','2026-10-18'].map(due=>({due,status:'예정'}));
 assert.deepEqual(filterTasks(tasks,'week','2026-10-16').map(t=>t.due),['2026-10-11','2026-10-17']);
});
