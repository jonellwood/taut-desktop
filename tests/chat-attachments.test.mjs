import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatAttachments} from '../src/lib/chat-attachments.ts';
test('repeated reference IDs collapse identical files and preserve different URLs',()=>{
 const file={id:'repeated',contentType:'reference',contentUrl:'https://example.sharepoint.com/one',name:'One'};
 const input=[file,{...file},{...file,contentUrl:'https://example.sharepoint.com/two',name:'Two'},{...file,id:undefined}, {...file,id:undefined}];
 const result=chatAttachments(input);assert.equal(result.length,3);assert.equal(new Set(result.map(f=>f.id)).size,3);assert.deepEqual(result.map(f=>f.name),['One','Two','One']);assert.deepEqual(chatAttachments(input),result);assert.equal(input.length,5);
});
test('non-file references and unsafe URL schemes remain excluded',()=>{
 assert.deepEqual(chatAttachments(undefined),[]);
 assert.deepEqual(chatAttachments([{id:'q',contentType:'messageReference',contentUrl:'https://example.test'},{contentType:'reference',contentUrl:'javascript:alert(1)'},{contentType:'reference'}]),[]);
});
