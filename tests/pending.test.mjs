import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingConversation,existingChat,submitMessage} from '../src/lib/pending.ts';

test('selection is local and stable, with separate recipients',()=>{
 assert.equal(pendingConversation('other','Other','me').id,'pending:other');
 assert.notEqual(pendingConversation('other','Other','me').id,pendingConversation('third','Third','me').id);
 assert.throws(()=>pendingConversation('ME','Me','me'));
});
test('only known one-on-one membership can be reused',()=>{
 const chat={id:'chat',chatType:'oneOnOne',members:[{userId:'me'},{userId:'other',email:'other@example.com'}]};
 assert.equal(existingChat([chat],'OTHER@example.com','me'),chat);
 assert.equal(existingChat([{...chat,chatType:'group'}],'other','me'),undefined);
});
test('empty, oversized, and self sends make zero Graph requests',async()=>{
 const invoke=async()=>assert.fail('Graph must not be called');
 for(const text of ['','   ','a'.repeat(4001)])await assert.rejects(submitMessage(invoke,'pending:other','other','me',text,()=>{}));
 await assert.rejects(submitMessage(invoke,'pending:me','me','me','Hi',()=>{}));
});
test('explicit first Send creates then sends; existing chats only send',async()=>{
 const calls=[];const invoke=async(command,args)=>{calls.push([command,args]);return {id:command==='graph_create_chat'?'chat':'message'};};
 await submitMessage(invoke,'pending:other','other','me',' Hi ',id=>assert.equal(id,'chat'));
 assert.deepEqual(calls.map(c=>c[0]),['graph_create_chat','graph_send_message']);
 assert.equal(calls[0][1].firstMessage,'Hi');assert.equal(calls[1][1].chatId,'chat');
 calls.length=0;
 await submitMessage(invoke,'chat',undefined,'me','Hi',()=>assert.fail());
 assert.deepEqual(calls.map(c=>c[0]),['graph_send_message']);
});
test('creation failure never sends; partial success retains ID and never retries',async()=>{
 let calls=0;
 await assert.rejects(submitMessage(async()=>{calls++;throw Error('offline');},'pending:other','other','me','Hi',()=>assert.fail()));
 assert.equal(calls,1);
 let retained;calls=0;
 await assert.rejects(submitMessage(async command=>{calls++;if(command==='graph_create_chat')return {id:'created'};throw Error('timeout');},'pending:other','other','me','Hi',id=>retained=id),/draft is saved/);
 assert.equal(retained,'created');assert.equal(calls,2);
});

test('unconfirmed message response preserves the created chat and requires explicit retry',async()=>{
 let retained;const calls=[];
 await assert.rejects(submitMessage(async command=>{calls.push(command);return command==='graph_create_chat'?{id:'chat'}:{};},'pending:other','other','me','Hi',id=>retained=id),/Check Teams/);
 assert.equal(retained,'chat');assert.equal(calls.length,2);
});

test('recipient normalization preserves one local draft and blocks whitespace self IDs',()=>{
 assert.equal(pendingConversation(' OTHER ','Other','me').id,'pending:other');
 assert.throws(()=>pendingConversation(' ME ','Me','me'));
 assert.throws(()=>pendingConversation('other','Other',''));
});

test('invalid pending state never sends to Graph',async()=>{
 const invoke=async()=>assert.fail('Graph must not be called');
 await assert.rejects(submitMessage(invoke,'pending:other',undefined,'me','Hi',()=>{}));
 await assert.rejects(submitMessage(invoke,'pending:other','','me','Hi',()=>{}));
 await assert.rejects(submitMessage(invoke,'pending:other','other','','Hi',()=>{}));
 await assert.rejects(submitMessage(invoke,'chat','other','me','Hi',()=>{}));
});

test('explicit retry after partial success sends only to the retained server chat',async()=>{
 let retained;const calls=[];
 const invoke=async(command,args)=>{
  calls.push([command,args]);
  if(command==='graph_create_chat')return {id:'created'};
  if(calls.length===2)throw Error('timeout');
  return {id:'message'};
 };
 await assert.rejects(submitMessage(invoke,'pending:other','other','me','Hi',id=>retained=id));
 await submitMessage(invoke,retained,undefined,'me','Hi',()=>assert.fail());
 assert.deepEqual(calls.map(c=>c[0]),['graph_create_chat','graph_send_message','graph_send_message']);
 assert.equal(calls[2][1].chatId,'created');
});

test('Graph system events are filtered without dropping ordinary media messages',async()=>{
 const {isUserMessage}=await import('../src/lib/pending.ts');
 assert.equal(isUserMessage({messageType:'systemEventMessage'}),false);
 assert.equal(isUserMessage({messageType:'unknownFutureValue'}),false);
 assert.equal(isUserMessage({messageType:'message',body:{content:''},attachments:[{id:'file'}]}),true);
 assert.equal(isUserMessage({}),true);
});
