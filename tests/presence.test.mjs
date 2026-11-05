import {test} from 'node:test';import assert from 'node:assert/strict';import {describePresence} from '../src/lib/presence.ts';
test('presence distinguishes availability, activity, expiry and unknown values',()=>{
 assert.deepEqual(describePresence({id:'u',availability:'Busy',activity:'InAMeeting',seen:100},200),{label:'In a meeting',color:'#ef867e'});
 assert.equal(describePresence({id:'u',availability:'Available',seen:100},90101).label,'Presence unavailable');
 assert.equal(describePresence({id:'u',availability:'Offline',seen:100},200).label,'Offline');
 assert.equal(describePresence({id:'u',availability:'FutureValue',seen:100},200).label,'Presence unavailable');
 assert.equal(describePresence({id:'u',availability:'Away',seen:100},200).color,'#efbb70');
});
