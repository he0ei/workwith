// Keep the task and concurrency version from the moment dragging starts.
export function installBoardDrag(root,{capture,move,error,allowed,canStart}){
 let active=null,source=null,hover=null;
 const highlight=column=>{hover?.classList.remove('drop-target');hover=column;hover?.classList.add('drop-target');};
 const clear=()=>{source?.classList.remove('dragging');highlight(null);source=null;active=null;};
 root.addEventListener('dragstart',e=>{
  const card=e.target.closest('[data-drag-task]');
  if(!card)return;
  if(e.target.closest('button,select,input,textarea,a')||!canStart()){e.preventDefault();return;}
  active=capture(card.dataset.dragTask);
  if(!active){e.preventDefault();return;}
  source=card;card.classList.add('dragging');
  e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',card.dataset.dragTask);
 });
 root.addEventListener('dragover',e=>{
  const column=e.target.closest('[data-drop-status]');
  if(!active||!column||!allowed(column.dataset.dropStatus))return;
  e.preventDefault();e.dataTransfer.dropEffect='move';highlight(column);
 });
 root.addEventListener('dragleave',e=>{if(hover&&!hover.contains(e.relatedTarget))highlight(null);});
 root.addEventListener('dragend',clear);
 root.addEventListener('drop',async e=>{
  const column=e.target.closest('[data-drop-status]'),snapshot=active;
  if(!snapshot||!column||!allowed(column.dataset.dropStatus))return;
  e.preventDefault();const status=column.dataset.dropStatus;clear();
  if(snapshot.task.status===status)return;
  try{await move(snapshot,status);}catch(err){error(err);}
 });
 return {isDragging:()=>Boolean(active)};
}
