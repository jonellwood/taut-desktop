export type EventTime={dateTime:string;timeZone:string};
export type CalendarEvent={id:string;calendarId?:string;availabilityOnly?:boolean;changeKey?:string;subject?:string;start:EventTime;end:EventTime;isAllDay?:boolean;isOnlineMeeting?:boolean;onlineMeetingProvider?:string;onlineMeeting?:{joinUrl?:string};isCancelled?:boolean;isOrganizer?:boolean;responseRequested?:boolean;organizer?:{emailAddress?:{name?:string;address?:string}};location?:{displayName?:string};responseStatus?:{response?:string};showAs?:string;attendees?:{type?:string;emailAddress?:{name?:string;address?:string};status?:{response?:string}}[];bodyPreview?:string;webLink?:string;type?:string;recurrence?:{pattern?:{type?:string;interval?:number;daysOfWeek?:string[]};range?:{type?:string;startDate?:string;endDate?:string;numberOfOccurrences?:number;recurrenceTimeZone?:string}}|null};
export function localDate(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function validCalendarDay(day:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;const date=new Date(day+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day;}
export function calendarAnchor(event:CalendarEvent,previous:string,submitted?:string){const value=eventDay(event);return validCalendarDay(value)?value:submitted&&validCalendarDay(submitted)?submitted:validCalendarDay(previous)?previous:localDate(new Date());}
export function calendarRange(day:string,days:number){if(!validCalendarDay(day)||!Number.isInteger(days)||days<1||days>32)throw Error('Choose a valid calendar date and range.');const start=new Date(day+'T00:00:00');const end=new Date(start);end.setDate(end.getDate()+days);return {start:start.toISOString(),end:end.toISOString()};}
export function eventDate(time:EventTime){const original=time?.dateTime;if(!original)return null;const raw=original.replace(/(\.\d{3})\d+(?=Z$|[+-]\d{2}:\d{2}$|$)/i,'$1');const explicit=/([zZ]|[+-]\d\d:\d\d)$/.test(raw);if(!explicit&&time.timeZone!=='UTC')return null;const date=new Date(raw+(explicit?'':'Z'));return Number.isNaN(date.getTime())?null:date;}
export function eventWhen(event:CalendarEvent){if(event.isAllDay)return 'All day';const options:Intl.DateTimeFormatOptions={hour:'numeric',minute:'2-digit'};return [event.start,event.end].map(t=>eventDate(t)?.toLocaleTimeString([],options)??'Time unavailable').join(' – ');}
export function responseLabel(event:CalendarEvent){if(event.isCancelled)return 'Cancelled';if(event.isOrganizer)return 'You organize this event';return ({accepted:'Accepted',tentativelyAccepted:'Tentative',declined:'Declined',notResponded:'Not yet responded',none:'No response recorded',organizer:'Organizer'} as Record<string,string>)[event.responseStatus?.response??'']??'Response unavailable';}
export function eventDay(event:CalendarEvent){if(event.isAllDay){const day=event.start?.dateTime?.slice(0,10)??'';return validCalendarDay(day)?day:'Date unavailable';}const date=eventDate(event.start);return date?localDate(date):'Date unavailable';}
export function calendarLink(value:string|undefined){try{const u=new URL(value??'');return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['outlook.office.com','outlook.office365.com','outlook.live.com'].includes(u.hostname)?u.href:null;}catch{return null;}}

export function attendeeResponseLabel(response?:string){return ({notResponded:'Not Responded',tentativelyAccepted:'Tentatively Accepted',none:'None',accepted:'Accepted',declined:'Declined',organizer:'Organizer'} as Record<string,string>)[response??'']??'Response unavailable';}

export type MeetingStatus={event:CalendarEvent|null;calendarUnavailable?:boolean;isOutOfDate?:boolean;responseRequested?:boolean;meetingMessageType?:string;previousStartDateTime?:EventTime;previousEndDateTime?:EventTime;previousLocation?:{displayName?:string}};
export function meetingResponseState(event:CalendarEvent|null,mail?:MeetingStatus){
 const answered=['accepted','tentativelyAccepted','declined'].includes(event?.responseStatus?.response??'');
 const eligible=event?.isOrganizer===false&&event?.isCancelled===false&&event?.type!=='seriesMaster'&&!!event?.changeKey;
 const request=mail===undefined||mail.meetingMessageType==='meetingRequest';
 const needsResponse=eligible&&request&&mail?.isOutOfDate!==true&&mail?.responseRequested!==false&&event?.responseRequested!==false&&event?.responseStatus?.response==='notResponded';
 return {answered,eligible,needsResponse};
}
export function meetingMessageLabel(type?:string){return ({meetingRequest:'Meeting invitation or update',meetingCancelled:'Meeting cancellation',meetingAccepted:'Meeting acceptance',meetingTentativelyAccepted:'Tentative meeting response',meetingTenativelyAccepted:'Tentative meeting response',meetingDeclined:'Meeting decline'} as Record<string,string>)[type??'']??'Meeting message';}

// Organizer identity is separate from RSVP; Graph may report their status as none.
export function calendarAttendeeLabel(event:CalendarEvent,attendee:NonNullable<CalendarEvent['attendees']>[number]){
 const organizer=event.organizer?.emailAddress?.address?.trim().toLowerCase();
 const address=attendee.emailAddress?.address?.trim().toLowerCase();
 return attendee.type!=='resource'&&organizer&&address===organizer?'Organizer · No RSVP needed':attendeeResponseLabel(attendee.status?.response);
}

// Only recorded Teams metadata can produce a join action; never parse the body.
export function teamsJoinLink(event:CalendarEvent|null|undefined):string|null{
 if(!event?.isOnlineMeeting||event.isCancelled||event.onlineMeetingProvider!=='teamsForBusiness')return null;
 const raw=event.onlineMeeting?.joinUrl;if(!raw||raw.length>8192)return null;
 try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&['teams.microsoft.com','teams.cloud.microsoft','gov.teams.microsoft.us','dod.teams.microsoft.us','teams.microsoft.us'].includes(u.hostname)&&/^\/(?:l\/meetup-join|meet)\/[^/]+/.test(u.pathname)?u.href:null;}catch{return null;}
}
