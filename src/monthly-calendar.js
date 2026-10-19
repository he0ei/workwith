import {overlapsSchedule} from './task-schedules.js';
import {shiftDay,weekRange,calendarOrder} from './weekly-calendar.js';
import {adjustSchedule,daysBetween,scheduleReason} from './schedule-bars.js';
import {dropDate} from './unscheduled-drag.js';

// Use whole Sunday–Saturday strips so intervals continue across week boundaries.
export function monthWeeks(month,tasks){
 const [year,m]=month.split('-').map(Number),last=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10),weeks=[];
 for(let start=weekRange(month+'-01').start;start<=last;start=shiftDay(start,7)){
  const end=shiftDay(start,6);
  weeks.push({start,end,tasks:tasks.filter(t=>overlapsSchedule(t,{start,end})).sort(calendarOrder)});
 }
 return weeks;
}

// A month drag uses the date under the pointer, rather than horizontal distance,
// allowing the same record to move or resize across rows without losing duration.
export function installMonthDrag(root,{capture,save,error,canStart,announce}){
 let active=null,hover=null,ghost=null,suppress=null,pending=false;
 const destination=e=>{const board=root.elementFromPoint?.(e.clientX,e.clientY)?.closest('[data-month-week]');return {board,date:board?dropDate(board,e.clientX):''};};
 function clear(){const a=active;active=null;ghost?.remove();ghost=null;hover?.classList.remove('plan-drop-target');hover=null;a?.bar.classList.remove('planning-dragging');if(a?.bar.hasPointerCapture?.(a.pointerId))a.bar.releasePointerCapture(a.pointerId);announce('');}
 const cancel=()=>{if(active?.moved)suppress={id:active.snapshot.task.id,until:Date.now()+600};clear();};
 async function apply(snapshot,next,mode,bar){
  if(next.start===snapshot.task.start&&next.due===snapshot.task.due)return;
  pending=true;bar.classList.add('schedule-saving');
  try{await save(snapshot,next,scheduleReason(snapshot.task,next,mode).replace('주간','월간'),mode);}catch(err){error(err);}finally{pending=false;bar.classList.remove('schedule-saving');}
 }
 root.addEventListener('pointerdown',e=>{
  const bar=e.target.closest?.('[data-schedule-bar]'),board=bar?.closest?.('[data-month-week]');if(!board||e.button!==0||active||pending||!canStart())return;
  const handle=e.target.closest('[data-resize]');if(handle?.disabled)return;
  const snapshot=capture(bar.dataset.scheduleBar,bar.dataset.scheduleSegment),anchor=dropDate(board,e.clientX);if(!snapshot||!anchor)return;
  active={bar,snapshot,anchor,mode:handle?.dataset.resize||'move',x:e.clientX,y:e.clientY,pointerId:e.pointerId,moved:false};bar.setPointerCapture?.(e.pointerId);
 });
 root.addEventListener('pointermove',e=>{
  const a=active;if(!a||a.pointerId!==e.pointerId)return;
  if(!a.moved&&Math.hypot(e.clientX-a.x,e.clientY-a.y)<5)return;a.moved=true;
  a.bar.classList.add('planning-dragging');
  if(!ghost&&root.body&&a.bar.cloneNode){ghost=a.bar.cloneNode(true);ghost.removeAttribute('data-schedule-bar');ghost.removeAttribute('data-action');ghost.classList.add('month-drag-ghost');ghost.inert=true;ghost.setAttribute('aria-hidden','true');root.body.append(ghost);}
  if(ghost)ghost.style.transform=`translate3d(${e.clientX+14}px,${e.clientY+14}px,0)`;
  if(e.cancelable)e.preventDefault();hover?.classList.remove('plan-drop-target');hover=null;
  const {board,date}=destination(e);a.next=date?adjustSchedule(a.snapshot.task,a.mode,daysBetween(a.anchor,date)):null;
  if(!a.next){announce('원하는 날짜에 놓아 주세요.');return;}
  hover=board.querySelector('[data-plan-date="'+date+'"]');hover?.classList.add('plan-drop-target');announce(`${a.next.start||a.next.due} ~ ${a.next.due||a.next.start} · 놓으면 저장`);
 });
 root.addEventListener('pointerup',async e=>{
  const a=active;if(!a||a.pointerId!==e.pointerId)return;
  const {date}=destination(e),next=a.moved&&date?adjustSchedule(a.snapshot.task,a.mode,daysBetween(a.anchor,date)):null;
  if(a.moved)suppress={id:a.snapshot.task.id,until:Date.now()+600};clear();if(next)await apply(a.snapshot,next,a.mode,a.bar);
 });
 root.addEventListener('pointercancel',cancel);root.addEventListener('visibilitychange',cancel);root.addEventListener('lostpointercapture',e=>{if(active?.pointerId===e.pointerId)cancel();});
 root.addEventListener('keydown',async e=>{
  if(e.key==='Escape'&&active){e.preventDefault();cancel();return;}
  const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key],bar=e.target.closest?.('[data-schedule-bar]');
  if(!delta||!bar?.closest?.('[data-month-week]')||active||pending||!canStart())return;
  const handle=e.target.closest('[data-resize]');if(handle?.disabled)return;
  const snapshot=capture(bar.dataset.scheduleBar,bar.dataset.scheduleSegment);if(!snapshot)return;e.preventDefault();
  await apply(snapshot,adjustSchedule(snapshot.task,handle?.dataset.resize||'move',delta),handle?.dataset.resize||'move',bar);
 });
 root.addEventListener('click',e=>{const bar=e.target.closest?.('[data-schedule-bar]');if(bar&&suppress?.id===bar.dataset.scheduleBar&&Date.now()<suppress.until){e.preventDefault();e.stopImmediatePropagation();}},true);
 return {isDragging:()=>Boolean(active)||pending,cancel};
}
