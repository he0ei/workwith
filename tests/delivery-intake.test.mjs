import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliveryIntake} from '../src/delivery-intake.js';
import {meetingIntake} from '../src/meeting-intake.js';
import {mutate} from '../server/workspace.js';
import {linkedMinutes} from '../src/task-minutes.js';
import {postgres} from './postgres-helper.mjs';
const projects=[{id:'mymam',title:'MYMAM'},{id:'other',title:'다른 브랜드'}];
const body='마이맘\u00a0랜딩페이지 작업본 전달드립니다.\n\n미리보기: https://example.test/preview\n\n연결이 필요한 부분은 세 가지입니다.\n1. 제출 처리: 기존 접수 API 연결\n2. 주소검색: 검색 서비스 연결\n3. 이미지 경로: 설정값 수정\n\n배포 일정 알려주시면 확인하겠습니다.';
test('delivery message becomes one named issue in the existing project, without inventing people or deadlines',()=>{
 const result=meetingIntake(body,projects,[]);
 assert.equal(result.drafts.length,1);assert.equal(result.drafts[0].title,'MY MAM 랜딩페이지 제작');assert.equal(result.drafts[0].projectId,'mymam');assert.deepEqual(result.projectIds,['mymam']);
 assert.equal(result.drafts[0].assignee,'');assert.equal(result.drafts[0].due,'');assert.equal(result.meetingDate,'');assert.equal(result.drafts[0].source,body);assert.equal(result.title,'MY MAM 랜딩페이지 전달 기록');
 assert.ok(result.drafts[0].issues.some(x=>x.includes('담당자')));assert.ok(result.drafts[0].issues.some(x=>x.includes('마감일')));
});
test('Korean, spaced English and case variants share the same project and issue title',()=>{
 for(const name of ['마이맘','마이 맘','MYMAM','MY MAM','mymam']){
  const result=meetingIntake(name+' 랜딩 페이지 작업본 전달드립니다.\n설정 정보를 확인해 주세요.',projects,[]);
  assert.equal(result.drafts[0].title,'MY MAM 랜딩페이지 제작');assert.equal(result.drafts[0].projectId,'mymam');
 }
 const misleading=meetingIntake(body+'\n참고: 다른 브랜드 자료도 있습니다.',projects,[]);assert.equal(misleading.drafts[0].projectId,'mymam');
 const ambiguity=meetingIntake(body,[{id:'a',title:'MYMAM'},{id:'b',title:'마이맘'}],[]);assert.equal(ambiguity.drafts[0].projectId,'');
 const closed=meetingIntake(body,[{id:'a',title:'MYMAM',status:'완료'}],[]);assert.equal(closed.drafts[0].projectId,'');assert.equal(closed.projectIds.length,0);
});
test('background, negative phrasing and reference-only material never trigger the delivery shortcut',()=>{
 for(const text of ['마이맘 랜딩페이지 작업본을 아직 전달하지 않았습니다.','참고 자료 작업본 전달드립니다.','회의 목적: 업무 검토\n마이맘 랜딩페이지 작업본 전달드립니다.','마이맘 랜딩페이지 구성을 설명합니다.'])assert.equal(deliveryIntake(text),null);
 assert.equal(deliveryIntake('안녕하세요.\n마이맘 랜딩페이지 작업본 전달드립니다.').title,'MY MAM 랜딩페이지 제작');
});
test('existing equivalent issue is recognized so a later source can be linked without another issue',()=>{
 const result=meetingIntake(body,projects,[{id:'existing',title:'마이맘 랜딩페이지 제작',projectId:'mymam',assignee:'sy'}]);
 assert.equal(result.drafts[0].duplicate,true);assert.equal(result.drafts[0].existingTaskId,'existing');
 assert.equal(meetingIntake(body,projects,[{id:'other',title:'MY MAM 랜딩페이지 제작',projectId:'other'}]).drafts[0].duplicate,false);
});
test('registration persists exact original text and bidirectional meeting/issue links through PostgreSQL',async()=>{
 const pg=await postgres();try{
  await mutate(pg.repository,{revision:0,baseVersion:null,action:{type:'project.save',value:{...projects[0],goal:'',owner:'jh',start:'',due:''}}},'jh');
  const before=await pg.repository.load(),info=meetingIntake(body,before.state.projects,[]);
  const value={registrationId:'delivery-archive',title:info.title,body,meetingDate:'2026-10-19',projectId:info.projectId,projectIds:info.projectIds,drafts:info.drafts,acknowledged:true};
  const saved=await mutate(pg.repository,{revision:before.state.revision,action:{type:'drafts.register',value}},'jh');
  assert.equal(saved.state.projects.length,1);assert.equal(saved.state.tasks.length,1);assert.equal(saved.state.minutes[0].body,body);assert.deepEqual(saved.state.minutes[0].taskIds,[saved.state.tasks[0].id]);assert.equal(linkedMinutes(saved.state.tasks[0],saved.state.minutes).length,1);
  const reloaded=await pg.repository.load();assert.equal(reloaded.state.minutes[0].body,body);assert.equal(reloaded.state.tasks[0].title,'MY MAM 랜딩페이지 제작');
  const retry=await mutate(pg.repository,{revision:reloaded.state.revision,action:{type:'drafts.register',value}},'jh');assert.equal(retry.state.tasks.length,1);assert.equal(retry.state.minutes.length,1);
  const longBody='MYMAM 상세페이지 작업본 전달드립니다.\n'+('보존할 원문.\n'.repeat(5000)),longInfo=meetingIntake(longBody,before.state.projects,[]),current=await pg.repository.load();
  await mutate(pg.repository,{revision:current.state.revision,action:{type:'drafts.register',value:{...value,registrationId:'long-archive',title:longInfo.title,body:longBody,drafts:longInfo.drafts}}},'jh');
  const longSaved=await pg.repository.load();assert.equal(longSaved.state.minutes.find(m=>m.id==='long-archive').body,longBody);assert.ok(longSaved.state.tasks.find(t=>t.title==='MY MAM 상세페이지 제작').note.length<=10000);
 }finally{await pg.close();}
});
