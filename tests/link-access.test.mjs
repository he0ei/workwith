import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../server/supabase-handler.js';
import {verifyWorkspaceLink} from '../server/link-access.js';
import {mutate} from '../server/workspace.js';
import {postgres} from './postgres-helper.mjs';
const token='a'.repeat(43),hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const env={APP_ORIGIN:'https://he0ei.github.io',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-secret',WORKSPACE_LINK_SHA256:await hash(token)};
const request=(body,secret=token,origin=env.APP_ORIGIN)=>new Request('https://test.supabase.co/functions/v1/workspace',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body)});
const task=(id,owner)=>({id,title:id,note:'',owner,assignee:owner,visibility:'private',projectId:'',status:'예정',priority:'보통',start:'',due:'',hours:0,kpiId:'',url:'',dependencies:[],completedAt:''});
test('shared link is verified before any protected request; missing, malformed, rotated and old Auth tokens fail closed',async()=>{
 let calls=0;const fetcher=()=>{calls++;throw Error('must not call DB');};
 for(const secret of ['',token+'b','b'.repeat(43),'old-auth-jwt'])assert.equal((await handle(request({op:'state'},secret),env,fetcher)).status,401);
 assert.equal((await handle(request({op:'state'}),{...env,WORKSPACE_LINK_SHA256:''},fetcher)).status,401);
 assert.equal((await handle(request({op:'state'}),{...env,WORKSPACE_LINK_SHA256:await hash('b'.repeat(43))},fetcher)).status,401);
 assert.equal((await handle(request({op:'state'},token,'https://other.example'),env,fetcher)).status,403);assert.equal(calls,0);
 assert.equal(await verifyWorkspaceLink('Bearer '+token,env.WORKSPACE_LINK_SHA256),true);
});
test('one link sees and edits former private tasks, retains owner, conflicts and meeting author history',async()=>{
 const pg=await postgres();try{
  for(const [id,owner] of [['private-sj','sj'],['private-sy','sy']]){const s=await pg.repository.load();await mutate(pg.repository,{action:{type:'task.save',value:task(id,owner)},revision:s.state.revision,baseVersion:null},owner);}
  const fetcher=async(url,options)=>{assert.ok(!url.includes('/auth/'));if(url.endsWith('workwith_snapshot'))return Response.json(await pg.repository.load());if(url.endsWith('workwith_revision'))return Response.json({revision:(await pg.repository.load()).state.revision});if(url.endsWith('workwith_commit')){const b=JSON.parse(options.body);return Response.json(await pg.repository.commit(b.p_revision,b.p_upserts,b.p_deletes));}throw Error('unexpected');};
  const s=await (await handle(request({op:'state',member:'jh'}),env,fetcher)).json();assert.equal(s.state.tasks.length,2);assert.ok(s.state.tasks.every(t=>t.visibility==='shared'));assert.ok(!JSON.stringify(s).includes('synthetic-server-secret'));
  const original=s.state.tasks.find(t=>t.id==='private-sy'),body={op:'change',member:'sj',revision:s.state.revision,baseVersion:s.versions['tasks:private-sy'],action:{type:'task.save',value:{...original,title:'팀에서 수정'}}};
  const updated=await handle(request(body),env,fetcher);assert.equal(updated.status,200);assert.equal((await pg.repository.load()).state.tasks.find(t=>t.id===original.id).owner,'sy');assert.equal((await handle(request(body),env,fetcher)).status,409);
  const next=await (await handle(request({op:'state'}),env,fetcher)).json();assert.equal((await handle(request({...body,revision:next.state.revision,baseVersion:next.versions['tasks:private-sy'],action:{type:'task.save',value:{...original,visibility:'private'}}}),env,fetcher)).status,400);
  const record={id:'meeting',title:'기록',body:'원문',projectId:'',author:'sy',at:new Date().toISOString()};
  assert.equal((await handle(request({op:'change',member:'jh',revision:next.state.revision,baseVersion:null,action:{type:'minutes.save',value:record}}),env,fetcher)).status,200);assert.equal((await pg.repository.load()).state.minutes[0].author,'sy');
 }finally{await pg.close();}
});
test('link file gateway validates bytes, fixes upload namespace, blocks traversal and unrelated files',async()=>{
 const empty={state:{version:1,revision:0,projects:[],tasks:[],kpis:[],artifacts:[],minutes:[],history:[]},versions:{}},calls=[];
 const fetcher=async(url,o)=>{calls.push(url);if(url.endsWith('workwith_snapshot'))return Response.json(empty);if(o.method==='POST'&&url.includes('/storage/'))return Response.json({});if(o.method==='DELETE')return Response.json(JSON.parse(o.body).prefixes.map(name=>({name})));if(url.includes('/storage/'))return new Response('%PDF-',{headers:{'Content-Type':'application/pdf'}});throw Error('unexpected');};
 const uploaded=await handle(request({op:'file.upload',name:'test.pdf',type:'application/pdf',taskId:'task-one',data:btoa('%PDF-test')}),env,fetcher);assert.equal(uploaded.status,200);const attachment=await uploaded.json();assert.match(attachment.path,/^00000000-0000-4000-8000-000000000000\/task-one\//);
 const read=await handle(request({op:'file.read',attachment}),env,fetcher);assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'no-store');
 assert.equal((await handle(request({op:'file.remove',attachment}),env,fetcher)).status,200);
 assert.equal((await handle(request({op:'file.upload',name:'fake.pdf',type:'application/pdf',data:btoa('not PDF')}),env,fetcher)).status,400);
 assert.equal((await handle(request({op:'file.read',attachment:{...attachment,path:'../secret'}}),env,fetcher)).status,400);
 assert.equal((await handle(request({op:'file.read',attachment:{...attachment,path:attachment.path.replace('00000000-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000')}}),env,fetcher)).status,403);
 assert.ok(calls.every(url=>!url.includes('/auth/')));
});
test('link-only SQL blocks old Auth database and storage access while service repository stays usable',async()=>{
 const {readFile}=await import('node:fs/promises');const pg=await postgres();try{
  await pg.db.exec(`create function public.workwith_password_status() returns jsonb language sql as $$ select '{}'::jsonb $$;create schema storage;create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;create policy old_member_files on storage.objects for all to authenticated using(true) with check(true);insert into storage.objects values('workwith-artifacts','old'),('workwith-task-files','old');`);
  await pg.db.exec(await readFile(new URL('../supabase/migrations/202610190001_link_only_access.sql',import.meta.url),'utf8'));
  await assert.rejects(pg.rpc('authenticated','sj','workwith_snapshot'),/permission denied/);await assert.rejects(pg.rpc('authenticated','sj','workwith_revision'),/permission denied/);await assert.rejects(pg.as('authenticated','sj',()=>pg.db.query('select * from public.workwith_records')),/permission denied/);
  assert.equal((await pg.as('authenticated','sj',()=>pg.db.query('select * from storage.objects'))).rows.length,0);await assert.rejects(pg.as('authenticated','sj',()=>pg.db.query("insert into storage.objects values('workwith-artifacts','new')")));
  assert.equal((await pg.repository.load()).state.version,1);
 }finally{await pg.close();}
});
