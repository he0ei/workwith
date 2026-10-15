export const USERS = [{id:'ceo',name:'대표님',initial:'대'},{id:'sj',name:'정승재',initial:'재'},{id:'sy',name:'양승연',initial:'연'},{id:'jh',name:'최재희',initial:'희'}];
import {validAttachment} from './attachments.js';
export const STATUSES=['예정','진행 중','검토 요청','완료'];
export const taskStatus=status=>status==='보류 중'?'검토 요청':status;
export const statusLabel=status=>taskStatus(status)==='검토 요청'?'보류 중':status;
export const PRIORITIES=['높음','보통','낮음'];
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
export const uid=()=>crypto.randomUUID();
export const empty=()=>({version:1,revision:0,projects:[],tasks:[],kpis:[],artifacts:[],minutes:[],history:[]});
const required=(condition,message)=>{if(!condition)throw Error(message);};
export function dateOK(value){return value==='' || (typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value);}
const userOK=id=>id===''||USERS.some(u=>u.id===id);
const str=(s,max=10000)=>typeof s==='string'&&s.length<=max;
export function safeURL(value){if(!value)return '';try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export const visible=(task,user)=>task.visibility==='shared'||task.owner===user;
export const visibleTasks=(state,user)=>state.tasks.filter(t=>visible(t,user));
export const taskPeople=task=>USERS.filter(u=>u.id===task.assignee||(task.visibility==='shared'&&(task.collaborators||[]).includes(u.id))).map(u=>u.id);
export const participates=(task,user)=>taskPeople(task).includes(user);
export function validate(state){
 required(state&&state.version===1&&Number.isInteger(state.revision)&&state.revision>=0,'지원하지 않는 저장 데이터 형식입니다.');
 for(const key of ['projects','tasks','kpis','artifacts','minutes','history']){
  required(Array.isArray(state[key])&&state[key].length<=20000,`${key} 데이터 형식 오류`);
  const ids=new Set();for(const x of state[key]){required(x&&str(x.id,100)&&x.id&&!ids.has(x.id),`${key} ID 오류`);ids.add(x.id);}
 }
 const project=id=>state.projects.some(p=>p.id===id);
 for(const p of state.projects)required(str(p.title,200)&&p.title.trim()&&str(p.goal)&&userOK(p.owner)&&dateOK(p.start)&&dateOK(p.due)&&(!p.start||!p.due||p.start<=p.due),'프로젝트 값 또는 일정 오류');
 for(const k of state.kpis)required(project(k.projectId)&&str(k.title,200)&&k.title.trim()&&str(k.unit,50)&&['increase','decrease','manual'].includes(k.method)&&Number.isFinite(k.target)&&k.target>=0&&Number.isFinite(k.current)&&k.current>=0,'KPI 값 오류');
 for(const t of state.tasks){
  const collaborators=t.collaborators??[];
  required(Array.isArray(collaborators)&&collaborators.length<=USERS.length&&new Set(collaborators).size===collaborators.length&&collaborators.every(id=>id&&userOK(id)&&id!==t.assignee),'협업자 값 오류');
  required(t.visibility!=='private'||collaborators.length===0,'개인 업무에는 협업자를 지정할 수 없습니다.');
  required(str(t.title,200)&&t.title.trim()&&str(t.note)&&userOK(t.assignee)&&userOK(t.owner)&&t.owner&&['shared','private'].includes(t.visibility)&&STATUSES.includes(taskStatus(t.status))&&PRIORITIES.includes(t.priority),'업무 값 오류');
  required((!t.projectId||project(t.projectId))&&(t.visibility!=='private'||(!t.projectId&&t.assignee===t.owner)),'개인 업무는 소유자에게만 배정하며 프로젝트에 연결할 수 없습니다.');
  required(dateOK(t.start)&&dateOK(t.due)&&dateOK(t.completedAt)&&(!t.start||!t.due||t.start<=t.due)&&Number.isFinite(t.hours)&&t.hours>=0&&t.hours<=10000,'업무 일정 또는 예상 시간 오류');
  required((t.status==='완료')===Boolean(t.completedAt),'완료일과 상태가 일치하지 않습니다.');
  required(str(t.url,2000)&&(!t.url||safeURL(t.url))&&(!t.kpiId||state.kpis.some(k=>k.id===t.kpiId&&k.projectId===t.projectId)),'업무 링크 또는 KPI 연결 오류');
  required(Array.isArray(t.dependencies)&&new Set(t.dependencies).size===t.dependencies.length,'의존 업무 형식 오류');
  for(const id of t.dependencies){const dep=state.tasks.find(x=>x.id===id);required(dep&&id!==t.id&&(dep.visibility==='shared'||(t.visibility==='private'&&dep.owner===t.owner)),'연결할 수 없는 의존 업무입니다.');}
 }
 const visited=new Set(),pending=new Set();
 function visit(id){required(!pending.has(id),'업무 의존 관계에 순환이 있습니다.');if(visited.has(id))return;pending.add(id);for(const dep of state.tasks.find(t=>t.id===id).dependencies)visit(dep);pending.delete(id);visited.add(id);}
 state.tasks.forEach(t=>visit(t.id));
 for(const a of state.artifacts)required(project(a.projectId)&&str(a.title,200)&&a.title.trim()&&str(a.url,2000)&&(!a.url||safeURL(a.url))&&(!a.attachment||validAttachment(a.attachment))&&(a.url||a.attachment),'결과물 링크 또는 첨부 파일 오류');
 for(const m of state.minutes)required((!m.projectId||project(m.projectId))&&(!m.projectIds||Array.isArray(m.projectIds)&&new Set(m.projectIds).size===m.projectIds.length&&m.projectIds.every(project))&&str(m.title,200)&&m.title.trim()&&str(m.body,50000)&&userOK(m.author)&&m.author&&str(m.at,100),'회의록 형식 오류');
 for(const h of state.history)required(str(h.at,100)&&userOK(h.actor)&&h.actor&&str(h.message,1000)&&['shared','private'].includes(h.visibility)&&userOK(h.owner)&&str(h.projectId,100),'이력 형식 오류');
 return state;
}
export function kpiProgress(k){if(k.method==='manual')return null;if(k.method==='increase')return k.target>0?Math.min(100,100*k.current/k.target):null;return k.current<=k.target?100:k.current>0?100*k.target/k.current:null;}
export function filterTasks(tasks,filter,date=today()){
 const d=new Date(`${date}T00:00:00Z`);const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()-day+1);const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);const end=d.toISOString().slice(0,10);
 return tasks.filter(t=>filter==='all'||(filter==='done'?t.status==='완료':t.status!=='완료'&&(filter==='today'?(t.start===date||t.due===date):filter==='late'?t.due&&t.due<date:filter==='week'?((t.start>=start&&t.start<=end)||(t.due>=start&&t.due<=end)):true)));
}
function log(s,actor,message,entity={}){s.history.push({id:uid(),at:new Date().toISOString(),actor,message,visibility:entity.visibility||'shared',owner:entity.owner||'',projectId:entity.projectId||entity.id&&s.projects.some(p=>p.id===entity.id)&&entity.id||''});}
export function change(state,action,actor){
 required(USERS.some(u=>u.id===actor),'사용자를 선택하세요.');const s=structuredClone(state),v=action.value;
 if(action.type==='task.status'){
  const task=s.tasks.find(t=>t.id===action.id);required(task&&visible(task,actor),'상태를 변경할 수 없는 업무입니다.');
  return change(state,{type:'task.save',value:{...task,status:taskStatus(action.status)}},actor);
 }
 if(action.type==='task.save'){
  const old=s.tasks.find(t=>t.id===v.id);required(!old||visible(old,actor),'다른 사용자의 개인 업무를 수정할 수 없습니다.');
  required(v.visibility!=='private'||v.owner===actor,'다른 사용자의 개인 업무를 생성할 수 없습니다.');
  required(!old||old.owner===v.owner,'업무 소유자는 변경할 수 없습니다.');
  const t={...v,status:taskStatus(v.status),collaborators:v.collaborators??old?.collaborators??[],completedAt:v.status==='완료'?(old?.completedAt||today()):''};
  const datesChanged=old&&(old.start!==t.start||old.due!==t.due);
  required(!datesChanged||action.reason?.trim(),'일정 변경 사유를 입력하세요.');
  if(t.status==='완료')required(t.dependencies.every(id=>s.tasks.find(x=>x.id===id)?.status==='완료'),'선행 업무를 완료한 후 완료 처리하세요.');
  if(old)s.tasks[s.tasks.indexOf(old)]=t;else s.tasks.push(t);
  log(s,actor,`${old?'업무 수정':'업무 생성'}: ${t.title}${datesChanged?` · 계획 ${old.start||'미정'} → ${t.start||'미정'}, 마감 ${old.due||'미정'} → ${t.due||'미정'} · 사유: ${action.reason}`:''}`,t);
 }else if(action.type==='task.delete'){
  const t=s.tasks.find(t=>t.id===action.id);required(t&&visible(t,actor),'삭제할 수 없는 업무입니다.');s.tasks=s.tasks.filter(x=>x.id!==t.id);s.tasks.forEach(x=>x.dependencies=x.dependencies.filter(id=>id!==t.id));log(s,actor,`업무 삭제: ${t.title}`,t);
 }else if(action.type==='project.delete'){
  const p=s.projects.find(p=>p.id===action.id);required(p,'프로젝트가 없습니다.');
  const ids=s.tasks.filter(t=>t.projectId===p.id).map(t=>t.id);s.tasks=s.tasks.filter(t=>t.projectId!==p.id);s.tasks.forEach(t=>t.dependencies=t.dependencies.filter(id=>!ids.includes(id)));
  s.projects=s.projects.filter(x=>x.id!==p.id);for(const key of ['kpis','artifacts'])s[key]=s[key].filter(x=>x.projectId!==p.id);s.minutes.forEach(m=>{if(m.projectId===p.id)m.projectId='';if(m.projectIds)m.projectIds=m.projectIds.filter(id=>id!==p.id);});log(s,actor,`프로젝트 및 연결 업무 ${ids.length}개 삭제: ${p.title}`,{projectId:p.id});
 }else if(['project.save','kpi.save','artifact.save','minutes.save'].includes(action.type)){
  const key={'project.save':'projects','kpi.save':'kpis','artifact.save':'artifacts','minutes.save':'minutes'}[action.type];const i=s[key].findIndex(x=>x.id===v.id),old=s[key][i];
  const datesChanged=key==='projects'&&old&&(old.start!==v.start||old.due!==v.due);required(!datesChanged||action.reason?.trim(),'일정 변경 사유를 입력하세요.');
  if(i<0)s[key].push(v);else s[key][i]=v;log(s,actor,`${i<0?'등록':'수정'}: ${v.title}${datesChanged?` · 시작 ${old.start||'미정'} → ${v.start||'미정'}, 마감 ${old.due||'미정'} → ${v.due||'미정'} · 사유: ${action.reason}`:''}`,v);
 }else if(['kpi.delete','artifact.delete','minutes.delete'].includes(action.type)){
  const key={'kpi.delete':'kpis','artifact.delete':'artifacts','minutes.delete':'minutes'}[action.type];const item=s[key].find(x=>x.id===action.id);required(item,'항목이 없습니다.');s[key]=s[key].filter(x=>x.id!==action.id);if(key==='kpis')s.tasks.forEach(t=>{if(t.kpiId===action.id)t.kpiId='';});log(s,actor,`삭제: ${item.title}`,item);
 }else throw Error('알 수 없는 작업입니다.');
 s.revision++;return validate(s);
}
export function parseMinutes(body){
 return body.split('\n').filter(l=>l.trim()&&!l.trim().startsWith('#')).map(line=>{
  const [title='',name='',due='',priority='',kpiTitle='',target='',unit='']=line.split('|').map(x=>x.trim());
  const assignee=USERS.find(u=>u.name===name)?.id||({'승재 책임님':'sj','승연 주임님':'sy','재희 주임':'jh'}[name]||'');
  const issues=[];if(!assignee)issues.push('담당자 확인 필요');if(!due||!dateOK(due))issues.push('마감일 확인 필요');if(priority&&!PRIORITIES.includes(priority))issues.push('우선순위 확인 필요');
  const kpiTarget=target!==''&&Number.isFinite(Number(target))&&Number(target)>=0?Number(target):null;
  if(kpiTitle&&kpiTarget===null)issues.push('KPI 목표 확인 필요');
  return {id:uid(),title,assignee,due:dateOK(due)?due:'',priority:PRIORITIES.includes(priority)?priority:'보통',kpiTitle,kpiTarget,unit,issues};
 }).filter(d=>d.title);
}
// Extract reviewable actions from sections, not every line of the minutes.
export function parseMeeting(body){
 const normalized=body.replace(/\r\n?/g,'\n').replace(/[\u2028\u2029]/g,'\n').replace(/[\u00a0\u2007\u202f]/g,' ');
 const project={title:'',goal:'',owner:'',start:'',due:''},drafts=[],unclassified=[],sections=[],topics=[];
 let meetingTitle='',meetingDate='',firstDate='',section='',mode='context',owner='',buffer=null;
 const peopleIn=text=>USERS.filter(u=>new RegExp(u.name+'(?:\\s*(?:책임|주임|님))?').test(text));
 const taskHeading=text=>/^(?:업무|할\s*일|액션(?:\s*아이템)?|실행\s*항목|후속\s*업무|현재\s*담당\s*업무|향후\s*계획.*과제)\s*[:：]?$/.test(text);
 function flush(){if(!buffer)return;const source=buffer.source.join('\n'),persons=peopleIn(source),assignee=buffer.owner|| (persons.length===1?persons[0].id:'');
  const uncertain=/(담당(?:자)?.*(?:확인|미정)|진행하는지|(?:여부|배정).*검토|협의 필요)/.test(source);
  const dates=[...source.matchAll(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/g)].map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
  const priorities=PRIORITIES.filter(p=>source.includes('우선순위: '+p)||source.includes('우선순위:'+p)||source.includes('['+p+']'));
  const issues=['규칙으로 찾은 실행 후보 · 원문 검토 필요'];
  if(!assignee||uncertain)issues.push('담당자 확인 필요');issues.push('프로젝트 연결 확인 필요');
  const relative=/(다음\s*주|이번\s*주|방문\s*(?:전|시)|\d{1,2}\/\d{1,2}|\d{1,2}일까지)/.test(source);
  if(relative)issues.push('상대·축약 일정 확인 필요');
  const due=!relative&&dates.length===1&&dateOK(dates[0])?dates[0]:'';if(!due)issues.push('마감일 확인 필요');
  if(priorities.length!==1)issues.push('우선순위 확인 필요');
  const title=buffer.title.replace(/^[^:：]{1,35}[:：]\s*/, '').replace(/\s*(?:→|\/\s*\d{4}[-.])[^]*$/, '').trim();
  drafts.push({id:uid(),title:(title||buffer.title).slice(0,200),assignee:uncertain?'':assignee,due,priority:priorities.length===1?priorities[0]:'보통',kpiTitle:'',kpiTarget:null,unit:'',issues,source,section:buffer.section,reason:buffer.reason,projectKey:''});buffer=null;
 }
 for(const raw of normalized.split('\n')){
  const line=raw.trim();if(!line){flush();continue;}
  if(/^-{3,}$/.test(line)){flush();section='';mode='context';owner='';meetingDate='';continue;}
  const date=line.match(/^(?:일자\s*[:：]\s*)?(\d{4})(?:[.\-/]|년\s*)(\d{1,2})(?:[.\-/]|월\s*)(\d{1,2})(?:[.]|일)?$/);
  if(date){flush();meetingDate=`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`;if(!firstDate)firstDate=meetingDate;unclassified.push(line);continue;}
  const heading=line.match(/^회의(?:명|\s*제목|\s*목적)\s*[:：]\s*(.+)$/);if(heading){flush();if(!meetingTitle)meetingTitle=heading[1];unclassified.push(line);continue;}
  const meta=line.match(/^(프로젝트(?:명)?|목표)\s*[:：]\s*(.+)$/);if(meta){flush();project[meta[1]==='목표'?'goal':'title']=meta[2];continue;}
  const numbered=line.match(/^\d+[.)]\s*(.+)$/),plain=line.replace(/^#{1,6}\s*/,'').replace(/[:：]\s*$/,'');
  if(numbered||taskHeading(plain)||/^(?:대표님\s*)?기대\s*역할$|^대표님 기대 역할$/.test(plain)){
   flush();section=numbered?numbered[1]:plain;sections.push(section);owner='';mode=taskHeading(section)?'actions':'context';
   if(numbered&&!taskHeading(section)&&!/기대 역할|담당자별/.test(section)&&section.length<80){
    const token=section.match(/[A-Z][A-Z0-9]{2,}/)?.[0]||section.split(/\s+/)[0];if(token&&!['서비스','업무','현재','향후','후속'].includes(token)&&!topics.some(t=>t.token===token))topics.push({token,title:section});
   }continue;
  }
  if(/^참석자\s*[:：]|^추가\s*협의\s*필요\s*[:：]/.test(line)){flush();unclassified.push(line);continue;}
  const persons=peopleIn(line),ownerHeading=persons.length===1&&new RegExp('^'+persons[0].name+'\\s*(?:책임|주임|님)?\\s*[:：]?$').test(line);
  if(ownerHeading){flush();owner=persons[0].id;unclassified.push(line);continue;}
  if(line.includes('|')){flush();drafts.push(...parseMinutes(line).map(d=>({...d,source:line,section,reason:'구분 입력',projectKey:''})));continue;}
  const explicitOwner=persons.length===1&&new RegExp('^'+persons[0].name+'\\s*(?:책임|주임|님)?\\s*[:：]').test(line);
  const bullet=/^[-*•]\s+/.test(line),actionable=/(하기|살펴보고|정리한다|공유하고|설명한다|발표\s*자료.*만들|미팅\s*예정|검토(?:한다|$)|확인하고|파악하고|반영|개선)/.test(line);
  // Context and role sections never become actions solely due to a mention of a name.
  const contextAction=!/기대 역할/.test(section)&&/(검토한다|추진한다|정리한다|확인한다|준비한다|작성한다|제작한다|개선한다)/.test(line);
  const accept=contextAction||mode==='actions'||section===''&&(bullet||explicitOwner||actionable)||/^업무\s*[:：]/.test(line);
  if(!accept){flush();unclassified.push(line);continue;}
  if(buffer&&!bullet&&!explicitOwner&&!/^[^:：]{1,35}[:：]/.test(line)&&!/(?:[.!?]|한다|하기|정리|검토|예정)(?:\s*\([^]*\))?$/.test(buffer.source.at(-1))){
   buffer.source.push(line);buffer.title+=' '+line;continue;
  }
  flush();buffer={title:line.replace(/^[-*•]\s*/,'').replace(/^업무\s*[:：]\s*/,''),source:[line],section:meetingDate?meetingDate+' · '+section:section,owner:explicitOwner?persons[0].id:owner,reason:mode==='actions'?'실행 과제 구역':contextAction?'설명 구역의 실행 표현':explicitOwner?'명시된 담당자 업무':'업무 표현'};
 }
 flush();
 const groups=[];
 for(const d of drafts){let topic=topics.find(t=>d.source.includes(t.token));if(!topic)topic=topics.find(t=>d.section.includes(t.title));
  const title=project.title||topic?.token||'회의 후속 업무';let group=groups.find(g=>g.title===title);if(!group){group={key:'group-'+groups.length,title,goal:project.goal,owner:'',start:'',due:''};groups.push(group);}d.projectKey=group.key;
 }
 return {project,drafts,unclassified,meetingTitle:meetingTitle||(firstDate?firstDate+' 회의록':''),projects:groups,sections};
}
export function registerDrafts(state,{minutesId,title,body,projectId,drafts,acknowledged,newProject,newProjects},actor){
 required(drafts.length>0,'등록할 업무 초안이 없습니다.');required(acknowledged,'초안을 검토하고 확인란을 선택하세요.');
 const archived=minutesId?state.minutes.find(m=>m.id===minutesId):null;required(!minutesId||archived,'보관된 회의록을 찾을 수 없습니다.');
 let s=state;const projectMap=new Map();
 if(newProjects){required(!projectId&&!newProject&&Array.isArray(newProjects)&&newProjects.length>0,'프로젝트 그룹을 확인하세요.');for(const p of newProjects){required(typeof p.key==='string'&&!projectMap.has(p.key),'프로젝트 그룹 ID 오류');const id=uid();projectMap.set(p.key,id);s=change(s,{type:'project.save',value:{id,title:p.title,goal:p.goal,owner:p.owner,start:p.start,due:p.due}},actor);}}
 if(newProject){required(!projectId,'새 프로젝트와 기존 프로젝트를 함께 지정할 수 없습니다.');projectId=uid();s=change(s,{type:'project.save',value:{id:projectId,title:newProject.title,goal:newProject.goal,owner:newProject.owner,start:newProject.start,due:newProject.due}},actor);}
 const links=[...new Set([...(archived?.projectIds||[]),...(archived?.projectId?[archived.projectId]:[]),...(newProjects?[...projectMap.values()]:projectId?[projectId]:[])])];
 s=change(s,{type:'minutes.save',value:{id:archived?.id||uid(),title:archived?.title||title,body:archived?.body||body,projectId:archived?.projectId||projectId,...(links.length?{projectIds:links}:{}),author:archived?.author||actor,at:archived?.at||new Date().toISOString()}},actor);
 for(const d of drafts){const taskProjectId=newProjects?projectMap.get(d.projectKey):projectId;required(!newProjects||taskProjectId,'업무의 프로젝트 연결을 확인하세요.');let kpiId='';if(d.kpiTitle){required(taskProjectId&&d.kpiTarget!==null,'KPI는 프로젝트와 유효한 목표값이 필요합니다.');kpiId=uid();s=change(s,{type:'kpi.save',value:{id:kpiId,projectId:taskProjectId,title:d.kpiTitle,target:d.kpiTarget,current:0,unit:d.unit,method:'manual'}},actor);}
  s=change(s,{type:'task.save',value:{id:uid(),title:d.title,note:d.source?`회의록 검토 후 등록\n출처: ${d.section||'회의록'}\n${d.source}`:'회의록 검토 후 등록',owner:actor,assignee:d.assignee,projectId:taskProjectId,visibility:'shared',status:'예정',priority:d.priority,start:'',due:d.due,hours:0,completedAt:'',dependencies:[],kpiId,url:''}},actor);
 }return s;
}
