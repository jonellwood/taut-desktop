import {test,expect,row,alex,blair,me} from './fixtures';
const options=(page:import('@playwright/test').Page,name:string)=>page.getByRole('button',{name:`Conversation options for ${name}`,exact:true});
async function pin(page:import('@playwright/test').Page,name:string){await options(page,name).click();await page.getByRole('menuitem',{name:'Pin chat',exact:true}).click();}

test('pinning an unopened unread chat stays local and survives reload and sync',async({page,graph},info)=>{
 graph.restoredSession=true;graph.chats[0].lastMessagePreview={id:'unread',messageType:'message',createdDateTime:'2026-11-03T12:00:00Z',from:{user:{id:alex.id}},body:{content:'Unread preview',contentType:'text'}};
 await page.goto('/');await expect(row(page,alex.displayName)).toBeVisible();await pin(page,alex.displayName);
 await expect(page.locator('.chat-row-wrap.pinned .chat-row')).toContainText(alex.displayName);
 await expect(row(page,alex.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Welcome to TAUT'})).toBeVisible();
 expect(graph.calls.some(c=>c.command==='graph_messages')).toBe(false);expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Refresh messages',exact:true}).click();await page.reload();
 await expect(page.locator('.chat-row-wrap.pinned .chat-row')).toContainText(alex.displayName);
 await expect(row(page,alex.displayName).getByLabel('Unread conversation',{exact:true})).toBeVisible();
 await options(page,alex.displayName).click();await page.screenshot({path:info.outputPath('pinned-options.png'),animations:'disabled'});
 await page.getByRole('menuitem',{name:'Unpin chat',exact:true}).click();
 await expect(page.locator('.chat-row-wrap.pinned')).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('pins are isolated by account and return after signing back in',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await expect(row(page,alex.displayName)).toBeVisible();await pin(page,alex.displayName);
 const firstAccountChats=graph.chats;
 await page.getByRole('button',{name:'Sign out',exact:true}).click();graph.profileId=blair.id;
 graph.chats=[{...firstAccountChats[0],id:'chat-second',topic:'Second account chat',members:firstAccountChats[0].members.map(m=>m.userId===me.id?{...m,userId:blair.id}:m)}];
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(row(page,'Second account chat')).toBeVisible();
 await expect(page.locator('.chat-row-wrap.pinned')).toHaveCount(0);await pin(page,'Second account chat');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();graph.profileId=me.id;graph.chats=firstAccountChats;
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(row(page,alex.displayName)).toBeVisible();
 await expect(page.locator('.chat-row-wrap.pinned .chat-row')).toHaveText(/Alex Example/);await expect(page.locator('.chat-row-wrap.pinned')).toHaveCount(1);expect(graph.writes).toEqual([]);
});

test('pinning and unpinning a selected group preserves its draft',async({page,graph})=>{
 graph.restoredSession=true;graph.chats[1].chatType='group';graph.chats[1].topic='Focus group';await page.goto('/');await row(page,'Focus group').click();
 const draft=page.getByRole('textbox',{name:'Message',exact:true});await draft.fill('Keep this group draft');await pin(page,'Focus group');
 await expect(draft).toHaveValue('Keep this group draft');await options(page,'Focus group').click();
 await page.getByRole('menuitem',{name:'Unpin chat',exact:true}).click();await expect(draft).toHaveValue('Keep this group draft');expect(graph.writes).toEqual([]);
});

test('pin storage failure leaves the list unchanged and explains the error',async({page,graph})=>{
 graph.restoredSession=true;await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('taut.pins.'))throw Error('Unavailable');return original.call(this,key,value);};});
 await page.goto('/');await expect(row(page,alex.displayName)).toBeVisible();await pin(page,alex.displayName);
 await expect(page.getByRole('alert')).toContainText('could not be saved');await expect(page.locator('.chat-row-wrap.pinned')).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('hidden pins stay hidden and Escape closes options without opening the chat',async({page,graph})=>{
 graph.restoredSession=true;graph.chats[0].viewpoint={isHidden:true};
 await page.addInitScript(({account})=>localStorage.setItem(`taut.pins.v1.${account}`,JSON.stringify(['chat-alex'])),{account:me.id});
 await page.goto('/');await expect(row(page,blair.displayName)).toBeVisible();await expect(row(page,alex.displayName)).toHaveCount(0);
 await page.getByRole('button',{name:/^Hidden chats/}).click();await expect(page.locator('.chat-row-wrap.pinned .chat-row')).toContainText(alex.displayName);
 await options(page,alex.displayName).click();await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);await expect(options(page,alex.displayName)).toBeFocused();
 expect(graph.calls.some(c=>c.command==='graph_messages')).toBe(false);expect(graph.writes).toEqual([]);
});
