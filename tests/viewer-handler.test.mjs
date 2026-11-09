import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleViewer} from '../server/viewer-handler.js';
const SECRET='s'.repeat(40),env={SUPABASE_URL:'https://test-project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',VIEWER_SECRET:SECRET};
const file=p=>({bucket:'workwith-task-files',path:p,name:p,type:'application/pdf',size:1});
const state={version:1,revision:4,projects:[{id:'p'}],kpis:[],minutes:[],artifacts:[],history:[{id:'h'}],
 tasks:[{id:'shared',visibility:'shared',attachment:file('u/shared/a.pdf')},{id:'mine',visibility:'private',owner:'jh',title:'개인 메모',attachment:file('u/mine/b.pdf')}]};
const fetcher=calls=>async(url,o={})=>{calls.push({url,method:o.method||'GET'});if(url.endsWith('/rpc/workwith_snapshot'))return Response.json({state,versions:{}});if(url.includes('/storage/v1/object/authenticated/'))return new Response('PDF');return new Response('{}',{status:404});};
const send=(body,secret=SECRET,calls=[])=>handleViewer(new Request('https://x/functions/v1/viewer',{method:'POST',headers:{'x-viewer-secret':secret,'Content-Type':'application/json'},body:JSON.stringify(body)}),env,fetcher(calls));

test('viewer function needs its own secret and never reaches the DB without it',async()=>{
 for(const secret of ['','wrong',SECRET.slice(1),SECRET+'x']){const calls=[];assert.equal((await send({op:'state'},secret,calls)).status,404);assert.equal(calls.length,0);}
 assert.equal((await handleViewer(new Request('https://x',{method:'GET'}),env,fetcher([]))).status,405);
 assert.equal((await handleViewer(new Request('https://x',{method:'POST',headers:{'x-viewer-secret':SECRET},body:'{}'}),{...env,VIEWER_SECRET:'short'},fetcher([]))).status,404);
});
test('viewer function returns shared work only, no history, and only reads',async()=>{
 const calls=[],r=await send({op:'state'},SECRET,calls),body=await r.json();
 assert.deepEqual(body.state.tasks.map(t=>t.id),['shared']);assert.deepEqual(body.state.history,[]);assert.ok(!JSON.stringify(body).includes('개인 메모'));assert.equal(body.versions,undefined);
 assert.ok(calls.every(c=>c.url.endsWith('/rpc/workwith_snapshot')));
 assert.equal((await send({op:'change',action:{type:'task.delete',id:'shared'}})).status,400);
});
test('viewer function serves only files attached to shared work',async()=>{
 let r=await send({op:'file.read',attachment:file('u/shared/a.pdf')});assert.equal(r.status,200);assert.equal(await r.text(),'PDF');
 for(const a of [file('u/mine/b.pdf'),file('other/x.pdf'),{...file('u/shared/a.pdf'),bucket:'workwith-artifacts'}]){const calls=[];r=await send({op:'file.read',attachment:a},SECRET,calls);assert.equal(r.status,404);assert.ok(!calls.some(c=>c.url.includes('/storage/')));}
});
