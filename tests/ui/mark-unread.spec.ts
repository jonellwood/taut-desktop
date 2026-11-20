import {test,expect,signIn,row,alex,blair,me,message,openDraft} from './fixtures';
function setup(graph:import('./fixtures').MockGraph){
 graph.chatWritePermission=true;graph.allowWrites=true;
 for(const [index,person] of [alex,blair].entries()){
   const latest={...message(`latest-${index}`,'Latest message',person.id),createdDateTime:'2026-01-01T12:01:00Z'};
   graph.chats[index].lastMessagePreview=latest;
   graph.chats[index].viewpoint={lastMessageReadDateTime:latest.createdDateTime};
   graph.messages[graph.chats[index].id]=[latest];
 }
}
test('right-click unread stays unread through refresh and poll until explicitly reopened',async({page,graph},testInfo)=>{
 setup(graph);await signIn(page);
 const input=page.getByRole('textbox',{name:'Message',exact:true});
 await input.fill('Keep my draft');
 await row(page,alex.displayName).click({button:'right'});
 await page.screenshot({path:testInfo.outputPath('chat-unread-menu.png')});
 await page.getByRole('menuitem',{name:'Mark as unread',exact:true}).click();
 await expect(row(page,alex.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Refresh messages',exact:true}).click();
 await page.clock.runFor(31_000);
 await expect(row(page,alex.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 await expect(input).toHaveValue('Keep my draft');
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_mark_chat_unread']);
 expect(graph.writes[0].args).toEqual({chatId:'chat-alex'});
 await row(page,blair.displayName).click();await row(page,alex.displayName).click();
 await expect(row(page,alex.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_mark_chat_unread','graph_mark_chat_read']);
});
test('options menu marks an unopened own-message chat unread without selecting or fetching it',async({page,graph})=>{
 setup(graph);graph.chats[1].lastMessagePreview!.from={user:{id:me.id}};
 await signIn(page);
 await page.getByRole('button',{name:`Conversation options for ${blair.displayName}`,exact:true}).click();
 await page.getByRole('menuitem',{name:'Mark as unread',exact:true}).click();
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 await expect(page.locator('.conversation-header')).toContainText(alex.displayName);
 await page.getByRole('button',{name:'Refresh messages',exact:true}).click();
 await expect(row(page,blair.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 expect(graph.calls.some(c=>c.command==='graph_messages'&&c.args.chatId==='chat-blair')).toBe(false);
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_mark_chat_unread']);
});
test('failed unread request leaves status unchanged and never retries on poll',async({page,graph})=>{
 setup(graph);graph.unreadError='timeout';await signIn(page);
 await row(page,alex.displayName).click({button:'right'});
 await page.getByRole('menuitem',{name:'Mark as unread',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Unread status was not confirmed');
 await expect(row(page,alex.displayName).getByLabel('Unread conversation',{exact:true})).toHaveCount(0);
 await page.clock.runFor(61_000);
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_mark_chat_unread']);
});
test('unread waits for server reconciliation without a lagging refresh clearing the badge',async({page,graph})=>{
 setup(graph);graph.unreadLag=true;await signIn(page);
 await row(page,alex.displayName).click({button:'right'});
 await page.getByRole('menuitem',{name:'Mark as unread',exact:true}).click();
 await expect(row(page,alex.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Refresh messages',exact:true}).click();
 await expect(row(page,alex.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 graph.chats[0].viewpoint={lastMessageReadDateTime:'2026-01-01T12:00:00Z'};
 await page.clock.runFor(31_000);
 await expect(row(page,alex.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_mark_chat_unread']);
});
test('no permission or pending conversation exposes no unread action',async({page,graph})=>{
 await signIn(page);
 await row(page,alex.displayName).click({button:'right'});
 await expect(page.getByRole('menuitem',{name:'Mark as unread',exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');await openDraft(page);
 await row(page,'Casey Example').click({button:'right'});
 await expect(page.getByRole('menuitem',{name:'Mark as unread',exact:true})).toHaveCount(0);
 expect(graph.writes).toEqual([]);
});
test('duplicate actions are blocked and a late success after sign-out cannot restore chats',async({page,graph})=>{
 setup(graph);let release!:()=>void;graph.unreadGate=new Promise(resolve=>release=resolve);
 await signIn(page);
 await row(page,alex.displayName).click({button:'right'});
 await page.getByRole('menuitem',{name:'Mark as unread',exact:true}).click();
 await row(page,alex.displayName).click({button:'right'});
 await expect(page.getByRole('menuitem',{name:'Mark as unread',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Sign out',exact:true}).click();
 release();
 await expect(row(page,alex.displayName)).toHaveCount(0);
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_mark_chat_unread']);
});
