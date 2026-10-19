import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceStore} from '../src/workspace-store.js';
import {handle} from '../server/supabase-handler.js';
import {empty} from '../src/model.js';
import {postgres} from './postgres-helper.mjs';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const config={url:'https://test.supabase.co',key:'sb_publishable_public-test'};
const env={APP_ORIGIN:'https://he0ei.github.io',SUPABASE_URL:config.url,SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-secret',WORKSPACE_PUBLIC_ACCESS:true,WORKSPACE_LINK_SHA256:''};
const request=(body,origin=env.APP_ORIGIN)=>new Request(config.url+'/functions/v1/workspace',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('ordinary URL works with empty tab storage and sends neither an invitation credential nor an Auth request',async()=>{
 const calls=[];
 for(let computer=0;computer<2;computer++){
  const store=new WorkspaceStore(async(url,o)=>{calls.push({url,...o});return Response.json({state:empty(),versions:{},user:JSON.parse(o.body).member});},storage(),config,{hash:'',pathname:'/workwith/',search:''},{replaceState(){assert.fail('plain address must stay unchanged');}});
  assert.equal(store.publicAccess,true);await store.read();await store.version();
 }
 assert.equal(calls.length,4);assert.ok(calls.every(c=>c.headers.Authorization===undefined&&!c.url.includes('/auth/')));
 assert.ok(calls.every(c=>!c.body.includes('token')&&c.referrerPolicy==='no-referrer'));
});
test('old invitation/session credentials are cleared and a stale fragment cannot gate a public workspace',async()=>{
 const saved=storage(),urls=[];for(const key of ['workwith-shared-link','workwith-supabase-session','workwith-recovery-pending'])saved.setItem(key,'old-access-credential');
 saved.setItem('workwith-display-member','sy');
 const store=new WorkspaceStore(async()=>Response.json({}),saved,config,{hash:'#access=old-link',pathname:'/workwith/',search:'?v=release'},{replaceState:(a,b,url)=>urls.push(url)});
 assert.deepEqual(urls,['/workwith/?v=release']);assert.equal(store.token,'');assert.equal(store.member,'sy');
 for(const key of ['workwith-shared-link','workwith-supabase-session','workwith-recovery-pending'])assert.equal(saved.getItem(key),null);
 await store.read();store.setMember('jh');assert.equal(saved.getItem('workwith-display-member'),'jh');
});
test('only explicit server public mode permits no-key requests; origin, methods and body checks still run',async()=>{
 let calls=0;const fetcher=async url=>{calls++;assert.ok(!url.includes('/auth/'));return Response.json({state:empty(),versions:{}});};
 assert.equal((await handle(request({op:'state'}),env,fetcher)).status,200);assert.equal(calls,1);
 for(const flag of [false,'true',undefined])assert.equal((await handle(request({op:'state'}),{...env,WORKSPACE_PUBLIC_ACCESS:flag},fetcher)).status,401);
 assert.equal((await handle(request({op:'state'},'https://other.example'),env,fetcher)).status,403);
 assert.equal((await handle(new Request(config.url,{method:'GET'}),env,fetcher)).status,405);
 assert.equal((await handle(request({op:'unexpected'}),env,fetcher)).status,400);
 assert.equal((await handle(request({op:'state',member:'outsider'}),env,fetcher)).status,400);
 assert.equal(calls,1);
});
test('three independent public clients can save and reload the same SQL task while stale edits return 409',async()=>{
 const pg=await postgres();try{
  const fetcher=async(url,o)=>{assert.ok(!url.includes('/auth/'));assert.equal(o.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);if(url.endsWith('workwith_snapshot'))return Response.json(await pg.repository.load());if(url.endsWith('workwith_revision'))return Response.json({revision:(await pg.repository.load()).state.revision});if(url.endsWith('workwith_commit')){const b=JSON.parse(o.body);return Response.json(await pg.repository.commit(b.p_revision,b.p_upserts,b.p_deletes));}throw Error('unexpected');};
  const client=()=>new WorkspaceStore((_url,o)=>handle(new Request(config.url,{...o,headers:{...o.headers,Origin:env.APP_ORIGIN}}),env,fetcher),storage(),config,{hash:'',pathname:'/',search:''},{replaceState(){}});
  const a=client(),b=client(),c=client();
  const initial=await a.read(),task={id:'public-task',title:'공유 저장 확인',note:'',owner:'jh',assignee:'jh',visibility:'shared',projectId:'',status:'예정',priority:'보통',start:'',due:'',hours:0,kpiId:'',url:'',dependencies:[],completedAt:''};
  await a.change({type:'task.save',value:task},initial.state.revision,null);
  const fromB=await b.read();assert.equal(fromB.state.tasks[0].title,task.title);b.setMember('sy');
  await b.change({type:'task.save',value:{...fromB.state.tasks[0],title:'다른 컴퓨터에서 수정'}},fromB.state.revision,fromB.versions['tasks:public-task']);
  assert.equal((await c.read()).state.tasks[0].title,'다른 컴퓨터에서 수정');
  await assert.rejects(a.change({type:'task.save',value:{...task,title:'오래된 편집'}},fromB.state.revision,fromB.versions['tasks:public-task']),e=>e.status===409);
  assert.equal((await a.read()).state.tasks.length,1);assert.ok(!JSON.stringify(await a.read()).includes(env.SUPABASE_SERVICE_ROLE_KEY));
 }finally{await pg.close();}
});
test('public attachment gateway retains 5MB/type/path checks and never exposes storage credentials',async()=>{
 const fetcher=async(url,o)=>{if(url.endsWith('workwith_snapshot'))return Response.json({state:empty(),versions:{}});if(url.includes('/storage/')&&o.method==='POST')return Response.json({});if(url.includes('/storage/')&&o.method==='DELETE')return Response.json(JSON.parse(o.body).prefixes.map(name=>({name})));if(url.includes('/storage/'))return new Response('%PDF-test');throw Error('unexpected');};
 const uploaded=await handle(request({op:'file.upload',taskId:'t',name:'test.pdf',type:'application/pdf',data:btoa('%PDF-test')}),env,fetcher);assert.equal(uploaded.status,200);const attachment=await uploaded.json();
 assert.ok(!JSON.stringify(attachment).includes(env.SUPABASE_SERVICE_ROLE_KEY));
 assert.equal((await handle(request({op:'file.read',attachment}),env,fetcher)).status,200);
 assert.equal((await handle(request({op:'file.remove',attachment}),env,fetcher)).status,200);
 assert.equal((await handle(request({op:'file.read',attachment:{...attachment,path:'../secret'}}),env,fetcher)).status,400);
 assert.equal((await handle(request({op:'file.upload',name:'fake.pdf',type:'application/pdf',data:btoa('not pdf')}),env,fetcher)).status,400);
 assert.equal((await handle(request({op:'file.upload',name:'big.pdf',type:'application/pdf',data:'a'.repeat(Math.ceil(5*1024*1024/3)*4+1)}),env,fetcher)).status,400);
});
