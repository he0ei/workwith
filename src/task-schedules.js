// Extra periods belong to the same task; gaps between periods remain unscheduled.
export function taskSchedules(task){
 return [...(task.start||task.due?[{id:'',start:task.start||task.due,due:task.due||task.start}]:[]),...(task.scheduleSlots||[])];
}
export const overlapsSchedule=(task,range)=>taskSchedules(task).some(s=>s.start<=range.end&&s.due>=range.start);
export function scheduleBars(task,range){
 return taskSchedules(task).filter(s=>s.start<=range.end&&s.due>=range.start).map(s=>({...task,start:s.start,due:s.due,_scheduleId:s.id}));
}
export function continueSchedule(task,date,id){
 if(task.status==='완료')throw Error('완료된 업무는 이어서 배정할 수 없습니다.');
 if(taskSchedules(task).some(s=>s.start<=date&&s.due>=date))throw Error('이미 해당 날짜에 배정된 업무입니다.');
 return {scheduleSlots:[...(task.scheduleSlots||[]),{id,start:date,due:date}]};
}
export function scheduleSnapshot(task,segmentId=''){
 const record=structuredClone(task);
 if(!segmentId)return {task:structuredClone(task),record,segmentId:''};
 const slot=task.scheduleSlots?.find(s=>s.id===segmentId);
 return slot?{task:{...structuredClone(task),start:slot.start,due:slot.due},record,segmentId}:null;
}
export function scheduleValue(snapshot,dates){
 if(!snapshot.segmentId)return {...(snapshot.record||snapshot.task),...dates};
 const record=snapshot.record;
 if(!record?.scheduleSlots?.some(s=>s.id===snapshot.segmentId))throw Error('추가 진행 일정을 찾을 수 없습니다.');
 return {...record,scheduleSlots:record.scheduleSlots.map(s=>s.id===snapshot.segmentId?{...s,...dates}:s)};
}
