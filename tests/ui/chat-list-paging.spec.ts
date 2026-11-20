import {test,expect,signIn,openDraft,row,chat,message,alex,blair,casey} from './fixtures';
const cursor='https://graph.microsoft.com/v1.0/chats?$skiptoken=older';
const second='https://graph.microsoft.com/v1.0/chats?$skiptoken=last';

test('older conversations append once, preserve drafts and selection, and survive recent refresh',async({page,graph},testInfo)=>{
 graph.chatNext=cursor;
 graph.chatPages[cursor]={value:[chat('chat-alex',alex),chat('chat-casey',casey),chat('chat-casey',casey)],'@odata.nextLink':second};
 graph.chatPages[second]={value:[]};
 graph.messages['chat-casey']=[message('old','An older conversation',casey.id)];
 await signIn(page);
 const input=page.getByRole('textbox',{name:'Message',exact:true});
 await input.fill('Keep my draft');
 await page.getByRole('button',{name:'Load more conversations',exact:true}).click();
 await expect(row(page,casey.displayName)).toHaveCount(1);
 await expect(row(page,alex.displayName)).toHaveCount(1);
 await expect(page.locator('.conversation-header')).toContainText(alex.displayName);
 await expect(input).toHaveValue('Keep my draft');
 await page.screenshot({path:testInfo.outputPath('conversation-paging.png')});
 expect(graph.calls.filter(c=>c.command==='graph_messages'&&c.args.chatId==='chat-casey')).toHaveLength(0);
 await page.getByRole('button',{name:'Refresh messages',exact:true}).click();
 await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_chats'&&!c.args.next).length).toBe(2);
 await expect(row(page,casey.displayName)).toHaveCount(1);
 await page.getByRole('button',{name:'Load more conversations',exact:true}).click();
 await expect(page.getByText('No more conversations available.',{exact:true})).toBeVisible();
 expect(graph.calls.filter(c=>c.command==='graph_chats'&&c.args.next).map(c=>c.args.next)).toEqual([cursor,second]);
 await row(page,casey.displayName).click();
 await expect(page.getByRole('region',{name:'Chat messages'})).toContainText('An older conversation');
 await row(page,alex.displayName).click();
 await expect(input).toHaveValue('Keep my draft');
 expect(graph.writes).toEqual([]);
});

test('a loaded older conversation is reused by New conversation after a refresh',async({page,graph})=>{
 graph.chatNext=cursor;graph.chatPages[cursor]={value:[chat('chat-casey',casey)]};
 await signIn(page);
 await page.getByRole('button',{name:'Load more conversations',exact:true}).click();
 await expect(row(page,casey.displayName)).toBeVisible();
 await page.getByRole('button',{name:'Refresh messages',exact:true}).click();
 await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_chats'&&!c.args.next).length).toBe(2);
 await openDraft(page,casey.displayName);
 await expect(page.locator('.conversation-header')).toContainText(casey.displayName);
 await expect(page.getByText('Local draft. Pressing Send',{exact:false})).toHaveCount(0);
 expect(graph.writes).toEqual([]);
});

test('failed page keeps loaded chats and retries the same cursor only on click',async({page,graph})=>{
 graph.chatNext=cursor;graph.chatPageError='Temporary failure';
 await signIn(page);
 await page.getByRole('button',{name:'Load more conversations',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('More conversations could not be loaded');
 await expect(row(page,alex.displayName)).toBeVisible();
 graph.chatPageError='';graph.chatPages[cursor]={value:[chat('chat-casey',casey)]};
 await page.getByRole('button',{name:'Load more conversations',exact:true}).click();
 await expect(row(page,casey.displayName)).toBeVisible();
 expect(graph.calls.filter(c=>c.command==='graph_chats'&&c.args.next)).toHaveLength(2);
 expect(graph.writes).toEqual([]);
});

test('search can load another page without clearing the filter',async({page,graph})=>{
 graph.chatNext=cursor;graph.chatPages[cursor]={value:[chat('chat-casey',casey)]};
 await signIn(page);
 await page.getByRole('textbox',{name:'Search conversations',exact:true}).fill('Casey');
 await expect(page.getByText('No matching conversations',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Load more conversations',exact:true}).click();
 await expect(row(page,casey.displayName)).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Search conversations',exact:true})).toHaveValue('Casey');
 expect(graph.writes).toEqual([]);
});

test('double clicks and repeated cursors cannot loop or duplicate conversations',async({page,graph})=>{
 graph.chatNext=cursor;graph.chatPages[cursor]={value:[chat('chat-blair',blair)],'@odata.nextLink':cursor};
 let release!:()=>void;graph.chatPageGate=new Promise(resolve=>release=resolve);
 await signIn(page);
 await page.getByRole('button',{name:'Load more conversations',exact:true}).click();
 await expect(page.getByRole('button',{name:'Loading conversations…',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Loading conversations…',exact:true}).dispatchEvent('click');
 expect(graph.calls.filter(c=>c.command==='graph_chats'&&c.args.next)).toHaveLength(1);
 release();
 await expect(page.getByRole('button',{name:'Load more conversations',exact:true})).toHaveCount(0);
 await expect(row(page,blair.displayName)).toHaveCount(1);
 expect(graph.writes).toEqual([]);
});

test('a page arriving after sign-out cannot repopulate conversations',async({page,graph})=>{
 graph.chatNext=cursor;graph.chatPages[cursor]={value:[chat('chat-casey',casey)]};
 let release!:()=>void;graph.chatPageGate=new Promise(resolve=>release=resolve);
 await signIn(page);
 await page.getByRole('button',{name:'Load more conversations',exact:true}).click();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 release();
 await expect(row(page,casey.displayName)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Load more conversations',exact:true})).toHaveCount(0);
 expect(graph.writes).toEqual([]);
});
