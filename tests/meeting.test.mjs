import {test} from 'node:test';
import assert from 'node:assert/strict';
import {USERS,empty,parseMeeting,registerDrafts} from '../src/model.js';
import {mutate} from '../server/workspace.js';
import {postgres} from './postgres-helper.mjs';
test('pasted meeting extracts explicit project and actions; ambiguous people and dates stay unset',()=>{
 assert.deepEqual(USERS.slice(1).map(x=>x.name),['정승재','양승연','최재희']);
 const m=parseMeeting('회의 제목: 캠페인 회의\n프로젝트: 콘텐츠 캠페인\n목표: 콘텐츠 발행\n배경 정보를 논의했다.\n업무:\n- 정승재: 기획안 작성 / 2026.10.20 / 우선순위: 높음\n- 양승연, 최재희: 다음 주 디자인 검토\n- 최재희: 발행 / 2026-10-21 ~ 2026-10-25');
 assert.equal(m.project.title,'콘텐츠 캠페인');assert.equal(m.project.goal,'콘텐츠 발행');assert.equal(m.project.owner,'');assert.equal(m.drafts.length,3);assert.equal(m.drafts[0].assignee,'sj');assert.equal(m.drafts[0].due,'2026-10-20');assert.equal(m.drafts[0].priority,'높음');assert.equal(m.drafts[1].assignee,'');assert.equal(m.drafts[1].due,'');assert.equal(m.drafts[2].due,'');assert.equal(m.unclassified.length,2);
 assert.equal(parseMeeting('회의 제목: 소개\n배경 정보를 논의했다.').drafts.length,0);
 assert.equal(parseMeeting('초안 | 정승재 | 2026-10-20 | 높음').drafts[0].assignee,'sj');
});
test('new project, minutes, tasks and KPI share one project; rejected draft changes no original state',()=>{
 const state=empty(),m=parseMeeting('업무 | 최재희 | | 보통 | 발행수 | 10 | 건'),value={title:'회의',body:'원문',projectId:'',newProject:{title:'신규 프로젝트',goal:'목표',owner:'',start:'',due:''},drafts:m.drafts,acknowledged:true};
 const next=registerDrafts(state,value,'jh');const id=next.projects[0].id;assert.equal(next.tasks[0].projectId,id);assert.equal(next.minutes[0].projectId,id);assert.equal(next.kpis[0].projectId,id);assert.equal(next.tasks[0].assignee,'jh');assert.deepEqual(state,empty());
 assert.throws(()=>registerDrafts(state,{...value,newProject:{...value.newProject,title:''}},'jh'),/프로젝트/);assert.deepEqual(state,empty());
 assert.throws(()=>registerDrafts(state,{...value,drafts:[{...value.drafts[0],due:'bad'}]},'jh'),/일정/);assert.deepEqual(state,empty());
});
test('SQL meeting batch commits project/tasks/minutes atomically and another member can read them',async()=>{
 const pg=await postgres();try{
 const value={title:'회의',body:'원문',projectId:'',newProject:{title:'새 프로젝트',goal:'',owner:'',start:'',due:''},drafts:parseMeeting('- 정승재: 기획안 작성').drafts,acknowledged:true};
 const saved=await mutate(pg.repository,{action:{type:'drafts.register',value},revision:0},'jh');assert.equal(saved.state.projects.length,1);assert.equal(saved.state.revision,1);
 const other=await pg.rpc('authenticated','sy','workwith_snapshot');assert.equal(other.state.tasks[0].projectId,other.state.projects[0].id);assert.equal(other.state.minutes[0].body,'원문');
 const before=await pg.repository.load();await assert.rejects(mutate(pg.repository,{action:{type:'drafts.register',value:{...value,drafts:[{...value.drafts[0],due:'invalid'}]}},revision:1},'jh'));assert.deepEqual(await pg.repository.load(),before);
 }finally{await pg.close();}
});
