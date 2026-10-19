import {test} from 'node:test';import assert from 'node:assert/strict';import {LinkStore} from '../src/link-store.js';
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('link fragments become tab sessions, leave the URL, never call Auth and keep display names separate from access',async()=>{
 const saved=storage(),calls=[],history=[];saved.setItem('workwith-supabase-session','old');const token='a'.repeat(43);
 const store=new LinkStore(async(url,o)=>{calls.push({url,...o});return Response.json({state:{},user:JSON.parse(o.body).member});},saved,{url:'https://test.supabase.co',key:'public-key'},{hash:'#access='+token,pathname:'/workwith/',search:''},{replaceState:(a,b,url)=>history.push(url)});
 assert.deepEqual(history,['/workwith/']);assert.equal(saved.getItem('workwith-supabase-session'),null);assert.equal(store.linkAccess,true);await store.read();store.setMember('sy');await store.version();
 assert.equal(calls[0].headers.Authorization,'Bearer '+token);assert.equal(JSON.parse(calls[1].body).member,'sy');assert.ok(calls.every(c=>!c.url.includes('/auth/')&&c.referrerPolicy==='no-referrer'));
 assert.equal(store.login,undefined);assert.equal(store.changePassword,undefined);assert.equal(store.requestRecovery,undefined);
});
test('plain links and malformed fragments cannot request protected data; shared link rotation errors propagate',async()=>{
 let calls=0;const config={url:'https://test.supabase.co',key:'public-key'},page={hash:'',pathname:'/',search:''},history={replaceState(){}};
 const store=new LinkStore(async()=>{calls++;return Response.json({});},storage(),config,page,history);await assert.rejects(store.read(),e=>e.status===401);assert.equal(calls,0);
 const saved=storage();saved.setItem('workwith-shared-link','a'.repeat(43));const malformed=new LinkStore(()=>{calls++;},saved,config,{...page,hash:'#access=bad'},history);await assert.rejects(malformed.read(),e=>e.status===401);assert.equal(calls,0);
 const denied=new LinkStore(async()=>Response.json({error:'폐기된 링크'},{status:401}),storage(),config,{...page,hash:'#access='+'b'.repeat(43)},history);await assert.rejects(denied.read(),e=>e.status===401);
});
