import {test} from 'node:test';
import assert from 'node:assert/strict';
import {insertEmoji} from '../src/lib/emoji.ts';
test('emoji inserts at the caret and replaces only selected text',()=>{
 assert.deepEqual(insertEmoji('Hello world','👋',6),{text:'Hello 👋world',caret:8});
 assert.deepEqual(insertEmoji('Hello world','👍',6,11),{text:'Hello 👍',caret:8});
});
test('UTF-16 cursor positions preserve adjacent emoji and line breaks',()=>{
 assert.deepEqual(insertEmoji('😀\nhello','❤️',3,8),{text:'😀\n❤️',caret:5});
 assert.deepEqual(insertEmoji('','🎉',0),{text:'🎉',caret:2});
});
test('invalid or stale selection bounds are clamped',()=>{
 assert.deepEqual(insertEmoji('abc','😊',99),{text:'abc😊',caret:5});
 assert.deepEqual(insertEmoji('abc','😊',-1,2),{text:'😊c',caret:2});
 assert.deepEqual(insertEmoji('abc','😊',NaN),{text:'abc😊',caret:5});
});
