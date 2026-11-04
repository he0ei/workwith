import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {empty,inScope,scopeState} from '../src/model.js';
import {mutate} from '../server/workspace.js';
import {postgres,ids} from './postgres-helper.mjs';

const S='p-sanmo',O='p-other';
const task=(id,projectId,v={})=>({id,title:id,note:'',owner:'jh',assignee:'jh',visibility:'shared',projectId,status:'예정',priority:'보통',start:'',due:'',hours:0,completedAt:'',url:'',kpiId:'',dependencies:[],...v});
const minute=(id,projectId,projectIds)=>({id,title:id,body:id,author:'jh',at:'2026-11-04T00:00:00Z',projectId,...(projectIds?{projectIds}:{})});
const seed={projects:[{id:S,title:'SANMO.AE',goal:'',owner:'sj',start:'',due:''},{id:O,title:'MYMAM',goal:'',owner:'sj',start:'',due:''}],
 tasks:[task('t-in',S),task('t-out',O),task('t-private','',{visibility:'private'})],kpis:[],
 artifacts:[{id:'a-in',projectId:S,title:'시안',url:'https://x.example'},{id:'a-out',projectId:O,title:'비공개 시안',url:'https://y.example'}],
 minutes:[minute('m-in',S),minute('m-both',S,[S,O]),minute('m-out',O),minute('m-none','')]};

test('scope rule: notes count only when every linked project is the scoped one',()=>{
 assert.equal(inScope('minutes',minute('a',S),S),true);assert.equal(inScope('minutes',minute('b','',[S]),S),true);
 assert.equal(inScope('minutes',minute('c',S,[S,O]),S),false);assert.equal(inScope('minutes',minute('d',''),S),false);assert.equal(inScope('minutes',minute('e',O,[S]),S),false);
 assert.equal(inScope('projects',{id:S},S),true);assert.equal(inScope('tasks',task('x',O),S),false);
 assert.deepEqual(scopeState({...empty(),...seed},null).tasks.length,3);
});

test('a project-scoped login reads and edits only SANMO.AE; other members are unchanged',async()=>{
 const pg=await postgres();try{
  await pg.db.exec(await readFile(new URL('../supabase/migrations/202611040002_project_scoped_members.sql',import.meta.url),'utf8'));
  ids.shpark='00000000-0000-4000-8000-000000000006';
  await pg.db.query('insert into auth.users(id) values($1)',[ids.shpark]);await pg.db.query('insert into public.workwith_members(user_id,member_id,project_scope) values($1,$2,$3)',[ids.shpark,'shpark',S]);
  const rows=[];for(const [entity,list] of Object.entries(seed))for(const x of list)rows.push({entity,id:x.id,payload:x});
  assert.equal(await pg.repository.commit(0,rows,[]),true);

  const mine=await pg.rpc('authenticated','shpark','workwith_snapshot');
  assert.deepEqual(mine.state.projects.map(p=>p.id),[S]);assert.deepEqual(mine.state.tasks.map(t=>t.id),['t-in']);
  assert.deepEqual(mine.state.minutes.map(m=>m.id),['m-in']);assert.deepEqual(mine.state.artifacts.map(a=>a.id),['a-in']);
  assert.ok(Object.keys(mine.versions).every(k=>['projects:'+S,'tasks:t-in','minutes:m-in','artifacts:a-in'].includes(k)),JSON.stringify(mine.versions));
  assert.ok(!JSON.stringify(mine).includes('MYMAM'));assert.ok(!JSON.stringify(mine).includes('비공개 시안'));
  const team=await pg.rpc('authenticated','jh','workwith_snapshot');assert.equal(team.state.projects.length,2);assert.equal(team.state.minutes.length,4);

  const body=async(action,id)=>{const s=await pg.repository.load();return {revision:s.state.revision,baseVersion:s.versions[id]??null,action};};
  const edited=await mutate(pg.repository,await body({type:'task.save',value:{...task('t-in',S),status:'진행 중',assignee:'shpark'}},'tasks:t-in'),'shpark',{scope:S});
  assert.equal(edited.state.tasks[0].status,'진행 중');assert.deepEqual(edited.state.projects.map(p=>p.id),[S]);assert.ok(!JSON.stringify(edited).includes('MYMAM'));
  const created=await mutate(pg.repository,await body({type:'task.save',value:task('t-new',S,{owner:'shpark',assignee:'shpark'})},'tasks:t-new'),'shpark',{scope:S});
  assert.ok(created.state.tasks.some(t=>t.id==='t-new'));
  const refused=[[{type:'task.save',value:task('t-out',O,{status:'완료',completedAt:'2026-11-04'})},'tasks:t-out'],[{type:'task.save',value:{...task('t-in',O)}},'tasks:t-in'],
   [{type:'project.save',value:{id:'p-new',title:'새 프로젝트',goal:'',owner:'shpark',start:'',due:''}},'projects:p-new'],[{type:'project.delete',id:S},'projects:'+S],
   [{type:'minutes.save',value:minute('m-new',S,[S,O])},'minutes:m-new'],[{type:'minutes.delete',id:'m-both'},'minutes:m-both'],[{type:'artifact.delete',id:'a-out'},'artifacts:a-out']];
  for(const [action,id] of refused){const before=await pg.repository.load();await assert.rejects(mutate(pg.repository,await body(action,id),'shpark',{scope:S}),e=>e.status===403,JSON.stringify(action));assert.equal((await pg.repository.load()).state.revision,before.state.revision);}
  const own=await mutate(pg.repository,await body({type:'minutes.save',value:{...minute('m-mine',S),author:'shpark'}},'minutes:m-mine'),'shpark',{scope:S});assert.ok(own.state.minutes.some(m=>m.id==='m-mine'));
 }finally{await pg.close();}
});
test('the deployed handler passes the member scope from the members table into every save',async()=>{
 const {handle}=await import('../server/supabase-handler.js');
 const state={...empty(),revision:3,projects:seed.projects,tasks:seed.tasks.slice(0,2)},versions={'tasks:t-out':1,'tasks:t-in':1};let commits=0;
 const fetcher=async(url,o={})=>{if(url.endsWith('/auth/v1/user'))return Response.json({id:ids.sj});if(url.includes('/rest/v1/workwith_members'))return Response.json([{member_id:'shpark',password_change_required:false,project_scope:S}]);
  if(url.endsWith('/rpc/workwith_snapshot'))return Response.json({state,versions,user:null});if(url.endsWith('/rpc/workwith_commit')){commits++;return Response.json(true);}return new Response('{}',{status:404});};
 const env={APP_ORIGIN:'https://he0ei.github.io',SUPABASE_URL:'https://test-project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service'};
 const send=action=>handle(new Request(env.SUPABASE_URL,{method:'POST',headers:{Authorization:'Bearer user-jwt','Content-Type':'application/json'},body:JSON.stringify({revision:3,baseVersion:1,action})}),env,fetcher);
 const outside=await send({type:'task.save',value:{...task('t-out',O),title:'변경'}});assert.equal(outside.status,403);assert.equal(commits,0);
 const inside=await send({type:'task.save',value:{...task('t-in',S),title:'변경'}});assert.equal(inside.status,200);assert.equal(commits,1);const out=await inside.json();assert.deepEqual(out.state.projects.map(p=>p.id),[S]);assert.deepEqual(out.state.tasks.map(t=>t.id),['t-in']);
});
