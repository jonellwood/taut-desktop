import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conversationActivity,activityIdentities,identityKey} from '../src/lib/activity.ts';
const person=(id,name)=>({id,displayName:name});
const event=(type,extra={})=>({messageType:'systemEventMessage',eventDetail:{'@odata.type':`#microsoft.graph.${type}EventMessageDetail`,...extra}});

test('member additions and removals use structured identities, including multiple people',()=>{
 const source={initiator:{user:person('actor','Alex')},members:[person('a','Blair'),person('b','Casey')]};
 assert.equal(conversationActivity(event('membersAdded',source)).summary,'Alex added Blair and Casey to the group');
 assert.equal(conversationActivity(event('membersDeleted',source)).summary,'Alex removed Blair and Casey from the group');
 assert.equal(conversationActivity(event('membersAdded',{...source,members:[...source.members,person('c','Devon')]})).summary,'Alex added Blair, Casey, and Devon to the group');
});
test('self-removal is leaving, and joins/leaves do not invent an initiator',()=>{
 const self=person('me','Alex');
 assert.equal(conversationActivity(event('membersDeleted',{initiator:{user:self},members:[self]}),{},'ME').summary,'You left the group');
 assert.equal(conversationActivity(event('membersDeleted',{initiator:{user:person('other','Blair')},members:[self]}),{},'me').summary,'Blair removed you from the group');
 assert.equal(conversationActivity(event('membersJoined',{members:[self]}),{},'me').summary,'You joined the group');
 assert.equal(conversationActivity(event('membersLeft',{members:[person('other','Blair')]})).summary,'Blair left the group');
});
test('rename uses actual group title as plain text and has an honest missing-name fallback',()=>{
 assert.equal(conversationActivity(event('chatRenamed',{chatDisplayName:'<script>alert(1)</script>',initiator:{user:person('me','Alex')}}),{},'me').summary,'You renamed the group to “<script>alert(1)</script>”');
 assert.equal(conversationActivity(event('chatRenamed',{})).summary,'Someone updated the group name');
});
test('missing identities use cached exact IDs or neutral labels, never ID strings',()=>{
 const source={initiator:{user:{id:'unknown-actor'}},members:[{id:'removed-user'},{id:'missing'}]};
 const names={[identityKey({id:'removed-user'})]:'Casey'};
 assert.equal(conversationActivity(event('membersAdded',source),names).summary,'Someone added Casey and a participant to the group');
 assert.equal(conversationActivity(event('membersAdded',{members:[{id:'unknown'}]})).summary,'Someone added a participant to the group');
 assert.equal(conversationActivity(event('membersDeleted',{members:[{id:'a'},{id:'b'}]})).summary,'Someone removed 2 participants from the group');
});
test('history visibility is reported only when supplied, without guessing the chosen option',()=>{
 assert.equal(conversationActivity(event('membersAdded',{visibleHistoryStartDateTime:'0001-01-01T00:00:00Z'})).history,'All previous messages shared');
 assert.match(conversationActivity(event('membersAdded',{visibleHistoryStartDateTime:'2026-11-01T12:00:00Z'})).history,/History available from/);
 for(const value of [undefined,null,'invalid'])assert.equal(conversationActivity(event('membersAdded',{visibleHistoryStartDateTime:value})).history,undefined);
});
test('unknown, missing, malformed, and ordinary messages cannot become fabricated activity',()=>{
 for(const message of [{},event('unknown'),{messageType:'systemEventMessage'},event('constructor'),{messageType:'message',eventDetail:event('membersAdded').eventDetail},{messageType:'systemEventMessage',eventDetail:{'@odata.type':'__proto__'}}])assert.equal(conversationActivity(message),undefined);
 assert.deepEqual(activityIdentities(event('unknown',{members:[person('a','Alex')]})),[]);
 assert.equal(conversationActivity(event('membersAdded',{members:null,initiator:null})).summary,'Someone updated group membership');
});
test('known structured events survive the legacy unknownFutureValue enum representation',()=>{
 const message=event('chatRenamed',{chatDisplayName:'Project'});message.messageType='unknownFutureValue';
 assert.equal(conversationActivity(message).kind,'renamed');
});
test('identity cache distinguishes tenants and extracts only supported activity identities',()=>{
 assert.notEqual(identityKey({id:'same',tenantId:'one'}),identityKey({id:'same',tenantId:'two'}));
 assert.equal(identityKey({id:'SAME',tenantId:'ONE'}),identityKey({id:'same',tenantId:'one'}));
 const source={initiator:{user:person('actor','Alex')},members:[person('member','Blair')]};
 assert.equal(activityIdentities(event('membersAdded',source)).length,2);
});
