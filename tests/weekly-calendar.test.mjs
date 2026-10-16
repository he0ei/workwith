import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weekRange,shiftDay,weeklyCalendar,weekDays} from '../src/weekly-calendar.js';
test('weekly ranges use Monday through Sunday across month/year/leap boundaries',()=>{
 assert.deepEqual(weekRange('2026-10-18'),{start:'2026-10-12',end:'2026-10-18'});
 assert.deepEqual(weekRange('2027-01-01'),{start:'2026-12-28',end:'2027-01-03'});
 assert.equal(shiftDay('2028-02-28',2),'2028-03-01');
 assert.equal(shiftDay('2026-12-28',7),'2027-01-04');
 assert.throws(()=>weekRange('2026-02-30'),/날짜/);
});
test('daily columns distinguish start, due and interval without inventing hours or repeating one-date tasks',()=>{
 const tasks=[{id:'span',title:'기획',start:'2026-10-12',due:'2026-10-14',priority:'보통'},{id:'due',title:'발송',start:'',due:'2026-10-16',priority:'높음'},{id:'single',title:'검토',start:'2026-10-16',due:'2026-10-16',priority:'보통'}];
 const days=weekDays({...weekRange('2026-10-16'),tasks},'2026-10-16');
 assert.equal(days.length,7);assert.equal(days[0].weekday,'월');assert.equal(days[4].isToday,true);assert.equal(days[6].isWeekend,true);
 assert.deepEqual(days[0].entries[0].labels,['계획']);assert.deepEqual(days[1].entries[0].labels,['진행 기간']);assert.deepEqual(days[2].entries[0].labels,['마감']);
 assert.deepEqual(days[4].entries.find(e=>e.task.id==='single').labels,['계획','마감']);
 assert.equal(days.flatMap(d=>d.entries).filter(e=>e.task.id==='due').length,1);assert.equal(days[5].entries.length,0);
});
test('this and next week include overlapping schedules and own collaboration without duplicates or data writes',()=>{
 const task=(id,fields={})=>({id,title:id,visibility:'shared',owner:'sj',assignee:'jh',collaborators:[],start:'',due:'',status:'예정',priority:'보통',...fields});
 const state={tasks:[task('span',{start:'2026-10-01',due:'2026-10-25'}),task('start',{start:'2026-10-14'}),task('due',{due:'2026-10-20'}),task('private',{visibility:'private',owner:'sy',assignee:'sy',due:'2026-10-16'}),task('collab',{assignee:'sy',collaborators:['jh'],due:'2026-10-19'}),task('other',{assignee:'sj',due:'2026-10-16'}),task('done',{status:'완료',due:'2026-10-16'}),task('late',{due:'2026-10-11'}),task('undated')]};
 const before=structuredClone(state),result=weeklyCalendar(state,'jh','2026-10-16','2026-10-16');
 assert.deepEqual(result.current.tasks.map(t=>t.id),['span','start']);
 assert.deepEqual(result.next.tasks.map(t=>t.id),['span','collab','due']);
 assert.deepEqual(result.overdue.map(t=>t.id),['late']);assert.deepEqual(result.unscheduled.map(t=>t.id),['undated']);
 assert.deepEqual(state,before);
});
