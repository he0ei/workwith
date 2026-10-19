import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workSummary,canAdjustCalendar} from '../src/work-week.js';
import {weeklyCalendar} from '../src/weekly-calendar.js';
test('three weeks cover Sunday through Saturday, overlap once per week, retain completion and old schedule slots',()=>{
 const task=(id,extra)=>({id,title:id,visibility:'shared',owner:'jh',assignee:'jh',priority:'보통',status:'진행 중',...extra});
 const state={tasks:[task('done',{start:'2026-12-20',due:'2026-12-22',status:'완료'}),task('span',{start:'2026-12-26',due:'2027-01-04'}),task('slots',{start:'2026-12-20',due:'2026-12-20',scheduleSlots:[{id:'more',start:'2027-01-03',due:'2027-01-04'}]}),task('unscheduled',{})]},before=structuredClone(state);
 const weeks=weeklyCalendar(state,'jh','2027-01-01');
 assert.deepEqual([weeks.previous.start,weeks.current.start,weeks.next.start],['2026-12-20','2026-12-27','2027-01-03']);
 assert.deepEqual(new Set(weeks.previous.tasks.map(t=>t.id)),new Set(['done','span','slots']));assert.deepEqual(weeks.current.tasks.map(t=>t.id),['span']);assert.deepEqual(new Set(weeks.next.tasks.map(t=>t.id)),new Set(['span','slots']));assert.deepEqual(state,before);
});
test('description previews use saved notes or latest linked meeting, preserve source data, and never invent detail',()=>{
 const minutes=[{projectId:'p',id:'a',meetingDate:'2026-10-01',body:'첫 기록',taskIds:['t']},{projectId:'p',id:'b',meetingDate:'2026-10-08',body:'최근 기록\n다음 단계',taskIds:['t']},{projectId:'p',id:'c',meetingDate:'2026-10-10',body:'다른 업무 기록',taskIds:['other']}];
 const task={id:'t',note:'',projectId:'p',visibility:'shared'},before=structuredClone(minutes);assert.equal(workSummary(task,minutes),'최근 기록 다음 단계');assert.equal(workSummary({...task,note:'직접 작성한 설명'},minutes),'직접 작성한 설명');assert.equal(workSummary({id:'other2',note:''},minutes),'');assert.equal(workSummary({...task,note:'회의록 검토 후 등록\n출처: 후속 업무\n실행 내용'},minutes),'실행 내용');assert.equal(workSummary({...task,note:'가'.repeat(250)},minutes).length,181);assert.deepEqual(minutes,before);
});
test('viewer mode and every touch or pen gesture are blocked; editing allows desktop pointer and keyboard only',()=>{
 const ready={editing:true,preview:false,busy:false,syncing:false,dialogOpen:false,view:'calendar'};
 assert.equal(canAdjustCalendar(ready,{pointerType:'mouse'}),true);assert.equal(canAdjustCalendar(ready,{key:'ArrowRight'}),true);
 for(const pointerType of ['touch','pen'])assert.equal(canAdjustCalendar(ready,{pointerType}),false);
 for(const patch of [{editing:false},{preview:true},{busy:true},{syncing:true},{dialogOpen:true},{view:'projects'}])assert.equal(canAdjustCalendar({...ready,...patch},{pointerType:'mouse'}),false);
});
