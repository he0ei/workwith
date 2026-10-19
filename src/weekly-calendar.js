import {taskSchedules,overlapsSchedule} from './task-schedules.js';
import {today,dateOK,visibleTasks,participates,PRIORITIES,taskStatus} from './model.js';
// Keep dates out of tie-breaking so moving a bar does not reshuffle its row.
export function calendarOrder(a,b){
 const paused=t=>taskStatus(t.status)==='검토 요청',rank=t=>PRIORITIES.indexOf(PRIORITIES.includes(t.priority)?t.priority:'보통');
 return Number(paused(a))-Number(paused(b))||rank(a)-rank(b)||a.title.localeCompare(b.title,'ko')||a.id.localeCompare(b.id);
}
export function shiftDay(date,days){
 if(!date||!dateOK(date)||!Number.isInteger(days))throw Error('주간 일정 날짜 오류');
 const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);
}
export function weekRange(date=today()){
 if(!date||!dateOK(date))throw Error('주간 일정 날짜 오류');
 const day=new Date(date+'T12:00:00Z').getUTCDay(),start=shiftDay(date,-day);
 return {start,end:shiftDay(start,6)};
}
export function weekDays(range,now=today()){
 return Array.from({length:7},(_,index)=>{
  const date=shiftDay(range.start,index);
  const entries=range.tasks.filter(t=>taskSchedules(t).some(s=>s.start===date||s.due===date)).sort(calendarOrder).map(task=>({task,labels:[...(taskSchedules(task).some(s=>s.start===date)?['시작']:[]),...(taskSchedules(task).some(s=>s.due===date)?['마감']:[]) ]}));
  return {date,weekday:['일','월','화','수','목','금','토'][index],isToday:date===now,isWeekend:index===0||index===6,entries};
 });
}
export const calendarTasks=(state,user,member='')=>visibleTasks(state,user).filter(t=>!member||participates(t,member)).sort(calendarOrder);
export function weeklyCalendar(state,user,anchor=today(),now=today(),member=''){
 const current=weekRange(anchor),previous=weekRange(shiftDay(current.start,-7)),next=weekRange(shiftDay(current.start,7));
 const mine=calendarTasks(state,user,member);
 const inRange=overlapsSchedule;
 const list=range=>mine.filter(t=>inRange(t,range)).sort(calendarOrder);
 return {previous:{...previous,tasks:list(previous)},current:{...current,tasks:list(current)},next:{...next,tasks:list(next)},overdue:mine.filter(t=>t.status!=='완료'&&taskSchedules(t).length&&taskSchedules(t).every(s=>s.due<now&&s.due<current.start)).sort(calendarOrder),unscheduled:mine.filter(t=>!taskSchedules(t).length).sort(calendarOrder)};
}
// A task spanning today counts once, including completed work shown on the calendar.
export function calendarDayTasks(state,user,date=today()){
 return calendarTasks(state,user).filter(t=>{return overlapsSchedule(t,{start:date,end:date});});
}
