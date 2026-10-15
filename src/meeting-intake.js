import {parseMeeting} from './model.js';
export const taskTitleKey=title=>title.normalize('NFKC').toLocaleLowerCase('ko').replace(/[\s\p{P}]+/gu,'');
export function meetingIntake(body,projects,tasks,projectId=''){
 const parsed=parseMeeting(body),matched=projects.find(p=>taskTitleKey(p.title)===taskTitleKey(parsed.project.title||''));
 const target=projectId||matched?.id||'__new__',seen=new Set();
 const drafts=parsed.drafts.filter(d=>{const title=taskTitleKey(d.title),key=title+'|'+d.assignee;if(!title||seen.has(key))return false;seen.add(key);return true;}).slice(0,50).map(d=>({...d,duplicate:target!=='__new__'&&tasks.some(t=>t.projectId===target&&taskTitleKey(t.title)===taskTitleKey(d.title)&&(!d.assignee||t.assignee===d.assignee||t.collaborators?.includes(d.assignee)))}));
 return {drafts,projectId:target,newProjectTitle:parsed.project.title||parsed.meetingTitle||'회의 후속 업무',title:parsed.meetingTitle,omitted:Math.max(0,seen.size-50)};
}
