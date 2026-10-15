import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkedMinutes,selectedMinuteIds} from '../src/task-minutes.js';

test('meeting links resolve current archive records without copying or duplicating text',()=>{
 const minutes=[{id:'m1',body:'수정된 원문'},{id:'m2',body:'다른 회의'}];
 assert.deepEqual(linkedMinutes({},minutes),[]);
 assert.deepEqual(linkedMinutes({minuteIds:['m1','m1','deleted']},minutes),[minutes[0]]);
 assert.deepEqual(linkedMinutes({minuteIds:['m1']},[]),[]);
 assert.deepEqual(selectedMinuteIds(['m2','m2','deleted',null,'m1'],minutes),['m2','m1']);
});
