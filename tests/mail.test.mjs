import {test} from 'node:test';import assert from 'node:assert/strict';
import {outlookLink,mergeMail,addressFull,attachmentPreview,mailText,mailDate,mailConversations} from '../src/lib/mail.ts';
test('mail original links cannot navigate arbitrary hosts or scripts',()=>{
 for(const value of ['javascript:alert(1)','https://outlook.office.com.evil.test/mail','https://user:pass@outlook.office.com/mail','http://outlook.office.com/mail','file:///tmp/test'])assert.equal(outlookLink(value),null);
 assert.equal(outlookLink('https://outlook.office.com/mail/id/a'),'https://outlook.office.com/mail/id/a');
});
test('mail pages deduplicate IDs and update changed summaries',()=>{assert.deepEqual(mergeMail([{id:'a',subject:'old'}],[{id:'a',subject:'new'},{id:'b',subject:'next'}]),[{id:'a',subject:'new'},{id:'b',subject:'next'}]);});
test('mail attachments never preview active document types',()=>{
 assert.deepEqual(attachmentPreview({contentType:'text/plain',base64:'aGVsbG8='}),{text:'hello'});
 assert.deepEqual(attachmentPreview({contentType:'image/svg+xml',base64:'aGVsbG8='}),{});
 assert.deepEqual(attachmentPreview({contentType:'application/pdf',base64:'aGVsbG8='}),{});
 assert.throws(()=>attachmentPreview({contentType:'text/plain',base64:'!@#'}));
});
test('mail text is bounded and addresses and dates handle missing fields',()=>{
 assert.equal(mailText({id:'a',body:{contentType:'text',content:'x'.repeat(100001)}}).length,100000);
 assert.equal(addressFull({emailAddress:{name:'Alex',address:'a@example.test'}}),'Alex <a@example.test>');
 assert.equal(mailDate({id:'a',receivedDateTime:'bad'}),'Date unavailable');
});

test('conversation grouping uses identity, latest preview, aggregate unread and unique loaded counts',()=>{
 const rows=[{id:'a',conversationId:'c',subject:'Same',receivedDateTime:'2026-11-04',isRead:false,hasAttachments:true},{id:'b',conversationId:'c',receivedDateTime:'2026-11-05',isRead:true},{id:'d',conversationId:'other',subject:'Same'},{id:'e',subject:'Same'},{id:'f',subject:'Same'}];
 const groups=mailConversations([...rows,rows[0]]);assert.equal(groups.length,4);assert.equal(groups[0].latest.id,'b');assert.equal(groups[0].count,2);assert.equal(groups[0].unread,true);assert.equal(groups[0].hasAttachments,true);
});
