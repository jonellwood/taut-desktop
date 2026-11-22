export const meetingDurationKey='taut.calendar.duration.v1';
export const meetingDurations=[15,30,45,60,90,120];
export function meetingDuration(storage:Pick<Storage,'getItem'>):number{
 try{const value=Number(storage.getItem(meetingDurationKey));return meetingDurations.includes(value)?value:30;}catch{return 30;}
}
export function defaultMeetingEnd(start:string,minutes:number):string{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(start)||!meetingDurations.includes(minutes))return '';
 const date=new Date(start);if(!Number.isFinite(date.getTime()))return '';
 date.setTime(date.getTime()+minutes*60_000);
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
