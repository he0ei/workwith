import {deliveryIntake} from './delivery-intake.js';
import {parseMeeting,dateOK,uid} from './model.js';
import {compactTaskTitle} from './task-heading.js';
export const taskTitleKey=title=>String(title??'').normalize('NFKC').toLocaleLowerCase('ko').replace(/[\s\p{P}]+/gu,'').replace(/마이맘/gu,'mymam');
const base=value=>taskTitleKey(value).replace(/(?:프로젝트|건)$/u,'');
export function matchMeetingProject(body,projects,title='',explicit=''){
 const exact=explicit?projects.filter(p=>taskTitleKey(p.title)===taskTitleKey(explicit)||base(explicit).length>=3&&base(p.title)===base(explicit)):[];
 if(exact.length===1)return exact[0].id;if(explicit)return '';
 const heading=taskTitleKey(title||body.split(/\r?\n/).find(line=>line.trim())||'');
 const matches=projects.filter(p=>base(p.title).length>=3&&heading.includes(base(p.title)));
 return matches.length===1?matches[0].id:'';
}
export function meetingDates(body){
 const dates=[];
 for(const raw of String(body).normalize('NFKC').split(/\r\n?|\n|\u2028|\u2029/u)){
  const line=raw.trim().replace(/^[-*#•]\s*/u,'');
  const match=line.match(/^(?:(?:회의\s*(?:일자|날짜|일시)|일자|일시|날짜)\s*[:：]?\s*)?(\d{4})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})(?:\s*(?:일|\.)\s*)?(.*)$/u);
  if(!match)continue;
  // Ignore deadlines or prose beginning with a date; accept date headers / times.
  const labelled=/^(?:회의\s*(?:일자|날짜|일시)|일자|일시|날짜)\s*[:：]/u.test(line);
  if(!labelled&&match[4]&&!/^\s*(?:회의록|회의|정기\s*회의)\s*$/u.test(match[4])&&!/^(?:\s|\(|\)|\[|\]|[월화수목금토일](?:요일)?|오전|오후|\d{1,2}:|~|–|-)*$/u.test(match[4])&&!/^\s*(?:\([월화수목금토일](?:요일)?\))?\s*(?:오전|오후)?\s*\d{1,2}:\d{2}/u.test(match[4]))continue;
  const found=labelled?[...line.matchAll(/(\d{4})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})/gu)]:[match];
  for(const value of found){const date=`${value[1]}-${value[2].padStart(2,'0')}-${value[3].padStart(2,'0')}`;if(dateOK(date)&&!dates.includes(date))dates.push(date);}
 }
 return dates;
}
// Prefer full project names. A unique brand/name token is a fallback, never a tie breaker.
function projectMatches(text,projects){
 const key=taskTitleKey(text),full=projects.filter(p=>base(p.title).length>=3&&key.includes(base(p.title)));
 if(full.length)return full.map(p=>p.id);
 return projects.filter(p=>{const token=p.title.normalize('NFKC').trim().split(/\s+/u)[0],alias=base(token);return alias.length>=3&&key.includes(alias)&&projects.filter(q=>base(q.title.normalize('NFKC').trim().split(/\s+/u)[0])===alias).length===1;}).map(p=>p.id);
}
export function meetingIntake(body,projects,tasks,selection='',title=''){
 projects=projects.filter(p=>p.status!=='완료');
 const parsed=parseMeeting(body),delivery=deliveryIntake(body);
 if(delivery){parsed.meetingTitle=delivery.archiveTitle;parsed.drafts=[{id:uid(),kind:'delivery',title:delivery.title,source:delivery.source,section:'작업본 전달문',projectHint:delivery.subject,assignee:'',due:'',priority:'보통',kpiTitle:'',kpiTarget:null,unit:'',issues:['담당자 확인 필요','마감일 확인 필요','우선순위 확인 필요'],reason:'전달문 제목에서 찾은 업무',projectKey:''}];}
 const globalProject=matchMeetingProject(body,projects,title||parsed.meetingTitle,parsed.project.title)||(parsed.meetingTitle?matchMeetingProject(body,projects,parsed.meetingTitle,parsed.project.title):'');
 const candidates=parsed.drafts.map(d=>{const direct=projectMatches(d.kind==='delivery'?d.projectHint:d.source||d.title,projects);return {...d,candidates:direct.length?direct:projectMatches(d.projectHint||'',projects).length?projectMatches(d.projectHint,projects):projectMatches(d.section||'',projects),title:compactTaskTitle(d.title)};});
 const manual=Array.isArray(selection)||Boolean(selection),requested=Array.isArray(selection)?selection:selection?[selection]:[];
 const selected=[...new Set((manual?requested:[globalProject,...candidates.flatMap(d=>d.candidates)]).filter(id=>projects.some(p=>p.id===id)))];
 const seen=new Set();
 const drafts=candidates.map(d=>{
  const projectId=d.candidates.length===1&&selected.includes(d.candidates[0])?d.candidates[0]:!d.candidates.length&&!d.projectHint&&selected.length===1?selected[0]:'';
  const existing=projectId?tasks.find(t=>t.projectId===projectId&&taskTitleKey(compactTaskTitle(t.title))===taskTitleKey(d.title)&&(!d.assignee||t.assignee===d.assignee||t.collaborators?.includes(d.assignee))):null;
  const {candidates,...value}=d;return {...value,projectId,duplicate:Boolean(existing),existingTaskId:existing?.id||''};
 }).filter(d=>{const title=taskTitleKey(d.title),key=title+'|'+d.assignee+'|'+(d.projectId||d.section||'');if(!title||seen.has(key))return false;seen.add(key);return true;});
 const dates=meetingDates(body);
 return {drafts:drafts.slice(0,50),projectId:selected.length===1?selected[0]:'',projectIds:selected,title:parsed.meetingTitle,meetingDate:dates.length===1?dates[0]:'',meetingDates:dates,omitted:Math.max(0,drafts.length-50)};
}
