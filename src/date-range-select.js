import {dropDate} from './unscheduled-drag.js';

// Earlier date first, whichever direction the pointer moved.
export function dateRange(a,b){return a<=b?{start:a,due:b}:{start:b,due:a};}

// Dragging across empty days of the month board selects a date range for a new
// task. Bars keep their own move/resize drag; touch keeps scrolling the page.
export function installDateRangeSelect(root,{canStart,select}){
 let active=null,suppressUntil=0;
 const dateAt=e=>{const board=root.elementFromPoint?.(e.clientX,e.clientY)?.closest?.('[data-month-week]');return board?dropDate(board,e.clientX):'';};
 const mark=range=>{for(const h of root.querySelectorAll?.('[data-month-week] [data-plan-date]')||[])h.classList.toggle('range-selected',Boolean(range)&&h.dataset.planDate>=range.start&&h.dataset.planDate<=range.due);};
 const clear=()=>{const a=active;active=null;mark(null);if(a?.target.hasPointerCapture?.(a.pointerId))a.target.releasePointerCapture(a.pointerId);};
 root.addEventListener('pointerdown',e=>{
  if(active||e.button!==0||e.pointerType==='touch'||!canStart(e))return;
  const board=e.target.closest?.('[data-month-week]');if(!board||e.target.closest('[data-schedule-bar],button,a,input,select'))return;
  const date=dropDate(board,e.clientX);if(!date)return;
  active={from:date,to:date,x:e.clientX,y:e.clientY,moved:false,pointerId:e.pointerId,target:e.target};e.target.setPointerCapture?.(e.pointerId);
 });
 root.addEventListener('pointermove',e=>{
  if(!active||e.pointerId!==active.pointerId)return;
  if(!active.moved&&Math.hypot(e.clientX-active.x,e.clientY-active.y)<6)return;
  active.moved=true;if(e.cancelable)e.preventDefault();
  const date=dateAt(e);if(date)active.to=date;mark(dateRange(active.from,active.to));
 });
 root.addEventListener('pointerup',e=>{
  if(!active||e.pointerId!==active.pointerId)return;
  const a=active,date=dateAt(e);if(date)a.to=date;clear();
  if(!a.moved)return;
  suppressUntil=Date.now()+600;select(dateRange(a.from,a.to));
 });
 root.addEventListener('pointercancel',clear);
 // The click that ends a drag must not also open a single-day task.
 return {consumeClick:()=>Date.now()<suppressUntil,cancel:clear,isSelecting:()=>Boolean(active?.moved)};
}
