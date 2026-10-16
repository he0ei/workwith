import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weekRange,shiftDay,weeklyCalendar,weekDays} from '../src/weekly-calendar.js';
test('weekly ranges use Sunday through Saturday across month/year/leap boundaries',()=>{
 assert.deepEqual(weekRange('2026-10-18'),{start:'2026-10-18',end:'2026-10-24'});
 assert.deepEqual(weekRange('2027-01-01'),{start:'2026-12-27',end:'2027-01-02'});
 assert.equal(shiftDay('2028-02-28',2),'2028-03-01');
 assert.equal(shiftDay('2026-12-28',7),'2027-01-04');
 assert.throws(()=>weekRange('2026-02-30'),/날짜/);
});
test('daily columns distinguish start, due and interval without inventing hours or repeating one-date tasks',()=>{
 const tasks=[{id:'span',title:'기획',start:'2026-10-12',due:'2026-10-14',priority:'보통'},{id:'due',title:'발송',start:'',due:'2026-10-16',priority:'높음'},{id:'single',title:'검토',start:'2026-10-16',due:'2026-10-16',priority:'보통'}];
 const days=weekDays({...weekRange('2026-10-16'),tasks},'2026-10-16');
 assert.equal(days.length,7);assert.equal(days[0].weekday,'일');assert.equal(days[5].isToday,true);assert.equal(days[0].isWeekend,true);assert.equal(days[6].isWeekend,true);
 assert.deepEqual(days[1].entries[0].labels,['시작']);assert.equal(days[2].entries.length,0);assert.deepEqual(days[3].entries[0].labels,['마감']);
 assert.deepEqual(days[5].entries.find(e=>e.task.id==='single').labels,['시작','마감']);
 assert.equal(days.flatMap(d=>d.entries).filter(e=>e.task.id==='due').length,1);assert.equal(days[6].entries.length,0);
});
test('this and next week include overlapping schedules and own collaboration without duplicates or data writes',()=>{
 const task=(id,fields={})=>({id,title:id,visibility:'shared',owner:'sj',assignee:'jh',collaborators:[],start:'',due:'',status:'예정',priority:'보통',...fields});
 const state={tasks:[task('span',{start:'2026-10-01',due:'2026-10-25'}),task('start',{start:'2026-10-14'}),task('due',{due:'2026-10-20'}),task('private',{visibility:'private',owner:'sy',assignee:'sy',due:'2026-10-16'}),task('collab',{assignee:'sy',collaborators:['jh'],due:'2026-10-19'}),task('other',{assignee:'sj',due:'2026-10-16'}),task('done',{status:'완료',due:'2026-10-16'}),task('late',{due:'2026-10-10'}),task('undated')]};
 const before=structuredClone(state),result=weeklyCalendar(state,'jh','2026-10-16','2026-10-16','jh');
 assert.deepEqual(result.current.tasks.map(t=>t.id),['done','span','start']);
 assert.deepEqual(result.next.tasks.map(t=>t.id),['collab','due','span']);
 assert.deepEqual(result.overdue.map(t=>t.id),['late']);assert.deepEqual(result.unscheduled.map(t=>t.id),['undated']);
 assert.deepEqual(state,before);
});

test('team calendar includes other shared schedules, filters equal participants and never exposes others private tasks',()=>{
 const base={start:'2026-10-12',due:'2026-10-15',status:'예정',visibility:'shared',owner:'sy',assignee:'sy',collaborators:[]};
 const state={tasks:[{...base,id:'shared',title:'팀 공유'}, {...base,id:'private',title:'다른 사람 개인',visibility:'private'}, {...base,id:'mine',title:'내 개인',visibility:'private',owner:'jh',assignee:'jh'}, {...base,id:'joint',title:'공동',collaborators:['jh']}]};
 assert.deepEqual(new Set(weeklyCalendar(state,'jh','2026-10-16').current.tasks.map(t=>t.id)),new Set(['shared','mine','joint']));
 assert.deepEqual(new Set(weeklyCalendar(state,'jh','2026-10-16','2026-10-16','sy').current.tasks.map(t=>t.id)),new Set(['shared','joint']));
 const moved={tasks:state.tasks.map(t=>t.id==='shared'?{...t,start:'2026-10-13'}:t)};assert.deepEqual(weeklyCalendar(state,'jh','2026-10-16').current.tasks.map(t=>t.id),weeklyCalendar(moved,'jh','2026-10-16').current.tasks.map(t=>t.id));
});

test('completed work stays on its dates in past weeks, respects visibility and is never overdue',()=>{
 const base={title:'완료 업무',visibility:'shared',owner:'sy',assignee:'sy',collaborators:['jh'],status:'완료',priority:'높음',start:'2026-10-05',due:'2026-10-07',completedAt:'2026-10-07'};
 const state={tasks:[{...base,id:'done'},{...base,id:'hidden',visibility:'private'},{...base,id:'mine',visibility:'private',owner:'jh',assignee:'jh'}]},before=structuredClone(state);
 const week=weeklyCalendar(state,'jh','2026-10-06','2026-10-16');
 assert.deepEqual(new Set(week.current.tasks.map(t=>t.id)),new Set(['done','mine']));
 assert.equal(weeklyCalendar(state,'jh','2026-10-16','2026-10-16').overdue.length,0);
 assert.deepEqual(weeklyCalendar(state,'jh','2026-10-06','2026-10-16','sy').current.tasks.map(t=>t.id),['done']);
 assert.deepEqual(state,before);
});
test('priority orders every calendar queue and paused work stays below even low-priority completed work',()=>{
 const task=(id,priority,status='진행 중')=>({id,title:id,priority,status,visibility:'shared',owner:'jh',assignee:'jh',start:'2026-10-12',due:'2026-10-14'});
 const input=[task('a-paused-high','높음','검토 요청'),task('b-low','낮음'),task('z-high','높음'),task('c-paused-low','낮음','보류 중'),task('y-normal','보통'),task('d-complete','낮음','완료')];
 const state={tasks:input},before=structuredClone(state),expected=['z-high','y-normal','b-low','d-complete','a-paused-high','c-paused-low'];
 assert.deepEqual(weeklyCalendar(state,'jh','2026-10-16').current.tasks.map(t=>t.id),expected);
 assert.deepEqual(weeklyCalendar({tasks:input.map(t=>({...t,start:'',due:''}))},'jh','2026-10-16').unscheduled.map(t=>t.id),expected);
 assert.deepEqual(weeklyCalendar(state,'jh','2026-10-23').overdue.map(t=>t.id),expected.filter(id=>id!=='d-complete'));
 const moved={tasks:input.map(t=>t.id==='z-high'?{...t,start:'2026-10-13',due:'2026-10-15'}:t)};
 assert.deepEqual(weeklyCalendar(moved,'jh','2026-10-16').current.tasks.map(t=>t.id),expected);assert.deepEqual(state,before);
});
test('today badge counts visible calendar intervals once, including completed work and excluding unscheduled or private team tasks',async()=>{
 const {calendarDayTasks}=await import('../src/weekly-calendar.js');
 const task=(id,start,due,extra={})=>({id,title:id,start,due,visibility:'shared',assignee:'sy',collaborators:[],priority:'보통',status:'진행 중',...extra});
 const state={tasks:[task('span','2026-10-14','2026-10-18'),task('today','2026-10-16','2026-10-16'),task('due-only','','2026-10-16'),task('start-only','2026-10-16',''),task('done','2026-10-15','2026-10-16',{status:'완료'}),task('private-mine','2026-10-16','2026-10-16',{visibility:'private',owner:'sj',assignee:'sj'}),task('private-other','2026-10-16','2026-10-16',{visibility:'private',owner:'sy'}),task('undated','',''),task('past','2026-10-14','2026-10-15'),task('future','2026-10-17','2026-10-18')]};
 assert.deepEqual(new Set(calendarDayTasks(state,'sj','2026-10-16').map(t=>t.id)),new Set(['span','today','due-only','start-only','done','private-mine']));
 assert.deepEqual(new Set(calendarDayTasks(state,'sj','2026-10-17').map(t=>t.id)),new Set(['span','future']));
});
