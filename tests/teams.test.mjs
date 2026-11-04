import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isChannelActivity,channelText,postTime,mergeTeams,mergeChannels} from '../src/lib/teams.ts';
test('only known events and legacy event metadata are classified as activity',()=>{
 assert.equal(isChannelActivity({id:'event',messageType:'systemEventMessage'}),true);
 assert.equal(isChannelActivity({id:'legacy',messageType:'unknownFutureValue',eventDetail:{'@odata.type':'#microsoft.graph.membersAddedEventMessageDetail'}}),true);
 assert.equal(isChannelActivity({id:'legacy-marker',messageType:'unknownFutureValue',body:{content:'<systemEventMessage/>'}}),true);
 assert.equal(isChannelActivity({id:'no-sender',messageType:'message',body:{content:'A normal post'}}),false);
 assert.equal(isChannelActivity({id:'literal',messageType:'message',body:{content:'<systemEventMessage/>'}}),false);
});
test('unknown enum values with readable text are not discarded',()=>{
 const message={id:'future',messageType:'futureKind',body:{contentType:'text',content:'Actual readable content'}};
 assert.equal(isChannelActivity(message),false);assert.equal(channelText(message),'Actual readable content');
});
test('deleted content stays masked even if its original type was an event',()=>{
 const message={id:'deleted',messageType:'systemEventMessage',deletedDateTime:'2026-01-01',body:{contentType:'text',content:'PRIVATE'}};
 assert.equal(isChannelActivity(message),false);assert.equal(channelText(message),'Message deleted');
});
test('historical timestamps include the year',()=>assert.match(postTime({id:'historic',createdDateTime:'2022-12-07T18:29:00Z'}),/2022/));
test('direct membership metadata enriches duplicate associated teams',()=>assert.deepEqual(mergeTeams([[{id:'one',displayName:'Team'}],[{id:'one',description:'Details'}]]),[{id:'one',displayName:'Team',description:'Details'}]));
test('channel deduplication retains verified host metadata',()=>assert.deepEqual(mergeChannels([[{id:'shared',hostTeamId:'host'}],[{id:'shared',displayName:'Roadmap',hostTeamId:null}]]),[{id:'shared',displayName:'Roadmap',hostTeamId:'host'}]));
