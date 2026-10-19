import {test} from 'node:test';
import assert from 'node:assert/strict';
import {start} from '../src/app.js';
import {DesignPreviewStore} from '../src/preview-store.js';
test('local file design preview loads no protected data, stops polling and rejects writes',async()=>{
 const nodes=new Map(['#app','#editor','#toast','#form-error','#sync-label','#login-error'].map(id=>[id,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}}]));
 const listeners={},windowListeners={},timers=[];
 globalThis.document={hidden:false,querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>listeners[name]=fn};globalThis.window={addEventListener:(name,fn)=>windowListeners[name]=fn};globalThis.location={protocol:'file:',search:''};
 globalThis.setTimeout=(fn,delay)=>{timers.push(delay);return 1;};globalThis.clearTimeout=()=>{};
 globalThis.sessionStorage={getItem(){throw Error('must not access session');}};globalThis.localStorage={getItem(){throw Error('must not access business data');}};
 globalThis.fetch=()=>{throw Error('must not request server');};
 const protectedStore={configured:()=>true,read:()=>{throw Error('must not read protected store');}};
 await start();await start(protectedStore);assert.match(nodes.get('#app').innerHTML,/칸반보드/);assert.ok(!nodes.get('#app').innerHTML.includes('data-nav="dashboard"'));assert.match(nodes.get('#app').innerHTML,/디자인 미리보기/);assert.ok(!nodes.get('#app').innerHTML.includes('공유 DB 연결'));assert.equal(timers.length,0);
 for(const view of ['collab','mine','calendar','projects','minutes','archive','settings'])await listeners.click({target:{closest:s=>s==='[data-nav]'?{dataset:{nav:view}}:null}});
 assert.match(nodes.get('#app').innerHTML,/디자인 미리보기/);listeners.visibilitychange();windowListeners.focus();assert.equal(timers.length,0);
 const store=new DesignPreviewStore();const a=await store.read();assert.equal(a.state.tasks.length,0);assert.equal(a.state.projects.length,0);await assert.rejects(store.change({type:'task.save'}),/저장하지 않습니다/);assert.deepEqual(await store.read(),a);
});

test('web login exposes no anonymous preview even when preview query is supplied',async()=>{
 const app={innerHTML:''};globalThis.document={querySelector:s=>s==='#app'?app:{addEventListener(){}},addEventListener(){}};globalThis.window={addEventListener(){}};globalThis.location={protocol:'https:',search:'?preview=1',hash:''};
 let reads=0;await start({configured:()=>true,read:async()=>{reads++;const err=Error('로그인이 필요합니다.');err.status=401;throw err;}});
 assert.equal(reads,1);assert.match(app.innerHTML,/워크스페이스 로그인/);assert.ok(!app.innerHTML.includes('data-action="preview"'));assert.ok(!app.innerHTML.includes('로그인 없이 대시보드 미리보기'));
});
