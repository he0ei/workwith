import {test} from 'node:test';import assert from 'node:assert/strict';import {start} from '../src/app.js';import {empty} from '../src/model.js';
test('shared-link UI has no login, password, settings or private-task choices; attribution is a display name',async()=>{
 const nodes=new Map(['#app','#editor','#toast','#form-error','#sync-label'].map(id=>[id,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}}])),events={};
 globalThis.document={hidden:false,querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>{const old=events[name];events[name]=old?e=>Promise.all([old(e),fn(e)]):fn;}};globalThis.window={addEventListener(){}};globalThis.location={protocol:'https:',hash:''};globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
 const store={linkAccess:true,member:'jh',setMember(v){this.member=v;},read:async()=>({state:empty(),versions:{},user:store.member})};await start(store);
 let html=nodes.get('#app').innerHTML;for(const text of ['로그인','로그아웃','비밀번호','data-nav="settings"'])assert.ok(!html.includes(text),text);assert.match(html,/작성 이름 \(본인 확인 없음\)/);
 await events.change({target:{id:'shared-member',value:'sy'}});assert.equal(store.member,'sy');
 await events.click({target:{closest:s=>s==='[data-action]'?{dataset:{action:'task',id:''}}:null}});html=nodes.get('#editor').innerHTML;assert.match(html,/data-shared-link="true"/);assert.match(html,/연결 프로젝트 \(선택\)/);assert.ok(!html.includes('나만 보기'));assert.ok(!html.includes('공개 범위'));
});
test('without a valid private link the web app shows an access notice and never a password form',async()=>{
 const app={innerHTML:''};globalThis.document={querySelector:s=>s==='#app'?app:null,addEventListener(){}};globalThis.window={addEventListener(){}};globalThis.location={protocol:'https:',hash:''};await start({linkAccess:true,read:async()=>{throw Error('팀의 비공개 접속 링크로 열어 주세요.');}});assert.match(app.innerHTML,/비공개 접속 링크/);assert.ok(!app.innerHTML.includes('<form'));assert.ok(!app.innerHTML.includes('password'));
});
test('public workspace errors offer retry without login, private-link or key instructions',async()=>{
 const nodes=new Map(['#app','#editor','#toast','#form-error','#sync-label'].map(id=>[id,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}}}])),events={};
 globalThis.document={hidden:false,querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>{const old=events[name];events[name]=old?e=>Promise.all([old(e),fn(e)]):fn;}};globalThis.window={addEventListener(){}};globalThis.location={protocol:'https:',hash:''};globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
 let fail=true;await start({linkAccess:true,publicAccess:true,read:async()=>{if(fail)throw Error('유효한 비공개 접속 링크가 필요합니다.');return {state:empty(),versions:{},user:'jh'};}});
 let html=nodes.get('#app').innerHTML;assert.match(html,/다시 연결/);for(const text of ['비공개','접속키','초대','로그인'])assert.ok(!html.includes(text));
 fail=false;await events.click({target:{closest:s=>s==='[data-action]'?{dataset:{action:'retry-workspace'}}:null}});
 html=nodes.get('#app').innerHTML;assert.match(html,/팀 캘린더/);assert.ok(!html.includes('다시 연결'));
});
test('a rejected login while working clears the session and reloads into the login screen',async()=>{
 const nodes=new Map(['#app','#editor','#toast','#form-error','#sync-label'].map(id=>[id,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}}])),events={};
 let reloads=0;globalThis.document={hidden:false,querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>{const old=events[name];events[name]=old?e=>Promise.all([old(e),fn(e)]):fn;}};globalThis.window={addEventListener(){},history:{replaceState(){}}};globalThis.location={protocol:'https:',hash:'',pathname:'/workwith/',search:'',reload(){reloads++;}};globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
 let cleared=0,rejected=false;const denied=()=>{const e=Error('세션이 만료되었거나 로그인 정보가 올바르지 않습니다.');e.status=401;return e;};
 const store={configured:()=>true,clearSession(){cleared++;},read:async()=>({state:empty(),versions:{},user:'jh',passwordChangeRequired:false}),version:async()=>{if(rejected)throw denied();return {revision:0};},change:async()=>{throw denied();}};
 await start(store);assert.match(nodes.get('#app').innerHTML,/팀 캘린더/);
 rejected=true;await events.visibilitychange();assert.equal(cleared,1);assert.equal(reloads,1);assert.ok(!nodes.get('#toast').textContent.includes('세션이 만료'));
});
test('a project-scoped member gets only the calendar, board and settings menus',async()=>{
 const nodes=new Map(['#app','#editor','#toast','#form-error','#sync-label'].map(id=>[id,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}}])),events={};
 globalThis.document={hidden:false,querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>{const old=events[name];events[name]=old?e=>Promise.all([old(e),fn(e)]):fn;}};globalThis.window={addEventListener(){},history:{replaceState(){}}};globalThis.location={protocol:'https:',hash:'',pathname:'/workwith/',search:''};globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
 const read=scope=>async()=>({state:empty(),versions:{},user:scope?'shpark':'jh',scope,passwordChangeRequired:false});
 await start({configured:()=>true,read:read('p-sanmo'),version:async()=>({revision:0})});
 let html=nodes.get('#app').innerHTML;for(const view of ['projects','minutes','archive'])assert.ok(!html.includes(`data-nav="${view}"`),view);for(const view of ['calendar','collab','settings'])assert.match(html,new RegExp(`data-nav="${view}"`));
 await events.click({target:{closest:s=>s==='[data-nav]'?{dataset:{nav:'minutes'}}:null}});assert.match(nodes.get('#app').innerHTML,/aria-current="page"[^>]*>[\s\S]*?팀 캘린더|data-nav="calendar"[^>]*aria-current="page"/);
 await start({configured:()=>true,read:read(null),version:async()=>({revision:0})});html=nodes.get('#app').innerHTML;for(const view of ['projects','minutes','archive'])assert.match(html,new RegExp(`data-nav="${view}"`));
});
