import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkedMinutes,meetingTasks,selectMeetingTaskIds} from '../src/task-minutes.js';
test('meeting links require a matching project and shared task; explicit archive links override legacy selections',()=>{
 const a={id:'a',projectId:'p1',visibility:'shared',minuteIds:['legacy','other']},b={id:'b',projectId:'p2',visibility:'shared'},privateTask={id:'private',projectId:'',visibility:'private'};
 const minutes=[{id:'legacy',projectId:'p1'},{id:'other',projectId:'p2',taskIds:['a','b']},{id:'new',projectId:'p1',taskIds:['a']},{id:'unassigned',projectId:'',taskIds:['a']}];
 assert.deepEqual(linkedMinutes(a,minutes).map(m=>m.id),['legacy','new']);
 assert.deepEqual(linkedMinutes(a,[{id:'legacy',projectId:'p1',taskIds:[]}]),[]);
 assert.deepEqual(linkedMinutes(privateTask,minutes),[]);
 assert.deepEqual(linkedMinutes({...a,projectId:'p3'},minutes),[]);
 assert.deepEqual(meetingTasks(minutes[1],[a,b,privateTask]).map(t=>t.id),['b']);
 assert.deepEqual(selectMeetingTaskIds(['a','a','b','private','missing'],'p1',[a,b,privateTask]),['a']);
 assert.deepEqual(selectMeetingTaskIds(['a'],'',[a]),[]);
});
