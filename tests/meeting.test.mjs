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
test('sectioned prose excludes background/roles, inherits explicit owner and preserves uncertain scheduling',()=>{
 const m=parseMeeting('2026.10.07.\u2028참석자: 정승재 책임, 양승연 주임\n1. ALPHA 서비스 파악\n시스템의 구조를 소개하고 사업 방향을 공유했다.\n2. 후속 업무\n양승연 주임: 다음 주 방문 전까지 자료를 살펴보고 질문을 정리한다.\n-----\n일자: 2026년 10월 8일\n1. BETA 제품 현황\n제품의 기획 철학을 설명하고 의견을 공유했다.\n2. 향후 계획 및 검토 과제\n구조 파악: ALPHA 기능의 흐름을 확인하고 효용을 정리\n제품 학습: BETA 반복 질문과 개발 의도를 정리\n추가 협의 필요: 담당자와 완료 일정 확인 필요\n3. 담당자별 기대 역할 및 현재 업무\n대표님 기대 역할\n양승연 주임: 심미적 판단으로 완성도 향상\n최재희 주임: 고객 심리를 이해해 전략 구체화\n현재 담당 업무\n양승연 주임\nALPHA 소개 자료 개선하기 → 10/13일 전달 예정 (12일까지 작업 완료하기)\n스터디 후 발표 자료 만들기 (계정 확인 필요)\n최재희 주임\n고객 미팅 예정\n스터디 후 발표 자료 만들기 (진행하는지 검토 필요)');
 assert.equal(m.drafts.length,7);assert.ok(!m.drafts.some(d=>/사업 방향|기획 철학|심미적|고객 심리/.test(d.source)));assert.equal(m.drafts[0].assignee,'sy');assert.equal(m.drafts[0].due,'');assert.equal(m.drafts[3].assignee,'sy');assert.equal(m.drafts[3].due,'');assert.match(m.drafts[3].issues.join(),/축약 일정/);assert.equal(m.drafts[5].assignee,'jh');assert.equal(m.drafts[6].assignee,'');assert.ok(m.drafts.every(d=>d.source&&d.reason));assert.ok(m.projects.some(p=>p.title==='ALPHA'));assert.ok(m.projects.some(p=>p.title==='BETA'));assert.ok(m.projects.some(p=>p.title==='회의 후속 업무'));
});
test('multiple proposed projects commit together, each task is linked, minutes appear in all projects, deletion unlinks safely',async()=>{
 const pg=await postgres();try{
 const m=parseMeeting('1. ALPHA 소개\n서비스를 설명했다.\n2. BETA 소개\n제품을 설명했다.\n3. 후속 업무\n정승재 책임: ALPHA 자료 공유하기\n최재희 주임: BETA 질문 정리하기');
 const value={title:'회의',body:'검증용 원문',projectId:'',newProjects:m.projects,drafts:m.drafts,acknowledged:true};const result=await mutate(pg.repository,{action:{type:'drafts.register',value},revision:0},'jh');
 assert.equal(result.state.projects.length,2);assert.equal(result.state.minutes[0].projectIds.length,2);assert.equal(new Set(result.state.tasks.map(t=>t.projectId)).size,2);assert.match(result.state.tasks[0].note,/출처/);
 const before=await pg.repository.load();await assert.rejects(mutate(pg.repository,{action:{type:'drafts.register',value:{...value,drafts:[{...m.drafts[0],projectKey:'missing'}]}},revision:before.state.revision},'jh'));assert.deepEqual(await pg.repository.load(),before);
 const id=before.state.projects[0].id;await mutate(pg.repository,{action:{type:'project.delete',id},revision:before.state.revision,baseVersion:before.versions['projects:'+id]},'jh');const after=await pg.repository.load();assert.equal(after.state.minutes[0].projectIds.length,1);assert.ok(!after.state.minutes[0].projectIds.includes(id));
 }finally{await pg.close();}
});
