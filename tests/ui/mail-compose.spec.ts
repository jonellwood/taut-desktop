import {test,expect,signIn} from './fixtures';
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('taut.formatting.visible.v1','false'));});
const openMail=async(page:import('@playwright/test').Page)=>{await page.getByRole('button',{name:'Mail',exact:true}).click();await expect(page.getByRole('heading',{name:'One conversation at a time.'})).toBeVisible();};
const fill=async(page:import('@playwright/test').Page)=>{await page.getByRole('combobox',{name:'To',exact:true}).fill('alex@example.test');await page.getByRole('textbox',{name:'Email subject'}).fill('A clear subject');await page.getByRole('textbox',{name:'Email message'}).fill('Hello from a local draft');};
test('new mail drafts survive close, navigation and restart without sending',async({page,graph})=>{
 await signIn(page);await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();await fill(page);await page.getByRole('button',{name:'Save & close'}).click();
 await page.getByText('Drafts on this Mac (1)',{exact:true}).click();await page.getByRole('button',{name:/A clear subject.*alex@example.test/}).click();await expect(page.getByRole('textbox',{name:'Email message'})).toHaveValue('Hello from a local draft');
 await page.getByRole('button',{name:'Chats',exact:true}).click();await openMail(page);await page.getByText('Drafts on this Mac (1)',{exact:true}).click();await page.getByRole('button',{name:/A clear subject.*alex@example.test/}).click();await expect(page.getByRole('textbox',{name:'Email subject'})).toHaveValue('A clear subject');
 await page.reload();await signIn(page);await openMail(page);await page.getByText('Drafts on this Mac (1)',{exact:true}).click();await page.getByRole('button',{name:/A clear subject.*alex@example.test/}).click();await expect(page.getByRole('textbox',{name:'Email message'})).toHaveValue('Hello from a local draft');expect(graph.writes).toEqual([]);
});
test('explicit review sends once with Cc Bcc and portable formatted HTML',async({page,graph},info)=>{
 await signIn(page);await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();await fill(page);await page.getByRole('combobox',{name:'Cc',exact:true}).fill('copy@example.test');await page.getByRole('combobox',{name:'Bcc',exact:true}).fill('hidden@example.test');await page.getByRole('button',{name:'Format',exact:true}).click();await page.getByRole('textbox',{name:'Email message'}).fill('**Hello**\n```php\n$x = 1;\n```');
 await page.getByRole('button',{name:'Review & send'}).click();await expect(page.getByRole('group',{name:'Review email before sending'})).toContainText('hidden@example.test');expect(graph.writes).toEqual([]);await page.screenshot({path:info.outputPath('new-mail-review.png')});await page.getByRole('button',{name:'Send email',exact:true}).click();await expect(page.getByRole('status')).toContainText('Accepted for sending');
 const calls=graph.calls.filter(c=>c.command==='mail_send_new');expect(calls).toHaveLength(1);expect(calls[0].args.draft.bcc).toEqual(['hidden@example.test']);expect(calls[0].args.draft.content).toContain('<pre><code class="language-php">');await expect(page.getByText('0 local drafts')).toBeVisible();
});
test('uncertain sends retain a locked draft across navigation and require acknowledgement',async({page,graph})=>{
 graph.mailSendResult={status:'uncertain',error:'Check Sent in Outlook before retrying.'};await signIn(page);await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();await fill(page);await page.getByRole('button',{name:'Review & send'}).click();await page.getByRole('button',{name:'Send email',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Check Sent');await expect(page.getByRole('button',{name:'Review & send'})).toBeDisabled();
 await page.getByRole('button',{name:'Save & close'}).click();await page.getByText('Drafts on this Mac (1)',{exact:true}).click();await page.getByRole('button',{name:/A clear subject.*Check sending status/}).click();await expect(page.getByRole('button',{name:'Review & send'})).toBeDisabled();expect(graph.calls.filter(c=>c.command==='mail_send_new')).toHaveLength(1);await page.getByRole('button',{name:'I checked Outlook — unlock draft'}).click();await expect(page.getByRole('button',{name:'Review & send'})).toBeEnabled();
});
test('missing send consent allows local drafts but prevents sending and discard is explicit',async({page,graph})=>{
 graph.mailCanSend=false;await signIn(page);await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();await fill(page);await expect(page.getByRole('button',{name:'Review & send'})).toBeDisabled();await page.getByRole('button',{name:'Discard draft',exact:true}).click();await expect(page.getByRole('dialog',{name:'Discard email draft'})).toBeVisible();await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await expect(page.getByRole('button',{name:'Discard permanently'})).toBeInViewport();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('textbox',{name:'Email message'})).toHaveValue('Hello from a local draft');await page.getByRole('button',{name:'Discard draft',exact:true}).click();await page.getByRole('button',{name:'Discard permanently'}).click();await expect(page.getByText('0 local drafts')).toBeVisible();expect(graph.writes).toEqual([]);
});

test('recipient lookup stages a coworker without sending and drafts stay account scoped',async({page,graph})=>{
 await signIn(page);await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();
 await page.getByText('Find a coworker',{exact:true}).click();await page.getByRole('textbox',{name:'Find email recipient'}).fill('Alex');await page.getByRole('button',{name:'Search people'}).click();await page.getByRole('button',{name:/Alex Example ·/}).click();await expect(page.getByRole('combobox',{name:'To',exact:true})).toHaveValue('alex@example.com');
 expect(graph.calls.filter(c=>c.command==='mail_send_new')).toHaveLength(0);
 graph.profileId='55555555-5555-4555-8555-555555555555';await page.reload();await signIn(page);await openMail(page);await expect(page.getByText('0 local drafts')).toBeVisible();expect(graph.writes).toEqual([]);
});

test('coworker destination follows focused recipient and validation stands out',async({page,graph})=>{
 await signIn(page);await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();
 await page.getByRole('combobox',{name:'Cc',exact:true}).focus();await page.getByText('Find a coworker',{exact:true}).click();await expect(page.getByRole('combobox',{name:'Add coworker to'})).toHaveValue('cc');
 await page.getByRole('combobox',{name:'Bcc',exact:true}).focus();await expect(page.getByRole('combobox',{name:'Add coworker to'})).toHaveValue('bcc');
 await page.getByRole('textbox',{name:'Find email recipient'}).fill('Alex');await page.getByRole('button',{name:'Search people'}).click();await page.getByRole('button',{name:/Alex Example ·/}).click();await expect(page.getByRole('combobox',{name:'Bcc',exact:true})).toHaveValue('alex@example.com');
 await expect(page.getByRole('status')).toContainText('Before sending');expect(graph.writes).toEqual([]);
});

for(const [action,label] of [['reply','Reply'],['replyAll','Reply all'],['forward','Forward']])test(`${label} stages source-scoped drafts and sends only after review`,async({page,graph},info)=>{
 graph.mailMessages[0].replyTo=[{emailAddress:{address:'reply@example.test'}}];graph.mailMessages[0].toRecipients=[{emailAddress:{address:'peer@example.test'}}];graph.mailMessages[0].ccRecipients=[{emailAddress:{address:'copy@example.test'}}];
 await signIn(page);await openMail(page);await page.locator('.mail-row').first().click();await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByText('Original message included',{exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
 await expect(page.getByRole('combobox',{name:'To',exact:true})).toHaveValue(action==='forward'?'':action==='replyAll'?'reply@example.test; peer@example.test':'reply@example.test');
 await page.getByRole('textbox',{name:'Email message'}).fill('A source-specific reply');await page.getByRole('button',{name:'Save & close'}).click();await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByRole('textbox',{name:'Email message'})).toHaveValue('A source-specific reply');await expect(page.getByText('1 local drafts',{exact:true})).toBeVisible();
 if(action==='forward')await page.getByRole('combobox',{name:'To',exact:true}).fill('forward@example.test');
 await page.getByRole('button',{name:'Review & send'}).click();expect(graph.writes).toEqual([]);await page.getByRole('group',{name:'Review email before sending'}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('mail-response-review.png')});await page.getByRole('button',{name:'Send email',exact:true}).click();await expect(page.getByText('0 local drafts',{exact:true})).toBeVisible();const sends=graph.calls.filter(c=>c.command==='mail_send_new');expect(sends).toHaveLength(1);expect(sends[0].args.draft.action).toBe(action);expect(sends[0].args.draft.sourceId).toBe('mail-1');expect(sends[0].args.draft.content).toContain('Original message');
});

test('response drafts retain their source across restart and actions stay separate',async({page,graph})=>{
 await signIn(page);await openMail(page);await page.locator('.mail-row').first().click();await page.getByRole('button',{name:'Reply',exact:true}).click();await page.getByRole('textbox',{name:'Email message'}).fill('Persistent reply');await page.getByRole('button',{name:'Save & close'}).click();await page.getByRole('button',{name:'Forward',exact:true}).click();await page.getByRole('textbox',{name:'Email message'}).fill('Separate forward');await page.reload();await signIn(page);await openMail(page);await page.getByText('Drafts on this Mac (2)',{exact:true}).click();await page.getByRole('button',{name:/RE:.*alex/}).click();await expect(page.getByRole('textbox',{name:'Email message'})).toHaveValue('Persistent reply');await page.getByRole('combobox',{name:'To',exact:true}).fill('alex@example.test');await page.getByRole('button',{name:'Review & send'}).click();await page.getByRole('button',{name:'Send email',exact:true}).click();const send=graph.calls.find(c=>c.command==='mail_send_new');expect(send?.args.draft.action).toBe('reply');expect(send?.args.draft.sourceId).toBe('mail-1');await expect(page.getByText('1 local drafts',{exact:true})).toBeVisible();
});

test('accepted reply refreshes the open thread when the Sent copy appears later',async({page,graph})=>{
 await signIn(page);await openMail(page);await page.locator('.mail-row').first().click();
 await page.getByRole('button',{name:'Reply',exact:true}).click();await page.getByRole('textbox',{name:'Email message'}).fill('A delayed sent copy');
 await page.getByRole('button',{name:'Review & send'}).click();await page.getByRole('button',{name:'Send email',exact:true}).click();
 await expect(page.getByText('0 local drafts',{exact:true})).toBeVisible();
 graph.mailMessages.push({...graph.mailMessages[0],id:'sent-copy',from:{emailAddress:{address:'me@example.test',name:'Test User'}},receivedDateTime:'2026-11-05T16:00:00Z',body:{contentType:'text',content:'A delayed sent copy'}});
 await page.clock.runFor(2100);await expect.poll(()=>graph.calls.filter(c=>c.command==='mail_page'&&c.args.query.collection==='conversation').length,{timeout:10000}).toBeGreaterThan(2);await expect(page.locator('#mail-message-sent-copy')).toBeVisible();
 expect(graph.calls.filter(c=>c.command==='mail_send_new')).toHaveLength(1);
 await page.getByRole('button',{name:'Chats',exact:true}).click();
 const count=graph.calls.filter(c=>c.command==='mail_page').length;
 await page.clock.runFor(5500);expect(graph.calls.filter(c=>c.command==='mail_page')).toHaveLength(count);
});

test('mail file copies survive reload and send only after review',async({page,graph})=>{
 await signIn(page);await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();await fill(page);
 await page.getByLabel('Choose email attachments').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('Local file')});
 await expect(page.getByRole('list',{name:'Draft attachments'})).toContainText('notes.txt');expect(graph.writes).toEqual([]);
 await page.reload();await signIn(page);await openMail(page);await page.getByText('Drafts on this Mac (1)',{exact:true}).click();await page.getByRole('button',{name:/A clear subject.*alex@example.test/}).click();
 await expect(page.getByRole('list',{name:'Draft attachments'})).toContainText('notes.txt');
 await page.getByRole('button',{name:'Review & send'}).click();await expect(page.getByRole('group',{name:'Review email before sending'})).toContainText('notes.txt');expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Send email',exact:true}).click();await expect(page.getByText('0 local drafts')).toBeVisible();
 const sent=graph.calls.filter(c=>c.command==='mail_send_new');expect(sent).toHaveLength(1);expect(sent[0].args.draft.attachments[0].contentBytes).toBe(Buffer.from('Local file').toString('base64'));
});
test('inline images produce CID content and oversized files leave draft unchanged',async({page,graph})=>{
 await signIn(page);await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();await fill(page);
 await page.getByLabel('Choose email attachments').setInputFiles({name:'large.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(2097153)});await expect(page.getByRole('alert')).toContainText('2 MB');await expect(page.getByRole('textbox',{name:'Email message'})).toHaveValue('Hello from a local draft');
 await page.getByLabel('Choose inline email images').setInputFiles({name:'pixel.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
 await expect(page.getByRole('list',{name:'Draft attachments'})).toContainText('Inline image');await page.getByRole('button',{name:'Review & send'}).click();await page.getByRole('button',{name:'Send email',exact:true}).click();await expect(page.getByText('0 local drafts')).toBeVisible();const d=graph.calls.find(c=>c.command==='mail_send_new')!.args.draft;expect(d.contentType).toBe('HTML');expect(d.content).toContain(`src="cid:taut-${d.attachments[0].id}"`);
});

test('saved signatures stay separate from the message and appear in review and send',async({page,graph},info)=>{
 await signIn(page);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Mail',exact:true}).click();
 await page.getByRole('textbox',{name:'Saved signature',exact:true}).fill('**Test User**\nSoftware developer');await page.getByRole('button',{name:'Save signature defaults'}).click();await page.screenshot({path:info.outputPath('signature-settings.png')});await page.getByRole('button',{name:'Close settings'}).click();
 await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();await fill(page);await expect(page.getByRole('textbox',{name:'Email message'})).toHaveValue('Hello from a local draft');
 await page.getByRole('button',{name:'Review & send'}).click();await expect(page.getByLabel('Signature to send')).toHaveText('Signature included');expect(graph.writes).toEqual([]);await page.getByRole('button',{name:'Send email',exact:true}).click();await expect(page.getByText('0 local drafts')).toBeVisible();expect(graph.calls.find(c=>c.command==='mail_send_new')!.args.draft.content).toContain('<strong>Test User</strong>');
});
test('clear mailbox search restores the current folder and clears the input',async({page,graph})=>{
 await signIn(page);await openMail(page);await page.getByRole('textbox',{name:'Search mailbox'}).fill('project');await page.getByRole('button',{name:'Search mail',exact:true}).click();await expect(page.getByText('MAILBOX SEARCH',{exact:false}).first()).toBeVisible();await page.getByRole('button',{name:'Clear mailbox search'}).click();await expect(page.getByRole('textbox',{name:'Search mailbox'})).toHaveValue('');await expect.poll(()=>graph.calls.filter(c=>c.command==='mail_page').at(-1)?.args.query.search).toBe(null);
});
test('respond by email fills the sender and quotes chat locally without sending',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:/Alex Example/}).first().click();await page.getByRole('button',{name:'Respond by email',exact:true}).first().click();
 await expect(page.getByRole('combobox',{name:'To',exact:true})).toHaveValue('alex@example.com');await expect(page.getByRole('textbox',{name:'Email subject'})).toHaveValue('From chat: Alex Example');await expect(page.getByRole('heading',{name:'In reference to'})).toBeVisible();await expect(page.locator('.mail-compose blockquote')).toContainText('Quoted from TAUT chat');await expect(page.getByRole('button',{name:'Review & send'})).toBeDisabled();expect(graph.writes).toEqual([]);
});

test('mail paste and drop stay local and uncertain sends retain file copies',async({page,graph})=>{
 graph.mailSendResult={status:'uncertain',error:'Check Sent'};await signIn(page);await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();await fill(page);
 await page.getByRole('textbox',{name:'Email message'}).evaluate(node=>{const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array([1,2,3])],'pasted.png',{type:'image/png'}));node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));});
 await expect(page.getByRole('list',{name:'Draft attachments'})).toContainText('Clipboard image');
 await page.getByRole('region',{name:'New email composer'}).evaluate(node=>{const transfer=new DataTransfer();transfer.items.add(new File(['dropped'],'drop.txt',{type:'text/plain'}));node.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));});
 await expect(page.getByRole('list',{name:'Draft attachments'})).toContainText('drop.txt');expect(graph.writes).toEqual([]);await page.getByRole('button',{name:'Review & send'}).click();await page.getByRole('button',{name:'Send email',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Check Sent');await page.reload();await signIn(page);await openMail(page);await page.getByText('Drafts on this Mac (1)',{exact:true}).click();await page.getByRole('button',{name:/A clear subject.*Check sending status/}).click();await expect(page.getByRole('list',{name:'Draft attachments'})).toContainText('drop.txt');await expect(page.getByRole('button',{name:'Review & send'})).toBeDisabled();expect(graph.calls.filter(c=>c.command==='mail_send_new')).toHaveLength(1);
});

test('self email requires confirmation and remembers opt out across restart',async({page,graph})=>{
 await signIn(page);await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();await fill(page);
 await page.getByRole('combobox',{name:'To',exact:true}).fill('ME@example.test');
 await page.getByRole('button',{name:'Review & send'}).click();await page.getByRole('button',{name:'Send email',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Send an email to yourself?'});
 await expect(dialog).toBeVisible();expect(graph.writes).toEqual([]);
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).not.toBeVisible();expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Send email',exact:true}).click();
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Send to myself'}).click();
 await expect(page.getByText('0 local drafts')).toBeVisible();expect(graph.calls.filter(c=>c.command==='mail_send_new')).toHaveLength(1);
 await page.reload();await signIn(page);await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();await fill(page);
 await page.getByRole('combobox',{name:'To',exact:true}).fill('me@example.test');await page.getByRole('button',{name:'Review & send'}).click();await page.getByRole('button',{name:'Send email',exact:true}).click();
 await expect(page.getByText('0 local drafts')).toBeVisible();expect(graph.calls.filter(c=>c.command==='mail_send_new')).toHaveLength(2);await expect(dialog).not.toBeVisible();
});
test('chat reference is sent in the actual HTML body before the response',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:/Alex Example/}).first().click();await page.getByRole('button',{name:'Respond by email',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Email message'}).fill('My email response');await page.getByRole('button',{name:'Review & send'}).click();expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Send email',exact:true}).click();await expect(page.getByText('0 local drafts')).toBeVisible();
 const d=graph.calls.find(c=>c.command==='mail_send_new')!.args.draft;
 expect(d.contentType).toBe('HTML');expect(d.content).toContain('<h3>In reference to</h3>');expect(d.content).toContain('border-left:3px');expect(d.content).toContain('<br>');
 expect(d.content.indexOf('Quoted from TAUT chat')).toBeLessThan(d.content.indexOf('My email response'));
});

test('review keeps confirmation visible in a small viewport with a long draft',async({page,graph})=>{
 await page.setViewportSize({width:1000,height:600});await signIn(page);await openMail(page);
 await page.getByRole('button',{name:'New email',exact:true}).click();await fill(page);
 await page.getByRole('textbox',{name:'Email message'}).fill('Long message\n'.repeat(100));
 await page.getByRole('button',{name:'Review & send'}).click();
 const dialog=page.getByRole('dialog',{name:'Review email before sending'});
 await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Send email',exact:true})).toBeInViewport();await expect(dialog.getByRole('button',{name:'Keep editing'})).toBeFocused();
 expect(graph.writes).toEqual([]);await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 await expect(page.getByRole('textbox',{name:'Email message'})).toHaveValue('Long message\n'.repeat(100));
});

test('cached People autocomplete fills recipients with keyboard and pointer without Graph lookup',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();
 await expect(page.getByRole('button',{name:/Alex Example/}).first()).toBeVisible();
 await openMail(page);await page.getByRole('button',{name:'New email',exact:true}).click();
 const before=graph.calls.filter(c=>c.command==='graph_search_users'||c.command==='people_page').length;
 const to=page.getByRole('combobox',{name:'To',exact:true});await to.fill('Al');
 await expect(page.getByRole('listbox',{name:'To suggestions'})).toBeVisible();await to.press('ArrowDown');await to.press('Enter');await expect(to).toHaveValue('alex@example.com; ');
 await to.fill('alex@example.com; Bl');await page.getByRole('option',{name:/Blair Example/}).click();await expect(to).toHaveValue('alex@example.com; blair@example.com; ');
 const cc=page.getByRole('combobox',{name:'Cc',exact:true});await cc.fill('Ca');await expect(page.getByRole('listbox',{name:'Cc suggestions'})).toBeVisible();await cc.press('Escape');await expect(page.getByRole('listbox')).not.toBeVisible();await expect(cc).toHaveValue('Ca');
 expect(graph.calls.filter(c=>c.command==='graph_search_users'||c.command==='people_page')).toHaveLength(before);expect(graph.writes).toEqual([]);
});
