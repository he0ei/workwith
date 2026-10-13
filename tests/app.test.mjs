// DOM boundary simulation: verifies rendering and event wiring, not browser layout.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KEY} from '../src/model.js';
import {sample} from './fixtures.mjs';
test('화면 렌더링 및 폼 이벤트 통합 검증 (브라우저 대체 아님)',async t=>{
 const nodes=new Map(['#app','#editor','#toast','#form-error'].map(id=>[id,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}}]));
 const listeners={},windowListeners={},data=new Map();
 globalThis.document={querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>listeners[name]=fn};
 globalThis.window={addEventListener:(name,fn)=>windowListeners[name]=fn};
 globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 globalThis.confirm=()=>true;
 globalThis.FormData=class{constructor(form){this.entries=Object.entries(form.values||{});}get(k){return this.entries.find(([key])=>key===k)?.[1]??null;}getAll(k){return this.entries.filter(([key])=>key===k).map(([,v])=>v);}has(k){return this.entries.some(([key])=>key===k);}[Symbol.iterator](){return this.entries[Symbol.iterator]();}};
 const click=(attr,value,id='')=>listeners.click({target:{closest:selector=>selector===`[${attr}]`?{dataset:{[{'data-nav':'nav','data-action':'action','data-filter':'filter'}[attr]]:value,id}}:null}});
 const submit=(kind,values,id)=>listeners.submit({preventDefault(){},target:{id:'edit-form',dataset:{kind,id},values}});
 const read=()=>JSON.parse(data.get(KEY));
 await import('../src/app.js');
 await t.test('빈 대시보드는 인증 및 저장 한계를 표시',()=>{assert.match(nodes.get('#app').innerHTML,/실제 인증 및 공동 동기화 미연결/);assert.match(nodes.get('#app').innerHTML,/첫 프로젝트/);});
 await t.test('전체 화면은 합성 데이터로 렌더링',()=>{localStorage.setItem(KEY,JSON.stringify(sample()));windowListeners.storage({key:KEY});for(const name of ['collab','mine','calendar','projects','minutes','archive','settings','dashboard']){click('data-nav',name);assert.ok(nodes.get('#app').innerHTML.includes('<main>'));}assert.equal(nodes.get('#toast').textContent,'다른 탭의 변경을 반영했습니다. 열려 있는 편집 폼은 닫았습니다.');});
 await t.test('프로젝트와 개인 업무 폼 저장, 사용자 전환 조회',()=>{
  click('data-action','project');assert.equal(nodes.get('#editor').open,true);
  submit('project',{title:'테스트 프로젝트',owner:'sj',start:'',due:'',goal:'테스트 목표'},'ptest');assert.equal(read().projects.at(-1).id,'ptest');
  click('data-action','task-private');submit('task',{title:'내 비공개 메모',visibility:'private',assignee:'sy',projectId:'ptest',status:'예정',priority:'높음',start:'',due:'',hours:'1',kpiId:'',url:'',note:'비공개 설명'},'private-ui');
  const value=read().tasks.at(-1);assert.equal(value.assignee,'sj');assert.equal(value.projectId,'');assert.equal(value.visibility,'private');
  click('data-nav','mine');assert.match(nodes.get('#app').innerHTML,/내 비공개 메모/);
  listeners.change({target:{id:'user-switch',value:'sy',dataset:{}}});assert.ok(!nodes.get('#app').innerHTML.includes('내 비공개 메모'));
  listeners.change({target:{id:'user-switch',value:'sj',dataset:{}}});
 });
 await t.test('프로젝트 상세와 KPI/결과물 렌더링',()=>{
  submit('kpi',{title:'측정 목표',projectId:'ptest',target:'10',current:'4',unit:'건',method:'increase'},'ktest');
  submit('artifact',{title:'테스트 기획안',projectId:'ptest',url:'https://example.com'},'atest');
  click('data-action','project-open','ptest');assert.match(nodes.get('#app').innerHTML,/측정 목표/);assert.match(nodes.get('#app').innerHTML,/value="40"/);assert.match(nodes.get('#app').innerHTML,/테스트 기획안/);
 });
 await t.test('삭제 버튼은 제출 버튼이 아니며 업무 삭제 유지',()=>{
  click('data-action','task','private-ui');assert.match(nodes.get('#editor').innerHTML,/<button type="button"[^>]+data-action="task-delete"/);
  click('data-action','task-delete','private-ui');assert.ok(!read().tasks.some(x=>x.id==='private-ui'));assert.equal(nodes.get('#editor').open,false);
 });
 await t.test('회의록 초안 등록 이벤트, 미지정 일정 유지',()=>{
  click('data-nav','minutes');listeners.submit({preventDefault(){},target:{id:'minutes-form',values:{title:'테스트 회의',projectId:'ptest',body:'회의 업무 | | | 보통'}}});assert.match(nodes.get('#app').innerHTML,/담당자 확인 필요/);
  listeners.submit({preventDefault(){},target:{id:'draft-form',values:{'title-0':'검토한 업무','assignee-0':'jh','due-0':'','priority-0':'보통','kpi-0':'','target-0':'','unit-0':'','include-0':'on',acknowledged:'on'}}});
  assert.equal(read().tasks.at(-1).title,'검토한 업무');assert.equal(read().tasks.at(-1).assignee,'jh');assert.equal(read().tasks.at(-1).due,'');assert.equal(read().minutes.at(-1).title,'테스트 회의');
 });
 await t.test('설정의 개발용 데이터 조작 제거 및 손상 원본 보존',()=>{
  click('data-nav','settings');
  const html=nodes.get('#app').innerHTML;
  for(const label of ['전체 시연 데이터 백업','시연 데이터 준비','JSON 내보내기','JSON 백업 복원','예시 데이터 불러오기','초기화'])assert.ok(!html.includes(label));
  const before=localStorage.getItem(KEY);
  for(const action of ['export','sample','reset'])click('data-action',action);
  assert.equal(localStorage.getItem(KEY),before);
  localStorage.setItem(KEY,'{broken');windowListeners.storage({key:KEY});assert.match(nodes.get('#app').innerHTML,/저장 데이터를 읽을 수 없습니다/);assert.equal(localStorage.getItem(KEY),'{broken');
 });
});
