import {test,expect,signIn,row,alex,blair,me,message,openDraft} from './fixtures';
function unread(graph:import('./fixtures').MockGraph,index=1,sender=blair.id){
 const chat=graph.chats[index];
 chat.lastMessagePreview={id:'latest',messageType:'message',createdDateTime:'2026-01-01T12:01:00Z',from:{user:{id:sender}},body:{content:'Latest message',contentType:'html'}};
 chat.viewpoint={lastMessageReadDateTime:'2026-01-01T11:00:00Z'};
 graph.messages[chat.id]=[{...message('latest','Latest message',sender),createdDateTime:'2026-01-01T12:01:00Z'}];
}
test.beforeEach(async({graph})=>{graph.chatWritePermission=true;graph.allowWrites=true;});

test('startup leaves all chats unselected and all server unread indicators intact',async({page,graph})=>{
 unread(graph,0,alex.id);unread(graph,1,blair.id);
 await page.goto('/');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeEnabled();
 await expect(page.getByRole('region',{name:'Welcome to TAUT'})).toBeVisible();
 await expect(page.getByLabel('2 unread conversations',{exact:true})).toBeVisible();
 expect(graph.calls.some(c=>c.command==='graph_messages')).toBe(false);expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Refresh messages'}).click();
 await expect(page.getByLabel('2 unread conversations',{exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
});

test('viewing latest messages writes own read state once and server state survives reload',async({page,graph})=>{
 unread(graph);await signIn(page);await row(page,blair.displayName).click();
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_mark_chat_read']);
 expect(graph.writes[0].args).toEqual({chatId:'chat-blair',messageId:'latest'});
 expect(graph.chats[1].viewpoint?.lastMessageReadDateTime).toBe('2026-01-01T12:01:00Z');
 graph.restoredSession=true;await page.reload();
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeEnabled();
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
 expect(graph.writes).toHaveLength(1);
});

test('manual refresh imports external mark-unread changes even for a previously read own group message',async({page,graph})=>{
 unread(graph,1,me.id);graph.chats[1].chatType='group';graph.chats[1].topic='Read-state group';
 await signIn(page);await row(page,'Read-state group').click();
 await expect(row(page,'Read-state group').getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
 await row(page,alex.displayName).click();
 graph.chats[1].viewpoint={lastMessageReadDateTime:'2026-01-01T11:00:00Z'};
 await page.getByRole('button',{name:'Refresh messages'}).click();
 await expect(row(page,'Read-state group').getByLabel('Unread conversation',{exact:true})).toBeVisible();
 expect(graph.writes).toHaveLength(1);
 await row(page,'Read-state group').click();
 await expect(row(page,'Read-state group').getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
 expect(graph.writes).toHaveLength(2);
});

test('failed read-state update retains unread and never retries silently',async({page,graph})=>{
 unread(graph);graph.readError='Read status was not confirmed (HTTP 403).';await signIn(page);await row(page,blair.displayName).click();
 await expect(page.getByRole('status')).toContainText('Read status was not confirmed');
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 await page.clock.runFor(30_000);expect(graph.writes).toHaveLength(1);
 graph.readError='';await page.getByRole('button',{name:'Refresh messages'}).click();
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);expect(graph.writes).toHaveLength(2);
});

test('missing grant cannot silently claim the Teams read state was updated',async({page,graph})=>{
 graph.chatWritePermission=false;unread(graph);await signIn(page);await row(page,blair.displayName).click();
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
});

test('newer server message preflight leaves unread intact until latest content is explicitly refreshed',async({page,graph})=>{
 unread(graph);graph.readConfirmed=false;await signIn(page);await row(page,blair.displayName).click();
 await expect(page.getByRole('status')).toContainText('Newer messages arrived');
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 await page.clock.runFor(5_000);expect(graph.writes).toHaveLength(1);
});

 test('directory-picker selection stays local even when an existing chat is unread',async({page,graph})=>{
  unread(graph);await signIn(page);await openDraft(page,blair.displayName);
  await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
  await row(page,blair.displayName).click();
  await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
  expect(graph.writes.map(c=>c.command)).toEqual(['graph_mark_chat_read']);
 });
 test('an unfocused chat does not mark messages read until the user returns to it',async({page,graph})=>{
  unread(graph);await signIn(page);
  await page.evaluate(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false}));
  await row(page,blair.displayName).click();await page.clock.runFor(5_000);
  await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
  await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'));});
  await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);expect(graph.writes).toHaveLength(1);
 });
