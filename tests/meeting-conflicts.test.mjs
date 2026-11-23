import {test} from 'node:test';
import assert from 'node:assert/strict';
import {meetingConflicts} from '../src/lib/meeting-conflicts.ts';
const event={id:'a',start:{dateTime:'2026-11-23T17:00:00Z',timeZone:'UTC'},end:{dateTime:'2026-11-23T17:30:00Z',timeZone:'UTC'}};
const at=t=>Date.parse('2026-11-23T'+t+':00Z');
test('overlaps exclude boundaries, free, cancelled, declined and edited event',()=>{
 assert.equal(meetingConflicts([event],at('17:15'),at('17:45')).length,1);
 assert.equal(meetingConflicts([event],at('17:30'),at('18:00')).length,0);
 assert.equal(meetingConflicts([event],at('16:30'),at('17:00')).length,0);
 for(const patch of [{showAs:'free'},{isCancelled:true},{responseStatus:{response:'declined'}}])assert.equal(meetingConflicts([{...event,...patch}],at('17:00'),at('17:30')).length,0);
 assert.equal(meetingConflicts([event],at('17:00'),at('17:30'),'a').length,0);
 assert.equal(meetingConflicts([{...event,showAs:'tentative'}],at('17:00'),at('17:30')).length,1);
 assert.equal(meetingConflicts([event],NaN,at('17:30')).length,0);
});
test('all-day spans use local dates and include midnight-crossing meetings',()=>{
 const allDay={id:'all-day',isAllDay:true,start:{dateTime:'2026-11-23T00:00:00',timeZone:'UTC'},end:{dateTime:'2026-11-24T00:00:00',timeZone:'UTC'}};
 assert.equal(meetingConflicts([allDay],new Date('2026-11-23T23:45:00').getTime(),new Date('2026-11-24T00:15:00').getTime()).length,1);
 assert.equal(meetingConflicts([allDay],new Date('2026-11-24T00:00:00').getTime(),new Date('2026-11-24T01:00:00').getTime()).length,0);
});
