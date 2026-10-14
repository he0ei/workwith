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
 globalThis.FormData=class{constructor(form){this.entries=Object.entries(form.values||{});}get(k){return this.entries.find(([key])=>key===k)?.[1]??null;}getAll(k){return this.entries.filter(([key])=>key===k).map(([,v])=>v);}has(k){return this.entries.some(([key])=>key===k);}[Symbol.iterator](){return this.entries[Symbol.iterator]();}};
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
 await t.test('all views render; KPI and artifacts are saved via authenticated API',async()=>{
  for(const name of ['collab','mine','calendar','projects','minutes','archive','settings','dashboard']){await click('data-nav',name);assert.match(nodes.get('#app').innerHTML,/<main>/);}
  await click('data-action','kpi','p');await submit('kpi',{title:'KPI',projectId:'p',target:'10',current:'4',unit:'건',method:'increase'},'k');
  await click('data-action','artifact','p');await submit('artifact',{title:'result',projectId:'p',url:'https://example.com'},'a');
  await click('data-action','project-open','p');assert.match(nodes.get('#app').innerHTML,/value="40"/);assert.match(nodes.get('#app').innerHTML,/result/);
 });
 await t.test('poll refresh keeps open editor and stale save is rejected without overwriting input',async()=>{
  await click('data-action','task','t');const html=nodes.get('#editor').innerHTML;
  const current=await item('tasks','t');current.title='other update';const snapshot=await pg.repository.load();
  await mutate(pg.repository,{action:{type:'task.save',value:current},revision:snapshot.state.revision,baseVersion:snapshot.versions['tasks:t']},'sj');
  const polling=[...timers.values()].find(x=>x.delay===30000);await polling.fn();assert.equal(nodes.get('#editor').open,true);assert.equal(nodes.get('#editor').innerHTML,html);
  await submit('task',{...current,title:'unsaved input',hours:'1'},'t');assert.match(nodes.get('#form-error').textContent,/다른 사람이 먼저 수정/);assert.equal((await item('tasks','t')).title,'other update');assert.equal(nodes.get('#editor').open,true);
 });
 await t.test('hidden tabs cancel polling and visibility refresh does not close editor',async()=>{document.hidden=true;listeners.visibilitychange();assert.ok(![...timers.values()].some(x=>x.delay===30000));document.hidden=false;listeners.visibilitychange();assert.ok([...timers.values()].some(x=>x.delay===30000));assert.equal(nodes.get('#editor').open,true);await click('data-action','close');});
 await t.test('meeting draft review registers tasks and minutes in one transaction',async()=>{
  await click('data-nav','minutes');await listeners.submit({preventDefault(){},target:{id:'minutes-form',values:{title:'meeting',projectId:'p',body:'meeting task | | | 보통'}}});assert.match(nodes.get('#app').innerHTML,/담당자 확인 필요/);
  await listeners.submit({preventDefault(){},target:{id:'draft-form',values:{'title-0':'reviewed task','assignee-0':'jh','due-0':'','priority-0':'보통','kpi-0':'','target-0':'','unit-0':'','include-0':'on',acknowledged:'on'}}});assert.ok((await read()).some(x=>x.entity==='tasks'&&JSON.parse(x.payload).title==='reviewed task'));assert.ok((await read()).some(x=>x.entity==='minutes'));
 });
 await t.test('meeting review creates a new project and opens its linked task detail',async()=>{
  await click('data-nav','minutes');await listeners.submit({preventDefault(){},target:{id:'minutes-form',values:{title:'new meeting',projectId:'__new__',body:'프로젝트: 새 캠페인\n업무:\n- 최재희: 콘텐츠 발행'}}});assert.match(nodes.get('#app').innerHTML,/value="새 캠페인"/);
  await listeners.submit({preventDefault(){},target:{id:'draft-form',values:{'project-title':'검토한 캠페인','project-goal':'목표','project-owner':'','project-start':'','project-due':'','title-0':'콘텐츠 발행','assignee-0':'jh','due-0':'','priority-0':'보통','kpi-0':'','target-0':'','unit-0':'','include-0':'on',acknowledged:'on'}}});
  const snapshot=await pg.repository.load(),project=snapshot.state.projects.find(x=>x.title==='검토한 캠페인');assert.ok(project);assert.equal(snapshot.state.tasks.find(x=>x.title==='콘텐츠 발행').projectId,project.id);assert.match(nodes.get('#app').innerHTML,/관련 업무/);assert.match(nodes.get('#app').innerHTML,/검토한 캠페인/);
 });
 await t.test('settings labels reflect Supabase and no demo data controls',async()=>{await click('data-nav','settings');const html=nodes.get('#app').innerHTML;assert.match(html,/Supabase PostgreSQL 공유/);for(const label of ['전체 시연 데이터 백업','시연 데이터 준비','JSON 내보내기','예시 데이터 불러오기'])assert.ok(!html.includes(label));});
 await pg.close();
});
