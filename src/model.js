export const USERS = [{id:'ceo',name:'대표님',initial:'대'},{id:'sj',name:'정승재',initial:'재'},{id:'sy',name:'양승연',initial:'연'},{id:'jh',name:'최재희',initial:'희'}];
export const STATUSES=['예정','진행 중','검토 요청','완료'];
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
  required(str(t.title,200)&&t.title.trim()&&str(t.note)&&userOK(t.assignee)&&userOK(t.owner)&&t.owner&&['shared','private'].includes(t.visibility)&&STATUSES.includes(t.status)&&PRIORITIES.includes(t.priority),'업무 값 오류');
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
 for(const a of state.artifacts)required(project(a.projectId)&&str(a.title,200)&&a.title.trim()&&str(a.url,2000)&&safeURL(a.url),'결과물 링크 오류');
 for(const m of state.minutes)required((!m.projectId||project(m.projectId))&&str(m.title,200)&&m.title.trim()&&str(m.body,50000)&&userOK(m.author)&&m.author&&str(m.at,100),'회의록 형식 오류');
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
 if(action.type==='task.save'){
  const old=s.tasks.find(t=>t.id===v.id);required(!old||visible(old,actor),'다른 사용자의 개인 업무를 수정할 수 없습니다.');
  required(v.visibility!=='private'||v.owner===actor,'다른 사용자의 개인 업무를 생성할 수 없습니다.');
  required(!old||old.owner===v.owner,'업무 소유자는 변경할 수 없습니다.');
  const t={...v,completedAt:v.status==='완료'?(old?.completedAt||today()):''};
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
  s.projects=s.projects.filter(x=>x.id!==p.id);for(const key of ['kpis','artifacts'])s[key]=s[key].filter(x=>x.projectId!==p.id);s.minutes.forEach(m=>{if(m.projectId===p.id)m.projectId='';});log(s,actor,`프로젝트 및 연결 업무 ${ids.length}개 삭제: ${p.title}`,{projectId:p.id});
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
// Conservative text extraction: explicit action lines only; never infer relative dates.
export function parseMeeting(body){
 const project={title:'',goal:'',owner:'',start:'',due:''},drafts=[],unclassified=[];let meetingTitle='';
 let actionSection=false;
 for(const raw of body.split('\n')){
  const line=raw.trim();if(!line)continue;
  const clean=line.replace(/^#{1,6}\s*/, '').replace(/^[-*•]\s*/, '').trim();
  const heading=clean.match(/^회의(?:명|\s*제목)\s*[:：]\s*(.+)$/);if(heading)meetingTitle=heading[1];
  const meta=clean.match(/^(프로젝트(?:명)?|목표)\s*[:：]\s*(.+)$/);
  if(meta){project[meta[1]==='목표'?'goal':'title']=meta[2];actionSection=false;continue;}
  if(/^(업무|할\s*일|액션(?:\s*아이템)?|실행\s*항목)\s*[:：]?$/i.test(clean)){actionSection=true;continue;}
  if(/^(참석자|회의(?:명|제목|일시)?|안건|논의(?:\s*내용)?|결정(?:\s*사항)?)\s*[:：]/.test(clean)||line.startsWith('#')){actionSection=false;unclassified.push(line);continue;}
  if(line.includes('|')){drafts.push(...parseMinutes(line));continue;}
  const marked=/^[-*•]\s+|^\d+[.)]\s+/.test(line)||/^업무\s*[:：]/.test(line);
  const actionable=/(작성|제작|검토|발행|정리|조사|준비|수정|확인|공유|등록|진행|구현|개발|디자인|배포|제출|완료)(?:한다|하기|할|하기로|해야|\s*예정|\s*필요|\s*담당|\s*완료|\s*$)/.test(clean);
  if(!actionSection&&!marked&&!actionable){unclassified.push(line);continue;}
  const title=clean.replace(/^\d+[.)]\s+/, '').replace(/^업무\s*[:：]\s*/, '');
  const people=USERS.filter(u=>title.includes(u.name));
  const dates=[...title.matchAll(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/g)].map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
  const due=dates.length===1&&dateOK(dates[0])?dates[0]:'';
  const priorities=PRIORITIES.filter(p=>new RegExp(`(?:우선순위\\s*[:：]\\s*|\\[)${p}`).test(title));
  const issues=['텍스트 규칙으로 추출한 업무 · 내용 검토 필요'];
  if(people.length!==1)issues.push('담당자 확인 필요');if(!due)issues.push('마감일 확인 필요');if(priorities.length!==1)issues.push('우선순위 확인 필요');if(title.length>200)issues.push('업무명 200자 제한 · 원문은 회의록에 보관');
  if(title)drafts.push({id:uid(),title:title.slice(0,200),assignee:people.length===1?people[0].id:'',due,priority:priorities.length===1?priorities[0]:'보통',kpiTitle:'',kpiTarget:null,unit:'',issues});
 }
 return {project,drafts,unclassified,meetingTitle};
}
export function registerDrafts(state,{title,body,projectId,drafts,acknowledged,newProject},actor){
 required(drafts.length>0,'등록할 업무 초안이 없습니다.');required(acknowledged,'초안을 검토하고 확인란을 선택하세요.');
 let s=state;
 if(newProject){required(!projectId,'새 프로젝트와 기존 프로젝트를 함께 지정할 수 없습니다.');projectId=uid();s=change(s,{type:'project.save',value:{id:projectId,title:newProject.title,goal:newProject.goal,owner:newProject.owner,start:newProject.start,due:newProject.due}},actor);}
 s=change(s,{type:'minutes.save',value:{id:uid(),title,body,projectId,author:actor,at:new Date().toISOString()}},actor);
 for(const d of drafts){let kpiId='';if(d.kpiTitle){required(projectId&&d.kpiTarget!==null,'KPI는 프로젝트와 유효한 목표값이 필요합니다.');kpiId=uid();s=change(s,{type:'kpi.save',value:{id:kpiId,projectId,title:d.kpiTitle,target:d.kpiTarget,current:0,unit:d.unit,method:'manual'}},actor);}
  s=change(s,{type:'task.save',value:{id:uid(),title:d.title,note:'회의록 검토 후 등록',owner:actor,assignee:d.assignee,projectId,visibility:'shared',status:'예정',priority:d.priority,start:'',due:d.due,hours:0,completedAt:'',dependencies:[],kpiId,url:''}},actor);
 }return s;
}
