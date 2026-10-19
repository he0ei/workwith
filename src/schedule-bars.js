import {dateOK,taskPeople} from './model.js';
import {shiftDay} from './weekly-calendar.js';
export const PERSON_COLORS={jh:{background:'#dff3ff',accent:'#0878ae'},sy:{background:'#eee5ff',accent:'#7045b5'},sj:{background:'#e9f5d0',accent:'#557620'},ceo:{background:'#edf0f4',accent:'#526170'}};
export const daysBetween=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
export function barPosition(task,range){
 const start=task.start||task.due,end=task.due||task.start;
 if(!start||!end||!dateOK(start)||!dateOK(end)||start>end||start>range.end||end<range.start)return null;
 const first=Math.max(0,daysBetween(range.start,start)),last=Math.min(6,daysBetween(range.start,end));
 return {first,span:last-first+1,clippedStart:start<range.start,clippedEnd:end>range.end};
}
export function adjustSchedule(task,mode,delta){
 if(!Number.isInteger(delta)||!['move','start','due'].includes(mode))throw Error('일정 조정 방식 오류');
 const start=task.start||task.due,end=task.due||task.start;if(!start||!end)throw Error('먼저 시작일 또는 마감일을 지정해 주세요.');
 if(mode==='move')return {start:task.start?shiftDay(task.start,delta):'',due:task.due?shiftDay(task.due,delta):''};
 // Pulling either edge establishes an explicit range for one-date tasks.
 return mode==='start'?{start:shiftDay(start,Math.min(delta,daysBetween(start,end))),due:end}:{start,due:shiftDay(end,Math.max(delta,-daysBetween(start,end)))};
}
export function barPeople(task){return taskPeople(task).map(id=>({id,...PERSON_COLORS[id]}));}
export function scheduleReason(task,next,mode){return `주간 보드 ${mode==='move'?'일정 이동':mode==='start'?'시작일 조정':'마감일 조정'} · ${task.start||'미지정'} ~ ${task.due||'미지정'} → ${next.start||'미지정'} ~ ${next.due||'미지정'}`;}
// Capture both the record and its version before any pointer/keyboard adjustment.
export function installScheduleDrag(root,{capture,save,error,canStart,announce}){
 let active=null,suppress=null;
 function paint(bar,task,range){const p=barPosition(task,range);if(!p)return;for(let i=0;i<7;i++)bar.classList.remove('bar-start-'+i);for(let i=1;i<=7;i++)bar.classList.remove('bar-span-'+i);bar.classList.add('bar-start-'+p.first,'bar-span-'+p.span);}
 function clear(restore=true){if(!active)return;const a=active;active=null;if(restore)paint(a.bar,a.snapshot.task,a.range);if(a.bar.style){a.bar.style.transform='';a.bar.style.width='';}a.bar.classList.remove('schedule-dragging');if(a.bar.hasPointerCapture?.(a.pointerId))a.bar.releasePointerCapture(a.pointerId);}
 async function apply(snapshot,next,mode){if(snapshot.task.start===next.start&&snapshot.task.due===next.due)return;await save(snapshot,next,scheduleReason(snapshot.task,next,mode),mode);}
 root.addEventListener('pointerdown',e=>{
  const bar=e.target.closest?.('[data-schedule-bar]');if(!bar||bar.closest?.('[data-month-week]')?.dataset.monthWeek||e.button!==0||!canStart()||active)return;
  const handle=e.target.closest('[data-resize]');if(handle?.disabled)return;
  const snapshot=capture(bar.dataset.scheduleBar,bar.dataset.scheduleSegment);if(!snapshot)return;
  const board=bar.closest('[data-week-timeline]'),range={start:board.dataset.weekTimeline,end:shiftDay(board.dataset.weekTimeline,6)};
  active={bar,board,range,snapshot,mode:handle?.dataset.resize||'move',x:e.clientX,delta:0,next:null,moved:false,width:bar.getBoundingClientRect?.().width||0,pointerId:e.pointerId};
  bar.setPointerCapture?.(e.pointerId);
 });
 root.addEventListener('pointermove',e=>{
  if(!active||active.pointerId!==e.pointerId)return;
  const a=active,width=a.board.getBoundingClientRect().width/7,raw=e.clientX-a.x;
  if(Math.abs(raw)<5&&!a.moved)return;a.moved=true;
  const origin=barPosition(a.snapshot.task,a.range),duration=daysBetween(a.snapshot.task.start||a.snapshot.task.due,a.snapshot.task.due||a.snapshot.task.start);
  const px=(origin.clippedStart||origin.clippedEnd)&&a.mode==='move'?raw:a.mode==='move'?Math.max(-origin.first*width,Math.min(raw,(7-origin.first-origin.span)*width)):a.mode==='start'?Math.max(-origin.first*width,Math.min(raw,duration*width)):Math.max(-duration*width,Math.min(raw,(7-origin.first-origin.span)*width));
  const delta=Math.round(px/width),next=adjustSchedule(a.snapshot.task,a.mode,delta);if(!barPosition({...a.snapshot.task,...next},a.range))return;
  a.delta=delta;a.next=next;a.bar.classList.add('schedule-dragging');
  if(a.bar.style&&!origin.clippedStart&&!origin.clippedEnd){a.bar.style.transform=`translate3d(${a.mode==='due'?0:px}px,0,0)`;if(a.mode!=='move')a.bar.style.width=Math.max(width-8,a.width+(a.mode==='start'?-px:px))+'px';}
  else paint(a.bar,{...a.snapshot.task,...next},a.range);
  if(e.cancelable)e.preventDefault();
  announce(`${next.start||next.due} ~ ${next.due||next.start} · 놓으면 저장`);
 });
 root.addEventListener('pointerup',async e=>{
  if(!active||active.pointerId!==e.pointerId)return;const a=active;
  const rect=a.board.getBoundingClientRect(),inside=e.clientY>=rect.top&&e.clientY<=rect.bottom&&e.clientX>=rect.left&&e.clientX<=rect.right;
  if(a.moved)suppress={id:a.snapshot.task.id,until:Date.now()+600};const changed=a.next&&a.delta!==0&&inside;if(changed)paint(a.bar,{...a.snapshot.task,...a.next},a.range);clear(!changed);announce('');
  if(!changed)return;
  a.bar.classList.add('schedule-saving');try{await apply(a.snapshot,a.next,a.mode);}catch(err){paint(a.bar,a.snapshot.task,a.range);error(err);}finally{a.bar.classList.remove('schedule-saving');}
 });
 const cancel=()=>{if(active?.moved)suppress={id:active.snapshot.task.id,until:Date.now()+600};clear();announce('');};
 root.addEventListener('pointercancel',cancel);root.addEventListener('visibilitychange',cancel);root.addEventListener('lostpointercapture',e=>{if(active?.pointerId===e.pointerId)cancel();});
 root.addEventListener('keydown',async e=>{
  if(e.key==='Escape'&&active){e.preventDefault();cancel();return;}
  if(active||e.target.closest?.('[data-status-indicator]'))return;
  const bar=e.target.closest?.('[data-schedule-bar]');if(!bar||bar.closest?.('[data-month-week]')?.dataset.monthWeek||!['ArrowLeft','ArrowRight'].includes(e.key)||!canStart())return;
  const handle=e.target.closest('[data-resize]');if(handle?.disabled)return;
  e.preventDefault();const snapshot=capture(bar.dataset.scheduleBar,bar.dataset.scheduleSegment);if(!snapshot)return;
  try{await apply(snapshot,adjustSchedule(snapshot.task,handle?.dataset.resize||'move',e.key==='ArrowLeft'?-1:1),handle?.dataset.resize||'move');}catch(err){error(err);}
 });
 root.addEventListener('click',e=>{const bar=e.target.closest?.('[data-schedule-bar]');if(bar&&suppress?.id===bar.dataset.scheduleBar&&Date.now()<suppress.until){e.preventDefault();e.stopImmediatePropagation();return;}if(e.target.closest?.('[data-resize]')){e.preventDefault();e.stopImmediatePropagation();}},true);
 return {isDragging:()=>Boolean(active),cancel};
}
