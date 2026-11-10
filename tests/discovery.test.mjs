import {test} from 'node:test';import assert from 'node:assert/strict';
import {searchLoadedChats} from '../src/lib/discovery.ts';
test('loaded search includes attachment names and excludes deleted, hidden and pending content',()=>{
 const chat={id:'c',name:'Alex',messages:[{id:'m',text:'Budget',createdDateTime:'2026-11-05'},{id:'f',text:'See file',attachments:[{name:'report.pdf'}]},{id:'d',text:'Secret',deleted:true}]};
 assert.equal(searchLoadedChats([chat],'budget')[0].messageId,'m');assert.equal(searchLoadedChats([chat],'report.pdf')[0].messageId,'f');assert.equal(searchLoadedChats([chat],'secret').length,0);
 assert.equal(searchLoadedChats([{...chat,hidden:true}],'budget').length,0);assert.equal(searchLoadedChats([{...chat,id:'pending:1'}],'budget').length,0);assert.equal(searchLoadedChats([chat],'Alex')[0].chatId,'c');assert.deepEqual(searchLoadedChats([chat],''),[]);
});
