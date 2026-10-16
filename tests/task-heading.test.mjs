import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactTaskTitle} from '../src/task-heading.js';
import {meetingIntake} from '../src/meeting-intake.js';
test('task headings put the object and action in a short noun phrase without inventing context',()=>{
 for(const [input,output] of [
 ['MYMAM 상세페이지를 기획한다.','MYMAM 상세페이지 기획'],
 ['기획안을 작성하기','기획안 작성'],
 ['MYMAM 상세페이지 기획을 진행한다','MYMAM 상세페이지 기획'],
 ['다음 주 자료를 검토한다','자료 검토'],
 ['시안을 검토하고 문구를 수정한다','시안 검토 및 문구 수정'],
 ['MYMAM 상세페이지 기획','MYMAM 상세페이지 기획'],
 ['발표 자료 만들기','발표 자료 제작'],
 ['계정 확인 필요','계정 확인 필요']
 ])assert.equal(compactTaskTitle(input),output);
});
test('automatic headings preserve original meeting prose and deduplicate against sentence titles',()=>{
 const body='프로젝트: MYMAM\n후속 업무\n- 양승연: MYMAM 상세페이지를 기획한다.';
 const result=meetingIntake(body,[{id:'p',title:'MYMAM'}],[{projectId:'p',title:'MYMAM 상세페이지 기획하기',assignee:'sy'}]);
 assert.equal(result.projectId,'p');assert.equal(result.drafts[0].title,'MYMAM 상세페이지 기획');assert.match(result.drafts[0].source,/기획한다/);assert.equal(result.drafts[0].duplicate,true);
});
test('headings retain the work object/action and normalize compound labels instead of evaluative direction',()=>{
 assert.equal(compactTaskTitle('MYMAM 서비스소개서 신뢰감있는 방향으로 개선'),'MYMAM 서비스 소개서 개선');
 assert.equal(compactTaskTitle('MYMAM 서비스소개서를 신뢰감 있는 방향으로 개선한다.'),'MYMAM 서비스 소개서 개선');
 assert.equal(compactTaskTitle('발표 자료 만들기 (계정 확인 필요)'),'발표 자료 제작');
 assert.equal(compactTaskTitle('신뢰감 조사'),'신뢰감 조사');
});
