import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weekRange,shiftDay,weeklyCalendar} from '../src/weekly-calendar.js';
test('weekly ranges use Monday through Sunday across month/year/leap boundaries',()=>{
 assert.deepEqual(weekRange('2026-10-18'),{start:'2026-10-12',end:'2026-10-18'});
 assert.deepEqual(weekRange('2027-01-01'),{start:'2026-12-28',end:'2027-01-03'});
 assert.equal(shiftDay('2028-02-28',2),'2028-03-01');
 assert.equal(shiftDay('2026-12-28',7),'2027-01-04');
 assert.throws(()=>weekRange('2026-02-30'),/날짜/);
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
