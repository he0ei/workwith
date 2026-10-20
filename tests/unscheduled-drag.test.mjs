import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dropDate,weekDropDate,installUnscheduledDrag} from '../src/unscheduled-drag.js';
function setup({weekStart='',now='2026-10-20'}={}){
 const listeners={},saves=[],errors=[],snapshot={task:{id:'t',start:'',due:'',status:'검토 요청',projectId:'p',visibility:'shared',collaborators:['sy']},base:{revision:3,versions:{'tasks:t':2}}};let enabled=true,fail=false;
 const source={dataset:{planTask:'t'},classList:{add(){},remove(){}}},header={classList:{add(){},remove(){}}};
 const board={classList:header.classList,dataset:weekStart?{weekDrop:weekStart}:{weekTimeline:'2026-10-11'},getBoundingClientRect:()=>({left:100,right:800,width:700}),querySelector:()=>header};
 let hit=true;const control=installUnscheduledDrag({addEventListener:(name,fn)=>listeners[name]=fn,elementFromPoint:()=>({closest:()=>hit?board:null})},{capture:()=>structuredClone(snapshot),canStart:()=>enabled,now:()=>now,save:async(...a)=>{saves.push(a);if(fail)throw Error('다른 사람이 먼저 수정');},error:e=>errors.push(e.message),announce(){}});
 const begin=()=>listeners.pointerdown({target:{closest:s=>s==='[data-plan-task]'?source:null},button:0,pointerId:1,clientX:100,clientY:100});
 const over=x=>listeners.pointermove({clientX:x,clientY:100,pointerId:1,cancelable:true,preventDefault(){}});
 const drop=(x=350,valid=true)=>{hit=valid;return listeners.pointerup({clientX:x,clientY:100,pointerId:1});};
 return{listeners,saves,errors,snapshot,board,control,begin,over,drop,disable:()=>enabled=false,fail:()=>fail=true};
}
test('drop position selects Sunday through Saturday including scrolled board bounds',()=>{
 const {board}=setup();assert.equal(dropDate(board,100),'2026-10-11');assert.equal(dropDate(board,799),'2026-10-17');assert.equal(dropDate(board,99),'');assert.equal(dropDate(board,800),'');
});
test('assign an unscheduled card once on drop with captured version and preserve its other fields',async()=>{
 const x=setup();x.begin();x.over(350);assert.equal(x.saves.length,0);x.snapshot.base.revision=9;await x.drop();await x.drop();assert.equal(x.saves.length,1);const [snap,dates,reason]=x.saves[0];assert.equal(snap.base.revision,3);assert.deepEqual(dates,{start:'2026-10-13',due:'2026-10-13'});assert.equal(snap.task.status,'검토 요청');assert.equal(snap.task.projectId,'p');assert.deepEqual(snap.task.collaborators,['sy']);assert.match(reason,/일정 미지정 업무 배정/);assert.equal(x.control.isDragging(),false);
});
test('external drops, cancellation, outside drop, dated cards and read-only state never save',async()=>{
 const x=setup();await x.drop();x.begin();x.listeners.pointercancel();await x.drop();x.begin();x.over(350);await x.drop(350,false);x.begin();x.over(350);x.listeners.keydown({key:'Escape',preventDefault(){}});await x.drop();x.disable();x.begin();await x.drop();assert.equal(x.saves.length,0);
 const y=setup();y.snapshot.task.start='2026-10-11';y.begin();y.over(350);await y.drop();assert.equal(y.saves.length,0);
});
test('assignment conflicts surface without leaving dragging state active',async()=>{
 const x=setup();x.fail();x.begin();x.over(350);await x.drop();assert.deepEqual(x.errors,['다른 사람이 먼저 수정']);assert.equal(x.control.isDragging(),false);
});
test('carryover pointer drop extends only the deadline and keeps start/status/project with captured version',async()=>{
 const x=setup();x.snapshot.task.start='2026-10-01';x.snapshot.task.due='2026-10-02';
 // Reuse the same pointer source, marking this scheduled card as a continuation.
 const original=x.listeners.pointerdown;let source;
 const event={target:{closest:s=>s==='[data-plan-task]'?source:null},button:0,pointerId:1,clientX:100,clientY:100};
 source={dataset:{planTask:'t',continueTask:'true'},classList:{add(){},remove(){}}};original(event);x.over(350);await x.drop();
 assert.equal(x.saves.length,1);const [snap,dates,reason,mode]=x.saves[0];assert.equal(mode,'extend');assert.match(reason,/마감일 연장/);
 assert.equal(snap.task.start,'2026-10-01');assert.equal(snap.task.due,'2026-10-02');assert.equal(snap.task.projectId,'p');assert.equal(snap.task.status,'검토 요청');assert.equal(snap.base.revision,3);
 assert.equal(dates.start,undefined);assert.equal(dates.due,'2026-10-13');assert.equal(dates.scheduleSlots,undefined);
 let suppressed=false;x.listeners.click({target:{closest:()=>source},preventDefault(){suppressed=true;},stopImmediatePropagation(){}});assert.equal(suppressed,true);
});

test('weekly drop chooses today within the actual current week, or Sunday for other ranges',()=>{
 assert.equal(weekDropDate('2026-10-18','2026-10-20'),'2026-10-20');assert.equal(weekDropDate('2026-10-18','2026-10-24'),'2026-10-24');
 assert.equal(weekDropDate('2026-10-11','2026-10-20'),'2026-10-11');assert.equal(weekDropDate('2026-10-25','2026-10-20'),'2026-10-25');
 assert.equal(weekDropDate('2026-12-27','2027-01-01'),'2027-01-01');assert.equal(weekDropDate('2028-02-27','2028-02-29'),'2028-02-29');
 for(const value of ['','bad','2026-02-30','2026-10-19'])assert.equal(weekDropDate(value,'2026-10-20'),'');
});
test('weekly column drops assign one existing task once, independently of horizontal day position',async()=>{
 for(const x of [110,799]){const t=setup({weekStart:'2026-10-18'});t.begin();t.over(x);await t.drop(x);await t.drop(x);assert.equal(t.saves.length,1);const [snapshot,dates]=t.saves[0];assert.deepEqual(dates,{start:'2026-10-20',due:'2026-10-20'});assert.equal(snapshot.task.id,'t');assert.equal(snapshot.task.projectId,'p');assert.deepEqual(snapshot.task.collaborators,['sy']);assert.equal(snapshot.task.status,'검토 요청');assert.equal(snapshot.base.versions['tasks:t'],2);}
 const next=setup({weekStart:'2026-10-25'});next.begin();next.over(350);await next.drop();assert.deepEqual(next.saves[0][1],{start:'2026-10-25',due:'2026-10-25'});
});
test('invalid week targets, cancellation, read-only state and conflicts never silently overwrite a task',async()=>{
 const invalid=setup({weekStart:'2026-10-19'});invalid.begin();invalid.over(350);await invalid.drop();assert.equal(invalid.saves.length,0);
 const readonly=setup({weekStart:'2026-10-18'});readonly.disable();readonly.begin();readonly.over(350);await readonly.drop();assert.equal(readonly.saves.length,0);
 const cancelled=setup({weekStart:'2026-10-18'});cancelled.begin();cancelled.over(350);cancelled.control.cancel();await cancelled.drop();assert.equal(cancelled.saves.length,0);
 const conflict=setup({weekStart:'2026-10-18'});conflict.fail();conflict.begin();conflict.over(350);await conflict.drop();assert.equal(conflict.errors.length,1);assert.equal(conflict.control.isDragging(),false);
});
