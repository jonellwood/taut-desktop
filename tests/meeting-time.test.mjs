import {test} from 'node:test';
import assert from 'node:assert/strict';
import {meetingDuration,defaultMeetingEnd} from '../src/lib/meeting-time.ts';
test('meeting duration defaults safely and accepts supported saved preferences',()=>{
 for(const value of [null,'bad','0','-1','144000','31'])assert.equal(meetingDuration({getItem:()=>value}),30);
 assert.equal(meetingDuration({getItem:()=> '45'}),45);
 assert.equal(meetingDuration({getItem:()=>{throw Error('denied');}}),30);
});
test('automatic end time uses local time and rolls into the next date',()=>{
 assert.equal(defaultMeetingEnd('2026-11-23T10:00',45),'2026-11-23T10:45');
 assert.equal(defaultMeetingEnd('2026-11-23T23:45',30),'2026-11-24T00:15');
 for(const start of ['','2026-11-23T','T10:00','invalid'])assert.equal(defaultMeetingEnd(start,30),'');
});
