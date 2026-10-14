import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installBoardDrag} from '../src/board-drag.js';

function setup(){
 const listeners={},moves=[],errors=[];
 const classes=new Set(),card={dataset:{dragTask:'task-1'},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};
 const column={dataset:{dropStatus:'완료'},classList:{add(){},remove(){}},contains:()=>false};
 const snapshot={task:{id:'task-1',status:'예정'},base:{revision:3,versions:{'tasks:task-1':2}}};
 let enabled=true,fail=false;
 const control=installBoardDrag({addEventListener:(n,fn)=>listeners[n]=fn},{capture:()=>structuredClone(snapshot),canStart:()=>enabled,allowed:s=>['예정','완료'].includes(s),move:async(s,status)=>{moves.push({s,status});if(fail)throw Error('다른 사람이 먼저 수정');},error:e=>errors.push(e.message)});
 const begin=(interactive=false)=>listeners.dragstart({target:{closest:s=>s==='[data-drag-task]'?card:interactive?{}:null},dataTransfer:{setData(){}},preventDefault(){}});
 const drop=()=>listeners.drop({target:{closest:()=>column},preventDefault(){}});
 return {listeners,moves,errors,column,snapshot,control,begin,drop,disable:()=>enabled=false,fail:()=>fail=true};
}
test('drop preserves starting revision even if state updates; clear after success',async()=>{
 const x=setup();x.begin();x.snapshot.base.revision=4;await x.drop();assert.equal(x.moves[0].s.base.revision,3);assert.equal(x.moves[0].status,'완료');assert.equal(x.control.isDragging(),false);
});
test('same stage, external drops, interactive controls and disabled mode do not save',async()=>{
 const x=setup();await x.drop();x.begin(true);await x.drop();x.disable();x.begin();await x.drop();assert.equal(x.moves.length,0);
 const y=setup();y.column.dataset.dropStatus='예정';y.begin();await y.drop();assert.equal(y.moves.length,0);
});
test('cancel and invalid destination do not save',async()=>{
 const x=setup();x.begin();x.column.dataset.dropStatus='invalid';await x.drop();x.listeners.dragend();await x.drop();assert.equal(x.moves.length,0);assert.equal(x.control.isDragging(),false);
});
test('save conflict is surfaced and drag state cleared',async()=>{
 const x=setup();x.fail();x.begin();await x.drop();assert.deepEqual(x.errors,['다른 사람이 먼저 수정']);assert.equal(x.control.isDragging(),false);
});
