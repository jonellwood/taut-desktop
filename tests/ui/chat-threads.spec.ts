import {test,expect,signIn,row,alex,blair,me,message,image} from './fixtures';
function reference(parent:string){return {id:parent,contentType:'messageReference',content:JSON.stringify({messageId:parent,messagePreview:'DO NOT DISPLAY STALE PREVIEW',messageSender:{user:{displayName:'Old snapshot'}}})};}
function seed(graph:any){
 graph.messages['chat-alex']=[{...message('root','The original question'),createdDateTime:'2026-01-01T12:00:00Z'},{...message('reply','First quoted reply',me.id),createdDateTime:'2026-01-01T12:01:00Z',attachments:[reference('root')]},{...message('nested','Nested quoted reply'),createdDateTime:'2026-01-01T12:02:00Z',attachments:[reference('reply')]},message('unrelated','An unrelated chat message')];
}

test('quoted chat replies open one context pane without sending or changing the chat draft',async({page,graph},info)=>{
 seed(graph);await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep normal chat draft');
 await page.getByRole('button',{name:'View chat replies',exact:true}).first().click();
 const pane=page.getByRole('complementary',{name:'Quoted replies'});await expect(pane).toContainText('The original question');await expect(pane).toContainText('First quoted reply');await expect(pane).toContainText('Nested quoted reply');await expect(pane).not.toContainText('An unrelated chat message');await expect(pane).not.toContainText('DO NOT DISPLAY STALE PREVIEW');
 await expect(page.locator('.messages')).toContainText('An unrelated chat message');await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep normal chat draft');
 await page.screenshot({path:info.outputPath('chat-reply-pane.png')});expect(graph.calls.filter(c=>c.command==='graph_chat_message')).toHaveLength(0);expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Close quoted replies'}).click();await expect(page.getByRole('complementary',{name:'Conversation details'})).toBeVisible();
});

test('missing parent is fetched read-only and deleted parent never exposes quote preview',async({page,graph})=>{
 graph.messages['chat-alex']=[{...message('reply','A quoted reply'),attachments:[reference('old-root')]}];
 graph.parentMessages['old-root']={...message('old-root','DELETED PARENT SECRET'),deletedDateTime:'2026-11-04T12:00:00Z'};
 await signIn(page);await page.getByRole('button',{name:'View quoted message 1',exact:true}).click();const pane=page.getByRole('complementary',{name:'Quoted replies'});
 await expect(pane).toContainText('Message deleted');await expect(pane).toContainText('A quoted reply');await expect(pane).not.toContainText('DELETED PARENT SECRET');await expect(pane).not.toContainText('DO NOT DISPLAY STALE PREVIEW');
 expect(graph.calls.filter(c=>c.command==='graph_chat_message').at(-1)?.args).toEqual({chatId:'chat-alex',messageId:'old-root'});expect(graph.writes).toEqual([]);
});

test('unavailable parent reports failure instead of showing an old snapshot',async({page,graph})=>{
 graph.messages['chat-alex']=[{...message('reply','Current reply'),attachments:[reference('missing')]}];graph.parentError='HTTP 404';await signIn(page);await page.getByRole('button',{name:'View quoted message 1'}).click();
 const pane=page.getByRole('complementary',{name:'Quoted replies'});await expect(pane.getByRole('alert')).toContainText('unavailable');await expect(pane).not.toContainText('DO NOT DISPLAY STALE PREVIEW');await expect(pane).toContainText('Current reply');expect(graph.writes).toEqual([]);
});

test('late older-parent response cannot leak into another selected chat',async({page,graph})=>{
 let release!:()=>void;graph.parentGate=new Promise<void>(resolve=>release=resolve);graph.parentMessages.old=message('old','OLD CHAT PARENT');graph.messages['chat-alex']=[{...message('reply','Current reply'),attachments:[reference('old')]}];
 await signIn(page);await page.getByRole('button',{name:'View quoted message 1'}).click();await expect(page.getByRole('status')).toContainText('Loading the quoted message');await row(page,blair.displayName).click();release();
 await expect(page.getByRole('complementary',{name:'Quoted replies'})).toHaveCount(0);await expect(page.locator('.main')).not.toContainText('OLD CHAT PARENT');expect(graph.writes).toEqual([]);
});

test('files, image viewer and reaction counts remain available inside reply context',async({page,graph})=>{
 seed(graph);graph.messages['chat-alex'][0].attachments=[{id:'file',name:'notes.pdf',contentType:'reference',contentUrl:'https://example.sharepoint.com/notes.pdf'}];
 graph.messages['chat-alex'][0].body.content='<p>The original question</p><img src="https://graph.microsoft.com/v1.0/chats/chat-alex/messages/root/hostedContents/1/$value">';graph.messages['chat-alex'][0].reactions=[{reactionType:'like',createdDateTime:'2026-11-04T12:00:00Z',user:{user:{id:me.id,displayName:'Test User'}}}];
 await signIn(page);await page.getByRole('button',{name:'View chat replies'}).first().click();const pane=page.getByRole('complementary',{name:'Quoted replies'});
 await pane.getByRole('button',{name:'notes.pdf',exact:true}).click();expect(graph.calls.filter(c=>c.command==='plugin:opener|open_url')).toHaveLength(1);
 await expect(pane.getByRole('group',{name:'Message reactions'})).toBeVisible();await pane.getByRole('button',{name:'View original image'}).click();await expect(page.getByRole('button',{name:'Close viewer'})).toBeVisible();await page.getByRole('button',{name:'Close viewer'}).click();expect(graph.writes).toEqual([]);
});

test('forwarded messages do not fabricate quote threads and relationship-only sync updates are detected',async({page,graph})=>{
 graph.messages['chat-alex']=[message('root','The original question'),{...message('reply','Same reply text'),attachments:[{...reference('root'),contentType:'forwardedMessageReference'}]}];await signIn(page);await expect(page.getByRole('button',{name:'View chat replies'})).toHaveCount(0);
 graph.messages['chat-alex'][1].attachments=[reference('root')];await page.getByRole('button',{name:'Refresh messages',exact:true}).click();await expect(page.getByRole('button',{name:'View chat replies'})).toHaveCount(1);expect(graph.writes).toEqual([]);
});

test('focus mode hides and restores the reply pane and navigation keeps normal drafts',async({page,graph})=>{
 seed(graph);await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep this separate draft');await page.getByRole('button',{name:'View chat replies'}).first().click();
 await page.getByRole('button',{name:'Focus mode',exact:true}).click();await expect(page.getByRole('complementary',{name:'Quoted replies'})).toHaveCount(0);await page.getByRole('button',{name:'Focus mode',exact:true}).click();await expect(page.getByRole('complementary',{name:'Quoted replies'})).toBeVisible();
 await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();await page.getByRole('button',{name:'Chats',exact:true}).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep this separate draft');expect(graph.writes).toEqual([]);
});

test('explicit quoted send preserves normal drafts and shows the linked reply',async({page,graph})=>{
 graph.allowWrites=true;await signIn(page);
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Normal draft stays');
 await page.getByRole('button',{name:'Reply with quote',exact:true}).first().click();
 const pane=page.getByRole('complementary',{name:'Quoted replies'});
 await expect(pane.getByRole('button',{name:'Send quoted reply',exact:true})).toBeDisabled();
 await pane.getByRole('textbox',{name:'Quoted reply'}).fill('A deliberate quoted reply');
 expect(graph.writes).toEqual([]);
 await pane.getByRole('button',{name:'Send quoted reply',exact:true}).click();
 await expect(pane.getByRole('textbox',{name:'Quoted reply'})).toHaveValue('');
 await expect(pane).toContainText('A deliberate quoted reply');
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Normal draft stays');
 expect(graph.writes).toHaveLength(1);
 expect(graph.writes[0].args).toEqual({chatId:'chat-alex',messageId:'hello',ownId:me.id,text:'A deliberate quoted reply'});
});

test('reply drafts survive closing and uncertain delivery requires explicit retry acknowledgement',async({page,graph})=>{
 graph.allowWrites=true;graph.quoteStatus='uncertain';await signIn(page);
 await page.getByRole('button',{name:'Reply with quote',exact:true}).first().click();
 let pane=page.getByRole('complementary',{name:'Quoted replies'});
 await pane.getByRole('textbox',{name:'Quoted reply'}).fill('Keep this reply');
 await page.getByRole('button',{name:'Close quoted replies'}).click();
 await page.getByRole('button',{name:'Reply with quote',exact:true}).first().click();
 await expect(pane.getByRole('textbox',{name:'Quoted reply'})).toHaveValue('Keep this reply');
 await pane.getByRole('button',{name:'Send quoted reply',exact:true}).click();
 await expect(pane.getByRole('alert')).toContainText('draft is saved');
 await expect(pane.getByRole('button',{name:'Send quoted reply',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Close quoted replies'}).click();
 await page.getByRole('button',{name:'Reply with quote',exact:true}).first().click();
 await expect(pane.getByRole('button',{name:'Send quoted reply',exact:true})).toBeDisabled();
 await pane.getByRole('button',{name:'Refresh chat messages',exact:true}).click();
 expect(graph.writes).toHaveLength(1);
 await pane.getByRole('button',{name:'I checked Teams — enable retry'}).click();
 expect(graph.writes).toHaveLength(1);
 graph.quoteStatus='sent';
 await pane.getByRole('button',{name:'Send quoted reply',exact:true}).click();
 await expect(pane.getByRole('textbox',{name:'Quoted reply'})).toHaveValue('');
 expect(graph.writes).toHaveLength(2);
});

test('in-flight quoted reply cannot be duplicated or clear a different chat draft',async({page,graph})=>{
 graph.allowWrites=true;let release!:()=>void;graph.quoteGate=new Promise<void>(resolve=>release=resolve);
 await signIn(page);await page.getByRole('button',{name:'Reply with quote',exact:true}).first().click();
 const pane=page.getByRole('complementary',{name:'Quoted replies'});
 await pane.getByRole('textbox',{name:'Quoted reply'}).fill('Captured target');
 await pane.getByRole('button',{name:'Send quoted reply',exact:true}).click();
 await expect(pane.getByRole('button',{name:'Send quoted reply',exact:true})).toBeDisabled();
 await row(page,blair.displayName).click();release();
 await expect(page.locator('.messages')).not.toContainText('Captured target');
 await row(page,alex.displayName).click();
 await page.getByRole('button',{name:'Reply with quote',exact:true}).first().click();
 await expect(pane.getByRole('textbox',{name:'Quoted reply'})).toHaveValue('');
 expect(graph.writes).toHaveLength(1);
});

test('quoted replies remain complete beside ordinary follow-ups and link back to the timeline',async({page,graph},info)=>{
 seed(graph);
 await signIn(page);
 const timeline=page.getByRole('region',{name:'Chat messages'});
 await expect(timeline.locator('[data-message-id="reply"] .bubble')).toContainText('First quoted reply');
 await expect(timeline.locator('[data-message-id="reply"] .chat-quote-link')).toContainText('The original question');
 await expect(timeline).toContainText('Nested quoted reply');
 await expect(timeline).toContainText('An unrelated chat message');
 await expect(timeline).not.toContainText('DO NOT DISPLAY STALE PREVIEW');
 await page.getByRole('button',{name:'View chat replies',exact:true}).first().click();
 const pane=page.getByRole('complementary',{name:'Quoted replies'});
 await expect(pane).toContainText('Ordinary follow-ups stay in the conversation');
 await expect(pane).not.toContainText('An unrelated chat message');
 await page.screenshot({path:info.outputPath('complete-quoted-timeline.png')});
 await pane.getByRole('button',{name:'View in conversation'}).first().click();
 await expect(pane).toHaveCount(0);
 await expect(timeline.locator('[data-message-id="reply"]')).toBeFocused();
 expect(graph.writes).toEqual([]);
});
