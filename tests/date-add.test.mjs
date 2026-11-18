import {test} from 'node:test';
import assert from 'node:assert/strict';
import {start} from '../src/app.js';
import {empty} from '../src/model.js';

function harness(){
 const nodes=new Map(['#app','#editor','#toast','#form-error','#sync-label'].map(id=>[id,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}}])),events={};
 globalThis.document={hidden:false,querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>{const old=events[name];events[name]=old?e=>Promise.all([old(e),fn(e)]):fn;}};globalThis.window={addEventListener(){},history:{replaceState(){}}};globalThis.location={protocol:'https:',hash:'',pathname:'/workwith/',search:''};globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
 const click=(action,id)=>events.click({target:{closest:s=>s==='[data-action]'?{dataset:{action,id}}:null}});
 return {nodes,events,click};
}
const state={...empty(),projects:[{id:'p-sanmo',title:'SANMO.AE',goal:'',owner:'sj',start:'',due:''},{id:'p-other',title:'MYMAM',goal:'',owner:'sj',start:'',due:''}]};

test('month dates are add buttons that open a new task on that date',async()=>{
 const {nodes,click}=harness();
 await start({configured:()=>true,read:async()=>({state,versions:{},user:'jh',passwordChangeRequired:false}),version:async()=>({revision:0})});
 await click('calendar-tab','month');const html=nodes.get('#app').innerHTML;
 assert.match(html,/data-action="task-on-date" data-id="\d{4}-\d{2}-\d{2}" role="button" tabindex="0"/);assert.match(html,/＋ 이 날 업무 추가/);
 await click('task-on-date','2026-11-20');const editor=nodes.get('#editor');
 assert.equal(editor.open,true);assert.match(editor.innerHTML,/새 업무/);assert.match(editor.innerHTML,/name="start"[^>]*value="2026-11-20"|value="2026-11-20"[^>]*name="start"/);assert.match(editor.innerHTML,/name="due"[^>]*value="2026-11-20"|value="2026-11-20"[^>]*name="due"/);
 editor.close();editor.innerHTML='';await click('task-on-date','not-a-date');assert.equal(editor.open,false);
});

test('a project-scoped member starts new tasks in their project; the viewer cannot start one',async()=>{
 let h=harness();
 await start({configured:()=>true,read:async()=>({state,versions:{},user:'shpark',scope:'p-sanmo',passwordChangeRequired:false}),version:async()=>({revision:0})});
 await h.click('task-on-date','2026-11-20');assert.match(h.nodes.get('#editor').innerHTML,/<option value="p-sanmo" selected/);
 h=harness();
 await start({preview:true,viewer:true,configured:()=>true,read:async()=>({state,versions:{},user:'ceo',passwordChangeRequired:false})});
 await h.click('task-on-date','2026-11-20');assert.equal(h.nodes.get('#editor').open,false);
});
