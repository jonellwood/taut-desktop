import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarRange,eventDate,eventDay,eventWhen,responseLabel,attendeeResponseLabel,calendarLink,meetingResponseState,meetingMessageLabel} from '../src/lib/calendar.ts';
test('calendar dates keep UTC instants and all-day calendar dates',()=>{
 assert.equal(eventDate({dateTime:'2026-11-12T15:00:00',timeZone:'UTC'}).toISOString(),'2026-11-12T15:00:00.000Z');
 assert.equal(eventDate({dateTime:'2026-11-12T15:00:00',timeZone:'Unknown'}),null);
 assert.equal(eventDay({isAllDay:true,start:{dateTime:'2026-11-12T00:00:00',timeZone:'UTC'}}),'2026-11-12');
 assert.equal(eventWhen({isAllDay:true}),'All day');
 const range=calendarRange('2026-11-12',7);assert.ok(new Date(range.end)>new Date(range.start));
});
test('recorded RSVP and cancellation are distinguished without inventing responses',()=>{
 assert.equal(responseLabel({responseStatus:{response:'accepted'}}),'Accepted');
 assert.equal(responseLabel({responseStatus:{response:'notResponded'}}),'Not yet responded');
 assert.equal(responseLabel({isCancelled:true,isOrganizer:true}),'Cancelled');
 assert.equal(responseLabel({}),'Response unavailable');
});
test('calendar links cannot open arbitrary destinations',()=>{
 assert.ok(calendarLink('https://outlook.office.com/calendar/item/1'));
 for(const url of ['javascript:alert(1)','https://evil.test/','https://outlook.office.com.evil.test/','https://user@outlook.office.com/'])assert.equal(calendarLink(url),null);
});

test('attendee response labels are readable Graph statuses',()=>{
 for(const [value,label] of Object.entries({notResponded:'Not Responded',tentativelyAccepted:'Tentatively Accepted',none:'None',accepted:'Accepted',declined:'Declined'}))assert.equal(attendeeResponseLabel(value),label);
 assert.equal(attendeeResponseLabel(),'Response unavailable');
});


test('meeting attention follows current RSVP and explicit request metadata only',()=>{
 const event={id:'e',changeKey:'v1',isOrganizer:false,isCancelled:false,responseRequested:true,responseStatus:{response:'notResponded'}};
 assert.equal(meetingResponseState(event).needsResponse,true);
 for(const response of ['accepted','tentativelyAccepted','declined']){
  const answered={...event,changeKey:'new-version',responseStatus:{response}};
  assert.equal(meetingResponseState(answered,{event:answered,meetingMessageType:'meetingRequest',isRead:false}).needsResponse,false);
  assert.equal(meetingResponseState(answered).answered,true);
 }
 for(const meta of [{meetingMessageType:'meetingRequest',isOutOfDate:true},{meetingMessageType:'meetingRequest',responseRequested:false},{meetingMessageType:'meetingAccepted'},{meetingMessageType:'meetingCancelled'},{}])assert.equal(meetingResponseState(event,{event,...meta}).needsResponse,false);
 for(const changed of [{isCancelled:true},{isOrganizer:true},{type:'seriesMaster'},{responseRequested:false},{changeKey:undefined},{responseStatus:{response:'none'}},{responseStatus:{}}])assert.equal(meetingResponseState({...event,...changed}).needsResponse,false);
 assert.equal(meetingResponseState(null).needsResponse,false);
 assert.equal(meetingMessageLabel('meetingAccepted'),'Meeting acceptance');
});
