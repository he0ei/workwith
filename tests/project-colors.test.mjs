import {test} from 'node:test';import assert from 'node:assert/strict';import {projectColors} from '../src/project-colors.js';
test('project colors resolve old eight-slot collisions and stay the same across ordering',()=>{
 const projects=Array.from({length:48},(_,i)=>({id:'project-'+i})),colors=projectColors(projects);
 assert.equal(new Set([...colors.values()].map(c=>c.background)).size,projects.length);
 assert.deepEqual([...projectColors([...projects].reverse())],[...colors]);
 assert.deepEqual(projectColors(projects).get('project-3'),colors.get('project-3'));
});
test('larger workspaces never cycle back to an already assigned tint',()=>{
 const projects=Array.from({length:20000},(_,i)=>({id:'p'+i})),colors=projectColors(projects);assert.equal(colors.size,20000);assert.equal(new Set([...colors.values()].map(c=>c.background)).size,20000);
});
