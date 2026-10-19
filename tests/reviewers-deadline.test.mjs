import {test} from 'node:test';
import assert from 'node:assert/strict';
import {change,validate,taskPeople,taskReviewers,participates} from '../src/model.js';
import {extendDeadline,taskSchedules,scheduleBars} from '../src/task-schedules.js';
import {weeklyCalendar,calendarDayTasks} from '../src/weekly-calendar.js';
import {monthWeeks} from '../src/monthly-calendar.js';
import {sample} from './fixtures.mjs';
import {mutate} from '../server/workspace.js';
import {postgres} from './postgres-helper.mjs';
const task=()=>({...sample().tasks[1],id:'review-task',kpiId:'',dependencies:[],owner:'jh',assignee:'jh',collaborators:['sy'],start:'2026-10-05',due:'2026-10-07'});
const state=t=>({...sample(),tasks:[t]});
test('reviewers are separate optional roles, validated and preserved through title/status/date changes',()=>{
 const old=task();assert.deepEqual(taskReviewers(old),[]);
 const saved=change(state(old),{type:'task.save',value:{...old,reviewers:['sj','ceo']}},'jh');
 assert.deepEqual(taskPeople(saved.tasks[0]),['sy','jh']);assert.deepEqual(taskReviewers(saved.tasks[0]),['ceo','sj']);assert.equal(participates(saved.tasks[0],'sj'),false);
 const edited=change(saved,{type:'task.save',value:{...old,title:'내용 수정'}},'jh');assert.deepEqual(edited.tasks[0].reviewers,['sj','ceo']);
 const done=change(edited,{type:'task.status',id:old.id,status:'완료'},'jh');assert.deepEqual(done.tasks[0].reviewers,['sj','ceo']);
 const cleared=change(edited,{type:'task.save',value:{...edited.tasks[0],reviewers:[]}},'jh');assert.deepEqual(cleared.tasks[0].reviewers,[]);
 for(const reviewers of [['outsider'],['sj','sj'],['jh'],['sy'],'sj'])assert.throws(()=>validate(state({...old,reviewers})),/검토자/);
});
test('backlog drag extends deadline, keeps original start and metadata, and does not create a period or task',()=>{
 const old={...task(),reviewers:['sj']},before=structuredClone(old),dates=extendDeadline(old,'2026-10-19');
 assert.deepEqual(dates,{due:'2026-10-19'});
 const saved=change(state(old),{type:'task.save',value:{...old,...dates},reason:'지난 미완료 업무 마감일 연장'},'jh'),next=saved.tasks[0];
 assert.equal(saved.tasks.length,1);assert.equal(next.start,'2026-10-05');assert.equal(next.due,'2026-10-19');assert.equal(next.scheduleSlots,undefined);assert.deepEqual(next.reviewers,['sj']);assert.deepEqual(next.collaborators,['sy']);assert.equal(next.projectId,old.projectId);assert.equal(next.status,old.status);
 assert.equal(calendarDayTasks(saved,'jh','2026-10-12').length,1);assert.equal(weeklyCalendar(saved,'jh','2026-10-19','2026-10-19').overdue.length,0);
 assert.equal(monthWeeks('2026-10',[next]).filter(w=>w.tasks.length).length,3);assert.deepEqual(old,before);
 assert.throws(()=>extendDeadline(old,'2026-10-07'),/이후/);assert.throws(()=>extendDeadline(old,'2026-10-06'),/이후/);assert.throws(()=>extendDeadline(old,'2026-02-30'),/날짜/);assert.throws(()=>extendDeadline({...old,status:'완료'},'2026-10-19'),/완료/);
 assert.throws(()=>change(state(old),{type:'task.save',value:{...old,...dates}},'jh'),/사유/);
});
test('legacy extra periods remain stored, but an extended interval draws once and counts once',()=>{
 const old={...task(),scheduleSlots:[{id:'legacy',start:'2026-10-12',due:'2026-10-14'}]},before=structuredClone(old);
 assert.throws(()=>extendDeadline(old,'2026-10-13'),/이후/);
 const next={...old,...extendDeadline(old,'2026-10-19')};
 assert.deepEqual(next.scheduleSlots,before.scheduleSlots);assert.equal(taskSchedules(next).length,1);
 assert.equal(scheduleBars(next,{start:'2026-10-11',end:'2026-10-17'}).length,1);assert.equal(calendarDayTasks(state(next),'jh','2026-10-12').length,1);
 assert.deepEqual(old,before);
});
test('reviewers and extended deadline survive SQL reload and stale concurrent saves are rejected',async()=>{
 const pg=await postgres();try{
  const old={...task(),reviewers:['sj']},seed=state(old);await pg.repository.commit(0,[...seed.projects.map(p=>({entity:'projects',id:p.id,payload:p})),{entity:'tasks',id:old.id,payload:old}],[]);
  let read=await pg.repository.load();const body={revision:read.state.revision,baseVersion:read.versions['tasks:'+old.id],action:{type:'task.save',value:{...old,...extendDeadline(old,'2026-10-19')},reason:'마감일 연장'}};
  await mutate(pg.repository,body,'jh');read=await pg.repository.load();const next=read.state.tasks[0];assert.equal(next.start,old.start);assert.equal(next.due,'2026-10-19');assert.deepEqual(next.reviewers,['sj']);assert.equal(next.scheduleSlots,undefined);
  await assert.rejects(mutate(pg.repository,body,'sy'),e=>e.status===409);
  await mutate(pg.repository,{revision:read.state.revision,baseVersion:read.versions['tasks:'+old.id],action:{type:'task.save',value:{...next,reviewers:['ceo']}}},'jh');assert.deepEqual((await pg.repository.load()).state.tasks[0].reviewers,['ceo']);
 }finally{await pg.close();}
});
