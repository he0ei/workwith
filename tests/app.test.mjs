import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {localDB} from '../scripts/local-db.mjs';
import worker from '../worker/index.js';
import {digest} from '../worker/auth.js';
import {sample} from './fixtures.mjs';

test('shared UI uses authenticated API, preserves editing and never stores business data locally',async t=>{
 const nodes=new Map(['#app','#editor','#toast','#form-error','#sync-label','#login-error'].map(id=>[id,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}}]));
 const listeners={},windowListeners={},timers=new Map();let timerId=0;const d=localDB();d.sqlite.exec(await readFile(new URL('../migrations/0001_shared.sql',import.meta.url),'utf8'));
 const token='a'.repeat(64);await d.prepare('INSERT INTO users VALUES(?,?,?)').bind('sj','salt','hash').run();await d.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await digest(token),'sj',Date.now()+60000).run();
 const data=new Map([['workwith-session',token]]);globalThis.sessionStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 globalThis.localStorage={getItem(){throw Error('local business storage prohibited');},setItem(){throw Error('local business storage prohibited');}};
 globalThis.document={hidden:false,querySelector:s=>nodes.get(s),addEventListener:(name,fn)=>listeners[name]=fn};
 globalThis.window={addEventListener:(name,fn)=>windowListeners[name]=fn};globalThis.location={protocol:'http:'};
 globalThis.setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;};globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.fetch=(url,options)=>worker.fetch(new Request('https://workwith.example'+url,options),{DB:d});
 globalThis.confirm=()=>true;
 globalThis.FormData=class{constructor(form){this.entries=Object.entries(form.values||{});}get(k){return this.entries.find(([key])=>key===k)?.[1]??null;}getAll(k){return this.entries.filter(([key])=>key===k).map(([,v])=>v);}has(k){return this.entries.some(([key])=>key===k);}[Symbol.iterator](){return this.entries[Symbol.iterator]();}};
 const click=(attr,value,id='')=>listeners.click({target:{closest:selector=>selector===`[${attr}]`?{dataset:{[{'data-nav':'nav','data-action':'action','data-filter':'filter'}[attr]]:value,id}}:null}});
 const submit=(kind,values,id)=>listeners.submit({preventDefault(){},target:{id:'edit-form',dataset:{kind,id},values}});
 const read=()=>d.sqlite.prepare('SELECT entity,payload FROM records').all();
 const item=(entity,id)=>JSON.parse(read().find(x=>x.entity===entity&&JSON.parse(x.payload).id===id).payload);
 await import('../src/app.js');
 await t.test('empty dashboard shows real login user and shared status',()=>{assert.match(nodes.get('#app').innerHTML,/공유 DB 연결/);assert.ok(!nodes.get('#app').innerHTML.includes('시연 사용자'));assert.ok([...timers.values()].some(x=>x.delay===30000));});
 await t.test('project and private task save to SQL, not localStorage',async()=>{
  await click('data-action','project');await submit('project',{title:'test project',owner:'sj',start:'',due:'',goal:'goal'},'p');assert.equal(item('projects','p').title,'test project');
  await click('data-action','task-private');await submit('task',{title:'private UI',visibility:'private',assignee:'sy',projectId:'p',status:'예정',priority:'높음',start:'',due:'',hours:'1',kpiId:'',url:'',note:'private'},'t');assert.equal(item('tasks','t').assignee,'sj');assert.equal(item('tasks','t').projectId,'');
 });
 await t.test('all views render; KPI and artifacts are saved via authenticated API',async()=>{
  for(const name of ['collab','mine','calendar','projects','minutes','archive','settings','dashboard']){await click('data-nav',name);assert.match(nodes.get('#app').innerHTML,/<main>/);}
  await click('data-action','kpi','p');await submit('kpi',{title:'KPI',projectId:'p',target:'10',current:'4',unit:'건',method:'increase'},'k');
  await click('data-action','artifact','p');await submit('artifact',{title:'result',projectId:'p',url:'https://example.com'},'a');
  await click('data-action','project-open','p');assert.match(nodes.get('#app').innerHTML,/value="40"/);assert.match(nodes.get('#app').innerHTML,/result/);
 });
 await t.test('poll refresh keeps open editor and stale save is rejected without overwriting input',async()=>{
  await click('data-action','task','t');const html=nodes.get('#editor').innerHTML;
  const current=item('tasks','t');current.title='other update';const revision=d.sqlite.prepare('SELECT revision FROM workspace').get().revision;
  await worker.fetch(new Request('https://workwith.example/api/change',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:{type:'task.save',value:current},revision,baseVersion:d.sqlite.prepare("SELECT version FROM records WHERE entity='tasks' AND id='t'").get().version})}),{DB:d});
  const polling=[...timers.values()].find(x=>x.delay===30000);await polling.fn();assert.equal(nodes.get('#editor').open,true);assert.equal(nodes.get('#editor').innerHTML,html);
  await submit('task',{...current,title:'unsaved input',hours:'1'},'t');assert.match(nodes.get('#form-error').textContent,/다른 사람이 먼저 수정/);assert.equal(item('tasks','t').title,'other update');assert.equal(nodes.get('#editor').open,true);
 });
 await t.test('hidden tabs cancel polling and visibility refresh does not close editor',async()=>{document.hidden=true;listeners.visibilitychange();assert.ok(![...timers.values()].some(x=>x.delay===30000));document.hidden=false;listeners.visibilitychange();assert.ok([...timers.values()].some(x=>x.delay===30000));assert.equal(nodes.get('#editor').open,true);await click('data-action','close');});
 await t.test('meeting draft review registers tasks and minutes in one transaction',async()=>{
  await click('data-nav','minutes');await listeners.submit({preventDefault(){},target:{id:'minutes-form',values:{title:'meeting',projectId:'p',body:'meeting task | | | 보통'}}});assert.match(nodes.get('#app').innerHTML,/담당자 확인 필요/);
  await listeners.submit({preventDefault(){},target:{id:'draft-form',values:{'title-0':'reviewed task','assignee-0':'jh','due-0':'','priority-0':'보통','kpi-0':'','target-0':'','unit-0':'','include-0':'on',acknowledged:'on'}}});assert.ok(read().some(x=>x.entity==='tasks'&&JSON.parse(x.payload).title==='reviewed task'));assert.ok(read().some(x=>x.entity==='minutes'));
 });
 await t.test('settings labels reflect D1 and no demo data controls',async()=>{await click('data-nav','settings');const html=nodes.get('#app').innerHTML;assert.match(html,/Cloudflare D1 공유/);for(const label of ['전체 시연 데이터 백업','시연 데이터 준비','JSON 내보내기','예시 데이터 불러오기'])assert.ok(!html.includes(label));});
 d.sqlite.close();
});
