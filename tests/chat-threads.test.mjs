import {test} from 'node:test';import assert from 'node:assert/strict';
import {quotedMessageIds,chatReplies} from '../src/lib/chat-threads.ts';
const attachment=(id,extra={})=>({id,contentType:'messageReference',content:JSON.stringify({messageId:id,...extra})});
const message=(id,replyIds=[])=>({id,replyIds,sender:'them',text:id,time:''});
test('only explicit same-chat message references establish quote relationships',()=>{
 assert.deepEqual(quotedMessageIds([attachment('123'),attachment('123'),attachment('456')],'chat'),['123','456']);
 assert.deepEqual(quotedMessageIds([{...attachment('123'),contentType:'forwardedMessageReference'},attachment('456',{originalConversationId:'other'})],'chat'),[]);
});
test('malformed, inconsistent and unsafe quotes do not fabricate threads',()=>{
 const bad=[{contentType:'messageReference',content:'{'},{...attachment('123'),id:'other'},attachment('../x'),attachment('bad\n'),attachment(''),{contentType:'messageReference',content:JSON.stringify({messagePreview:'Same words without identity'})}];
 assert.deepEqual(quotedMessageIds(bad,'chat'),[]);
});
test('multi-quote references are bounded and do not include quoted text',()=>assert.equal(quotedMessageIds(Array.from({length:20},(_,i)=>attachment(String(i))),'chat').length,10));
test('thread replies include descendants in timeline order without unrelated messages',()=>{
 const rows=[message('a'),message('b',['a']),message('other'),message('c',['b']),message('d',['a','other'])];
 assert.deepEqual(chatReplies('a',rows).map(m=>m.id),['b','c','d']);
});
test('cycles and self references are bounded while deleted reply markers are retained',()=>{
 const rows=[message('a',['c']),message('b',['a']),{...message('c',['b']),deleted:true},message('self',['self'])];
 assert.deepEqual(chatReplies('a',rows).map(m=>m.id),['b','c']);assert.deepEqual(chatReplies('self',rows),[]);
});
test('activity is not treated as a user reply',()=>assert.deepEqual(chatReplies('a',[{...message('event',['a']),activity:{kind:'added'}}]),[]));
