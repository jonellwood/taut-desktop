import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingGroupConversation,submitMessage} from '../src/lib/pending.ts';
const users=[{id:'alex',displayName:'Alex'},{id:'blair',displayName:'Blair'}];
test('group selection is pure with stable per-group drafts and optional names',()=>{
 const a=pendingGroupConversation(users,'Team','me');
 assert.equal(a.id,pendingGroupConversation([...users].reverse(),'Team','me').id);
 assert.notEqual(a.id,pendingGroupConversation(users,'Other team','me').id);
 assert.equal(a.name,'Team');assert.equal(a.chatType,'group');
 for(const invalid of [[],[users[0]],[users[0],users[0]],[users[0],{id:'ME'}]])assert.throws(()=>pendingGroupConversation(invalid,'','me'));
 assert.throws(()=>pendingGroupConversation(users,'Bad:name','me'));
});
test('group creation requires nonempty first text and valid local state',async()=>{
 for(const text of ['', ' ', 'x'.repeat(4001)])await assert.rejects(submitMessage(async()=>assert.fail(),'pending:group',undefined,'me',text,()=>assert.fail(),undefined,{recipients:['alex','blair'],topic:''}));
 await assert.rejects(submitMessage(async()=>assert.fail(),'pending:group',undefined,'me','Hi',()=>assert.fail(),undefined,{recipients:['alex','me'],topic:''}));
});
test('group first Send creates once, retains ID, then prepares and sends files',async()=>{
 const calls=[];
 await submitMessage(async(command,args)=>{calls.push([command,args]);return {id:command==='graph_create_group_chat'?'created':'message'};},'pending:group',undefined,'me','Hi',id=>calls.push(['retained',id]),async id=>{calls.push(['prepare',id]);return ['file'];},{recipients:['alex','blair'],topic:'Team'});
 assert.deepEqual(calls.map(c=>c[0]),['graph_create_group_chat','retained','prepare','graph_send_attachments']);
 assert.deepEqual(calls[0][1],{recipients:['alex','blair'],topic:'Team',ownId:'me',firstMessage:'Hi'});
});
test('unconfirmed creation marks the pending group and never sends or retries',async()=>{
 let uncertain=0;let calls=0;
 for(const result of [null,{}])await assert.rejects(submitMessage(async()=>{calls++;return result;},'pending:group',undefined,'me','Hi',()=>assert.fail(),undefined,{recipients:['alex','blair'],topic:'',onUnconfirmed:()=>uncertain++}));
 assert.equal(uncertain,2);assert.equal(calls,2);
});
test('failed first delivery retains group ID and retry never creates another group',async()=>{
 let retained;const calls=[];
 await assert.rejects(submitMessage(async cmd=>{calls.push(cmd);if(cmd==='graph_create_group_chat')return {id:'created'};throw Error('timeout');},'pending:group',undefined,'me','Hi',id=>retained=id,undefined,{recipients:['alex','blair'],topic:''}));
 await submitMessage(async cmd=>{calls.push(cmd);return {id:'sent'};},retained,undefined,'me','Hi',()=>assert.fail());
 assert.deepEqual(calls,['graph_create_group_chat','graph_send_message','graph_send_message']);
});
