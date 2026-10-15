// Meeting links are managed on archived meeting records; only project tasks qualify.
export const meetingProjectIds=m=>[...new Set([m.projectId,...(m.projectIds||[])].filter(Boolean))];
export function linkedMinutes(task,minutes){
 if(!task.projectId||task.visibility!=='shared')return [];
 const legacy=new Set(Array.isArray(task.minuteIds)?task.minuteIds:[]);
 return minutes.filter(m=>meetingProjectIds(m).includes(task.projectId)&&(Array.isArray(m.taskIds)?m.taskIds.includes(task.id):legacy.has(m.id)));
}
export function meetingTasks(meeting,tasks){
 return tasks.filter(t=>linkedMinutes(t,[meeting]).length);
}
export function selectMeetingTaskIds(ids,projectId,tasks){
 const allowed=new Set(tasks.filter(t=>projectId&&t.projectId===projectId&&t.visibility==='shared').map(t=>t.id));
 return [...new Set(ids.filter(id=>typeof id==='string'&&allowed.has(id)))];
}
