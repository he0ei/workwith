import {empty,today,validate} from '../src/model.js';
export function sample(){
 const s=empty(),date=today();const shift=n=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 s.projects=[{id:'p1',title:'브랜드 리뉴얼',goal:'브랜드의 핵심 메시지와 시각 언어를 정리합니다. (예시)',owner:'sj',start:shift(-10),due:shift(12)},{id:'p2',title:'10월 콘텐츠 캠페인',goal:'팀이 함께 만드는 월간 콘텐츠 캠페인. (예시)',owner:'sy',start:shift(-3),due:shift(20)}];
 s.kpis=[{id:'k1',projectId:'p1',title:'브랜드 가이드 검토 항목',target:10,current:6,unit:'항목',method:'increase'},{id:'k2',projectId:'p2',title:'콘텐츠 발행',target:12,current:3,unit:'건',method:'increase'}];
 const items=[['t1','브랜드 키워드 정리','sj','p1','완료',-2,2],['t2','브랜드 가이드 초안 작성','sy','p1','진행 중',3,6],['t3','시각 레퍼런스 리서치','jh','p1','검토 요청',0,3],['t4','캠페인 기획안 검토','ceo','p2','예정',2,2],['t5','콘텐츠 캘린더 구성','sj','p2','진행 중',-1,4],['t6','첫 번째 콘텐츠 문구 작성','jh','p2','예정',5,3],['t7','주간 업무 정리','sj','','예정',0,1]];
 s.tasks=items.map(([id,title,assignee,projectId,status,due,hours],i)=>({id,title,note:'실제 회사 자료가 아닌 시연용 예시입니다.',assignee,owner:assignee,projectId,visibility:projectId?'shared':'private',status,priority:i===4?'높음':'보통',start:shift(-3),due:shift(due),hours,completedAt:status==='완료'?shift(-2):'',kpiId:projectId==='p1'?'k1':projectId==='p2'?'k2':'',url:'',dependencies:id==='t2'?['t1']:[]}));return validate(s);
}
