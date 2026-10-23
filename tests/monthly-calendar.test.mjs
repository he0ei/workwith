import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthWeeks,installMonthDrag} from '../src/monthly-calendar.js';
const task={id:'t',title:'검토',start:'2026-10-16',due:'2026-10-17',projectId:'p',status:'검토 요청',visibility:'shared',collaborators:['sy'],assignee:'jh'};
test('month strips use Sunday first, cover leap days and show every overlapping interval',()=>{
 const weeks=monthWeeks('2026-10',[task,{...task,id:'u',start:'',due:''},{...task,id:'long',start:'2026-09-25',due:'2026-11-03'}]);
 assert.equal(weeks[0].start,'2026-09-27');assert.equal(weeks.at(-1).end,'2026-10-31');
 assert.equal(weeks.filter(w=>w.tasks.some(t=>t.id==='long')).length,5);
 assert.equal(weeks.flatMap(w=>w.tasks).some(t=>t.id==='u'),false);
 assert.equal(monthWeeks('2024-02',[]).at(-1).end,'2024-03-02');
 assert.equal(monthWeeks('2026-08',[]).length,6);
});
function setup(){
 const listeners={},saves=[],errors=[],snapshot={task:structuredClone(task),base:{revision:8,versions:{'tasks:t':4}}};let enabled=true,fail=false,point=true,gate;
 const cl={add(){},remove(){}};
 const week=(start,top)=>({dataset:{weekTimeline:start,monthWeek:'true'},getBoundingClientRect:()=>({left:0,right:700,width:700,top,bottom:top+150}),querySelector:()=>({classList:cl})});
 const first=week('2026-10-11',0),second=week('2026-10-18',150);
 const bar={dataset:{scheduleBar:'t'},classList:cl,closest:s=>s==='[data-month-week]'?first:null};
 const target=(mode='move')=>({closest:s=>s==='[data-schedule-bar]'?bar:s==='[data-resize]'&&mode!=='move'?{dataset:{resize:mode}}:null});
 const root={addEventListener:(name,fn)=>listeners[name]=fn,elementFromPoint:(x,y)=>point&&x>=0&&x<700&&y>=0&&y<300?{closest:()=>y<150?first:second}:null};
 const control=installMonthDrag(root,{capture:()=>structuredClone(snapshot),canStart:()=>enabled,announce(){},save:async(...args)=>{saves.push(args);await gate;if(fail)throw Error('충돌');},error:e=>errors.push(e.message)});
 const begin=(mode='move')=>listeners.pointerdown({target:target(mode),button:0,clientX:mode==='due'?650:550,clientY:80,pointerId:1});
 const move=(x=150,y=200)=>listeners.pointermove({clientX:x,clientY:y,pointerId:1,preventDefault(){},cancelable:true});
 const end=(x=150,y=200)=>listeners.pointerup({clientX:x,clientY:y,pointerId:1});
 return {listeners,saves,errors,snapshot,control,target,begin,move,end,disable:()=>enabled=false,fail:()=>fail=true,hold:()=>{let release;gate=new Promise(r=>release=r);return release;}};
}
test('move across week rows preserves duration, captured version and all task metadata',async()=>{
 const x=setup();x.begin();x.move();assert.equal(x.saves.length,0);x.snapshot.base.revision=99;await x.end();
 assert.equal(x.saves.length,1);assert.deepEqual(x.saves[0][1],{start:'2026-10-19',due:'2026-10-20'});
 assert.equal(x.saves[0][0].base.revision,8);assert.deepEqual(x.saves[0][0].task,task);assert.match(x.saves[0][2],/월간 보드 일정 이동/);
});
test('both endpoints resize across rows, clamping instead of reversing dates',async()=>{
 const x=setup();x.begin('due');x.move(350,200);await x.end(350,200);assert.deepEqual(x.saves[0][1],{start:'2026-10-16',due:'2026-10-21'});
 const y=setup();y.begin('start');y.move(50,80);await y.end(50,80);assert.deepEqual(y.saves[0][1],{start:'2026-10-11',due:'2026-10-17'});
 const z=setup();z.begin('start');z.move(350,200);await z.end(350,200);assert.deepEqual(z.saves[0][1],{start:'2026-10-17',due:'2026-10-17'});
});
test('click, outside drop, Escape, pointer cancellation and readonly never write',async()=>{
 const x=setup();x.begin();await x.end(550,80);x.begin();x.move(-10);await x.end(-10);x.begin();x.move();x.listeners.keydown({key:'Escape',preventDefault(){}});await x.end();x.begin();x.move();x.listeners.pointercancel();await x.end();x.disable();x.begin();x.move();await x.end();assert.equal(x.saves.length,0);
});
test('keyboard moves a week, errors surface and saving blocks additional changes',async()=>{
 const x=setup();await x.listeners.keydown({target:x.target(),key:'ArrowDown',preventDefault(){}});assert.deepEqual(x.saves[0][1],{start:'2026-10-23',due:'2026-10-24'});
 const y=setup();y.fail();y.begin();y.move();await y.end();assert.deepEqual(y.errors,['충돌']);
 const z=setup(),release=z.hold();z.begin();z.move();const pending=z.end();assert.equal(z.control.isDragging(),true);z.begin();assert.equal(z.saves.length,1);release();await pending;assert.equal(z.control.isDragging(),false);
});
test('drag completion suppresses accidental editor clicks',async()=>{
 const x=setup();x.begin();x.move();await x.end();let suppressed=false;x.listeners.click({target:x.target(),preventDefault(){suppressed=true;},stopImmediatePropagation(){}});assert.equal(suppressed,true);
});
test('monthly strips keep completed work below active and paused work without changing records',()=>{
 const input=[{...task,id:'pause',title:'가',priority:'높음'}, {...task,id:'normal',title:'나',status:'진행 중',priority:'보통'},{...task,id:'high',title:'하',status:'완료',priority:'높음'},{...task,id:'low',title:'다',status:'예정',priority:'낮음'}];
 const before=structuredClone(input),weeks=monthWeeks('2026-10',input);
 assert.deepEqual(weeks.find(w=>w.start==='2026-10-11').tasks.map(t=>t.id),['normal','low','pause','high']);assert.deepEqual(input,before);
});
