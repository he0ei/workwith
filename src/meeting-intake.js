import {parseMeeting} from './model.js';
import {compactTaskTitle} from './task-heading.js';
export const taskTitleKey=title=>title.normalize('NFKC').toLocaleLowerCase('ko').replace(/[\s\p{P}]+/gu,'');
export function matchMeetingProject(body,projects,title='',explicit=''){
 const base=value=>taskTitleKey(value).replace(/(?:프로젝트|건)$/u,'');
 const exact=explicit?projects.filter(p=>taskTitleKey(p.title)===taskTitleKey(explicit)||base(explicit).length>=3&&base(p.title)===base(explicit)):[];
 if(exact.length===1)return exact[0].id;
 if(explicit)return '';
 const heading=taskTitleKey(title||body.split(/\r?\n/).find(line=>line.trim())||'');
 const matches=projects.filter(p=>{const key=taskTitleKey(p.title).replace(/(?:프로젝트|건)$/u,'');return key.length>=3&&heading.includes(key);});
 return matches.length===1?matches[0].id:'';
}
export function meetingIntake(body,projects,tasks,projectId='',title=''){
 const parsed=parseMeeting(body),valid=projects.some(p=>p.id===projectId);
 const target=valid?projectId:matchMeetingProject(body,projects,title||parsed.meetingTitle,parsed.project.title),seen=new Set();
 const drafts=parsed.drafts.map(d=>({...d,title:compactTaskTitle(d.title)})).filter(d=>{const title=taskTitleKey(d.title),key=title+'|'+d.assignee;if(!title||seen.has(key))return false;seen.add(key);return true;}).slice(0,50).map(d=>({...d,duplicate:Boolean(target)&&tasks.some(t=>t.projectId===target&&taskTitleKey(compactTaskTitle(t.title))===taskTitleKey(d.title)&&(!d.assignee||t.assignee===d.assignee||t.collaborators?.includes(d.assignee)))}));
 return {drafts,projectId:target,title:parsed.meetingTitle,omitted:Math.max(0,seen.size-50)};
}
