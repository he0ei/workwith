import {test} from 'node:test';
import assert from 'node:assert/strict';
import {meetingIntake} from '../src/meeting-intake.js';
import {empty,registerDrafts} from '../src/model.js';
import {mutate} from '../server/workspace.js';
import {postgres} from './postgres-helper.mjs';

test('intake matches explicit project, deduplicates actions and leaves uncertain values unset',()=>{
 const info=meetingIntake('프로젝트: 콘텐츠\n후속 업무\n- 정승재: 기획안 작성하기\n- 정승재: 기획안 작성하기\n- 최재희: 다음 주 문구 검토하기',[{id:'p',title:'콘텐츠'}],[{projectId:'p',title:'기획안 작성하기',assignee:'sj'}]);
 assert.equal(info.projectId,'p');assert.equal(info.drafts.length,2);assert.equal(info.drafts[0].duplicate,true);assert.equal(info.drafts[1].due,'');assert.equal(info.drafts[1].assignee,'jh');
 assert.equal(meetingIntake('배경 정보를 소개했다.',[],[]).drafts.length,0);
 assert.equal(meetingIntake('후속 업무\n- 자료 검토하기',[],[]).projectId,'');
 assert.equal(meetingIntake('후속 업무\n- 양승연: 도구 스터디하기\n- 최재희: 도구 스터디하기',[],[]).drafts.length,2);
});

test('intake batch stores provenance, meeting date and links atomically, retry does not duplicate',async()=>{
 const pg=await postgres();try{
 const body='후속 업무\n- 양승연: 시안 작성하기',info=meetingIntake(body,[],[]);
 const value={registrationId:'intake-1',title:'디자인 회의',meetingDate:'2026-10-15',body,projectId:'',drafts:info.drafts,acknowledged:true,newProject:{title:'디자인',goal:'',owner:'',start:'',due:''}};
 const result=await mutate(pg.repository,{action:{type:'drafts.register',value},revision:0},'sj');
 assert.equal(result.state.minutes[0].id,'intake-1');assert.equal(result.state.minutes[0].meetingDate,'2026-10-15');assert.deepEqual(result.state.minutes[0].taskIds,[result.state.tasks[0].id]);assert.equal(result.state.tasks[0].projectId,result.state.projects[0].id);assert.match(result.state.tasks[0].note,/시안 작성하기/);
 const retried=await mutate(pg.repository,{action:{type:'drafts.register',value},revision:result.state.revision},'sj');assert.equal(retried.state.tasks.length,1);assert.equal(retried.state.projects.length,1);
 const other=await pg.rpc('authenticated','sy','workwith_snapshot');assert.equal(other.state.minutes[0].taskIds[0],other.state.tasks[0].id);
 const before=await pg.repository.load();await assert.rejects(mutate(pg.repository,{action:{type:'drafts.register',value:{...value,registrationId:'bad',drafts:[{...info.drafts[0],due:'bad'}]}},revision:before.state.revision},'sj'));assert.deepEqual(await pg.repository.load(),before);
 }finally{await pg.close();}
});

test('meeting title matches the existing collaboration project across spacing; ambiguity requires selection',()=>{
 const projects=[{id:'gowoori',title:'고우리 협업 건'},{id:'other',title:'다른 협업 건'}];
 assert.equal(meetingIntake('후속 업무\n- 자료 검토하기',projects,[],'','고우리협업 검토').projectId,'gowoori');
 assert.equal(meetingIntake('회의 제목: 고우리협업 검토\n후속 업무\n- 자료 검토하기',projects,[]).projectId,'gowoori');
 assert.equal(meetingIntake('프로젝트: 고우리 협업\n후속 업무\n- 자료 검토하기',projects,[]).projectId,'gowoori');
 assert.equal(meetingIntake('회의 제목: 다른 협업 검토',projects,[],'gowoori').projectId,'gowoori');
 assert.equal(meetingIntake('고우리협업 검토',projects.concat({id:'duplicate',title:'고우리 협업 프로젝트'}),[]).projectId,'');
 assert.equal(meetingIntake('내용에 고우리협업을 언급했다.',projects,[],'','일반 회의').projectId,'');
});
test('meeting dates use explicit headers, accept Korean/dotted dates, and never mistake deadlines for meetings',()=>{
 for(const header of ['2026.10.08.','회의 일자: 2026년 10월 8일 (목) 14:00','회의날짜: 2026-10-08 (목)','일시: 2026/10/08 10:00','2026.10.08. 회의록','회의일자: 2026.10.08. / 장소: 회의실'])assert.equal(meetingIntake(header,[],[]).meetingDate,'2026-10-08');
 for(const body of ['후속 업무\n- 마감일: 2026-10-08','2026-10-08까지 완료','2026.02.30.'])assert.equal(meetingIntake(body,[],[]).meetingDate,'');
 const multiple=meetingIntake('2026.10.07.\n2026.10.08.',[],[]);assert.equal(multiple.meetingDate,'');assert.equal(multiple.meetingDates.length,2);assert.equal(meetingIntake('회의일자: 2026.10.07 ~ 2026.10.08',[],[]).meetingDate,'');
 assert.equal(meetingIntake('2026.10.08.\n일자: 2026.10.08.',[],[]).meetingDate,'2026-10-08');
});
test('multiple existing projects are matched per action and identical headings in separate projects survive deduplication',()=>{
 const projects=[{id:'a',title:'ALPHA 소개서'},{id:'b',title:'BETA 제품'}];
 const body='2026.10.08.\n프로젝트: ALPHA 소개서\n후속 업무\n- 정승재: 자료 검토하기\n프로젝트: BETA 제품\n후속 업무\n- 정승재: 자료 검토하기';
 const info=meetingIntake(body,projects,[]);assert.deepEqual(new Set(info.projectIds),new Set(['a','b']));assert.deepEqual(info.drafts.map(d=>d.projectId),['a','b']);assert.equal(info.drafts.length,2);
 const selected=meetingIntake('후속 업무\n- ALPHA 소개서 개선하기\n- BETA 제품 자료 정리하기\n- 자료 검토하기',projects,[],['a','b']);
 assert.deepEqual(selected.drafts.map(d=>d.projectId),['a','b','']);
 const conflict=meetingIntake('후속 업무\n- BETA 제품 자료 정리하기',projects,[],['a']);assert.equal(conflict.drafts[0].projectId,'');
 const unknown=meetingIntake('프로젝트: 등록되지 않은 사업\n후속 업무\n- 자료 검토하기\n프로젝트: ALPHA 소개서\n후속 업무\n- ALPHA 소개서 개선하기',projects,[]);assert.equal(unknown.drafts[0].projectId,'');
 const ambiguous=meetingIntake('후속 업무\n- ALPHA 자료 검토하기',[{id:'a',title:'ALPHA 소개서'},{id:'b',title:'ALPHA 광고'}],[],['a','b']);assert.equal(ambiguous.drafts[0].projectId,'');
});
test('multi-project registration saves one archive with correct task projects atomically and rejects unresolved/foreign links',async()=>{
 const pg=await postgres();try{
 for(const [id,title]of [['a','ALPHA 소개서'],['b','BETA 제품'],['outside','다른 프로젝트']]){const before=await pg.repository.load();await mutate(pg.repository,{action:{type:'project.save',value:{id,title,goal:'',owner:'jh',start:'',due:''}},revision:before.state.revision,baseVersion:null},'jh');}
 const body='회의 일자: 2026년 10월 8일\n후속 업무\n- 양승연: ALPHA 소개서 신뢰감있는 방향으로 개선하기\n- 최재희: BETA 제품 자료 정리하기',info=meetingIntake(body,(await pg.repository.load()).state.projects,[],['a','b']);
 const value={registrationId:'multi-reg',title:'통합 회의',body,meetingDate:info.meetingDate,projectId:'a',projectIds:['a','b'],drafts:info.drafts,acknowledged:true};
 const initial=await pg.repository.load();for(const bad of ['', 'outside','missing']){await assert.rejects(mutate(pg.repository,{action:{type:'drafts.register',value:{...value,drafts:[{...info.drafts[0],projectId:bad},...info.drafts.slice(1)]}},revision:initial.state.revision},'jh'));assert.deepEqual(await pg.repository.load(),initial);}
 const result=await mutate(pg.repository,{action:{type:'drafts.register',value},revision:initial.state.revision},'jh');assert.equal(result.state.projects.length,3);assert.equal(result.state.minutes.length,1);assert.deepEqual(new Set(result.state.tasks.map(t=>t.projectId)),new Set(['a','b']));assert.deepEqual(result.state.minutes[0].projectIds,['a','b']);assert.equal(result.state.minutes[0].meetingDate,'2026-10-08');assert.equal(result.state.minutes[0].taskIds.length,2);assert.match(result.state.tasks.find(t=>t.projectId==='a').note,/신뢰감있는 방향/);assert.equal(result.state.tasks.find(t=>t.projectId==='a').title,'ALPHA 소개서 개선');
 const other=await pg.rpc('authenticated','sj','workwith_snapshot');assert.equal(other.state.minutes[0].taskIds.length,2);
 const retry=await mutate(pg.repository,{action:{type:'drafts.register',value},revision:result.state.revision},'jh');assert.equal(retry.state.tasks.length,2);
 }finally{await pg.close();}
});
