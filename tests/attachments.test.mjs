import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attachmentBytes,validAttachment,MAX_ATTACHMENT_BYTES} from '../src/attachments.js';
import {SharedStore} from '../src/shared-store.js';
const config={url:'https://test-project.supabase.co',key:'sb_publishable_test'};
const owner='00000000-0000-4000-8000-000000000001';
const png=()=>new File([new Uint8Array([137,80,78,71,13,10,26,10,1])],'검증.png',{type:'image/png'});
const attachment={bucket:'workwith-artifacts',path:owner+'/00000000-0000-4000-8000-000000000002.png',name:'검증.png',type:'image/png',size:9};
const storage=()=>({getItem:()=>JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',expires_at:Date.now()/1000+3600}),setItem(){},removeItem(){}});
test('attachment validation rejects unsupported, oversized and mismatched bytes before upload',async()=>{
 assert.equal((await attachmentBytes(png())).length,9);
 for(const file of [new File(['x'],'x.svg',{type:'image/svg+xml'}),new File(['x'],'x.png',{type:'image/png'}),new File([],'empty.pdf',{type:'application/pdf'}),{type:'application/pdf',name:'big.pdf',size:MAX_ATTACHMENT_BYTES+1}])await assert.rejects(attachmentBytes(file));
 assert.ok(validAttachment(attachment));for(const invalid of [{...attachment,path:'../secret.png'},{...attachment,bucket:'public'},{...attachment,type:'text/html'},{...attachment,size:0}])assert.ok(!validAttachment(invalid));
});
test('private upload stores verified owner path, uses JWT and cannot overwrite an object',async()=>{
 const calls=[],store=new SharedStore(async(url,o)=>{calls.push({url,o});return url.endsWith('/auth/v1/user')?Response.json({id:owner}):Response.json({Key:'path'});},storage(),config);
 const result=await store.uploadAttachment(png());assert.ok(validAttachment(result));assert.ok(result.path.startsWith(owner+'/'));assert.equal(calls[1].o.headers.Authorization,'Bearer test-access');assert.equal(calls[1].o.headers['x-upsert'],'false');assert.equal(calls[1].o.body.byteLength,9);assert.ok(!calls[1].url.includes('object/public'));
});
test('task upload uses separate private bucket and binds immutable path to task id',async()=>{
 const calls=[],store=new SharedStore(async(url,o)=>{calls.push({url,o});return url.endsWith('/auth/v1/user')?Response.json({id:owner}):Response.json({Key:'path'});},storage(),config);
 const result=await store.uploadAttachment(png(),{taskId:'task-id'});assert.equal(result.bucket,'workwith-task-files');assert.ok(result.path.startsWith(owner+'/task-id/'));assert.ok(validAttachment(result));assert.match(calls[1].url,/object\/workwith-task-files\//);await assert.rejects(store.uploadAttachment(png(),{taskId:'../invalid'}),/경로/);
});
test('download and removal enforce the private bucket and metadata checks',async()=>{
 const calls=[],store=new SharedStore(async(url,o)=>{calls.push({url,o});return o.method==='DELETE'?Response.json([{name:attachment.path}]):new Response(new Uint8Array([1,2,3]));},storage(),config);
 assert.equal((await store.downloadAttachment(attachment)).size,3);assert.ok(calls[0].url.includes('/object/authenticated/workwith-artifacts/'));assert.equal(calls[0].o.headers.Authorization,'Bearer test-access');
 await store.removeAttachment(attachment);assert.equal(calls[1].o.method,'DELETE');assert.deepEqual(JSON.parse(calls[1].o.body),{prefixes:[attachment.path]});
 await assert.rejects(store.downloadAttachment({...attachment,path:'../../data'}));assert.equal(calls.length,2);
});
test('no login or denied Storage operation never produces a successful attachment',async()=>{
 const loggedOut=new SharedStore(()=>assert.fail('unexpected request'),{getItem:()=>null},config);await assert.rejects(loggedOut.uploadAttachment(png()),/로그인/);
 const denied=new SharedStore(async(url)=>url.endsWith('/auth/v1/user')?Response.json({id:owner}):Response.json({message:'denied'},{status:403}),storage(),config);await assert.rejects(denied.uploadAttachment(png()),/업로드/);
});
test('empty delete response is reported instead of claiming orphan cleanup succeeded',async()=>{
 const store=new SharedStore(async()=>Response.json([]),storage(),config);await assert.rejects(store.removeAttachment(attachment),/삭제를 확인하지 못했습니다/);
});
