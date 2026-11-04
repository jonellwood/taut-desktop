import {test,expect,signIn,message} from './fixtures';
test('one stable status area carries recoverable sync notices across navigation and focus mode',async({page,graph},info)=>{
 await signIn(page);
 const status=page.getByRole('contentinfo',{name:'Workspace status',exact:true});
 await expect(status).toContainText('background sync active');
 const normal=await status.boundingBox();
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Preserve this draft');
 graph.messagesError='Microsoft Graph network error';
 await page.clock.runFor(5_000);await expect(status).toContainText('Sync paused after an error');
 await expect(page.locator('.sync-warning')).toHaveCount(0);
 await expect(page.getByText('Sync paused after an error. Automatic retry is enabled.',{exact:true})).toHaveCount(1);
 const warning=await status.boundingBox();expect(warning!.y+warning!.height).toBeCloseTo(normal!.y+normal!.height,0);
 await page.getByRole('button',{name:'Focus mode',exact:true}).click();await expect(status).toBeVisible();
 await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();await expect(status).toContainText('Sync paused');
 await page.screenshot({path:info.outputPath('persistent-status.png')});
 graph.messagesError='';await page.clock.runFor(20_000);await expect(status).toContainText('background sync active');
 await page.getByRole('button',{name:'Chats',exact:true}).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Preserve this draft');expect(graph.writes).toEqual([]);
});
test('healthy message reads cannot hide a chat-list failure before that resource recovers',async({page,graph})=>{
 await signIn(page);const status=page.getByRole('contentinfo',{name:'Workspace status',exact:true});
 graph.chatsError='Graph returned HTTP 503';await page.clock.runFor(30_000);await expect(status).toContainText('Sync paused');
 await page.clock.runFor(20_000);await expect(status).toContainText('Sync paused'); // successful five-second message poll
 graph.chatsError='';await page.clock.runFor(45_000);await expect(status).toContainText('background sync active');expect(graph.writes).toEqual([]);
});
test('authentication and read notices share the global status area without moving the composer',async({page,graph})=>{
 graph.restoredSession=true;graph.persistenceNotice='Using a temporary sign-in; Keychain was unavailable.';await page.goto('/');
 const status=page.getByRole('contentinfo',{name:'Workspace status',exact:true});
 await expect(status).toContainText('temporary sign-in');await page.getByRole('button',{name:'Dismiss sign-in notice'}).click();
 await expect(status).toContainText('background sync active');await expect(page.locator('.auth-notice,.auth-error')).toHaveCount(0);
 graph.messagesError='Session expired. Fresh sign-in required.';
 await page.getByRole('button',{name:'Chats',exact:true}).click();
 await page.getByRole('button',{name:/Alex Example/}).first().click();
 await expect(status.getByRole('alert')).toContainText('Unable to load messages');expect(graph.writes).toEqual([]);
});
test('unchanged formatted polling retains the code DOM and stays responsive to typing',async({page,graph})=>{
 const code=Array.from({length:500},(_,i)=>'$Value'+i+' = Get-Item "sample"').join('\n');
 graph.messages['chat-alex']=[{...message('code',''),body:{contentType:'html',content:'<pre class="language-powershell"><code>'+code+'</code></pre>'}}];
 await signIn(page);
 const text=page.locator('.messages pre code');await expect(text).toContainText('$Value499');
 await text.evaluate(node=>(node as any).retained=true);
 await page.clock.runFor(5_000);
 expect(await text.evaluate(node=>(node as any).retained)).toBe(true);
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Still responsive');
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Still responsive');expect(graph.writes).toEqual([]);
});
