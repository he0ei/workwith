import {today} from '../src/model.js';
import {weekRange,shiftDay} from '../src/weekly-calendar.js';
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
 globalThis.document={hidden:false,querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>{const previous=listeners[name];listeners[name]=previous?e=>Promise.all([previous(e),fn(e)]):fn;}};
 globalThis.window={addEventListener:(name,fn)=>windowListeners[name]=fn};globalThis.location={protocol:'http:'};
 globalThis.setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;};globalThis.clearTimeout=id=>timers.delete(id);

 globalThis.confirm=()=>true;
 globalThis.FormData=class{constructor(form){this.entries=Object.entries(form.values||{});}get(k){return this.entries.find(([key])=>key===k)?.[1]??null;}getAll(k){return this.entries.filter(([key])=>key===k).flatMap(([,v])=>Array.isArray(v)?v:[v]);}has(k){return this.entries.some(([key])=>key===k);}[Symbol.iterator](){return this.entries[Symbol.iterator]();}};
 const click=(attr,value,id='')=>listeners.click({target:{closest:selector=>selector===`[${attr}]`?{dataset:{[{'data-nav':'nav','data-action':'action','data-filter':'filter'}[attr]]:value,id}}:null}});
 const submit=(kind,values,id)=>listeners.submit({preventDefault(){},target:{id:'edit-form',dataset:{kind,id},values}});
 const read=async()=>{const result=await pg.repository.load();return Object.entries(result.state).filter(([,v])=>Array.isArray(v)).flatMap(([entity,values])=>values.map(x=>({entity,payload:JSON.stringify(x)})));};
 const item=async(entity,id)=>{const result=await pg.repository.load();return result.state[entity].find(x=>x.id===id);};
 await start(store);
 await t.test('empty dashboard shows real login user and shared status',()=>{assert.match(nodes.get('#app').innerHTML,/공유 DB 연결/);assert.match(nodes.get('#app').innerHTML,/aria-current="page" class="active"><span>.*?<\/span><span class="nav-text">팀 캘린더/);assert.ok(!nodes.get('#app').innerHTML.includes('시연 사용자'));assert.ok([...timers.values()].some(x=>x.delay===30000));});
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
  await click('data-action','task');const editor=nodes.get('#editor').innerHTML;assert.ok(!editor.includes('주 담당자'));assert.match(editor,/여러 명을 선택할 수 있어요/);
  const values={title:'동등 공동 업무',visibility:'shared',projectId:'p',status:'보류 중',priority:'보통',start:'',due:'',hours:'1',kpiId:'',url:'',note:'',collaborator:['jh','sy']};
  await submit('task',values,'parallel-task');const saved=await item('tasks','parallel-task');assert.equal(saved.assignee,'');assert.deepEqual(saved.collaborators,['jh','sy']);assert.equal(saved.status,'검토 요청');
  await click('data-nav','collab');assert.match(nodes.get('#app').innerHTML,/보류 중/);assert.ok(!/>검토 요청</.test(nodes.get('#app').innerHTML));assert.match(nodes.get('#app').innerHTML,/task-status-indicator status-dot-2/);assert.match(nodes.get('#app').innerHTML,/aria-label="업무 상태: 보류 중"/);
  await listeners.change({target:{id:'assignee-filter',value:'unassigned',dataset:{}}});assert.ok(!nodes.get('#app').innerHTML.includes('동등 공동 업무'));
 });
 await t.test('status-only change keeps private card visible in completed filter and preserves every other field',async()=>{
  const before=await item('tasks','t');await listeners.change({target:{id:'',dataset:{status:'t'},value:'완료'}});
  await click('data-nav','mine');await click('data-filter','done');assert.match(nodes.get('#app').innerHTML,/data-drag-task="t"/);
  assert.match(nodes.get('#app').innerHTML,/task-status-indicator status-dot-3/);assert.match(nodes.get('#app').innerHTML,/aria-label="업무 상태: 완료"/);const completed=await item('tasks','t');await listeners.change({target:{id:'',dataset:{status:'t'},value:'진행 중'}});
  const updated=await item('tasks','t');assert.equal(updated.visibility,'private');assert.deepEqual({...updated,status:completed.status,completedAt:completed.completedAt},completed);assert.match(nodes.get('#app').innerHTML,/data-drag-task="t"/);assert.equal(nodes.get('#toast').textContent,'상태를 변경했습니다.');assert.match(nodes.get('#app').innerHTML,/task-status-indicator status-dot-1/);
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
 await t.test('archive-only submission preserves original without tasks',async()=>{
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
  await click('data-nav','archive');assert.match(nodes.get('#app').innerHTML,/test.pdf/);assert.match(nodes.get('#app').innerHTML,/artifact-preview/);
  const failedPath=path.replace('000000000002.pdf','000000000003.pdf');store.uploadAttachment=async()=>({...attachment,path:failedPath});
  await click('data-action','artifact','p');await submit('artifact',{title:'잘못된 프로젝트',projectId:'missing',url:'',file},'failed-result');assert.ok(!await item('artifacts','failed-result'));assert.deepEqual(removed,[failedPath]);assert.equal((await item('artifacts','file-result')).attachment.path,path);assert.equal(nodes.get('#editor').open,true);await click('data-action','close');
 });
 await t.test('settings labels reflect Supabase and no demo data controls',async()=>{await click('data-nav','settings');const html=nodes.get('#app').innerHTML;assert.match(html,/내 계정/);assert.match(html,/비밀번호 변경/);assert.ok(!html.includes('워크스페이스 설정'));assert.ok(!html.includes('최근 변경 이력'));assert.ok(!html.includes('Supabase PostgreSQL 공유'));for(const label of ['전체 시연 데이터 백업','시연 데이터 준비','JSON 내보내기','예시 데이터 불러오기'])assert.ok(!html.includes(label));});
 await t.test('settings password form validates confirmation and clears credentials after successful change',async()=>{
  let called=0;store.changePassword=async(current,next)=>{called++;assert.equal(current,'temporary-test');assert.equal(next,'replacement-test');};
  await click('data-nav','settings');assert.match(nodes.get('#app').innerHTML,/비밀번호 변경/);await click('data-action','password-change');assert.match(nodes.get('#editor').innerHTML,/autocomplete="current-password"/);assert.match(nodes.get('#editor').innerHTML,/autocomplete="new-password"/);
  await submit('password-change',{currentPassword:'temporary-test',password:'replacement-test',confirmPassword:'mismatch'},'');assert.equal(called,0);assert.equal(nodes.get('#editor').open,true);assert.match(nodes.get('#form-error').textContent,/일치하지/);
  await submit('password-change',{currentPassword:'temporary-test',password:'replacement-test',confirmPassword:'replacement-test'},'');assert.equal(called,1);assert.equal(nodes.get('#editor').open,false);assert.equal(nodes.get('#editor').innerHTML,'');assert.match(nodes.get('#toast').textContent,/비밀번호를 변경/);
 });
 await t.test('project completion persists without changing tasks; sidebar toggle preserves page',async()=>{
  await click('data-action','project-open','p');const before=await pg.repository.load();await click('data-action','project-toggle','p');assert.equal((await item('projects','p')).status,'완료');assert.deepEqual((await pg.repository.load()).state.tasks,before.state.tasks);assert.match(nodes.get('#app').innerHTML,/다시 진행/);
  await click('data-action','sidebar-toggle');assert.match(nodes.get('#app').innerHTML,/sidebar is-collapsed/);assert.match(nodes.get('#app').innerHTML,/사이드바 펼치기/);assert.match(nodes.get('#app').innerHTML,/test project/);
  await click('data-nav','archive');assert.match(nodes.get('#app').innerHTML,/sidebar is-collapsed/);await click('data-action','sidebar-toggle');await click('data-action','project-toggle','p');assert.equal((await item('projects','p')).status,'진행 중');
 });
 await t.test('blue attachment icon opens picker; file drop stages upload until save; cancel does not upload',async()=>{
  const file=new File(['%PDF-1.7'],'dropped.pdf',{type:'application/pdf'});let picked=0,uploads=0;nodes.set('#artifact-file',{click(){picked++;}});nodes.set('#attachment-selection',{textContent:''});const zone={classList:{add(){},remove(){}}};
  store.uploadAttachment=async value=>{uploads++;assert.equal(value,file);return {bucket:'workwith-artifacts',path:'00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000004.pdf',name:file.name,type:file.type,size:file.size};};
  await click('data-action','artifact','p');assert.match(nodes.get('#editor').innerHTML,/data-file-drop/);await click('data-action','attachment-choose');assert.equal(picked,1);
  await listeners.drop({target:{closest:s=>s==='[data-file-drop]'?zone:null},dataTransfer:{files:[file]},preventDefault(){}});assert.equal(uploads,0);assert.match(nodes.get('#attachment-selection').textContent,/dropped.pdf/);
  await submit('artifact',{title:'드롭 결과',projectId:'p',url:''},'drop-result');assert.equal(uploads,1);assert.equal((await item('artifacts','drop-result')).attachment.name,'dropped.pdf');
  await click('data-action','artifact','p');await listeners.drop({target:{closest:s=>s==='[data-file-drop]'?zone:null},dataTransfer:{files:[file]},preventDefault(){}});await click('data-action','close');assert.equal(uploads,1);
 });
 await t.test('dashboard shows four projects and six tasks, sorts by priority, and opens all ongoing tasks',async()=>{
  for(let i=0;i<6;i++){await click('data-action','project');await submit('project',{title:'순위 프로젝트 '+i,goal:'',owner:'sj',start:'',due:'',priority:i===5?'높음':'낮음'},'rank-p'+i);await click('data-action','task');await submit('task',{title:'순위 업무 '+i,visibility:'shared',assignee:'sj',projectId:'rank-p'+i,status:'진행 중',priority:i===5?'높음':'낮음',start:'',due:'',hours:'0',url:'',note:'',kpiId:''},'rank-t'+i);}
  await click('data-nav','dashboard');const html=nodes.get('#app').innerHTML;assert.equal((html.match(/class="project-card"/g)||[]).length,4);assert.equal((html.match(/class="task-line"/g)||[]).length,6);assert.ok(html.indexOf('순위 프로젝트 5')<html.indexOf('test project'));assert.ok(html.indexOf('순위 업무 5')<html.indexOf('순위 업무 0'));
  await click('data-action','dashboard-all-tasks');assert.match(nodes.get('#app').innerHTML,/순위 업무 4/);assert.match(nodes.get('#app').innerHTML,/순위 업무 5/);
 });
 await t.test('task editing uploads private files, preserves on ordinary edit, cleans conflicts and removes attachments',async()=>{
  const file=new File(['%PDF-1.7'],'task.pdf',{type:'application/pdf'}),attachment={bucket:'workwith-task-files',path:'00000000-0000-4000-8000-000000000001/t/00000000-0000-4000-8000-000000000005.pdf',name:file.name,type:file.type,size:file.size};const removed=[];
  store.uploadAttachment=async(f,options)=>{assert.equal(f,file);assert.equal(options.taskId,'t');return attachment;};store.removeAttachment=async a=>removed.push(a.path);
  const old=await item('tasks','t');await click('data-action','task','t');assert.match(nodes.get('#editor').innerHTML,/name="note"/);assert.match(nodes.get('#editor').innerHTML,/<details/);assert.match(nodes.get('#editor').innerHTML,/type="radio" name="status"/);
  await submit('task',{...old,note:'제목 아래에서 작성한 설명',file},'t');assert.equal((await item('tasks','t')).note,'제목 아래에서 작성한 설명');assert.deepEqual((await item('tasks','t')).attachment,attachment);assert.equal((await item('tasks','t')).visibility,'private');
  await click('data-nav','archive');assert.match(nodes.get('#app').innerHTML,/task-preview/);
  const attached=await item('tasks','t');await click('data-action','task','t');await submit('task',{...attached,title:'파일 유지'},'t');assert.deepEqual((await item('tasks','t')).attachment,attachment);assert.equal(removed.length,0);
  const conflictAttachment={...attachment,path:attachment.path.replace('000000000005.pdf','000000000006.pdf')};store.uploadAttachment=async()=>conflictAttachment;
  await click('data-action','task','t');const fresh=await pg.repository.load();await mutate(pg.repository,{action:{type:'task.save',value:{...attached,title:'다른 수정'}},revision:fresh.state.revision,baseVersion:fresh.versions['tasks:t']},'sj');await submit('task',{...attached,file},'t');assert.deepEqual(removed,[conflictAttachment.path]);assert.deepEqual((await item('tasks','t')).attachment,attachment);assert.equal((await item('tasks','t')).title,'다른 수정');assert.equal(nodes.get('#editor').open,true);await click('data-action','close');
  await click('data-action','task','t');await submit('task',{...await item('tasks','t'),removeAttachment:'on'},'t');assert.equal((await item('tasks','t')).attachment,null);
 });
 await t.test('minutes registration connects only selected project tasks; task edit has no meeting picker',async()=>{
  const shared=await item('tasks','rank-t0');
  await click('data-action','task');await submit('task',{...shared,title:'같은 프로젝트 추가 업무'},'meeting-task2');
  await click('data-nav','minutes');const group={innerHTML:''};
  await listeners.change({target:{name:'projectId',value:'rank-p0',closest:()=>({id:'minutes-form',values:{projectId:'rank-p0',body:''},querySelector:s=>s==='[data-meeting-tasks]'?group:null})}});
  assert.match(group.innerHTML,/순위 업무 0/);assert.match(group.innerHTML,/같은 프로젝트 추가 업무/);assert.ok(!group.innerHTML.includes('순위 업무 1'));
  const body='회의 원문 <script>alert(1)</script>';
  await listeners.submit({preventDefault(){},target:{id:'minutes-form',values:{title:'프로젝트 업무 회의',body,meetingDate:'2026-10-15',projectId:'rank-p0',task:['rank-t0','meeting-task2','rank-t1','t']}}});
  const snapshot=await pg.repository.load(),m=snapshot.state.minutes.find(m=>m.title==='프로젝트 업무 회의');
  assert.deepEqual(m.taskIds,['rank-t0','meeting-task2']);assert.equal(m.body,body);
  await click('data-action','task','rank-t0');assert.ok(!nodes.get('#editor').innerHTML.includes('name="minute"'));assert.ok(!nodes.get('#editor').innerHTML.includes('task-section-minutes'));
  await submit('task',{...await item('tasks','rank-t0'),note:'업무 수정 후에도 회의 연결 유지'},'rank-t0');
  await click('data-action','task-minutes','rank-t0');const viewer=nodes.get('#editor').innerHTML;assert.match(viewer,/프로젝트 업무 회의/);assert.ok(viewer.includes('&lt;script&gt;'));assert.ok(!viewer.includes('type="checkbox"'));await click('data-action','close');
  await click('data-action','task-minutes','rank-t1');assert.ok(!nodes.get('#editor').innerHTML.includes('프로젝트 업무 회의'));await click('data-action','close');
  await listeners.change({target:{id:'',dataset:{status:'rank-t0'},value:'진행 중'}});assert.deepEqual((await item('minutes',m.id)).taskIds,['rank-t0','meeting-task2']);
  await click('data-action','minutes-edit',m.id);assert.ok(nodes.get('#editor').innerHTML.includes('value="rank-t0" checked'));
  await submit('minutes',{...m,task:['meeting-task2']},m.id);assert.deepEqual((await item('minutes',m.id)).taskIds,['meeting-task2']);assert.equal((await item('minutes',m.id)).body,body);
  const other=await pg.rpc('authenticated','sy','workwith_snapshot');assert.deepEqual(other.state.minutes.find(x=>x.id===m.id).taskIds,['meeting-task2']);
  await click('data-action','minutes-edit',m.id);await submit('minutes',{...await item('minutes',m.id),projectId:'rank-p1',task:['rank-t0','rank-t1']},m.id);assert.deepEqual((await item('minutes',m.id)).taskIds,['rank-t1']);
  await click('data-action','task-minutes','meeting-task2');assert.ok(!nodes.get('#editor').innerHTML.includes('프로젝트 업무 회의'));await click('data-action','close');
 });
 await t.test('pasted meeting creates issue cards in the existing collaboration project and never creates a project',async()=>{
  const values={title:'고우리협업 검토',body:'후속 업무\n- 정승재: 초안 작성하기\n- 양승연: 시안 검토하기',meetingDate:'2026-10-16',projectId:'',generateTasks:'on'};
  const before=await pg.repository.load();await listeners.submit({preventDefault(){},target:{id:'minutes-form',values}});
  assert.deepEqual(await pg.repository.load(),before);assert.match(nodes.get('#login-error').textContent,/기존 프로젝트/);
  await click('data-action','project');await submit('project',{title:'고우리 협업 건',goal:'',owner:'sj',start:'',due:''},'gowoori');
  await listeners.submit({preventDefault(){},target:{id:'minutes-form',values}});
  let snapshot=await pg.repository.load();const project=snapshot.state.projects.find(p=>p.id==='gowoori'),m=snapshot.state.minutes.find(m=>m.title==='고우리협업 검토');
  assert.equal(snapshot.state.projects.length,before.state.projects.length+1);assert.equal(snapshot.state.tasks.filter(t=>t.projectId===project.id).length,2);assert.equal(m.projectId,project.id);assert.equal(m.taskIds.length,2);
  await listeners.submit({preventDefault(){},target:{id:'minutes-form',values:{title:'추가 논의',body:'후속 업무\n- 정승재: 초안 작성하기\n- 최재희: 문구 작성하기',meetingDate:'2026-10-16',projectId:project.id,generateTasks:'on'}}});
  snapshot=await pg.repository.load();assert.equal(snapshot.state.tasks.filter(t=>t.projectId===project.id).length,3);assert.equal(snapshot.state.minutes.find(m=>m.title==='추가 논의').taskIds.length,1);assert.equal(snapshot.state.projects.length,before.state.projects.length+1);
 });
 await t.test('shared issue registration requires an existing project and saves concise headings',async()=>{
  const values={title:'MYMAM 상세페이지를 기획한다.',visibility:'shared',assignee:'sj',projectId:'',status:'예정',priority:'보통',start:'',due:'',hours:'0',kpiId:'',url:'',note:'기획 방향을 함께 검토한다.'};
  const before=await pg.repository.load();await click('data-action','task');await submit('task',values,'heading-task');
  assert.deepEqual(await pg.repository.load(),before);assert.match(nodes.get('#form-error').textContent,/프로젝트/);assert.equal(nodes.get('#editor').open,true);
  await submit('task',{...values,projectId:'gowoori'},'heading-task');const saved=await item('tasks','heading-task');
  assert.equal(saved.title,'MYMAM 상세페이지 기획');assert.equal(saved.projectId,'gowoori');assert.equal(saved.note,values.note);
 });
 await t.test('save blocks invalid dates and missing reason before writing, preserving the editor',async()=>{
  const old=await item('tasks','t-collab');await click('data-action','task','t-collab');
  await submit('task',{...old,start:'2026-10-20',due:'2026-10-19',hours:'1'},old.id);
  assert.match(nodes.get('#form-error').textContent,/마감일은 시작일/);assert.equal(nodes.get('#editor').open,true);assert.equal((await item('tasks',old.id)).start,old.start);
  await submit('task',{...old,start:'2026-10-20',due:'2026-10-21',hours:'1'},old.id);
  assert.match(nodes.get('#form-error').textContent,/일정 변경 시 사유를 입력해야 합니다/);assert.equal((await item('tasks',old.id)).due,old.due);
 });
 await t.test('weekly calendar automatically shows this and next week and preserves the monthly view',async()=>{
  const range=weekRange(today()),next=shiftDay(range.start,7);
  const values={visibility:'shared',assignee:'sj',projectId:'gowoori',status:'예정',priority:'보통',hours:'0',kpiId:'',url:'',note:''};
  await click('data-action','task');await submit('task',{...values,title:'이번 주 일정 확인',start:range.start,due:range.end},'weekly-this');
  await click('data-action','task');await submit('task',{...values,title:'다음 주 일정 확인',start:next,due:shiftDay(next,6)},'weekly-next');
  await click('data-nav','calendar');assert.match(nodes.get('#app').innerHTML,/이번 주 할 일/);assert.equal((nodes.get('#app').innerHTML.match(/class="week-days"/g)||[]).length,2);assert.match(nodes.get('#app').innerHTML,/data-schedule-bar/);assert.match(nodes.get('#app').innerHTML,/다음 주 할 일/);assert.match(nodes.get('#app').innerHTML,/weekly-this/);assert.match(nodes.get('#app').innerHTML,/weekly-next/);
  await click('data-action','calendar-month');assert.match(nodes.get('#app').innerHTML,/class="calendar month-board"/);
  await click('data-action','calendar-week');await click('data-action','week-next');assert.match(nodes.get('#app').innerHTML,/선택한 주 할 일/);await click('data-action','week-today');
  await click('data-action','task','weekly-this');assert.equal(nodes.get('#editor').open,true);
  await submit('task',{...values,title:'이번 주 일정 확인',start:next,due:shiftDay(next,6),reason:'다음 주로 조정'},'weekly-this');
  assert.match(nodes.get('#app').innerHTML,/다음 주 할 일/);assert.equal((await item('tasks','weekly-this')).start,next);
  nodes.set('.next-week-board',{open:true});
  const before=await item('tasks','weekly-this');
  await listeners.keydown({key:'ArrowRight',preventDefault(){},target:{closest:selector=>selector==='[data-schedule-bar]'?{dataset:{scheduleBar:'weekly-this'}}:null}});
  const after=await item('tasks','weekly-this');assert.equal(after.start,shiftDay(before.start,1));assert.equal(after.due,shiftDay(before.due,1));assert.equal(after.visibility,before.visibility);assert.equal(after.status,before.status);assert.equal(after.projectId,before.projectId);assert.deepEqual(after.collaborators,before.collaborators);assert.match(nodes.get('#app').innerHTML,/<details class="next-week-board" open>/);nodes.delete('.next-week-board');

 });
 await t.test('unscheduled cards assign a chosen calendar date while retaining project, status and participants',async()=>{
  await click('data-action','task');await submit('task',{title:'일정 배정 검증',visibility:'shared',assignee:'sj',collaborator:'sy',projectId:'gowoori',status:'검토 요청',priority:'보통',hours:'1',kpiId:'',url:'',note:'',start:'',due:''},'planning-only');
  await click('data-nav','calendar');const html=nodes.get('#app').innerHTML;assert.match(html,/class="planning-card"/);assert.match(html,/task-status-indicator/);assert.match(html,/data-plan-task="planning-only"/);assert.match(html,/class="calendar-info"/);assert.match(html,/class="bar-project"/);assert.ok(!html.includes('id="schedule-instructions"'));
  await click('data-action','task','planning-only');assert.equal(nodes.get('#editor').open,true);await click('data-action','close');
  const source={dataset:{planTask:'planning-only'},classList:{add(){},remove(){}}},board={dataset:{weekTimeline:weekRange(today()).start},getBoundingClientRect:()=>({left:0,right:700,width:700}),querySelector:()=>null};
  document.elementFromPoint=()=>({closest:()=>board});
  await listeners.pointerdown({target:{closest:s=>s==='[data-plan-task]'?source:null},button:0,pointerId:1,clientX:100,clientY:100});
  await listeners.pointermove({pointerId:1,clientX:250,clientY:100,cancelable:true,preventDefault(){}});
  await listeners.pointerup({pointerId:1,clientX:250,clientY:100});delete document.elementFromPoint;
  const saved=await item('tasks','planning-only');assert.equal(saved.start,shiftDay(weekRange(today()).start,2));assert.equal(saved.due,saved.start);assert.equal(saved.projectId,'gowoori');assert.equal(saved.status,'검토 요청');assert.deepEqual(saved.collaborators,['sy']);assert.ok(!nodes.get('#app').innerHTML.includes('data-plan-task="planning-only"'));assert.match(nodes.get('#app').innerHTML,/data-schedule-bar="planning-only"/);
 });
 await t.test('monthly date dragging persists only schedule fields through SQL and leaves inline metadata compact',async()=>{
  await click('data-action','calendar-month');
  const before=await item('tasks','planning-only'),from=weekRange(before.start).start,to=shiftDay(from,7),classes={add(){},remove(){}};
  const board={dataset:{weekTimeline:from,monthWeek:'true'},getBoundingClientRect:()=>({left:0,right:700,width:700}),querySelector:()=>null};
  const destination={...board,dataset:{weekTimeline:to,monthWeek:'true'}};
  const bar={dataset:{scheduleBar:before.id},classList:classes,closest:selector=>selector==='[data-month-week]'?board:null};
  const target={closest:selector=>selector==='[data-schedule-bar]'?bar:null};
  document.elementFromPoint=()=>({closest:selector=>selector==='[data-month-week]'?destination:null});
  await listeners.pointerdown({target,button:0,pointerId:2,clientX:250,clientY:50});
  await listeners.pointermove({pointerId:2,clientX:250,clientY:200,cancelable:true,preventDefault(){}});
  await listeners.pointerup({pointerId:2,clientX:250,clientY:200});delete document.elementFromPoint;
  const after=await item('tasks',before.id);assert.equal(after.start,shiftDay(before.start,7));assert.equal(after.due,shiftDay(before.due,7));
  for(const key of ['status','projectId','visibility','assignee','collaborators','note','url','dependencies'])assert.deepEqual(after[key],before[key]);
  assert.match(nodes.get('#app').innerHTML,/class="bar-meta"/);assert.match(nodes.get('#app').innerHTML,/class="planning-meta"/);assert.equal((await pg.repository.load()).state.history.length,0);
  await click('data-action','calendar-week');
 });
 await t.test('team calendar shows shared work of other members and supports a member filter without a schedule button',async()=>{
  await click('data-action','task');await submit('task',{title:'승연 단독 일정',visibility:'shared',assignee:'sy',projectId:'gowoori',status:'예정',priority:'보통',hours:'1',kpiId:'',url:'',note:'함께 확인할 내용',start:today(),due:today()},'team-only');
  await click('data-nav','calendar');assert.match(nodes.get('#app').innerHTML,/팀 캘린더/);assert.match(nodes.get('#app').innerHTML,/승연 단독 일정/);assert.ok(!nodes.get('#app').innerHTML.includes('일정 잡기'));
  await listeners.change({target:{id:'calendar-member',value:'sj',dataset:{}}});assert.ok(!nodes.get('#app').innerHTML.includes('승연 단독 일정'));
  await listeners.change({target:{id:'calendar-member',value:'sy',dataset:{}}});assert.match(nodes.get('#app').innerHTML,/승연 단독 일정/);
  await click('data-action','task','team-only');assert.match(nodes.get('#editor').innerHTML,/함께 확인할 내용/);await click('data-action','close');
  await listeners.change({target:{id:'calendar-member',value:'',dataset:{}}});
 });
 await t.test('completed tasks retain title priority chips in both calendars without rendering writes',async()=>{
  await listeners.change({target:{id:'',dataset:{status:'team-only'},value:'완료'}});
  const before=await pg.repository.load();await click('data-nav','calendar');
  let html=nodes.get('#app').innerHTML;assert.match(html,/data-schedule-bar="team-only"/);assert.match(html,/schedule-completed/);assert.match(html,/업무 상태: 완료/);assert.match(html,/완료 [0-9]+개/);assert.match(html,/task-priority-chip priority-normal/);
  await click('data-action','calendar-month');html=nodes.get('#app').innerHTML;assert.match(html,/data-schedule-bar="team-only"/);assert.match(html,/업무 상태: 완료/);assert.match(html,/bar-title-line/);
  assert.deepEqual((await pg.repository.load()).state,before.state);
 });
 await t.test('pasted date and multiple project links reach the SQL archive and each task without new projects',async()=>{
  for(const [id,title] of [['multi-alpha','ALPHA 서비스소개서'],['multi-beta','BETA 제품']]){await click('data-action','project');await submit('project',{title,goal:'',owner:'sj',start:'',due:''},id);}
  await click('data-nav','minutes');const sections=new Map(['[data-intake]','[data-meeting-projects]','[data-meeting-tasks]','[data-meeting-date-status]'].map(k=>[k,{innerHTML:'',textContent:''}]));
  const values={title:'여러 프로젝트 검증',meetingDate:today(),body:'회의일자: 2026년 10월 8일 (목)\n후속 업무\n- 양승연: ALPHA 서비스소개서 신뢰감있는 방향으로 개선하기\n- 최재희: BETA 제품 자료 정리하기',meetingProjectSelection:'1',meetingProject:['multi-alpha','multi-beta'],generateTasks:'on'};
  const date={get value(){return values.meetingDate;},set value(v){values.meetingDate=v;}},title={get value(){return values.title;},set value(v){values.title=v;}};
  const form={id:'minutes-form',values,querySelector:s=>s==='[name=meetingDate]'?date:s==='[name=title]'?title:sections.get(s)};nodes.set('#minutes-form',form);
  await listeners.input({target:{name:'body',value:values.body,closest:s=>s==='#minutes-form'||s==='form'?form:null}});
  assert.equal(values.meetingDate,'2026-10-08');assert.match(sections.get('[data-meeting-projects]').innerHTML,/value="multi-alpha" checked/);assert.match(sections.get('[data-meeting-projects]').innerHTML,/value="multi-beta" checked/);
  assert.match(sections.get('[data-intake]').innerHTML,/ALPHA 서비스 소개서 개선/);
  values.draft=[...sections.get('[data-intake]').innerHTML.matchAll(/name="draft" value="([^"]+)"/g)].map(m=>m[1]);assert.equal(values.draft.length,2);
  const count=(await pg.repository.load()).state.projects.length;
  await listeners.submit({preventDefault(){},target:form});const result=await pg.repository.load(),record=result.state.minutes.find(m=>m.title===values.title);assert.ok(record);assert.equal(record.meetingDate,'2026-10-08');assert.deepEqual(new Set(record.projectIds),new Set(['multi-alpha','multi-beta']));assert.equal(result.state.projects.length,count);
  const linked=result.state.tasks.filter(t=>record.taskIds.includes(t.id));assert.deepEqual(new Set(linked.map(t=>t.projectId)),new Set(['multi-alpha','multi-beta']));assert.equal(linked.find(t=>t.projectId==='multi-alpha').title,'ALPHA 서비스 소개서 개선');assert.match(linked.find(t=>t.projectId==='multi-alpha').note,/신뢰감있는 방향/);
  await click('data-action','minutes-edit',record.id);assert.match(nodes.get('#editor').innerHTML,/value="multi-alpha" checked/);assert.match(nodes.get('#editor').innerHTML,/value="multi-beta" checked/);
  await submit('minutes',{...record,meetingProjectSelection:'1',meetingProject:['multi-beta'],task:record.taskIds},record.id);const edited=await item('minutes',record.id);assert.deepEqual(edited.projectIds,['multi-beta']);assert.deepEqual(edited.taskIds,[linked.find(t=>t.projectId==='multi-beta').id]);nodes.delete('#minutes-form');
 });
 await t.test('meeting links hide completed projects, separate completed tasks and preserve historical links',async()=>{
  for(const [id,title] of [['link-open','진행 연결 프로젝트'],['link-closed','완료 연결 프로젝트']]){await click('data-action','project');await submit('project',{title,goal:'',owner:'sj',start:'',due:''},id);}
  for(const [id,title,status,projectId] of [['link-active-task','남은 연결 업무','진행 중','link-open'],['link-done-task','완료 연결 업무','완료','link-open'],['link-old-task','기존 완료 프로젝트 업무','완료','link-closed']]){await click('data-action','task');await submit('task',{title,visibility:'shared',assignee:'sj',projectId,status,priority:'보통',start:'',due:'',hours:'0',kpiId:'',url:'',note:''},id);}
  const create=values=>listeners.submit({preventDefault(){},target:{id:'minutes-form',values}});
  await create({title:'완료 전 기록',meetingDate:today(),projectId:'link-closed',task:['link-old-task'],body:'기존 연결을 보존합니다.'});
  const old=(await pg.repository.load()).state.minutes.find(m=>m.title==='완료 전 기록');
  await click('data-action','project-toggle','link-closed');await click('data-nav','minutes');
  let html=nodes.get('#app').innerHTML;const choices=html.split('data-meeting-projects>')[1].split('</fieldset>')[0];assert.ok(!choices.includes('value="link-closed"'));assert.match(choices,/value="link-open"/);
  await create({title:'상태별 연결 기록',meetingDate:today(),projectId:'link-open',task:['link-active-task','link-done-task','link-old-task'],body:'업무 연결을 확인합니다.'});
  const record=(await pg.repository.load()).state.minutes.find(m=>m.title==='상태별 연결 기록');assert.deepEqual(new Set(record.taskIds),new Set(['link-active-task','link-done-task']));
  await click('data-action','minutes-edit',record.id);html=nodes.get('#editor').innerHTML;
  const active=html.split('data-meeting-task-status="active"')[1].split('</details>')[0],done=html.split('data-meeting-task-status="completed"')[1].split('</details>')[0];
  assert.match(active,/기존 업무에 연결/);assert.match(active,/name="task" value="link-active-task" checked/);assert.ok(!active.includes('value="link-done-task"'));
  assert.match(done,/완료된 업무에 연결/);assert.match(done,/name="task" value="link-done-task" checked/);assert.ok(!done.includes('value="link-active-task"'));assert.ok(!html.includes('value="link-old-task"'));
  await submit('minutes',{...record,meetingProjectSelection:'1',meetingProject:['link-open'],task:['link-active-task','link-done-task']},record.id);assert.deepEqual(new Set((await item('minutes',record.id)).taskIds),new Set(['link-active-task','link-done-task']));
  await click('data-action','minutes-edit',old.id);html=nodes.get('#editor').innerHTML;assert.match(html,/type="hidden" name="meetingProject" value="link-closed"/);assert.ok(!html.includes('type="checkbox" name="meetingProject" value="link-closed"'));assert.match(html,/기존 연결 유지/);
  await submit('minutes',{...old,meetingProjectSelection:'1',meetingProject:['link-closed'],task:['link-old-task']},old.id);assert.deepEqual((await item('minutes',old.id)).taskIds,['link-old-task']);await click('data-action','close');
  const sections=new Map(['[data-intake]','[data-meeting-projects]','[data-meeting-tasks]','[data-meeting-date-status]'].map(k=>[k,{innerHTML:'',textContent:''}]));
  const form={id:'minutes-form',values:{title:'완료 사업 후속',meetingDate:today(),body:'프로젝트: 완료 연결 프로젝트\n후속 업무\n- 정승재: 완료 연결 프로젝트 결과 정리하기',meetingProjectSelection:'1'},querySelector:s=>sections.get(s)};nodes.set('#minutes-form',form);
  await listeners.input({target:{name:'body',value:form.values.body,closest:s=>s==='#minutes-form'||s==='form'?form:null}});
  assert.ok(!sections.get('[data-meeting-projects]').innerHTML.includes('value="link-closed"'));assert.ok(!sections.get('[data-intake]').innerHTML.includes('value="link-closed"'));nodes.delete('#minutes-form');
 });
 await pg.close();
});
