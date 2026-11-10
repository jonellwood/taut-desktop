import {test,expect,signIn,me} from './fixtures';
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('taut.formatting.visible.v1','false'));});
const source='**Try this**\n```powershell\n\t$x = "<safe>"\nWrite-Host $x\n```';
test('formatting controls preview locally, preserve chat drafts, and send only explicitly',async({page,graph},info)=>{
 graph.allowWrites=true;graph.attachmentPermission=true;await signIn(page);const input=page.getByRole('textbox',{name:'Message',exact:true});
 await page.getByRole('button',{name:'Format',exact:true}).click();await input.fill(source);
 await input.press('Enter');expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Preview',exact:true}).click();const preview=page.getByRole('region',{name:'Formatted message preview'});
 await expect(preview.locator('strong')).toHaveText('Try this');await expect(preview.getByRole('region',{name:'PowerShell code block'})).toContainText('$x = "<safe>"');
 await page.getByRole('button',{name:'Close preview'}).click();
 await page.getByRole('button',{name:/^BE Blair Example/}).click();await expect(page.getByRole('button',{name:'Format',exact:true})).toHaveAttribute('aria-pressed','true');await input.fill('Blair draft');
 await page.getByRole('button',{name:/^AE Alex Example/}).click();await expect(input).toHaveValue(source+'\n');await expect(page.getByRole('button',{name:'Format',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Preview',exact:true}).click();await page.screenshot({path:info.outputPath('composer-formatting.png')});
 expect(graph.writes).toEqual([]);await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_send_message').length).toBe(1);expect(graph.calls.find(c=>c.command==='graph_send_message')?.args).toEqual({chatId:'chat-alex',text:source,formatted:true});
 await expect(input).toHaveValue('');await expect(page.locator('.messages strong').filter({hasText:'Try this'})).toBeVisible();
});
test('toolbar inserts code at selection, blank fences never send, and files stay with formatted drafts',async({page,graph})=>{
 graph.allowWrites=true;graph.attachmentPermission=true;await signIn(page);const input=page.getByRole('textbox',{name:'Message',exact:true});
 await page.getByRole('button',{name:'Format',exact:true}).click();await page.getByRole('combobox',{name:'Code language'}).selectOption('php');await input.fill('echo "<tag>";');await input.selectText();await page.getByRole('button',{name:'Code block',exact:true}).click();await expect(input).toHaveValue('```php\necho "<tag>";\n```\n');
 await input.fill('```php\n \n```');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.getByRole('alert')).toContainText('nonempty');expect(graph.writes).toEqual([]);
 await page.getByLabel('Choose attachment files').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('test')});await input.fill(source);
 await page.getByRole('button',{name:'Send message',exact:true}).click();await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_send_attachments').length).toBe(1);expect(graph.calls.find(c=>c.command==='graph_send_attachments')?.args.formatted).toBe(true);
});
test('quoted formatted reply keeps its own draft and sends HTML through the mocked command',async({page,graph})=>{
 graph.allowWrites=true;await signIn(page);await page.getByRole('button',{name:'Reply with quote',exact:true}).first().click();const pane=page.getByRole('complementary',{name:'Chat reply thread'});
 await pane.getByRole('button',{name:'Format',exact:true}).click();await pane.getByRole('textbox',{name:'Quoted reply'}).fill('**A reply**');
 await pane.getByRole('button',{name:'Close reply thread'}).click();await page.getByRole('button',{name:'Reply with quote',exact:true}).first().click();await expect(pane.getByRole('button',{name:'Format',exact:true})).toHaveAttribute('aria-pressed','true');await expect(pane.getByRole('textbox',{name:'Quoted reply'})).toHaveValue('**A reply**');
 await pane.getByRole('button',{name:'Send quoted reply'}).click();await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_reply_with_quote').length).toBe(1);expect(graph.calls.find(c=>c.command==='graph_reply_with_quote')?.args.formatted).toBe(true);await expect(pane.locator('strong').filter({hasText:'A reply'})).toBeVisible();
});
test('channel post and reply formatting use independent drafts and explicit sends',async({page,graph})=>{
 graph.allowWrites=true;graph.teamData.posts=[{id:'post',messageType:'message',from:{user:{id:me.id,displayName:'Test User'}},body:{contentType:'text',content:'Original'}}];
 await signIn(page);await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 const post=page.getByRole('form',{name:'New channel post'});await post.getByRole('button',{name:'Format',exact:true}).click();await post.getByRole('textbox').fill('**New post**');
 await page.getByRole('button',{name:'View replies',exact:true}).click();const reply=page.getByRole('form',{name:'Channel reply'});await expect(reply.getByRole('button',{name:'Format',exact:true})).toHaveAttribute('aria-pressed','true');await reply.getByRole('button',{name:'Preview',exact:true}).click();await reply.getByRole('textbox').fill('`reply`');
 expect(graph.writes).toEqual([]);await reply.getByRole('button',{name:'Send channel reply'}).click();await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_send_channel').length).toBe(1);expect(graph.calls.find(c=>c.command==='graph_send_channel')?.args.target.formatted).toBe(true);await expect(post.getByRole('textbox')).toHaveValue('**New post**');await post.getByRole('button',{name:'Post to channel'}).click();await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_send_channel').length).toBe(2);
});

for(const composer of ['chat','quote','post','channel reply'])test(`List starter is selected and typing preserves the bullet in ${composer}`,async({page,graph})=>{
 await signIn(page);
 let scope=page.locator('.compose-format-area');let input=page.getByRole('textbox',{name:'Message',exact:true});
 if(composer==='quote'){
  await page.getByRole('button',{name:'Reply with quote',exact:true}).first().click();scope=page.getByRole('complementary',{name:'Chat reply thread'});input=scope.getByRole('textbox',{name:'Quoted reply'});
 }else if(composer!=='chat'){
  graph.teamData.posts=[{id:'post',body:{contentType:'text',content:'Original'}}];
  await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
  if(composer==='channel reply')await page.getByRole('button',{name:'View replies',exact:true}).click();
  scope=page.getByRole('form',{name:composer==='post'?'New channel post':'Channel reply'});input=scope.getByRole('textbox');
 }
 await scope.getByRole('button',{name:'Format',exact:true}).click();
 // Insertion after existing text also accounts for the added line break.
 await input.fill('Notes');await input.press('End');await scope.getByRole('button',{name:'List',exact:true}).click();
 await expect(input).toBeFocused();await expect(input).toHaveValue('Notes\n- List item');
 expect(await input.evaluate((element:HTMLTextAreaElement)=>element.value.slice(element.selectionStart,element.selectionEnd))).toBe('List item');
 await input.pressSequentially('First task');await expect(input).toHaveValue('Notes\n- First task');
 await input.fill('');await scope.getByRole('button',{name:'List',exact:true}).click();
 expect(await input.evaluate((element:HTMLTextAreaElement)=>[element.selectionStart,element.selectionEnd])).toEqual([2,11]);
 await input.pressSequentially('Another task');await expect(input).toHaveValue('- Another task');
 await input.press('Enter');await expect(input).toHaveValue('- Another task\n- ');
 await input.pressSequentially('Second task');await input.press('Enter');await expect(input).toHaveValue('- Another task\n- Second task\n- ');
 await input.press('Enter');await expect(input).toHaveValue('- Another task\n- Second task\n\n');
 expect(await input.evaluate((element:HTMLTextAreaElement)=>element.selectionStart)).toBe((await input.inputValue()).length);
 await input.pressSequentially('Normal paragraph');await expect(input).toHaveValue('- Another task\n- Second task\n\nNormal paragraph');
 await input.fill('```text\n- literal');await input.press('Enter');await expect(input).toHaveValue('```text\n- literal\n');
 expect(graph.writes).toEqual([]);
});

test('long PHP draft changes its existing fence and sends intact; oversize stays local',async({page,graph})=>{
 graph.allowWrites=true;await signIn(page);const input=page.getByRole('textbox',{name:'Message',exact:true});const code="$value = 'hello';\n".repeat(400);
 await page.getByRole('button',{name:'Format',exact:true}).click();await input.fill('```powershell\n'+code+'```');await expect(page.getByRole('combobox',{name:'Code language'})).toHaveValue('powershell');await page.getByRole('combobox',{name:'Code language'}).selectOption('php');await expect(input).toHaveValue('```php\n'+code+'```');await expect(page.getByRole('combobox',{name:'Code language'})).toHaveValue('php');
 await page.getByRole('button',{name:'Preview',exact:true}).click();await expect(page.getByRole('region',{name:'Formatted message preview'}).getByRole('region',{name:'PHP code block'})).toBeVisible();await page.getByRole('button',{name:'Close preview'}).click();
 await page.getByRole('button',{name:'Send message',exact:true}).click();await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_send_message').length).toBe(1);expect(graph.calls.find(c=>c.command==='graph_send_message')?.args.text).toBe('```php\n'+code+'```');
 const oversized='```php\n'+'&'.repeat(8000)+'\n```';await input.fill(oversized);await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.getByRole('alert')).toContainText('64 KiB');await expect(input).toHaveValue(oversized);expect(graph.calls.filter(c=>c.command==='graph_send_message')).toHaveLength(1);
});

test('quoted and channel composers preserve and send text beyond the former 4000 character cap',async({page,graph})=>{
 graph.allowWrites=true;await signIn(page);const text='Long snippet line\n'.repeat(300);
 await page.getByRole('button',{name:'Reply with quote',exact:true}).first().click();const quote=page.getByRole('complementary',{name:'Chat reply thread'});await quote.getByRole('textbox',{name:'Quoted reply'}).fill(text);await expect(quote.getByRole('textbox')).toHaveValue(text);await quote.getByRole('button',{name:'Send quoted reply'}).click();await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_reply_with_quote').length).toBe(1);
 graph.teamData.posts=[{id:'post',body:{contentType:'text',content:'Original'}}];await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 const post=page.getByRole('form',{name:'New channel post'});await post.getByRole('textbox').fill(text);await expect(post.getByRole('textbox')).toHaveValue(text);await post.getByRole('button',{name:'Post to channel'}).click();await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_send_channel').length).toBe(1);
 await page.getByRole('button',{name:'View replies',exact:true}).last().click();const reply=page.getByRole('form',{name:'Channel reply'});await reply.getByRole('textbox').fill(text);await reply.getByRole('button',{name:'Send channel reply'}).click();await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_send_channel').length).toBe(2);
});
