import {test,expect,signIn,row,alex,blair,casey,chat,me,message} from './fixtures';
import type {ChatPreview} from '../../src/lib/chat-summary';
const incoming=(id='new',text='A new message',createdDateTime='2026-01-01T12:01:00Z'):ChatPreview=>({id,messageType:'message',createdDateTime,body:{content:text,contentType:'html'},from:{user:{id:blair.id}}});

test('unopened incoming chat shows current preview, message time, unread dot and navigation badge',async({page,graph},testInfo)=>{
 graph.chats[1].lastUpdatedDateTime='2025-12-01T00:00:00Z';
 graph.chats[1].lastMessagePreview=incoming();graph.chats[1].viewpoint={lastMessageReadDateTime:'2026-01-01T11:00:00Z'};
 await signIn(page);
 const target=row(page,blair.displayName);
 await expect(target).toContainText('A new message');await expect(target.locator('.chat-meta small')).not.toContainText('2025');
 await expect(target.getByLabel('Unread conversation',{exact:true})).toBeVisible();
 await expect(page.getByLabel('1 unread conversations',{exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('unread-chat.png')});
 await page.getByRole('button',{name:'Collapse sidebar'}).click();
 await expect(page.getByLabel('1 unread conversations',{exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
});

test('new message in an already loaded inactive chat replaces cached preview and preserves selected draft',async({page,graph})=>{
 graph.chatWritePermission=true;graph.allowWrites=true;
 await signIn(page);await row(page,blair.displayName).click();
 await row(page,alex.displayName).click();
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Unsent Alex draft');
 graph.chats[1].lastMessagePreview=incoming();graph.chats[1].viewpoint={lastMessageReadDateTime:'2026-01-01T11:00:00Z'};
 graph.messages['chat-blair']=[{...message('new','A new message',blair.id),createdDateTime:'2026-01-01T12:01:00Z'}];
 await page.clock.runFor(30_000);
 await expect(row(page,blair.displayName)).toContainText('A new message');
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Unsent Alex draft');
 await row(page,blair.displayName).click();
 await expect(page.locator('.messages')).toContainText('A new message');
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
 await page.clock.runFor(30_000);
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
 await row(page,alex.displayName).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Unsent Alex draft');
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_mark_chat_read']);
});

test('a later incoming message relights a read chat without reopening it',async({page,graph})=>{
 graph.chatWritePermission=true;graph.allowWrites=true;
 const stamp='2026-01-01T12:01:00Z';
 graph.chats[1].lastMessagePreview=incoming();graph.messages['chat-blair']=[{...message('new','A new message',blair.id),createdDateTime:stamp}];
 await signIn(page);await row(page,blair.displayName).click();
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
 await row(page,alex.displayName).click();
 graph.chats[1].lastMessagePreview=incoming('later','Second incoming','2026-01-01T12:02:00Z');
 await page.clock.runFor(30_000);
 await expect(row(page,blair.displayName)).toContainText('Second incoming');
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();expect(graph.writes.map(c=>c.command)).toEqual(['graph_mark_chat_read']);
});

test('own messages, system activity and reaction-only updates do not create unread indicators',async({page,graph})=>{
 graph.chats[1].lastMessagePreview={...incoming(),from:{user:{id:me.id}}};
 await signIn(page);await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
 graph.chats[1].lastMessagePreview={...incoming(),messageType:'systemEventMessage'};
 await page.clock.runFor(30_000);
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
 graph.chats[1].lastMessagePreview=incoming();graph.chats[1].viewpoint={lastMessageReadDateTime:'2026-01-01T12:02:00Z'};
 graph.chats[1].lastUpdatedDateTime='2026-01-01T12:05:00Z';
 await page.clock.runFor(30_000);
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('hidden chat unread state does not require background message fetches',async({page,graph})=>{
 await signIn(page);
 graph.chats[1].lastMessagePreview=incoming();graph.chats[1].viewpoint={isHidden:true};
 await page.clock.runFor(30_000);
 await expect(page.getByLabel('1 unread conversations',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:/^Hidden chats/}).click();
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 expect(graph.calls.some(c=>c.command==='graph_messages'&&c.args.chatId==='chat-blair')).toBe(false);expect(graph.writes).toEqual([]);
});

 test('newly discovered incoming conversation gets a visible preview and badge during sync',async({page,graph})=>{
  await signIn(page);
  graph.chats.unshift({...chat('chat-casey',casey),lastMessagePreview:{...incoming('first','New conversation arrived'),from:{user:{id:casey.id}}}});
  await page.clock.runFor(30_000);
  await expect(row(page,casey.displayName)).toContainText('New conversation arrived');
  await expect(row(page,casey.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
  await expect(page.getByLabel('1 unread conversations',{exact:true})).toBeVisible();
  await expect(page.locator('.conversation-header')).toContainText(alex.displayName);expect(graph.writes).toEqual([]);
 });

 test('a slow active-message read cannot skip the scheduled chat-list poll',async({page,graph})=>{
  await signIn(page);await page.clock.runFor(29_000);
  let release!:()=>void;graph.messagesGate=new Promise<void>(resolve=>release=resolve);
  await page.clock.runFor(2_000);
  graph.chats[1].lastMessagePreview=incoming('delayed','Arrived during slow read');
  release();
  await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_chats').length).toBe(2);
  await expect(row(page,blair.displayName)).toContainText('Arrived during slow read');expect(graph.writes).toEqual([]);
 });
