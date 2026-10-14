import {USERS,validate,change,registerDrafts,visible} from '../src/model.js';
export const entities=['projects','tasks','kpis','artifacts','minutes','history'];
export class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const map={project:'projects',task:'tasks',kpi:'kpis',artifact:'artifacts',minutes:'minutes'};
export function publicState(snapshot,actor){
 const state=structuredClone(snapshot.state),versions={};state.tasks=state.tasks.filter(t=>visible(t,actor));state.history=state.history.filter(h=>h.visibility==='shared'||h.owner===actor);
 for(const e of entities)for(const x of state[e])versions[e+':'+x.id]=snapshot.versions[e+':'+x.id];return {state,versions,user:actor};
}
export async function mutate(repository,body,actor){
 if(!USERS.some(u=>u.id===actor))throw new ApiError(403,'등록된 팀원만 접근할 수 있습니다.');
 if(!body||!Number.isInteger(body.revision)||body.revision<0)throw new ApiError(400,'저장 버전이 필요합니다.');
 const a=body.action,batch=a?.type==='drafts.register',key=map[a?.type?.split('.')[0]];
 if(!batch&&(!key||!['save','delete'].includes(a?.type?.split('.')[1])&&a?.type!=='task.status'))throw new ApiError(400,'지원하지 않는 변경입니다.');
 for(let retry=0;retry<3;retry++){
  const before=await repository.load(),s=validate(before.state),id=a?.value?.id||a?.id;
  if(!batch){
   const item=s[key].find(x=>x.id===id);
   if(key==='tasks'&&item&&!visible(item,actor))throw new ApiError(403,'다른 사용자의 개인 업무에 접근할 수 없습니다.');
   if((before.versions[key+':'+id]??null)!==body.baseVersion)throw new ApiError(409,'다른 사람이 먼저 수정했습니다. 입력한 내용을 확인하고 최신 데이터에서 다시 저장하세요.');
   if(key==='minutes'&&a.type==='minutes.save'&&a.value.author!==actor)throw new ApiError(403,'회의록 작성자는 로그인 사용자여야 합니다.');
  }
  if((batch||a.type.endsWith('.delete'))&&s.revision!==body.revision)throw new ApiError(409,'다른 변경이 반영되었습니다. 최신 데이터를 확인한 뒤 다시 시도하세요.');
  let next;try{next=batch?registerDrafts(s,a.value,actor):change(s,a,actor);}catch(err){throw new ApiError(400,err.message);}
  next.revision=s.revision+1;const upserts=[],deletes=[];
  for(const e of entities){const old=new Map(s[e].map(x=>[x.id,x])),fresh=new Map(next[e].map(x=>[x.id,x]));
   for(const x of next[e])if(JSON.stringify(x)!==JSON.stringify(old.get(x.id)))upserts.push({entity:e,id:x.id,payload:x});
   for(const x of s[e])if(!fresh.has(x.id))deletes.push({entity:e,id:x.id});
  }
  if(upserts.length+deletes.length>200)throw new ApiError(400,'한 번에 처리할 항목이 너무 많습니다. 나누어 등록하거나 삭제하세요.');
  if(await repository.commit(s.revision,upserts,deletes))return publicState(await repository.load(),actor);
 }
 throw new ApiError(409,'다른 사용자의 저장이 진행 중입니다. 잠시 후 다시 시도하세요.');
}
