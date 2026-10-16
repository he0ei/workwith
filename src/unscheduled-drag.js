import {shiftDay} from './weekly-calendar.js';
export function dropDate(board,x){
 const rect=board.getBoundingClientRect();if(rect.width<=0||x<rect.left||x>=rect.right)return '';
 return shiftDay(board.dataset.weekTimeline,Math.floor((x-rect.left)/(rect.width/7)));
}
// Pointer capture keeps assignment consistent with moving/resizing scheduled bars.
export function installUnscheduledDrag(root,{capture,save,error,canStart,announce}){
 let active=null,hover=null,suppress=null,ghost=null;
 const clearHover=()=>{hover?.classList.remove('plan-drop-target');hover=null;};
 const clear=()=>{ghost?.remove();ghost=null;const a=active;active=null;a?.source.classList.remove('planning-dragging');if(a?.source.hasPointerCapture?.(a.pointerId))a.source.releasePointerCapture(a.pointerId);clearHover();announce('');};
 const destination=e=>{const board=root.elementFromPoint?.(e.clientX,e.clientY)?.closest('[data-week-timeline]');return {board,date:board?dropDate(board,e.clientX):''};};
 root.addEventListener('pointerdown',e=>{
  const source=e.target.closest?.('[data-plan-task]');if(!source||e.button!==0||active||!canStart())return;
  if(e.target.closest('input,select'))return;
  const snapshot=capture(source.dataset.planTask);if(!snapshot||snapshot.task.start||snapshot.task.due)return;
  active={snapshot,source,x:e.clientX,y:e.clientY,pointerId:e.pointerId,moved:false};source.setPointerCapture?.(e.pointerId);
 });
 root.addEventListener('pointermove',e=>{
  if(!active||e.pointerId!==active.pointerId)return;
  if(Math.hypot(e.clientX-active.x,e.clientY-active.y)<6&&!active.moved)return;
  active.moved=true;active.source.classList.add('planning-dragging');
  if(!ghost&&root.body&&active.source.cloneNode){ghost=active.source.cloneNode(true);ghost.removeAttribute('data-plan-task');ghost.removeAttribute('data-action');ghost.classList.add('planning-ghost');ghost.inert=true;ghost.setAttribute('aria-hidden','true');root.body.append(ghost);}
  if(ghost)ghost.style.transform=`translate3d(${e.clientX+14}px,${e.clientY+14}px,0)`;if(e.cancelable)e.preventDefault();
  clearHover();const {board,date}=destination(e);if(!date){announce('원하는 날짜에 놓아 주세요.');return;}
  hover=board.querySelector('[data-plan-date="'+date+'"]');hover?.classList.add('plan-drop-target');announce(date+'에 일정 배정 · 놓으면 저장');
 });
 root.addEventListener('pointerup',async e=>{
  if(!active||e.pointerId!==active.pointerId)return;const a=active,{date}=destination(e);
  if(a.moved)suppress={id:a.snapshot.task.id,until:Date.now()+600};clear();if(!a.moved||!date)return;
  try{await save(a.snapshot,{start:date,due:date},'주간 보드에서 일정 미지정 업무 배정 · '+date,'move');}catch(err){error(err);}
 });
 const cancel=()=>{if(active?.moved)suppress={id:active.snapshot.task.id,until:Date.now()+600};clear();};
 root.addEventListener('pointercancel',cancel);root.addEventListener('visibilitychange',cancel);root.addEventListener('lostpointercapture',e=>{if(active?.pointerId===e.pointerId)cancel();});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();cancel();}});
 root.addEventListener('click',e=>{const card=e.target.closest?.('[data-plan-task]');if(card&&suppress?.id===card.dataset.planTask&&Date.now()<suppress.until){e.preventDefault();e.stopImmediatePropagation();}},true);
 return {isDragging:()=>Boolean(active)};
}
