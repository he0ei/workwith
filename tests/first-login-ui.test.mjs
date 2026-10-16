import {test} from 'node:test';import assert from 'node:assert/strict';import {start} from '../src/app.js';import {empty} from '../src/model.js';
test('first login requires a password once, then opens calendar and never prompts on subsequent boot',async()=>{
 let pending=true,changes=0,schedules=0;
 const store={read:async()=>({state:empty(),versions:{},user:'sj',passwordChangeRequired:pending}),changePassword:async(old,next)=>{assert.equal(old,'temporary-test');assert.equal(next,'replacement-test');changes++;pending=false;}};
 const setup=()=>{
  const nodes=new Map(['#app','#editor','#toast','#login-error'].map(id=>[id,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},close(){this.open=false;},addEventListener(){}}]));const listeners={};
  globalThis.location={protocol:'https:',hash:''};globalThis.window={addEventListener(){}};
  globalThis.document={querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>{const old=listeners[name];listeners[name]=old?e=>Promise.all([old(e),fn(e)]):fn;}};
  globalThis.setTimeout=()=>{schedules++;return 1;};globalThis.clearTimeout=()=>{};
  globalThis.FormData=class{constructor(form){this.values=Object.entries(form.values);}[Symbol.iterator](){return this.values[Symbol.iterator]();}};
  return {nodes,listeners};
 };
 const a=setup();await start(store);assert.match(a.nodes.get('#app').innerHTML,/first-password-form/);assert.ok(!a.nodes.get('#app').innerHTML.includes('data-nav='));assert.equal(schedules,0);
 const submit=values=>a.listeners.submit({preventDefault(){},target:{id:'first-password-form',values,reset(){}}});
 await submit({currentPassword:'temporary-test',password:'replacement-test',confirmPassword:'wrong'});assert.equal(changes,0);assert.match(a.nodes.get('#login-error').textContent,/일致|일치/);
 await submit({currentPassword:'temporary-test',password:'replacement-test',confirmPassword:'replacement-test'});assert.equal(changes,1);assert.ok(!a.nodes.get('#app').innerHTML.includes('first-password-form'));assert.match(a.nodes.get('#app').innerHTML,/팀 캘린더/);assert.equal(schedules,1);
 const b=setup();await start(store);assert.ok(!b.nodes.get('#app').innerHTML.includes('first-password-form'));assert.match(b.nodes.get('#app').innerHTML,/팀 캘린더/);
});
