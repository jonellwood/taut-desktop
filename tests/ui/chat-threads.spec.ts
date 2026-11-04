import {test,expect,signIn,row,alex,blair,me,message,image} from './fixtures';
function reference(parent:string){return {id:parent,contentType:'messageReference',content:JSON.stringify({messageId:parent,messagePreview:'DO NOT DISPLAY STALE PREVIEW',messageSender:{user:{displayName:'Old snapshot'}}})};}
function seed(graph:any){
 graph.messages['chat-alex']=[{...message('root','The original question'),createdDateTime:'2026-01-01T12:00:00Z'},{...message('reply','First quoted reply',me.id),createdDateTime:'2026-01-01T12:01:00Z',attachments:[reference('root')]},{...message('nested','Nested quoted reply'),createdDateTime:'2026-01-01T12:02:00Z',attachments:[reference('reply')]},message('unrelated','An unrelated chat message')];
}

test('quoted chat replies open one context pane without sending or changing the chat draft',async({page,graph},info)=>{
 seed(graph);await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep normal chat draft');
 await page.getByRole('button',{name:'View chat replies',exact:true}).first().click();
 const pane=page.getByRole('complementary',{name:'Chat reply thread'});await expect(pane).toContainText('The original question');await expect(pane).toContainText('First quoted reply');await expect(pane).toContainText('Nested quoted reply');await expect(pane).not.toContainText('An unrelated chat message');await expect(pane).not.toContainText('DO NOT DISPLAY STALE PREVIEW');
 await expect(page.locator('.messages')).toContainText('An unrelated chat message');await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep normal chat draft');
 await page.screenshot({path:info.outputPath('chat-reply-pane.png')});expect(graph.calls.filter(c=>c.command==='graph_chat_message')).toHaveLength(0);expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Close reply thread'}).click();await expect(page.getByRole('complementary',{name:'Conversation details'})).toBeVisible();
});

test('missing parent is fetched read-only and deleted parent never exposes quote preview',async({page,graph})=>{
 graph.messages['chat-alex']=[{...message('reply','A quoted reply'),attachments:[reference('old-root')]}];
 graph.parentMessages['old-root']={...message('old-root','DELETED PARENT SECRET'),deletedDateTime:'2026-11-04T12:00:00Z'};
 await signIn(page);await page.getByRole('button',{name:'View quoted message 1',exact:true}).click();const pane=page.getByRole('complementary',{name:'Chat reply thread'});
 await expect(pane).toContainText('Message deleted');await expect(pane).toContainText('A quoted reply');await expect(pane).not.toContainText('DELETED PARENT SECRET');await expect(pane).not.toContainText('DO NOT DISPLAY STALE PREVIEW');
 expect(graph.calls.filter(c=>c.command==='graph_chat_message').at(-1)?.args).toEqual({chatId:'chat-alex',messageId:'old-root'});expect(graph.writes).toEqual([]);
});

test('unavailable parent reports failure instead of showing an old snapshot',async({page,graph})=>{
 graph.messages['chat-alex']=[{...message('reply','Current reply'),attachments:[reference('missing')]}];graph.parentError='HTTP 404';await signIn(page);await page.getByRole('button',{name:'View quoted message 1'}).click();
 const pane=page.getByRole('complementary',{name:'Chat reply thread'});await expect(pane.getByRole('alert')).toContainText('unavailable');await expect(pane).not.toContainText('DO NOT DISPLAY STALE PREVIEW');await expect(pane).toContainText('Current reply');expect(graph.writes).toEqual([]);
});

test('late older-parent response cannot leak into another selected chat',async({page,graph})=>{
 let release!:()=>void;graph.parentGate=new Promise<void>(resolve=>release=resolve);graph.parentMessages.old=message('old','OLD CHAT PARENT');graph.messages['chat-alex']=[{...message('reply','Current reply'),attachments:[reference('old')]}];
 await signIn(page);await page.getByRole('button',{name:'View quoted message 1'}).click();await expect(page.getByRole('status')).toContainText('Loading the quoted message');await row(page,blair.displayName).click();release();
 await expect(page.getByRole('complementary',{name:'Chat reply thread'})).toHaveCount(0);await expect(page.locator('.main')).not.toContainText('OLD CHAT PARENT');expect(graph.writes).toEqual([]);
});

test('files, image viewer and reaction counts remain available inside reply context',async({page,graph})=>{
 seed(graph);graph.messages['chat-alex'][0].attachments=[{id:'file',name:'notes.pdf',contentType:'reference',contentUrl:'https://example.sharepoint.com/notes.pdf'}];
 graph.messages['chat-alex'][0].body.content='<p>The original question</p><img src="https://graph.microsoft.com/v1.0/chats/chat-alex/messages/root/hostedContents/1/$value">';graph.messages['chat-alex'][0].reactions=[{reactionType:'like',createdDateTime:'2026-11-04T12:00:00Z',user:{user:{id:me.id,displayName:'Test User'}}}];
 await signIn(page);await page.getByRole('button',{name:'View chat replies'}).first().click();const pane=page.getByRole('complementary',{name:'Chat reply thread'});
 await pane.getByRole('button',{name:'notes.pdf',exact:true}).click();expect(graph.calls.filter(c=>c.command==='plugin:opener|open_url')).toHaveLength(1);
 await expect(pane.getByRole('group',{name:'Message reactions'})).toBeVisible();await pane.getByRole('button',{name:'View original image'}).click();await expect(page.getByRole('button',{name:'Close viewer'})).toBeVisible();await page.getByRole('button',{name:'Close viewer'}).click();expect(graph.writes).toEqual([]);
});

test('forwarded messages do not fabricate quote threads and relationship-only sync updates are detected',async({page,graph})=>{
 graph.messages['chat-alex']=[message('root','The original question'),{...message('reply','Same reply text'),attachments:[{...reference('root'),contentType:'forwardedMessageReference'}]}];await signIn(page);await expect(page.getByRole('button',{name:'View chat replies'})).toHaveCount(0);
 graph.messages['chat-alex'][1].attachments=[reference('root')];await page.getByRole('button',{name:'Refresh messages',exact:true}).click();await expect(page.getByRole('button',{name:'View chat replies'})).toHaveCount(1);expect(graph.writes).toEqual([]);
});

test('focus mode hides and restores the reply pane and navigation keeps normal drafts',async({page,graph})=>{
 seed(graph);await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep this separate draft');await page.getByRole('button',{name:'View chat replies'}).first().click();
 await page.getByRole('button',{name:'Focus mode',exact:true}).click();await expect(page.getByRole('complementary',{name:'Chat reply thread'})).toHaveCount(0);await page.getByRole('button',{name:'Focus mode',exact:true}).click();await expect(page.getByRole('complementary',{name:'Chat reply thread'})).toBeVisible();
 await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();await page.getByRole('button',{name:'Chats',exact:true}).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep this separate draft');expect(graph.writes).toEqual([]);
});
