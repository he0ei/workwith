import {linkedMinutes} from './task-minutes.js';
// This is a preview of saved text, never an invented summary or a data rewrite.
export function workSummary(task,minutes=[],limit=180){
 const records=linkedMinutes(task,minutes).sort((a,b)=>(b.meetingDate||b.at||'').localeCompare(a.meetingDate||a.at||''));
 const source=task.note?.trim()||records[0]?.body||'';
 const clean=source.replace(/^회의록 검토 후 등록\s*(?:출처:[^\n]*\n)?/u,'').replace(/\s+/gu,' ').trim();
 return clean.length>limit?clean.slice(0,limit)+'…':clean;
}
// Touch/pen scroll must never become a schedule write, even in edit mode.
export function canAdjustCalendar(options,event={}){
 return options.editing&&!options.preview&&!options.busy&&!options.syncing&&!options.dialogOpen&&options.view==='calendar'&&!['touch','pen'].includes(event.pointerType);
}
