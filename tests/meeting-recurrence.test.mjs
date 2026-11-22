import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newRecurrence,recurrenceState,restoreRecurrence,startWeekday} from '../src/lib/meeting-recurrence.ts';
const start='2026-11-23T09:00',zone='America/New_York';
test('old drafts stay single meetings and weekly rules include only explicitly selected weekdays',()=>{
 assert.equal(recurrenceState(restoreRecurrence(undefined),start,zone).value,null);
 const result=recurrenceState({...newRecurrence(),frequency:'weekly',interval:2,daysOfWeek:['wednesday','monday'],count:6},start,zone);
 assert.equal(result.error,'');assert.deepEqual(result.value,{frequency:'weekly',interval:2,daysOfWeek:['monday','wednesday'],ending:'count',count:6,endDate:null,timeZone:zone});assert.match(result.label,/Monday, Wednesday/);assert.equal(startWeekday(start),'monday');
});
test('daily end-date recurrence omits inactive count and weekdays',()=>{
 const result=recurrenceState({...newRecurrence(),frequency:'daily',ending:'date',endDate:'2026-12-23'},start,zone);
 assert.equal(result.error,'');assert.equal(result.value.count,null);assert.deepEqual(result.value.daysOfWeek,[]);assert.equal(result.value.endDate,'2026-12-23');
});
test('invalid or unbounded recurrence stays non-sendable',()=>{
 for(const change of [{interval:0},{interval:1.5},{interval:53},{count:0},{count:366},{ending:'date',endDate:'2026-11-22'},{frequency:'weekly',daysOfWeek:[]},{frequency:'weekly',daysOfWeek:['tuesday']}]){
  const result=recurrenceState({...newRecurrence(),frequency:'daily',...change},start,zone);assert.ok(result.error);assert.equal(result.value,null);
 }
 assert.throws(()=>restoreRecurrence({frequency:'unsupported',ending:'count'}));
});
