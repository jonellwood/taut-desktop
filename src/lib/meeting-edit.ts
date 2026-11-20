import {eventDate,type CalendarEvent} from './calendar.ts';
export type EditableEvent=CalendarEvent&{body?:{contentType?:string;content?:string};isOnlineMeeting?:boolean;locations?:{displayName?:string}[]};
export type PersonEdit={address:string;kind:'required'|'optional'};
export type EditForm={subject:string;start:string;end:string;description:string;note:string;required:string;optional:string;changeRoom:boolean;roomAddress:string;roomName:string};
export type MeetingChanges={subject?:string;start?:string;end?:string;description?:string;descriptionNote?:string;people?:PersonEdit[];changeRoom?:boolean;room?:{emailAddress:string;displayName:string}|null};
export const manageAttemptKey=(account:string,id:string,version:string)=>JSON.stringify(['taut-meeting-manage',account,id,version]);
export const canManageMeeting=(event:CalendarEvent)=>event.isOrganizer===true&&event.isCancelled===false&&event.type==='singleInstance'&&!!event.changeKey;
export const canReplaceDescription=(event:EditableEvent)=>event.body?.contentType?.toLowerCase()==='text'&&event.isOnlineMeeting===false;
export function localMeetingTime(time:CalendarEvent['start']){const date=eventDate(time);if(!date)return '';const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,23);}
export function editForm(event:EditableEvent):EditForm{
 const resources=event.attendees?.filter(a=>a.type==='resource')??[],first=resources[0];
 return {subject:event.subject??'',start:localMeetingTime(event.start),end:localMeetingTime(event.end),description:canReplaceDescription(event)?event.body?.content??'':'',note:'',required:(event.attendees??[]).filter(a=>a.type==='required').map(a=>a.emailAddress?.address??'').join('; '),optional:(event.attendees??[]).filter(a=>a.type==='optional').map(a=>a.emailAddress?.address??'').join('; '),changeRoom:false,roomAddress:first?.emailAddress?.address??'',roomName:first?.emailAddress?.name??first?.emailAddress?.address??''};
}
const addresses=(value:string)=>value.split(/[;,\n]/).map(s=>s.trim()).filter(Boolean);
export function meetingChanges(event:EditableEvent,form:EditForm):MeetingChanges{
 const original=editForm(event),changes:MeetingChanges={};
 if(form.subject.trim()!==original.subject.trim())changes.subject=form.subject.trim();
 if(!form.subject.trim()||form.subject.length>255)throw Error('Add a subject within 255 characters.');
 if(form.start!==original.start||form.end!==original.end){
  const start=new Date(form.start),end=new Date(form.end);
  if(event.isAllDay!==false||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end.getTime()-start.getTime()>31*86400000)throw Error('Choose valid times with the end after the start, within 31 days.');
  changes.start=start.toISOString();changes.end=end.toISOString();
 }
 if(canReplaceDescription(event)&&form.description!==original.description)changes.description=form.description;
 if(!canReplaceDescription(event)&&form.note.trim())changes.descriptionNote=form.note.trim();
 const people:PersonEdit[]=[...addresses(form.required).map(address=>({address,kind:'required' as const})),...addresses(form.optional).map(address=>({address,kind:'optional' as const}))];
 const existing=[...addresses(original.required).map(address=>({address,kind:'required'})),...addresses(original.optional).map(address=>({address,kind:'optional'}))];
 if(JSON.stringify(people)!==JSON.stringify(existing)){
  if((event.attendees??[]).some(a=>!['required','optional','resource'].includes(a.type??'')))throw Error('Use Outlook to edit this attendee list.');
  changes.people=people;
 }
 const resources=(event.attendees??[]).filter(a=>a.type==='resource');
 if(form.changeRoom&&(form.roomAddress.toLowerCase()!==original.roomAddress.toLowerCase()||(!form.roomAddress&&!!event.location?.displayName))){
  if(resources.length>1||(event.locations?.length??0)>1)throw Error('Use Outlook to change meetings with multiple rooms or locations.');
  changes.changeRoom=true;changes.room=form.roomAddress?{emailAddress:form.roomAddress,displayName:form.roomName}:null;
 }
 const all=[...people.map(p=>p.address),...(changes.changeRoom?(form.roomAddress?[form.roomAddress]:[]):resources.map(a=>a.emailAddress?.address??''))];
 if(people.length>20||all.some(a=>!/^\S+@[^\s@]+$/.test(a))||new Set(all.map(a=>a.toLowerCase())).size!==all.length)throw Error('Use up to 20 unique valid people addresses and a distinct room.');
 return changes;
}
