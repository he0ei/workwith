// Relationships inherit task RLS; archive text is never copied into a task.
export function linkedMinutes(task,minutes){
 const ids=new Set(Array.isArray(task.minuteIds)?task.minuteIds:[]);
 return minutes.filter(m=>ids.has(m.id));
}
export function selectedMinuteIds(ids,minutes){
 const available=new Set(minutes.map(m=>m.id));
 return [...new Set(ids.filter(id=>typeof id==='string'&&available.has(id)))];
}
