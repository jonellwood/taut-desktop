import { test, expect, signIn, row, message, me, alex, blair, openDraft } from './fixtures';

test.beforeEach(async ({graph})=>{
 graph.chatWritePermission=true;graph.allowWrites=true;
 graph.messages['chat-alex']=[message('theirs','Their message'),message('mine','My message to delete',me.id)];
});

test('confirmation is local, cancel writes nothing, and only own messages have controls',async({page,graph})=>{
 await signIn(page);
 await expect(page.getByRole('button',{name:'Delete message',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Delete message',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Delete message'});
 await expect(dialog).toContainText('My message to delete');
 await expect(dialog.getByRole('button',{name:'Cancel'})).toBeFocused();
 expect(graph.writes).toEqual([]);
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
 expect(graph.writes).toEqual([]);
 await openDraft(page);await expect(page.getByRole('button',{name:'Hide conversation for me'})).toHaveCount(0);
 expect(graph.writes).toEqual([]);
});

test('delete waits for confirmation and restore reloads original content',async({page,graph})=>{
 await signIn(page);
 await page.getByRole('button',{name:'Delete message',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Delete message',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeHidden();
 await expect(page.locator('.messages')).not.toContainText('My message to delete');
 await expect(page.locator('.messages')).toContainText('Message deleted');
 expect(graph.writes.map(c=>[c.command,c.args])).toEqual([['graph_change_message',{chatId:'chat-alex',messageId:'mine',restore:false}]]);
 await page.getByRole('button',{name:'Restore message',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Restore message',exact:true}).click();
 await expect(page.locator('.messages')).toContainText('My message to delete');
 await expect(page.getByRole('button',{name:'Restore message',exact:true})).toHaveCount(0);
 expect(graph.writes).toHaveLength(2);
});

test('permission missing disables changes without disturbing read and drafts',async({page,graph})=>{
 graph.chatWritePermission=false;
 await signIn(page);
 await expect(page.getByRole('button',{name:'Delete message',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Hide conversation for me'})).toBeDisabled();
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('still drafting');
 await page.getByRole('button',{name:'Refresh messages'}).click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('still drafting');
 expect(graph.writes).toEqual([]);
});

test('failed delete keeps content and requires read-only status before explicit retry',async({page,graph})=>{
 graph.changeError='Deletion was not confirmed (HTTP 403).';
 await signIn(page);
 await page.getByRole('button',{name:'Delete message',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Delete message',exact:true}).click();
 await expect(dialog).toContainText('not confirmed');
 await expect(dialog.getByRole('button',{name:'Delete message',exact:true})).toBeDisabled();
 await expect(page.locator('.messages')).toContainText('My message to delete');
 await dialog.getByRole('button',{name:'Cancel'}).click();
 await page.getByRole('button',{name:'Delete message',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Delete message',exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'Check status'}).click();
 await expect(dialog.getByRole('button',{name:'Delete message',exact:true})).toBeEnabled();
 expect(graph.writes).toHaveLength(1);
 expect(graph.calls.filter(c=>c.command==='graph_message_status')).toHaveLength(1);
 graph.changeError='';
 await dialog.getByRole('button',{name:'Delete message',exact:true}).click();
 await expect(dialog).toBeHidden();expect(graph.writes).toHaveLength(2);
});

test('uncertain delete reconciles confirmed server state without repeating mutation',async({page,graph})=>{
 graph.changeError='Timed out; deletion was not confirmed';
 await signIn(page);
 await page.getByRole('button',{name:'Delete message',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Delete message',exact:true}).click();
 graph.messages['chat-alex'][1].deletedDateTime='2026-01-01T12:01:00Z';
 await dialog.getByRole('button',{name:'Check status'}).click();
 await expect(dialog).toBeHidden();await expect(page.locator('.messages')).toContainText('Message deleted');
 expect(graph.writes).toHaveLength(1);
});

test('confirmed deletion masks stale reads and removes attachment previews',async({page,graph})=>{
 const own=graph.messages['chat-alex'][1];own.attachments=[{id:'file',name:'Private report.pdf',contentType:'reference',contentUrl:'https://example.sharepoint.com/file'}];
 const stale=structuredClone(graph.messages['chat-alex']);
 await signIn(page);await expect(page.locator('.messages')).toContainText('Private report.pdf');
 await page.getByRole('button',{name:'Delete message',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Delete message',exact:true}).click();
 graph.messages['chat-alex']=stale;
 await page.getByRole('button',{name:'Refresh messages'}).click();
 await expect(page.locator('.messages')).toContainText('Message deleted');
 await expect(page.locator('.messages')).not.toContainText('Private report.pdf');
 await expect(page.locator('.messages')).not.toContainText('My message to delete');
 expect(graph.writes).toHaveLength(1);
});

test('hide and unhide preserve text and file drafts and never send or leave',async({page,graph})=>{
 await signIn(page);
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep this draft');
 await page.locator('input[type=file]').setInputFiles({name:'draft.txt',mimeType:'text/plain',buffer:Buffer.from('local only')});
 await page.getByRole('button',{name:'Hide conversation for me'}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('This affects only you');
 expect(graph.writes).toEqual([]);
 await dialog.getByRole('button',{name:'Hide for me',exact:true}).click();
 await expect(page.locator('.conversation-header')).toContainText(blair.displayName);
 await expect(row(page,alex.displayName)).toHaveCount(0);
 await page.getByRole('button',{name:/^Hidden chats/}).click();
 await row(page,alex.displayName).click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep this draft');
 await expect(page.locator('.attachment-drafts')).toContainText('draft.txt');
 await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Unhide conversation for me'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Unhide for me',exact:true}).click();
 await expect(row(page,alex.displayName)).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep this draft');
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_set_chat_visibility','graph_set_chat_visibility']);
 expect(graph.writes.map(c=>c.args.hidden)).toEqual([true,false]);
});

test('failed hide keeps chat visible and status failure cannot enable retry',async({page,graph})=>{
 graph.visibilityError='Visibility not confirmed';graph.statusError='Read unavailable';
 await signIn(page);await page.getByRole('button',{name:'Hide conversation for me'}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Hide for me',exact:true}).click();
 await expect(row(page,alex.displayName)).toBeVisible();
 await dialog.getByRole('button',{name:'Check status'}).click();
 await expect(dialog).toContainText('Read unavailable');
 await expect(dialog.getByRole('button',{name:'Hide for me',exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'Cancel'}).click();
 await expect(page.locator('.conversation-header')).toContainText(alex.displayName);
 expect(graph.writes).toHaveLength(1);
});

test('hidden chats loaded from Graph stay out of normal list and new activity can return them',async({page,graph})=>{
 graph.chats[1].viewpoint={isHidden:true};
 await signIn(page);await expect(row(page,blair.displayName)).toHaveCount(0);
 await page.getByRole('button',{name:/^Hidden chats/}).click();await expect(row(page,blair.displayName)).toBeVisible();
 await page.getByRole('button',{name:'Back to visible chats'}).click();
 graph.chats[1].viewpoint={isHidden:false};
 await page.clock.runFor(30_000);
 await expect(row(page,blair.displayName)).toBeVisible();expect(graph.writes).toEqual([]);
});

 test('all chats hidden leaves a safe empty view with access to hidden list',async({page,graph})=>{
  graph.chats.forEach(c=>c.viewpoint={isHidden:true});
  await page.goto('/');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.locator('.conversation-header')).toContainText('No visible conversations');
  await page.clock.runFor(30_000);
  await expect(page.locator('.conversation-header')).toContainText('No visible conversations');
  await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:/^Hidden chats/}).click();
  await expect(row(page,alex.displayName)).toBeVisible();expect(graph.writes).toEqual([]);
 });

 test('late image download cannot repopulate a deleted preview cache',async({page,graph})=>{
  let release!:()=>void;graph.imageGate=new Promise<void>(resolve=>release=resolve);
  graph.messages['chat-alex']=[message('mine','Photo <img src="../hostedContents/image-1/$value"/>',me.id)];
  await signIn(page);await page.getByRole('button',{name:'View shared image',exact:true}).click();
  await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_hosted_image').length).toBe(1);
  await page.getByRole('button',{name:'Delete message',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Delete message',exact:true}).click();
  await expect(page.locator('.messages')).toContainText('Message deleted');release();
  await page.getByRole('button',{name:'Restore message',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Restore message',exact:true}).click();
  await expect(page.getByRole('button',{name:'View shared image',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Open shared image full screen'})).toHaveCount(0);
 });
