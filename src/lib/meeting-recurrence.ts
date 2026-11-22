export const recurrenceDays=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
export type RecurrenceForm={frequency:'none'|'daily'|'weekly';interval:number;daysOfWeek:string[];ending:'count'|'date';count:number;endDate:string};
export const newRecurrence=():RecurrenceForm=>({frequency:'none',interval:1,daysOfWeek:[],ending:'count',count:10,endDate:''});
export function startWeekday(start:string){const d=new Date(start);return Number.isFinite(d.getTime())?['sunday',...recurrenceDays.slice(0,6)][d.getDay()]:null;}
export function restoreRecurrence(value:any):RecurrenceForm{
 if(value==null)return newRecurrence();
 if(!['none','daily','weekly'].includes(value.frequency)||!['count','date'].includes(value.ending))throw Error('Saved recurrence could not be read. Discard the draft before creating a replacement.');
 return {frequency:value.frequency,interval:typeof value.interval==='number'?value.interval:NaN,daysOfWeek:Array.isArray(value.daysOfWeek)?value.daysOfWeek.filter((d:unknown)=>typeof d==='string'):[],ending:value.ending,count:typeof value.count==='number'?value.count:NaN,endDate:typeof value.endDate==='string'?value.endDate:''};
}
export function recurrenceState(form:RecurrenceForm,start:string,zone:string){
 let error='';let value:null|{frequency:string;interval:number;daysOfWeek:string[];ending:string;count:number|null;endDate:string|null;timeZone:string}=null;
 if(form.frequency==='none')return {error,value,label:'Does not repeat'};
 const days=recurrenceDays.filter(d=>form.daysOfWeek.includes(d));
 const label=`Every ${form.interval} ${form.frequency==='daily'?(form.interval===1?'day':'days'):(form.interval===1?'week':'weeks')}${form.frequency==='weekly'?' on '+days.map(d=>d[0].toUpperCase()+d.slice(1)).join(', '):''} · ${form.ending==='count'?form.count+(form.count===1?' occurrence':' occurrences'):'through '+form.endDate} · ${zone}`;
 if(!['daily','weekly'].includes(form.frequency)||!Number.isInteger(form.interval)||form.interval<1||form.interval>52)error='Repeat every 1–52 days or weeks.';
 else if(!startWeekday(start))error='Choose a valid first meeting date and time.';
 else if(form.frequency==='weekly'&&(!days.length||days.length!==form.daysOfWeek.length||!days.includes(startWeekday(start)!)))error="Select weekdays including the first meeting’s weekday.";
 else if(form.ending==='count'&&(!Number.isInteger(form.count)||form.count<1||form.count>365))error='Use 1–365 occurrences.';
 else if(form.ending==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(form.endDate)||!Number.isFinite(Date.parse(form.endDate+'T12:00:00'))||form.endDate<start.slice(0,10)))error='Choose a series end date on or after the first meeting date.';
 if(!error)value={frequency:form.frequency,interval:form.interval,daysOfWeek:form.frequency==='weekly'?days:[],ending:form.ending,count:form.ending==='count'?form.count:null,endDate:form.ending==='date'?form.endDate:null,timeZone:zone};
 return {error,value,label};
}
