import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messagePreview,previewUnread} from '../src/lib/chat-summary.ts';
const preview={id:'new',messageType:'message',createdDateTime:'2026-01-01T12:00:00Z',from:{user:{id:'other'}}};
test('unread follows server read positions including backwards manual-unread changes',()=>{
 assert.equal(previewUnread(preview,'me','2026-01-01T11:00:00Z'),true);
 assert.equal(previewUnread(preview,'me','2026-01-01T12:00:00Z'),false);
 assert.equal(previewUnread(preview,'me','2026-01-01T11:00:00Z'),true);
 assert.equal(previewUnread({...preview,from:{user:{id:'me'}}},'me','2026-01-01T11:00:00Z'),true);
 assert.equal(previewUnread(preview,'me',undefined),true);
});
test('own, system, deleted, missing-author, and malformed previews never create unread noise',()=>{
 for(const extra of [{from:{user:{id:'ME'}}},{messageType:'systemEventMessage'},{messageType:'unknownFutureValue'},{isDeleted:true},{from:undefined},{createdDateTime:'invalid'}])assert.equal(previewUnread({...preview,...extra},'me'),false);
 assert.equal(messagePreview(undefined),false);
 assert.equal(messagePreview({...preview,messageType:'systemEventMessage'}),false);
});
