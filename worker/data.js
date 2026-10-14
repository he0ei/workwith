import {empty,validate,change,registerDrafts,visible,USERS} from '../src/model.js';
import {randomToken} from './auth.js';
export const entities=['projects','tasks','kpis','artifacts','minutes','history'];
const map={project:'projects',task:'tasks',kpi:'kpis',artifact:'artifacts',minutes:'minutes'};
export class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
export async function load(db){
 const results=await db.batch([db.prepare('SELECT revision FROM workspace WHERE id=1'),db.prepare('SELECT entity,id,payload,version FROM records ORDER BY rowid')]);
 const state=empty(),versions={};state.revision=results[0].results[0].revision;
 for(const r of results[1].results){if(!entities.includes(r.entity))throw Error('Unknown database entity');state[r.entity].push(JSON.parse(r.payload));versions[r.entity+':'+r.id]=r.version;}
 return {state:validate(state),versions};
}
export function publicState(snapshot,actor){
 const state=structuredClone(snapshot.state),versions={};
 state.tasks=state.tasks.filter(t=>visible(t,actor));state.history=state.history.filter(h=>h.visibility==='shared'||h.owner===actor);
 for(const e of entities)for(const item of state[e])versions[e+':'+item.id]=snapshot.versions[e+':'+item.id];
 return {state,versions,user:actor};
}
export async function mutate(db,body,actor){
 if(!USERS.some(u=>u.id===actor))throw new ApiError(401,'로그인이 필요합니다.');
 if(!body||!Number.isInteger(body.revision)||body.revision<0)throw new ApiError(400,'저장 버전이 필요합니다.');
 const a=body.action,batch=a?.type==='drafts.register',key=map[a?.type?.split('.')[0]];
 if(!batch&&(!key||!['save','delete'].includes(a?.type?.split('.')[1])))throw new ApiError(400,'지원하지 않는 변경입니다.');
 for(let retry=0;retry<3;retry++){
  const before=await load(db),s=before.state,id=a?.value?.id||a?.id;
  if(!batch){
   const item=s[key].find(x=>x.id===id);
   if(key==='tasks'&&item&&!visible(item,actor))throw new ApiError(403,'다른 사용자의 개인 업무에 접근할 수 없습니다.');
   const current=before.versions[key+':'+id]??null;
   if(body.baseVersion!==current)throw new ApiError(409,'다른 사람이 먼저 수정했습니다. 입력한 내용을 확인하고 최신 데이터에서 다시 저장하세요.');
   if(key==='minutes'&&a.type==='minutes.save'&&a.value.author!==actor)throw new ApiError(403,'회의록 작성자는 로그인 사용자여야 합니다.');
  }
  // Cascading deletion and meeting batches affect multiple records; require the full revision.
  if((batch||a.type.endsWith('.delete'))&&s.revision!==body.revision)throw new ApiError(409,'다른 변경이 반영되었습니다. 최신 데이터를 확인한 뒤 다시 시도하세요.');
  let next;try{next=batch?registerDrafts(s,a.value,actor):change(s,a,actor);}catch(err){throw new ApiError(400,err.message);}
  const token=randomToken(),revision=s.revision+1;next.revision=revision;
  const queries=[db.prepare('UPDATE workspace SET revision=?,token=? WHERE id=1 AND revision=?').bind(revision,token,s.revision)];
  for(const e of entities){
   const old=new Map(s[e].map(x=>[x.id,x])),fresh=new Map(next[e].map(x=>[x.id,x]));
   for(const x of next[e])if(JSON.stringify(x)!==JSON.stringify(old.get(x.id)))queries.push(db.prepare('INSERT INTO records(entity,id,payload,version) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM workspace WHERE id=1 AND token=?) ON CONFLICT(entity,id) DO UPDATE SET payload=excluded.payload,version=excluded.version').bind(e,x.id,JSON.stringify(x),revision,token));
   for(const x of s[e])if(!fresh.has(x.id))queries.push(db.prepare('DELETE FROM records WHERE entity=? AND id=? AND EXISTS(SELECT 1 FROM workspace WHERE id=1 AND token=?)').bind(e,x.id,token));
  }
  if(queries.length>95)throw new ApiError(400,'한 번에 처리할 항목이 너무 많습니다. 회의록 업무를 나누어 등록하거나 연결 항목을 먼저 삭제하세요.');
  const results=await db.batch(queries);
  if(results[0].meta.changes===1)return publicState(await load(db),actor);
 }
 throw new ApiError(409,'다른 사용자의 저장이 진행 중입니다. 잠시 후 다시 시도하세요.');
}
