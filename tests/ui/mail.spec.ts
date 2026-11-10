import {test,expect,signIn,row,alex} from './fixtures';
const openMail=async(page:import('@playwright/test').Page)=>{await page.getByRole('button',{name:'Mail',exact:true}).click();await expect(page.getByRole('heading',{name:'One conversation at a time.'})).toBeVisible();};
const mailRow=(page:import('@playwright/test').Page)=>page.locator('.mail-row').first();
test('mail stays opt-in and reading a conversation preserves chat draft and mailbox unread state',async({page,graph},info)=>{
 await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep my chat draft');
 expect(graph.calls.some(c=>c.command.startsWith('mail_'))).toBe(false);
 await openMail(page);expect(graph.calls.filter(c=>c.command==='mail_attachment')).toHaveLength(0);
 await mailRow(page).click();await expect(page.locator('.mail-body')).toContainText('Let me know what you think.');
 await expect(page.getByLabel('Unread email')).toBeVisible();expect(graph.mailMessages[0].isRead).toBe(false);
 expect(graph.calls.filter(c=>c.command==='mail_save_attachment')).toHaveLength(0);
 await page.screenshot({path:info.outputPath('mail-reading.png')});
 await page.getByRole('button',{name:'Chats',exact:true}).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep my chat draft');expect(graph.writes).toEqual([]);
});
test('mail search covers mailbox, paginates and recovers without mailbox writes',async({page,graph})=>{
 await signIn(page);graph.mailPages.first={value:graph.mailMessages,next:'page-2'};graph.mailPages['page-2']={value:[{...graph.mailMessages[0],id:'mail-2',conversationId:'conversation-2',subject:'Second document'}],next:null};
 await openMail(page);await page.getByRole('button',{name:'Load more mail',exact:true}).click();await expect(page.locator('.mail-row')).toHaveCount(2);
 delete graph.mailPages.first;await page.getByRole('textbox',{name:'Search mailbox'}).fill('no match');await page.getByRole('button',{name:'Search mail',exact:true}).click();await expect(page.getByText('No matching email.',{exact:true})).toBeVisible();
 expect(graph.calls.filter(c=>c.command==='mail_page').at(-1)?.args.query.search).toBe('no match');
 await page.getByRole('textbox',{name:'Search mailbox'}).fill('project');await page.getByRole('button',{name:'Search mail',exact:true}).click();await expect(page.locator('.mail-row')).toHaveCount(1);
 graph.mailError='Mail is being throttled. Wait a little, then refresh.';await page.getByRole('button',{name:'Refresh mail',exact:true}).click();await expect(page.getByRole('alert')).toContainText('throttled');await expect(page.locator('.mail-row')).toHaveCount(1);
 graph.mailError='';await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByRole('alert')).toHaveCount(0);expect(graph.writes).toEqual([]);
});
test('mail missing consent does not read messages or interfere with chat',async({page,graph})=>{
 graph.mailPermitted=false;await signIn(page);await page.getByRole('button',{name:'Mail',exact:true}).click();await expect(page.getByRole('heading',{name:'Connect your mailbox'})).toBeVisible();
 expect(graph.calls.filter(c=>c.command==='mail_page')).toHaveLength(0);await page.getByRole('button',{name:'Chats',exact:true}).click();await expect(page.locator('.messages')).toContainText('Hello from Alex');expect(graph.writes).toEqual([]);
});
test('mail HTML fallback is inert and remote images do not load',async({page,graph})=>{
 graph.mailMessages[0].body={contentType:'html',content:'<p>Readable message</p><img src="https://tracker.example/pixel" onerror="window.badMail=true"><script>window.badMail=true</script><a href="javascript:alert(1)">No active link</a>'};
 await signIn(page);await openMail(page);await mailRow(page).click();await expect(page.frameLocator('iframe[title="Formatted email"]').locator('body')).toContainText('Readable message');await page.getByRole('button',{name:'Plain text',exact:true}).click();await expect(page.locator('.mail-body')).toContainText('Readable message');await expect(page.locator('.mail-body img,.mail-body script,.mail-body a')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).badMail)).toBeUndefined();expect(graph.writes).toEqual([]);
});
test('mail attachment metadata loads on expansion and preview/save stay explicit',async({page,graph},info)=>{
 await signIn(page);await openMail(page);await mailRow(page).click();await expect(page.locator('.mail-body')).toBeVisible();
 await expect(page.locator('.mail-thread').getByText('project.txt',{exact:true})).toBeVisible();expect(graph.calls.filter(c=>c.command==='mail_attachment')).toHaveLength(0);
 await page.locator('.mail-thread').getByRole('button',{name:'Preview',exact:true}).click();await expect(page.getByRole('dialog',{name:'Mail attachment preview'})).toContainText('hello');await page.screenshot({path:info.outputPath('mail-attachment.png')});
 await page.getByRole('button',{name:'Close attachment preview'}).click();await page.getByRole('button',{name:'Save project.txt'}).click();await expect(page.locator('.mail-thread').getByRole('status')).toContainText('Attachment saved.');expect(graph.calls.filter(c=>c.command==='mail_save_attachment')).toHaveLength(1);expect(graph.writes).toEqual([]);
});
test('mail conversation expands individual messages and rejects stale responses after leaving',async({page,graph})=>{
 graph.mailMessages.push({...graph.mailMessages[0],id:'mail-2',receivedDateTime:'2026-11-05T15:00:00Z',body:{contentType:'text',content:'A second reply'}});
 await signIn(page);await openMail(page);await mailRow(page).click();await expect(page.locator('.mail-message')).toHaveCount(2);await expect(page.locator('.mail-body')).toHaveCount(1);
 await page.getByRole('button',{name:/Read message/}).click();await expect(page.locator('.mail-body')).toHaveCount(2);await expect(page.locator('.mail-thread')).toContainText('A second reply');
 let release!:()=>void;graph.mailGate=new Promise<void>(r=>release=r);await page.getByRole('button',{name:'Refresh mail'}).click();await page.getByRole('button',{name:'Chats',exact:true}).click();release();await expect(page.locator('.messages')).toContainText('Hello from Alex');expect(graph.writes).toEqual([]);
});
for(const theme of ['light','dark'])test(`mail ${theme} layout and collapsed sidebar`,async({page,graph},info)=>{
 await page.addInitScript(theme=>localStorage.setItem('taut.appearance.v1',JSON.stringify({mode:theme,accent:'amber',contrast:'standard'})),theme);
 await signIn(page);await openMail(page);await mailRow(page).click();await expect(page.locator('.mail-body')).toBeVisible();await page.getByRole('button',{name:'Collapse mail sidebar'}).click();await expect(page.getByRole('complementary',{name:'Mail navigation'})).toHaveCount(0);
 await page.getByRole('button',{name:'Show mail sidebar'}).click();await expect(page.getByRole('complementary',{name:'Mail navigation'})).toBeVisible();await page.screenshot({path:info.outputPath(`mail-${theme}.png`)});expect(graph.writes).toEqual([]);
});

test('mail groups loaded conversation messages across pages and opens the latest',async({page,graph})=>{
 const latest={...graph.mailMessages[0],id:'latest',receivedDateTime:'2026-11-05T18:00:00Z',bodyPreview:'Latest reply',isRead:true};
 graph.mailPages.first={value:[latest],next:'older'};
 graph.mailPages.older={value:[{...latest,id:'earlier',receivedDateTime:'2026-11-04T18:00:00Z',isRead:false}, {...latest,id:'unrelated',conversationId:'different',subject:latest.subject}],next:null};
 await signIn(page);await openMail(page);await page.getByRole('button',{name:'Load more mail',exact:true}).click();
 await expect(page.locator('.mail-row')).toHaveCount(2);
 await expect(mailRow(page)).toContainText('2 loaded');await expect(mailRow(page).getByLabel('Unread email')).toBeVisible();
 graph.mailMessages=[latest];await mailRow(page).click();
 expect(graph.calls.some(c=>c.command==='mail_page'&&c.args.query.collection==='message'&&c.args.query.messageId==='latest')).toBe(true);
 expect(graph.writes).toEqual([]);
});

test('HTML mail preserves formatting inside a locked frame and reviews links before opening',async({page,graph},info)=>{
 graph.mailMessages[0].body={contentType:'html',content:`<html><head><base href="https://evil.test"><meta http-equiv="refresh" content="0;url=https://evil.test"><style>body{background:url(https://evil.test/css)}</style></head><body onload="parent.badMail=true"><h2 style="color:#ff6644;background-color:#222222;border-color:#aa8844">Project update</h2><font color="#1166bb">Legacy color</font><p style="color:var(--host-secret);background-image:url(https://evil.test/color)">No resource styles</p><p>Hello <b>team</b>.</p><table><tr><th>Item</th><th>Status</th></tr><tr><td>Release</td><td style="text-align:center;background:url(https://evil.test/pixel)">Ready</td></tr></table><ul><li>Review</li></ul><blockquote>Previous note</blockquote><pre>const safe = 1;</pre><img src="https://evil.test/pixel" srcset="https://evil.test/a 2x" alt="Company logo"><img src="cid:inline"><svg onload="parent.badMail=true"></svg><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input></form><script>parent.badMail=true</script><a href="https://example.test/document">Read document</a><a href="javascript:alert(1)">Unsafe</a></body></html>`};
 const remote:string[]=[];page.on('request',request=>{if(request.url().includes('evil.test'))remote.push(request.url());});
 await signIn(page);await openMail(page);await mailRow(page).click();const frame=page.frameLocator('iframe[title="Formatted email"]');
 await expect(frame.getByRole('heading',{name:'Project update'})).toBeVisible();await expect(frame.getByRole('cell',{name:'Ready'})).toBeVisible();await expect(frame.locator('b')).toHaveText('team');
 await expect(frame.getByRole('heading',{name:'Project update'})).toHaveCSS('color','rgb(255, 102, 68)');
 await expect(frame.getByRole('heading',{name:'Project update'})).toHaveCSS('background-color','rgb(34, 34, 34)');
 await expect(frame.locator('font')).toHaveCSS('color','rgb(17, 102, 187)');
 await expect(frame.getByText('No resource styles',{exact:true})).not.toHaveAttribute('style',/url|var/);
 const html=page.getByRole('button',{name:'HTML',exact:true}),plain=page.getByRole('button',{name:'Plain text',exact:true});
 await expect(html).toHaveAttribute('aria-pressed','true');await expect(plain).toHaveAttribute('aria-pressed','false');
 expect(await html.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(await plain.evaluate(el=>getComputedStyle(el).backgroundColor));
 await expect(frame.locator('script,img,iframe,form,input,base,a[href],svg')).toHaveCount(0);
 await expect(page.locator('iframe[title="Formatted email"]')).toHaveAttribute('sandbox','');
 expect(await page.evaluate(()=>(window as any).badMail)).toBeUndefined();expect(remote).toEqual([]);
 expect(graph.calls.filter(c=>c.command==='plugin:opener|open_url')).toHaveLength(0);
 await page.getByText('Email links (1)',{exact:true}).click();await page.getByRole('button',{name:'[1] https://example.test/document',exact:true}).click();await expect(page.getByRole('group',{name:'Review email link'})).toContainText('https://example.test/document');
 expect(graph.calls.filter(c=>c.command==='plugin:opener|open_url')).toHaveLength(0);await page.getByRole('button',{name:'Open link',exact:true}).click();expect(graph.calls.filter(c=>c.command==='plugin:opener|open_url')).toHaveLength(1);
 await page.screenshot({path:info.outputPath('html-mail.png')});await page.getByRole('button',{name:'Plain text',exact:true}).click();await expect(page.locator('.mail-body')).toContainText('Project update');await expect(page.locator('iframe[title="Formatted email"]')).toHaveCount(0);
 await page.getByRole('button',{name:'HTML',exact:true}).click();await expect(frame.getByRole('table')).toBeVisible();expect(graph.writes).toEqual([]);expect(graph.calls.filter(c=>c.command==='mail_attachment')).toHaveLength(0);
});
for(const theme of ['light','dark'])test(`formatted email follows ${theme} theme and bounds pathological content`,async({page,graph})=>{
 await page.addInitScript(theme=>{if(window===window.top)localStorage.setItem('taut.appearance.v1',JSON.stringify({mode:theme,accent:'amber',contrast:'increased'}));},theme);
 graph.mailMessages[0].body={contentType:'html',content:'<h2>Theme preview</h2><table><tr><td>Readable</td></tr></table>'+'<div>'.repeat(50)+'Nested'+'</div>'.repeat(50)};
 await signIn(page);await openMail(page);await mailRow(page).click();const frame=page.frameLocator('iframe[title="Formatted email"]');await expect(frame.getByRole('heading',{name:'Theme preview'})).toBeVisible();await expect(page.getByText('Long or deeply nested content was shortened. Open in Outlook for the original.')).toBeVisible();
 const bg=await frame.locator('html').evaluate(node=>getComputedStyle(node).backgroundColor);expect(bg).not.toBe('rgba(0, 0, 0, 0)');expect(graph.writes).toEqual([]);
});

test('Mail reading default persists and each message can override it',async({page,graph})=>{
 graph.mailMessages[0].body={contentType:'html',content:'<h2>Reading choice</h2>'};
 await signIn(page);await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Mail',exact:true}).click();
 await page.getByRole('group',{name:'Default email presentation'}).getByRole('radio',{name:'Plain text',exact:true}).check();
 await page.getByRole('button',{name:'Done',exact:true}).click();await openMail(page);await mailRow(page).click();
 await expect(page.locator('.mail-body')).toContainText('Reading choice');await expect(page.getByRole('button',{name:'Plain text',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'HTML',exact:true}).click();await expect(page.frameLocator('iframe').getByRole('heading',{name:'Reading choice'})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('taut.mail.presentation.v1'))).toBe('plain');expect(graph.writes).toEqual([]);
});

test('mail direction, empty attachment controls and inherited HTML contrast',async({page,graph})=>{
 await page.addInitScript(()=>{if(window===window.top)localStorage.setItem('taut.appearance.v1',JSON.stringify({mode:'dark',accent:'amber',contrast:'standard'}));});
 graph.mailFiles=[];
 graph.mailMessages[0].body={contentType:'html',content:'<div style="color:black"><p>Dark surface ink</p><div style="background:white"><p>White surface ink</p></div></div>'};
 graph.mailMessages.push({...graph.mailMessages[0],id:'sent-mail',from:{emailAddress:{name:'Test User',address:'me@example.test'}}});
 await signIn(page);await openMail(page);await mailRow(page).click();
 await expect(page.locator('.mail-direction').getByText('Received',{exact:true})).toBeVisible();
 await expect(page.locator('.mail-direction').getByText('Sent',{exact:true})).toBeVisible();
 await expect(page.locator('.mail-attachment-toggle')).toHaveCount(0);
 const frame=page.frameLocator('iframe[title="Formatted email"]');
 await expect(frame.getByText('Dark surface ink',{exact:true})).toHaveCSS('color','rgb(255, 255, 255)');
 await expect(frame.getByText('White surface ink',{exact:true})).toHaveCSS('color','rgb(0, 0, 0)');
 await frame.locator('style').evaluate(el=>{el.textContent=el.textContent!.replace(/@supports[\s\S]*$/,'');});
 await expect(frame.getByText('Dark surface ink',{exact:true})).toHaveCSS('color','rgb(255, 255, 255)');
 expect(graph.calls.filter(c=>c.command==='mail_attachment')).toHaveLength(0);expect(graph.writes).toEqual([]);
});

test('inline-only mail files remain discoverable without downloading contents',async({page,graph})=>{
 graph.mailMessages[0].hasAttachments=false;graph.mailFiles=[{...graph.mailFiles[0],name:'signature.png',isInline:true}];
 await signIn(page);await openMail(page);await mailRow(page).click();
 await expect(page.getByText('signature.png',{exact:true})).toBeVisible();
 await expect(page.getByText(/Inline attachment/)).toBeVisible();
 expect(graph.calls.filter(c=>c.command==='mail_attachment')).toHaveLength(0);expect(graph.writes).toEqual([]);
});

test('empty HTML meeting responses use a compact fallback instead of a blank frame',async({page,graph})=>{
 graph.mailMessages[0].body={contentType:'html',content:'<html><body><div> &nbsp;<br> </div></body></html>'};
 await signIn(page);await openMail(page);await mailRow(page).click();await expect(page.getByText('This email has no readable message body. Open in Outlook for meeting or other message details.')).toBeVisible();await expect(page.locator('iframe[title="Formatted email"]')).toHaveCount(0);await expect(page.getByRole('button',{name:'HTML',exact:true})).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('tiny attachment previews retain their intrinsic size',async({page,graph})=>{
 graph.mailFiles=[{id:'tiny',name:'signature.png',contentType:'image/png',size:68,'@odata.type':'#microsoft.graph.fileAttachment'}];
 graph.mailFile={contentType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
 await signIn(page);await openMail(page);await mailRow(page).click();await page.locator('.mail-thread').getByRole('button',{name:'Preview',exact:true}).click();
 const img=page.getByRole('dialog',{name:'Mail attachment preview'}).locator('img');await expect(img).toBeVisible();
 await expect.poll(()=>img.evaluate((node:HTMLImageElement)=>node.complete&&node.naturalWidth)).toBe(1);
 expect((await img.boundingBox())?.width).toBe(1);expect((await img.boundingBox())?.height).toBe(1);expect(graph.writes).toEqual([]);
});

test('unsupported documents offer Save without a misleading Preview in either view',async({page,graph})=>{
 graph.mailFiles=[{id:'pdf',name:'menu.pdf',contentType:'application/pdf',size:147000}];
 await signIn(page);await openMail(page);await mailRow(page).click();
 await expect(page.locator('.mail-thread').getByRole('button',{name:'Save menu.pdf'})).toBeVisible();
 await expect(page.locator('.mail-thread').getByRole('button',{name:'Preview',exact:true})).toHaveCount(0);
 await expect(page.getByRole('complementary',{name:'Mail conversation details'}).getByText('menu.pdf',{exact:true})).toBeVisible();
 await expect(page.getByRole('complementary',{name:'Mail conversation details'}).getByRole('button',{name:'Preview',exact:true})).toHaveCount(0);
 expect(graph.calls.filter(c=>c.command==='mail_attachment')).toHaveLength(0);expect(graph.writes).toEqual([]);
});

test('explicit read and unread changes reconcile the message and sidebar',async({page,graph})=>{
 await signIn(page);await openMail(page);await mailRow(page).click();
 await page.getByRole('button',{name:'Mark read',exact:true}).click();
 await expect(page.getByLabel('Unread email')).toHaveCount(0);
 await page.getByRole('button',{name:'Mark unread',exact:true}).click();
 await expect(page.getByLabel('Unread email')).toBeVisible();
 expect(graph.calls.filter(c=>c.command==='mail_set_read').map(c=>c.args.isRead)).toEqual([true,false]);
});

test('inline image approval persists for that attachment and can be revoked',async({page,graph})=>{
 graph.mailMessages[0].body={contentType:'html',content:'<p>Inline picture</p><a href="https://example.test/signature"><img src="cid:logo" alt="Signature logo" width="120" height="120" style="width:1.25in;height:1.25in"></a><a href="https://example.test/remote"><img src="https://example.test/tracker.png" alt="Remote logo"></a>'};
 graph.mailFiles=[{id:'logo',name:'logo.png',contentType:'image/png',contentId:'logo',isInline:true,size:68}];
 graph.mailFile={contentType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
 await signIn(page);await openMail(page);await mailRow(page).click();
 const frame=page.frameLocator('iframe[title="Formatted email"]');await expect(frame.locator('img')).toHaveCount(0);
 expect(graph.calls.filter(c=>c.command==='mail_attachment')).toHaveLength(0);
 await page.locator('.mail-thread').getByRole('button',{name:'Preview',exact:true}).click();
 await expect(frame.locator('img')).toHaveCount(1);await expect(page.getByRole('dialog',{name:'Mail attachment preview'})).toHaveCount(0);
 await expect(frame.locator('img')).toHaveAttribute('src',`data:image/png;base64,${graph.mailFile.base64}`);
 await expect(frame.locator('img')).toHaveJSProperty('naturalWidth',1);
 await expect(frame.locator('img')).toHaveCSS('width','120px');
 await expect(frame.locator('img')).toHaveCSS('height','120px');
 await expect(frame.locator('.mail-link').first()).toHaveText('');
 await page.getByText('Email links (2)',{exact:true}).click();
 await expect(page.getByRole('button',{name:'[1] https://example.test/signature',exact:true})).toBeVisible();
 await expect(frame.locator('a')).toHaveCount(0);
 await expect(frame.getByText('[Image blocked: Remote logo]',{exact:true})).toBeVisible();
 await mailRow(page).click();await expect(frame.locator('img')).toHaveCount(1);
 await page.getByRole('button',{name:'Block again',exact:true}).click();await expect(frame.locator('img')).toHaveCount(0);
 expect(graph.writes).toEqual([]);
});

test('optional viewing delay marks only the open message and manual unread holds',async({page,graph})=>{
 await page.addInitScript(()=>{localStorage.setItem('taut.mail.read-delay.v1','3');Object.defineProperty(document,'hasFocus',{value:()=>true});});
 await signIn(page);await openMail(page);await page.clock.runFor(3300);
 expect(graph.calls.filter(c=>c.command==='mail_set_read')).toHaveLength(0);
 await mailRow(page).click();await page.locator('.mail-read-marker').scrollIntoViewIfNeeded();await page.clock.runFor(3600);await expect(page.getByRole('button',{name:'Mark unread',exact:true})).toBeVisible({timeout:8000});
 await page.getByRole('button',{name:'Mark unread',exact:true}).click();await page.clock.runFor(3500);
 expect(graph.calls.filter(c=>c.command==='mail_set_read').map(c=>c.args.isRead)).toEqual([true,false]);
});


test('high importance uses Graph metadata in the latest message row and individual headers',async({page,graph})=>{
 graph.mailMessages[0].importance='high';
 graph.mailMessages.push({...graph.mailMessages[0],id:'normal',conversationId:'normal-thread',subject:'URGENT! high importance',importance:'normal'});
 graph.mailMessages.push({...graph.mailMessages[0],id:'missing',conversationId:'missing-thread',subject:'Missing importance',importance:undefined});
 await signIn(page);await openMail(page);
 await expect(page.locator('.mail-row').getByRole('img',{name:'High importance',exact:true})).toHaveCount(1);
 await page.locator('.mail-row').filter({has:page.getByText('Project document',{exact:true})}).click();
 await expect(page.locator('.mail-message-heading').getByText('High importance',{exact:true})).toHaveCount(1);
 await page.locator('.mail-row').filter({hasText:'URGENT!'}).click();
 await expect(page.locator('.mail-message-heading').getByText('High importance',{exact:true})).toHaveCount(0);
 expect(graph.writes).toEqual([]);
});
