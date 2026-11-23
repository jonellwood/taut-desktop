import {eventDate,type CalendarEvent} from './calendar.ts';
export function meetingConflicts(events:CalendarEvent[],start:number,end:number,exclude=''){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
 return events.filter(event=>{
  if(event.id===exclude||event.isCancelled||event.showAs==='free'||event.responseStatus?.response==='declined')return false;
  const first=event.isAllDay?new Date(event.start.dateTime.slice(0,10)+'T00:00:00').getTime():eventDate(event.start)?.getTime();
  const last=event.isAllDay?new Date(event.end.dateTime.slice(0,10)+'T00:00:00').getTime():eventDate(event.end)?.getTime();
  return first!=null&&last!=null&&first<end&&last>start;
 });
}
