import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dropDate,installUnscheduledDrag} from '../src/unscheduled-drag.js';
function setup(){
 const listeners={},saves=[],errors=[],snapshot={task:{id:'t',start:'',due:'',status:'검토 요청',projectId:'p',visibility:'shared',collaborators:['sy']},base:{revision:3,versions:{'tasks:t':2}}};let enabled=true,fail=false;
 const source={dataset:{planTask:'t'},classList:{add(){},remove(){}}},header={classList:{add(){},remove(){}}};
 const board={dataset:{weekTimeline:'2026-10-11'},getBoundingClientRect:()=>({left:100,right:800,width:700}),querySelector:()=>header};
 let hit=true;const control=installUnscheduledDrag({addEventListener:(name,fn)=>listeners[name]=fn,elementFromPoint:()=>({closest:()=>hit?board:null})},{capture:()=>structuredClone(snapshot),canStart:()=>enabled,save:async(...a)=>{saves.push(a);if(fail)throw Error('다른 사람이 먼저 수정');},error:e=>errors.push(e.message),announce(){}});
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
