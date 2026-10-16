import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adjustSchedule,barPosition,barPeople,installScheduleDrag,scheduleReason,PERSON_COLORS} from '../src/schedule-bars.js';
const task={id:'t',title:'기획',start:'2026-10-12',due:'2026-10-14',visibility:'shared',assignee:'jh',collaborators:['sy'],status:'검토 요청',projectId:'p'};
const range={start:'2026-10-11',end:'2026-10-17'};
test('move preserves duration, one-sided dates, status, visibility and collaborators',()=>{
 assert.deepEqual(adjustSchedule(task,'move',2),{start:'2026-10-14',due:'2026-10-16'});
 assert.deepEqual(adjustSchedule({...task,start:''},'move',1),{start:'',due:'2026-10-15'});
 assert.deepEqual(adjustSchedule({...task,due:''},'move',-1),{start:'2026-10-11',due:''});
 assert.equal(task.status,'검토 요청');assert.deepEqual(task.collaborators,['sy']);
 assert.match(scheduleReason(task,adjustSchedule(task,'move',1),'move'),/주간 보드 일정 이동.*2026-10-12.*2026-10-15/);
});
test('resize cannot reverse dates and creates an explicit interval for single-date tasks',()=>{
 assert.deepEqual(adjustSchedule(task,'start',10),{start:'2026-10-14',due:'2026-10-14'});
 assert.deepEqual(adjustSchedule(task,'due',-10),{start:'2026-10-12',due:'2026-10-12'});
 assert.deepEqual(adjustSchedule({...task,start:''},'start',-2),{start:'2026-10-12',due:'2026-10-14'});
 assert.deepEqual(adjustSchedule({...task,due:''},'due',2),{start:'2026-10-12',due:'2026-10-14'});
 assert.throws(()=>adjustSchedule(task,'move',1.5));
});
test('bars clip at week edges, have inclusive spans and keep parallel people colors',()=>{
 assert.deepEqual(barPosition(task,range),{first:1,span:3,clippedStart:false,clippedEnd:false});
 assert.equal(barPosition({...task,start:'2026-10-01',due:'2026-10-25'},range).span,7);
 assert.equal(barPosition({...task,start:'2026-10-18',due:'2026-10-19'},range),null);
 assert.equal(barPosition({...task,start:'',due:'2026-10-14'},range).span,1);
 assert.deepEqual(barPeople(task).map(p=>p.id),['sy','jh']);assert.equal(PERSON_COLORS.jh.background,'#dff3ff');
});
function setup(){
 const listeners={},saves=[],errors=[],classes=new Set(),snapshot={task:structuredClone(task),base:{revision:3,versions:{'tasks:t':2}}};
 let enabled=true,fail=false,gate;
 const board={dataset:{weekTimeline:range.start},getBoundingClientRect:()=>({width:700,left:0,right:700,top:0,bottom:500})};
 const bar={style:{},getBoundingClientRect:()=>({width:292}),dataset:{scheduleBar:'t'},classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x))},closest:()=>board};
 const target=mode=>({closest:s=>s==='[data-schedule-bar]'?bar:s==='[data-resize]'&&mode!=='move'?{dataset:{resize:mode}}:null});
 const control=installScheduleDrag({addEventListener:(n,fn)=>listeners[n]=fn},{canStart:()=>enabled,capture:()=>structuredClone(snapshot),save:async(...args)=>{saves.push(args);await gate;if(fail)throw Error('다른 사람이 먼저 수정');},error:err=>errors.push(err.message),announce(){}});
 const begin=(mode='move')=>listeners.pointerdown({target:target(mode),button:0,clientX:150,pointerId:1});
 const move=x=>listeners.pointermove({clientX:x,pointerId:1,cancelable:true,preventDefault(){}});
 const end=(x=250,y=100)=>listeners.pointerup({clientX:x,clientY:y,pointerId:1});
 return {bar,listeners,saves,errors,classes,snapshot,control,begin,move,end,target,hold:()=>{let release;gate=new Promise(resolve=>release=resolve);return ()=>release();},disable:()=>enabled=false,fail:()=>fail=true};
}
test('drag previews without writes, then saves exactly once with captured version and reason',async()=>{
 const x=setup();x.begin();x.move(250);assert.equal(x.saves.length,0);assert.equal(x.bar.style.transform,'translate3d(100px,0,0)');x.snapshot.base.revision=9;await x.end();
 assert.equal(x.saves.length,1);assert.equal(x.saves[0][0].base.revision,3);assert.deepEqual(x.saves[0][1],{start:'2026-10-13',due:'2026-10-15'});assert.equal(x.control.isDragging(),false);
});
test('cancel, no movement, outside drop and read-only mode never save',async()=>{
 const x=setup();x.begin();await x.end(150);x.begin();x.move(250);x.listeners.pointercancel();await x.end();x.begin();x.move(250);await x.end(250,700);x.disable();x.begin();await x.end();assert.equal(x.saves.length,0);
 const y=setup();y.begin();y.move(250);y.listeners.keydown({key:'Escape',preventDefault(){}});await y.end();assert.equal(y.saves.length,0);
});
test('resize uses the chosen edge and conflicts restore original geometry',async()=>{
 const x=setup();x.begin('due');x.move(350);await x.end(350);assert.equal(x.saves[0][1].start,task.start);assert.equal(x.saves[0][1].due,'2026-10-16');
 const y=setup();y.fail();y.begin();y.move(250);await y.end();assert.deepEqual(y.errors,['다른 사람이 먼저 수정']);assert.ok(y.classes.has('bar-start-1'));
});
test('keyboard moves or resizes by a day and a completed drag suppresses accidental editor click',async()=>{
 const x=setup();await x.listeners.keydown({target:x.target('start'),key:'ArrowLeft',preventDefault(){}});assert.deepEqual(x.saves[0][1],{start:'2026-10-11',due:'2026-10-14'});
 x.begin();x.move(250);const count=x.saves.length;await x.listeners.keydown({target:x.target('move'),key:'ArrowRight',preventDefault(){}});assert.equal(x.saves.length,count);await x.end();let prevented=false;x.listeners.click({target:x.target('move'),preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,true);
});

test('a dropped bar stays at the target while saving instead of flashing back to the original date',async()=>{
 const x=setup(),release=x.hold();x.begin();x.move(250);const pending=x.end();assert.ok(x.classes.has('bar-start-2'));assert.ok(x.classes.has('schedule-saving'));assert.equal(x.bar.style.transform,'');release();await pending;assert.ok(x.classes.has('bar-start-2'));assert.ok(!x.classes.has('schedule-saving'));
});
