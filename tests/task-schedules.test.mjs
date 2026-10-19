import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskSchedules,continueSchedule,scheduleBars,scheduleSnapshot,scheduleValue} from '../src/task-schedules.js';
import {weeklyCalendar,calendarDayTasks} from '../src/weekly-calendar.js';
import {monthWeeks} from '../src/monthly-calendar.js';
import {adjustSchedule} from '../src/schedule-bars.js';
import {change,validate} from '../src/model.js';
import {sample} from './fixtures.mjs';
import {mutate} from '../server/workspace.js';
const task=()=>({...sample().tasks[1],id:'continue',kpiId:'',dependencies:[],start:'2026-10-05',due:'2026-10-07'});
const state=t=>({...sample(),tasks:[t]});
test('carryover adds a separate period to the same task without filling the intervening gap',()=>{
 const old=task(),next={...old,...continueSchedule(old,'2026-10-19','slot-1')};
 assert.equal(next.start,old.start);assert.equal(next.due,old.due);assert.equal(next.status,old.status);
 assert.equal(weeklyCalendar(state(next),'jh','2026-10-06').current.tasks.length,1);
 assert.equal(weeklyCalendar(state(next),'jh','2026-10-19').current.tasks.length,1);
 assert.equal(weeklyCalendar(state(next),'jh','2026-10-12').current.tasks.length,0);
 assert.equal(calendarDayTasks(state(next),'jh','2026-10-19').length,1);
 assert.equal(calendarDayTasks(state(next),'jh','2026-10-10').length,0);
 assert.equal(weeklyCalendar(state(next),'jh','2026-10-19','2026-10-19').overdue.length,0);
 assert.equal(weeklyCalendar(state(next),'jh','2026-10-26','2026-10-26').overdue.length,1);
 assert.equal(monthWeeks('2026-10',[next]).filter(w=>w.tasks.length).length,2);
 assert.throws(()=>continueSchedule(next,'2026-10-19','repeat'),/이미/);
 assert.throws(()=>continueSchedule({...next,status:'완료'},'2026-10-20','done'),/완료/);
});
test('move and resize a continuation independently; primary period and other periods remain untouched',()=>{
 const original={...task(),scheduleSlots:[{id:'a',start:'2026-10-19',due:'2026-10-19'},{id:'b',start:'2026-10-26',due:'2026-10-27'}]},before=structuredClone(original);
 const snapshot=scheduleSnapshot(original,'a');
 const resized=scheduleValue(snapshot,adjustSchedule(snapshot.task,'due',3));
 assert.deepEqual(resized.scheduleSlots[0],{id:'a',start:'2026-10-19',due:'2026-10-22'});
 assert.equal(resized.start,original.start);assert.equal(resized.due,original.due);assert.deepEqual(resized.scheduleSlots[1],original.scheduleSlots[1]);
 const moved=scheduleValue(scheduleSnapshot(resized,'a'),{start:'2026-10-20',due:'2026-10-23'});
 assert.equal(scheduleBars(moved,{start:'2026-10-18',end:'2026-10-24'})[0]._scheduleId,'a');
 assert.equal(scheduleSnapshot(original,'deleted'),null);assert.deepEqual(original,before);
 const primary=scheduleValue(scheduleSnapshot(original),{start:'2026-10-04',due:'2026-10-06'});assert.deepEqual(primary.scheduleSlots,original.scheduleSlots);
});
test('overlapping periods count a task once; completion remains visible in every scheduled week',()=>{
 const t={...task(),scheduleSlots:[{id:'a',start:'2026-10-06',due:'2026-10-08'}],status:'완료',completedAt:'2026-10-08'};
 assert.equal(calendarDayTasks(state(t),'jh','2026-10-06').length,1);
 assert.equal(weeklyCalendar(state(t),'jh','2026-10-06').current.tasks.length,1);
 assert.equal(weeklyCalendar(state(t),'jh','2026-10-19').overdue.length,0);
});
test('server model preserves additional periods through normal edits and status changes, and rejects malformed schedules',()=>{
 const old=task(),s=state(old),value={...old,...continueSchedule(old,'2026-10-19','a')};
 assert.throws(()=>change(s,{type:'task.save',value},'jh'),/사유/);
 const saved=change(s,{type:'task.save',value,reason:'이어서 진행'},'jh');
 const edited=change(saved,{type:'task.save',value:{...old,title:'제목 수정'}},'jh');
 assert.deepEqual(edited.tasks[0].scheduleSlots,value.scheduleSlots);
 const done=change(edited,{type:'task.status',id:old.id,status:'완료'},'jh');assert.deepEqual(done.tasks[0].scheduleSlots,value.scheduleSlots);
 for(const slots of [[{id:'a',start:'2026-02-30',due:'2026-03-01'}],[{id:'a',start:'2026-10-20',due:'2026-10-19'}],[{id:'',start:'2026-10-19',due:'2026-10-19'}],[...value.scheduleSlots,...value.scheduleSlots],Array.from({length:105},(_,i)=>({id:String(i),start:'2026-10-19',due:'2026-10-19'}))])assert.throws(()=>validate(state({...old,scheduleSlots:slots})),/추가 진행/);
});
test('shared save persists one task and rejects a stale concurrent continuation instead of overwriting it',async()=>{
 const old=task();let current={state:state(old),versions:{'tasks:continue':1}};
 const repository={load:async()=>structuredClone(current),commit:async(revision,upserts)=>{if(revision!==current.state.revision)return false;for(const u of upserts){const i=current.state[u.entity].findIndex(x=>x.id===u.id);if(i<0)current.state[u.entity].push(u.payload);else current.state[u.entity][i]=u.payload;current.versions[u.entity+':'+u.id]=(current.versions[u.entity+':'+u.id]||0)+1;}current.state.revision++;return true;}};
 const body={revision:current.state.revision,baseVersion:1,action:{type:'task.save',value:{...old,...continueSchedule(old,'2026-10-19','a')},reason:'추가 진행'}};
 const saved=await mutate(repository,body,'jh',{sharedAccess:true});
 assert.equal(saved.state.tasks.length,1);assert.equal(saved.state.tasks[0].start,'2026-10-05');assert.equal(saved.state.tasks[0].scheduleSlots[0].start,'2026-10-19');
 const reloaded=JSON.parse(JSON.stringify(await repository.load()));assert.equal(reloaded.state.tasks[0].scheduleSlots.length,1);
 await assert.rejects(mutate(repository,body,'sy',{sharedAccess:true}),e=>e.status===409);
 assert.equal(current.state.tasks[0].scheduleSlots.length,1);
});
test('additional periods survive PostgreSQL reload and subsequent title/status edits',async()=>{
 const {postgres}=await import('./postgres-helper.mjs'),pg=await postgres();
 try{
  const old=task(),seed=state(old);await pg.repository.commit(0,[...seed.projects.map(p=>({entity:'projects',id:p.id,payload:p})),{entity:'tasks',id:old.id,payload:old}],[]);
  let read=await pg.repository.load();
  const save=async(value,reason)=>{const result=await mutate(pg.repository,{revision:read.state.revision,baseVersion:read.versions['tasks:'+old.id],action:{type:'task.save',value,reason}},'jh');read=await pg.repository.load();return result;};
  await save({...old,...continueSchedule(old,'2026-10-19','persisted')},'기존 일정 유지');
  await save({...old,title:'후속 편집'});
  const saved=read.state.tasks[0];assert.equal(saved.start,old.start);assert.equal(saved.due,old.due);assert.deepEqual(saved.scheduleSlots,[{id:'persisted',start:'2026-10-19',due:'2026-10-19'}]);
  await mutate(pg.repository,{revision:read.state.revision,baseVersion:read.versions['tasks:'+old.id],action:{type:'task.status',id:old.id,status:'완료'}},'jh');
  assert.equal((await pg.repository.load()).state.tasks[0].scheduleSlots[0].id,'persisted');
 }finally{await pg.close();}
});
