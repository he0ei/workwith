import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {postgres} from './postgres-helper.mjs';
import {mutate} from '../server/workspace.js';
import {start} from '../src/app.js';

import {sample} from './fixtures.mjs';

test('shared UI uses authenticated API, preserves editing and never stores business data locally',async t=>{
 const nodes=new Map(['#app','#editor','#toast','#form-error','#sync-label','#login-error'].map(id=>[id,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}}]));
 const listeners={},windowListeners={},timers=new Map();let timerId=0;const pg=await postgres();
 const store={read:()=>pg.rpc('authenticated','sj','workwith_snapshot'),version:()=>pg.rpc('authenticated','sj','workwith_revision'),change:(action,revision,baseVersion)=>mutate(pg.repository,{action,revision,baseVersion},'sj')};
 globalThis.localStorage={getItem(){throw Error('local business storage prohibited');},setItem(){throw Error('local business storage prohibited');}};
 globalThis.document={hidden:false,querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>listeners[name]=fn};
 globalThis.window={addEventListener:(name,fn)=>windowListeners[name]=fn};globalThis.location={protocol:'http:'};
 globalThis.setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;};globalThis.clearTimeout=id=>timers.delete(id);

 globalThis.confirm=()=>true;
 globalThis.FormData=class{constructor(form){this.entries=Object.entries(form.values||{});}get(k){return this.entries.find(([key])=>key===k)?.[1]??null;}getAll(k){return this.entries.filter(([key])=>key===k).flatMap(([,v])=>Array.isArray(v)?v:[v]);}has(k){return this.entries.some(([key])=>key===k);}[Symbol.iterator](){return this.entries[Symbol.iterator]();}};
 const click=(attr,value,id='')=>listeners.click({target:{closest:selector=>selector===`[${attr}]`?{dataset:{[{'data-nav':'nav','data-action':'action','data-filter':'filter'}[attr]]:value,id}}:null}});
 const submit=(kind,values,id)=>listeners.submit({preventDefault(){},target:{id:'edit-form',dataset:{kind,id},values}});
 const read=async()=>{const result=await pg.repository.load();return Object.entries(result.state).filter(([,v])=>Array.isArray(v)).flatMap(([entity,values])=>values.map(x=>({entity,payload:JSON.stringify(x)})));};
 const item=async(entity,id)=>{const result=await pg.repository.load();return result.state[entity].find(x=>x.id===id);};
 await start(store);
 await t.test('empty dashboard shows real login user and shared status',()=>{assert.match(nodes.get('#app').innerHTML,/공유 DB 연결/);assert.ok(!nodes.get('#app').innerHTML.includes('시연 사용자'));assert.ok([...timers.values()].some(x=>x.delay===30000));});
 await t.test('project and private task save to SQL, not localStorage',async()=>{
  await click('data-action','project');await submit('project',{title:'test project',owner:'sj',start:'',due:'',goal:'goal'},'p');assert.equal((await item('projects','p')).title,'test project');
  await click('data-action','task-private');await submit('task',{title:'private UI',visibility:'private',assignee:'sy',projectId:'p',status:'예정',priority:'높음',start:'',due:'',hours:'1',kpiId:'',url:'',note:'private'},'t');assert.equal((await item('tasks','t')).assignee,'sj');assert.equal((await item('tasks','t')).projectId,'');
 });
 await t.test('dragging between board stages saves through SQL and records completion date',async()=>{
  await click('data-nav','mine');assert.match(nodes.get('#app').innerHTML,/data-drag-task="t"/);
  const classes={add(){},remove(){}},card={dataset:{dragTask:'t'},classList:classes};
  const target={closest:selector=>selector==='[data-drag-task]'?card:null};
  const transfer={setData(){}};
  listeners.dragstart({target,dataTransfer:transfer,preventDefault(){assert.fail('drag should be accepted');}});
  const column={dataset:{dropStatus:'완료'},classList:classes};
  await listeners.drop({target:{closest:()=>column},preventDefault(){}});
  const saved=await item('tasks','t');assert.equal(saved.status,'완료');assert.ok(saved.completedAt);
  listeners.dragstart({target,dataTransfer:transfer,preventDefault(){}});
  column.dataset.dropStatus='진행 중';await listeners.drop({target:{closest:()=>column},preventDefault(){}});
  assert.equal((await item('tasks','t')).completedAt,'');
  listeners.dragstart({target,dataTransfer:transfer,preventDefault(){}});
  const concurrent=await pg.repository.load();
  await mutate(pg.repository,{action:{type:'task.save',value:{...concurrent.state.tasks.find(t=>t.id==='t'),title:'동시 수정 보존'}},revision:concurrent.state.revision,baseVersion:concurrent.versions['tasks:t']},'sj');
  column.dataset.dropStatus='완료';await listeners.drop({target:{closest:()=>column},preventDefault(){}});
  assert.equal((await item('tasks','t')).status,'진행 중');assert.equal((await item('tasks','t')).title,'동시 수정 보존');assert.match(nodes.get('#toast').textContent,/다른 사람이 먼저 수정/);
 });
 await t.test('all views render; KPI and artifacts are saved via authenticated API',async()=>{
  for(const name of ['collab','mine','calendar','projects','minutes','archive','settings','dashboard']){await click('data-nav',name);assert.match(nodes.get('#app').innerHTML,/<main>/);}
  await click('data-action','kpi','p');await submit('kpi',{title:'KPI',projectId:'p',target:'10',current:'4',unit:'건',method:'increase'},'k');
  await click('data-action','artifact','p');await submit('artifact',{title:'result',projectId:'p',url:'https://example.com'},'a');
  await click('data-action','project-open','p');assert.match(nodes.get('#app').innerHTML,/value="40"/);assert.match(nodes.get('#app').innerHTML,/result/);
 });
 await t.test('shared task collaborator persists and is included in my board, calendar and member filter',async()=>{
  await click('data-action','task');await submit('task',{title:'협업 검증',visibility:'shared',assignee:'sy',collaborator:'sj',projectId:'p',status:'예정',priority:'보통',start:'',due:'',hours:'1',kpiId:'',url:'',note:''},'t-collab');assert.deepEqual((await item('tasks','t-collab')).collaborators,['sj']);
  await click('data-nav','mine');assert.match(nodes.get('#app').innerHTML,/협업 검증/);assert.match(nodes.get('#app').innerHTML,/project-chip/);assert.match(nodes.get('#app').innerHTML,/person-chip/);
  await click('data-nav','calendar');assert.match(nodes.get('#app').innerHTML,/협업 검증/);await click('data-nav','collab');await listeners.change({target:{id:'assignee-filter',value:'sj',dataset:{}}});assert.match(nodes.get('#app').innerHTML,/협업 검증/);
  await click('data-action','task','t-collab');assert.match(nodes.get('#editor').innerHTML,/name="collaborator" value="sj" checked/);
  await click('data-action','close');
 });
 await t.test('parallel people picker saves equal participants and paused stage',async()=>{
  await click('data-action','task');const editor=nodes.get('#editor').innerHTML;assert.ok(!editor.includes('주 담당자'));assert.match(editor,/함께 맡는 사람 모두 선택/);
  const values={title:'동등 공동 업무',visibility:'shared',projectId:'p',status:'보류 중',priority:'보통',start:'',due:'',hours:'1',kpiId:'',url:'',note:'',collaborator:['jh','sy']};
  await submit('task',values,'parallel-task');const saved=await item('tasks','parallel-task');assert.equal(saved.assignee,'');assert.deepEqual(saved.collaborators,['jh','sy']);assert.equal(saved.status,'검토 요청');
  await click('data-nav','collab');assert.match(nodes.get('#app').innerHTML,/보류 중/);assert.ok(!/>검토 요청</.test(nodes.get('#app').innerHTML));
  await listeners.change({target:{id:'assignee-filter',value:'unassigned',dataset:{}}});assert.ok(!nodes.get('#app').innerHTML.includes('동등 공동 업무'));
 });
 await t.test('status-only change keeps private card visible in completed filter and preserves every other field',async()=>{
  const before=await item('tasks','t');await listeners.change({target:{id:'',dataset:{status:'t'},value:'완료'}});
  await click('data-nav','mine');await click('data-filter','done');assert.match(nodes.get('#app').innerHTML,/data-drag-task="t"/);
  const completed=await item('tasks','t');await listeners.change({target:{id:'',dataset:{status:'t'},value:'진행 중'}});
  const updated=await item('tasks','t');assert.equal(updated.visibility,'private');assert.deepEqual({...updated,status:completed.status,completedAt:completed.completedAt},completed);assert.match(nodes.get('#app').innerHTML,/data-drag-task="t"/);assert.equal(nodes.get('#toast').textContent,'상태를 변경했습니다.');
  await click('data-filter','done');assert.ok(!nodes.get('#app').innerHTML.includes('data-drag-task="t"'));
  await click('data-nav','dashboard');assert.match(nodes.get('#app').innerHTML,/진행 중 업무/);assert.ok(!nodes.get('#app').innerHTML.includes('이번 주에 집중할 업무'));assert.ok(!nodes.get('#app').innerHTML.includes('이번 주 업무'));assert.match(nodes.get('#app').innerHTML,/칸반보드/);assert.ok(!nodes.get('#app').innerHTML.includes('협업 스케줄'));assert.match(nodes.get('#app').innerHTML,new RegExp(before.title));
 });
 await t.test('poll refresh keeps open editor and stale save is rejected without overwriting input',async()=>{
  await click('data-action','task','t');const html=nodes.get('#editor').innerHTML;
  const current=await item('tasks','t');current.title='other update';const snapshot=await pg.repository.load();
  await mutate(pg.repository,{action:{type:'task.save',value:current},revision:snapshot.state.revision,baseVersion:snapshot.versions['tasks:t']},'sj');
  const polling=[...timers.values()].find(x=>x.delay===30000);await polling.fn();assert.equal(nodes.get('#editor').open,true);assert.equal(nodes.get('#editor').innerHTML,html);
  await submit('task',{...current,title:'unsaved input',hours:'1'},'t');assert.match(nodes.get('#form-error').textContent,/다른 사람이 먼저 수정/);assert.equal((await item('tasks','t')).title,'other update');assert.equal(nodes.get('#editor').open,true);
 });
 await t.test('hidden tabs cancel polling and visibility refresh does not close editor',async()=>{document.hidden=true;listeners.visibilitychange();assert.ok(![...timers.values()].some(x=>x.delay===30000));document.hidden=false;listeners.visibilitychange();assert.ok([...timers.values()].some(x=>x.delay===30000));assert.equal(nodes.get('#editor').open,true);await click('data-action','close');});
 await t.test('pasting minutes never parses automatically; archive-only saves preserve original without tasks',async()=>{
  await click('data-nav','minutes');const body='후속 업무\n양승연: 검증 자료 정리하기';nodes.set('#minutes-form',{values:{title:'원문 보관 검증',body,projectId:''}});listeners.input({target:{id:'',closest:selector=>selector==='#minutes-form'}});assert.ok(![...timers.values()].some(t=>t.delay===350));assert.ok(!nodes.get('#app').innerHTML.includes('id="draft-form"'));
  const before=await pg.repository.load();await listeners.submit({preventDefault(){},target:{id:'minutes-form',values:{title:'원문 보관 검증',body,projectId:''}}});const after=await pg.repository.load();assert.equal(after.state.tasks.length,before.state.tasks.length);assert.equal(after.state.projects.length,before.state.projects.length);const m=after.state.minutes.find(m=>m.title==='원문 보관 검증');assert.equal(m.body,body);assert.equal(m.projectId,'');assert.ok(!nodes.get('#app').innerHTML.includes('id="draft-form"'));assert.match(nodes.get('#app').innerHTML,/회의록 아카이브/);for(const text of ['업무 초안 만들기','프로젝트 · 업무 검토','추천 프로젝트별 생성','프로젝트/업무 등록'])assert.ok(!nodes.get('#app').innerHTML.includes(text));
  await click('data-nav','dashboard');await click('data-nav','minutes');assert.match(nodes.get('#app').innerHTML,/원문 보관 검증/);
 });
 await t.test('kanban and my board use only the top new task button',async()=>{
  for(const view of ['collab','mine']){await click('data-nav',view);const html=nodes.get('#app').innerHTML;assert.match(html,/새 업무/);assert.ok(!html.includes('add-card'));assert.ok(!html.includes('+ 업무 추가'));}
 });
 await t.test('meeting dates persist, filter archives and link existing projects without generating tasks',async()=>{
  await click('data-nav','minutes');assert.match(nodes.get('#app').innerHTML,/회의록 등록/);assert.ok(!nodes.get('#app').innerHTML.includes('회의록 입력'));
  const before=await pg.repository.load();
  const create=values=>listeners.submit({preventDefault(){},target:{id:'minutes-form',values}});
  await create({title:'날짜 A 회의',meetingDate:'2026-10-12',projectId:'',body:'원문 A'});
  await create({title:'날짜 B 회의',meetingDate:'2026-10-13',projectId:'p',body:'원문 B'});
  let snapshot=await pg.repository.load();assert.equal(snapshot.state.projects.length,before.state.projects.length);assert.equal(snapshot.state.tasks.length,before.state.tasks.length);
  const a=snapshot.state.minutes.find(m=>m.title==='날짜 A 회의'),b=snapshot.state.minutes.find(m=>m.title==='날짜 B 회의');assert.equal(a.meetingDate,'2026-10-12');assert.equal(b.projectId,'p');
  await listeners.change({target:{id:'minutes-date-filter',value:'2026-10-12'}});let html=nodes.get('#app').innerHTML;assert.match(html,/날짜 A 회의/);assert.ok(!html.includes('날짜 B 회의'));
  await click('data-action','minutes-edit',a.id);await submit('minutes',{title:a.title,body:a.body,meetingDate:a.meetingDate,projectId:'p'},a.id);
  const linked=await item('minutes',a.id);assert.equal(linked.projectId,'p');assert.equal(linked.author,a.author);assert.equal(linked.at,a.at);
  await click('data-action','project-open','p');assert.match(nodes.get('#app').innerHTML,/날짜 A 회의/);assert.match(nodes.get('#app').innerHTML,/날짜 B 회의/);
  await click('data-nav','minutes');await click('data-action','minutes-filter-reset');assert.match(nodes.get('#app').innerHTML,/날짜 B 회의/);
  snapshot=await pg.repository.load();await create({title:'잘못된 날짜',meetingDate:'2026-02-30',projectId:'p',body:'검증'});assert.equal((await pg.repository.load()).state.minutes.length,snapshot.state.minutes.length);assert.match(nodes.get('#login-error').textContent,/회의 날짜/);
 });
 await t.test('legacy meeting archive dates use Korea registration date and keep original data',async()=>{
  const snapshot=await pg.repository.load();const legacy={id:'legacy-meeting-date',title:'기존 날짜 회의록',body:'기존 원문',projectId:'',author:'sj',at:'2026-10-14T16:00:00Z'};
  await mutate(pg.repository,{action:{type:'minutes.save',value:legacy},revision:snapshot.state.revision,baseVersion:null},'sj');
  await [...timers.values()].find(t=>t.delay===30000).fn();await click('data-nav','minutes');await listeners.change({target:{id:'minutes-date-filter',value:'2026-10-15'}});assert.match(nodes.get('#app').innerHTML,/기존 날짜 회의록/);assert.match(nodes.get('#app').innerHTML,/등록일 기준/);assert.deepEqual(await item('minutes',legacy.id),legacy);
 });
 await t.test('card body opens editor; state select clicks stay on the board; project chip follows title',async()=>{
  await click('data-nav','collab');const html=nodes.get('#app').innerHTML;assert.ok(html.indexOf('class="task-title"')<html.indexOf('class="project-chip'));
  const card={dataset:{action:'task',id:'t-collab'}};
  await listeners.click({target:{closest:s=>s==='[data-task-card]'||s==='[data-action]'?card:null}});assert.equal(nodes.get('#editor').open,true);await click('data-action','close');
  await listeners.click({target:{closest:s=>s==='[data-task-card]'?card:s==='select,input,textarea,label,a'?{}:null}});assert.equal(nodes.get('#editor').open,false);
 });
 await t.test('file-only artifacts save, keep attachment on title edit, and clean failed new upload',async()=>{
  const path='00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.pdf';const file=new File(['%PDF-1.7'],'test.pdf',{type:'application/pdf'}),attachment={bucket:'workwith-artifacts',path,name:file.name,type:file.type,size:file.size};let removed=[];
  store.uploadAttachment=async()=>attachment;store.removeAttachment=async a=>removed.push(a.path);
  await click('data-action','artifact','p');await submit('artifact',{title:'PDF 결과',projectId:'p',url:'',file},'file-result');assert.deepEqual((await item('artifacts','file-result')).attachment,attachment);
  await click('data-action','artifact-edit','file-result');await submit('artifact',{title:'PDF 결과 수정',projectId:'p',url:''},'file-result');assert.equal((await item('artifacts','file-result')).attachment.path,path);assert.equal(removed.length,0);
  await click('data-nav','archive');assert.match(nodes.get('#app').innerHTML,/test.pdf/);assert.match(nodes.get('#app').innerHTML,/artifact-download/);
  const failedPath=path.replace('000000000002.pdf','000000000003.pdf');store.uploadAttachment=async()=>({...attachment,path:failedPath});
  await click('data-action','artifact','p');await submit('artifact',{title:'잘못된 프로젝트',projectId:'missing',url:'',file},'failed-result');assert.ok(!await item('artifacts','failed-result'));assert.deepEqual(removed,[failedPath]);assert.equal((await item('artifacts','file-result')).attachment.path,path);assert.equal(nodes.get('#editor').open,true);await click('data-action','close');
 });
 await t.test('settings labels reflect Supabase and no demo data controls',async()=>{await click('data-nav','settings');const html=nodes.get('#app').innerHTML;assert.match(html,/Supabase PostgreSQL 공유/);for(const label of ['전체 시연 데이터 백업','시연 데이터 준비','JSON 내보내기','예시 데이터 불러오기'])assert.ok(!html.includes(label));});
 await t.test('settings password form validates confirmation and clears credentials after successful change',async()=>{
  let called=0;store.changePassword=async(current,next)=>{called++;assert.equal(current,'temporary-test');assert.equal(next,'replacement-test');};
  await click('data-nav','settings');assert.match(nodes.get('#app').innerHTML,/비밀번호 변경/);await click('data-action','password-change');assert.match(nodes.get('#editor').innerHTML,/autocomplete="current-password"/);assert.match(nodes.get('#editor').innerHTML,/autocomplete="new-password"/);
  await submit('password-change',{currentPassword:'temporary-test',password:'replacement-test',confirmPassword:'mismatch'},'');assert.equal(called,0);assert.equal(nodes.get('#editor').open,true);assert.match(nodes.get('#form-error').textContent,/일치하지/);
  await submit('password-change',{currentPassword:'temporary-test',password:'replacement-test',confirmPassword:'replacement-test'},'');assert.equal(called,1);assert.equal(nodes.get('#editor').open,false);assert.equal(nodes.get('#editor').innerHTML,'');assert.match(nodes.get('#toast').textContent,/비밀번호를 변경/);
 });
 await pg.close();
});
