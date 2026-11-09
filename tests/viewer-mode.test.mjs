import {test} from 'node:test';
import assert from 'node:assert/strict';
import {start} from '../src/app.js';
import {ViewerStore} from '../src/viewer-store.js';
import {empty} from '../src/model.js';
const TOKEN='T'.repeat(43);

test('viewer store reads from its own link path and never writes',async()=>{
 const calls=[],store=new ViewerStore(async(url)=>{calls.push(url);return url.endsWith('api/state')?Response.json({state:{...empty(),projects:[{id:'p',title:'P'}]}}):new Response('PDF');},{pathname:`/v/${TOKEN}/`});
 const read=await store.read();assert.equal(read.user,'ceo');assert.equal(read.state.projects.length,1);assert.equal(store.preview,true);
 await store.downloadAttachment({bucket:'workwith-task-files',path:'a/b c.pdf'});
 assert.deepEqual(calls,[`/v/${TOKEN}/api/state`,`/v/${TOKEN}/api/file?bucket=workwith-task-files&path=a%2Fb%20c.pdf`]);
 await assert.rejects(store.change(),/읽기 전용/);
});

test('viewer mode shows the team screens without login, settings, create, edit or complete controls',async()=>{
 const nodes=new Map(['#app','#editor','#toast','#form-error','#sync-label'].map(id=>[id,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}}])),events={};
 globalThis.document={hidden:false,querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>{const old=events[name];events[name]=old?e=>Promise.all([old(e),fn(e)]):fn;}};globalThis.window={addEventListener(){},history:{replaceState(){}}};globalThis.location={protocol:'https:',hash:'',pathname:`/v/${TOKEN}/`,search:''};globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 const state={...empty(),projects:[{id:'p',title:'SANMO.AE',goal:'',owner:'sj',start:'',due:''}],tasks:[{id:'t',title:'보이는 업무',note:'',owner:'sj',assignee:'sj',visibility:'shared',projectId:'p',status:'진행 중',priority:'보통',start:today,due:today,hours:0,completedAt:'',url:'',kpiId:'',dependencies:[]}],minutes:[{id:'m',title:'주간 회의',body:'원문',author:'sj',at:today+'T00:00:00Z',projectId:'p'}]};
 await start({preview:true,viewer:true,configured:()=>true,read:async()=>({state,versions:{},user:'ceo',passwordChangeRequired:false})});
 let html=nodes.get('#app').innerHTML;
 assert.match(html,/팀 캘린더/);assert.match(html,/보이는 업무/);assert.match(html,/읽기 전용/);
 for(const text of ['로그인','로그아웃','data-nav="settings"','＋ 새 업무','data-action="task-complete"','data-action="calendar-edit"','goto-settings'])assert.ok(!html.includes(text),text);
 for(const view of ['collab','projects','minutes','archive'])assert.match(html,new RegExp(`data-nav="${view}"`));
 await events.click({target:{closest:s=>s==='[data-nav]'?{dataset:{nav:'minutes'}}:null}});html=nodes.get('#app').innerHTML;
 assert.ok(!html.includes('id="minutes-form"'));assert.match(html,/meeting-archive" open/);assert.match(html,/주간 회의/);
 await events.click({target:{closest:s=>s==='[data-nav]'?{dataset:{nav:'projects'}}:null}});assert.ok(!nodes.get('#app').innerHTML.includes('＋ 프로젝트'));
 await events.click({target:{closest:s=>s==='[data-nav]'?{dataset:{nav:'collab'}}:null}});html=nodes.get('#app').innerHTML;assert.match(html,/data-status="t" disabled/);assert.ok(!html.includes('draggable="true"'));
 await events.click({target:{closest:s=>s==='[data-action]'?{dataset:{action:'task',id:'t'}}:null}});const dialog=nodes.get('#editor').innerHTML;assert.match(dialog,/보기 모드/);assert.ok(!dialog.includes('<form'));assert.ok(!dialog.includes('calendar-edit-task'));
 for(const action of ['project','artifact','kpi','minutes-edit','task-delete','calendar-edit-task']){nodes.get('#editor').innerHTML='';await events.click({target:{closest:s=>s==='[data-action]'?{dataset:{action,id:'t'}}:null}});assert.ok(!nodes.get('#editor').innerHTML.includes('<form'),action);}

});
