// Extra periods belong to the same task; gaps between periods remain unscheduled.
export function taskSchedules(task){
 const primary=task.start||task.due?{id:'',start:task.start||task.due,due:task.due||task.start}:null;
 // Keep older additional periods in storage, but never draw them twice inside an extended primary period.
 return [...(primary?[primary]:[]),...(task.scheduleSlots||[]).filter(s=>!primary||s.start<primary.start||s.due>primary.due)];
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

export function extendDeadline(task,date){
 if(task.status==='완료')throw Error('완료된 업무의 마감일은 연장할 수 없습니다.');
 const valid=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 if(!valid)throw Error('마감일 날짜를 확인해 주세요.');
 const end=taskSchedules(task).map(s=>s.due).sort().at(-1);
 if(!end||date<=end)throw Error('기존 일정 이후 날짜에 놓아 마감일을 연장해 주세요.');
 return {due:date};
}
