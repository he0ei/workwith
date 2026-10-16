import {today,dateOK,visibleTasks,participates,priorityOrder} from './model.js';
export function shiftDay(date,days){
 if(!date||!dateOK(date)||!Number.isInteger(days))throw Error('주간 일정 날짜 오류');
 const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);
}
export function weekRange(date=today()){
 if(!date||!dateOK(date))throw Error('주간 일정 날짜 오류');
 const day=new Date(date+'T12:00:00Z').getUTCDay()||7,start=shiftDay(date,1-day);
 return {start,end:shiftDay(start,6)};
}
export function weeklyCalendar(state,user,anchor=today(),now=today()){
 const current=weekRange(anchor),next=weekRange(shiftDay(current.start,7));
 const mine=visibleTasks(state,user).filter(t=>participates(t,user)&&t.status!=='완료');
 const inRange=(t,range)=>{const start=t.start||t.due,end=t.due||t.start;return Boolean(start&&end&&start<=range.end&&end>=range.start);};
 const list=range=>mine.filter(t=>inRange(t,range)).sort((a,b)=>(a.start||a.due).localeCompare(b.start||b.due)||priorityOrder(a,b));
 return {current:{...current,tasks:list(current)},next:{...next,tasks:list(next)},overdue:mine.filter(t=>t.due&&t.due<now&&t.due<current.start).sort(priorityOrder),unscheduled:mine.filter(t=>!t.start&&!t.due).sort(priorityOrder)};
}
