import {test,expect,signIn,me,blair} from './fixtures';
const badge=(page:import('@playwright/test').Page)=>page.locator('.mail-unread');
async function mail(page:import('@playwright/test').Page){await page.getByRole('button',{name:'Mail',exact:true}).click();await expect(page.locator('.mail-row').first()).toBeVisible();}
const checks=(graph:import('./fixtures').MockGraph)=>graph.calls.filter(c=>c.command==='mail_unread').length;

test('badge uses the full Inbox count in Chats, caps display and never fetches messages',async({page,graph},info)=>{
 graph.mailUnreadCount=1234;await signIn(page);await expect(badge(page)).toHaveText('99+');await expect(badge(page)).toHaveAttribute('aria-label',/^1234 unread Inbox items/);
 expect(graph.calls.some(c=>c.command==='mail_page'||c.command==='mail_attachment')).toBe(false);
 graph.mailUnreadCount=4;await page.clock.runFor(61000);await expect(badge(page)).toHaveText('4');await expect(badge(page)).toHaveAttribute('title',/other folders and subfolders are excluded/);
 await page.screenshot({path:info.outputPath('mail-inbox-badge.png')});expect(graph.writes).toEqual([]);
});

test('missing consent never requests Inbox counts or message pages',async({page,graph})=>{
 graph.mailPermitted=false;await signIn(page);await page.clock.runFor(180000);expect(checks(graph)).toBe(0);await expect(badge(page)).toHaveCount(0);expect(graph.calls.some(c=>c.command==='mail_page')).toBe(false);expect(graph.writes).toEqual([]);
});

test('read unread and move actions refresh the authoritative count without guessing',async({page,graph})=>{
 await signIn(page);await expect(badge(page)).toHaveText('1');await mail(page);await page.locator('.mail-row').first().click();
 await page.getByRole('button',{name:'Mark read',exact:true}).click();await expect(badge(page)).toHaveCount(0);await expect(page.locator('.inbox-count')).toHaveText('Inbox unread: 0');
 await page.getByRole('button',{name:'Mark unread',exact:true}).click();await expect(badge(page)).toHaveText('1');
 await page.getByRole('button',{name:'Move to Deleted Items',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Move to Deleted Items',exact:true}).click();await expect(badge(page)).toHaveCount(0);
 expect(graph.writes.map(c=>c.command)).toEqual(['mail_set_read','mail_set_read','mail_move_deleted']);
});

test('count failures retain a marked last count, back off and recover on explicit refresh',async({page,graph})=>{
 graph.mailUnreadCount=8;await signIn(page);await expect(badge(page)).toHaveText('8');graph.mailUnreadError='HTTP 429';await page.clock.runFor(61000);
 await expect(badge(page)).toHaveClass(/stale/);await expect(badge(page)).toHaveText('8');await expect(badge(page)).toHaveAttribute('aria-label',/last checked/);
 const n=checks(graph);await page.clock.runFor(59000);expect(checks(graph)).toBe(n);
 graph.mailUnreadError='';graph.mailUnreadCount=3;await mail(page);await page.getByRole('button',{name:'Refresh mail',exact:true}).click();await expect(badge(page)).toHaveText('3');await expect(badge(page)).not.toHaveClass(/stale/);expect(graph.writes).toEqual([]);
});

test('hidden and offline sessions pause count reads then refresh on return',async({page,graph})=>{
 await signIn(page);await expect(badge(page)).toHaveText('1');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 const n=checks(graph);await page.clock.runFor(180000);expect(checks(graph)).toBe(n);
 graph.mailUnreadCount=2;await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await expect(badge(page)).toHaveText('2');
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));});
 const offline=checks(graph);await page.clock.runFor(180000);expect(checks(graph)).toBe(offline);
 graph.mailUnreadCount=5;await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));});await expect(badge(page)).toHaveText('5');expect(graph.writes).toEqual([]);
});

test('late counts cannot leak across sign-out or account changes',async({page,graph})=>{
 let release!:()=>void;graph.mailUnreadGate=new Promise<void>(resolve=>release=resolve);graph.mailUnreadCount=7;
 await signIn(page);await expect.poll(()=>checks(graph)).toBe(1);await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(badge(page)).toHaveCount(0);
 graph.profileId=blair.id;graph.mailUnreadGate=undefined;graph.mailUnreadCount=2;await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(badge(page)).toHaveText('2');release();await page.clock.runFor(1000);await expect(badge(page)).toHaveText('2');
 expect(graph.calls.filter(c=>c.command==='mail_unread').map(c=>c.args.ownId)).toEqual([me.id,blair.id]);expect(graph.writes).toEqual([]);
});

test('a mutation invalidates an in-flight count and queues only a fresh read',async({page,graph})=>{
 let release!:()=>void;graph.mailUnreadGate=new Promise<void>(resolve=>release=resolve);await signIn(page);await mail(page);await page.locator('.mail-row').first().click();await page.getByRole('button',{name:'Mark read',exact:true}).click();
 graph.mailUnreadGate=undefined;release();await expect(page.locator('.inbox-count')).toHaveText('Inbox unread: 0');await expect(badge(page)).toHaveCount(0);expect(checks(graph)).toBe(2);expect(graph.writes.map(c=>c.command)).toEqual(['mail_set_read']);
});

test('quiet refresh preserves selected body, scroll anchors and loaded pages while importing Outlook read state',async({page,graph})=>{
 graph.mailMessages[0].body.content='Long message\n'.repeat(200);for(let i=1;i<20;i++)graph.mailMessages.push({...graph.mailMessages[0],id:'older-'+i,conversationId:'older-thread-'+i,subject:'Older '+i,isRead:true,receivedDateTime:`2026-11-${String(5-Math.min(i,4)).padStart(2,'0')}T14:00:00Z`});
 await signIn(page);await mail(page);await page.locator('.mail-row').filter({has:page.getByText('Project document',{exact:true})}).click();await expect(page.locator('.mail-body')).toContainText('Long message');
 await page.locator('.mail-thread').evaluate(el=>el.scrollTop=160);await page.locator('.mail-rows').evaluate(el=>el.scrollTop=220);
 const scroll=await page.locator('.mail-thread').evaluate(el=>el.scrollTop),listScroll=await page.locator('.mail-rows').evaluate(el=>el.scrollTop),bodyCalls=graph.calls.filter(c=>c.command==='mail_page'&&c.args.query.collection==='message').length;
 graph.mailMessages[0].isRead=true;graph.mailMessages.unshift({...graph.mailMessages[0],id:'new-mail',conversationId:'new-thread',subject:'New arrival',isRead:false,receivedDateTime:'2026-11-06T14:00:00Z'});
 await page.clock.runFor(61000);await expect(page.getByRole('button',{name:'Mark unread',exact:true})).toBeVisible();await expect(page.locator('.mail-row').filter({has:page.getByText('New arrival',{exact:true})})).toHaveCount(1);
 expect(await page.locator('.mail-thread').evaluate(el=>el.scrollTop)).toBeCloseTo(scroll,0);
 // Newly inserted rows above the viewport must keep the same visible row anchored.
 expect(await page.locator('.mail-rows').evaluate(el=>el.scrollTop)).toBeGreaterThan(listScroll);
 await expect(page.locator('.mail-reader-header h2')).toHaveText('Project document');expect(graph.calls.filter(c=>c.command==='mail_page'&&c.args.query.collection==='message')).toHaveLength(bodyCalls);expect(graph.writes).toEqual([]);
});

test('quiet checks preserve composition and searches and do not reset the paging cursor',async({page,graph})=>{
 graph.mailPages.first={value:[graph.mailMessages[0]],next:'page-2'};graph.mailPages['page-2']={value:[{...graph.mailMessages[0],id:'older',conversationId:'older-thread',subject:'Old page'}],next:'page-3'};
 await signIn(page);await mail(page);await page.getByRole('button',{name:'Load more mail',exact:true}).click();await page.clock.runFor(61000);await page.getByRole('button',{name:'Load more mail',exact:true}).click();expect(graph.calls.filter(c=>c.command==='mail_page').at(-1)?.args.query.next).toBe('page-3');
 await page.getByRole('button',{name:'New email',exact:true}).click();await page.getByRole('combobox',{name:'To',exact:true}).fill('alex@example.test');await page.getByRole('textbox',{name:'Email subject'}).fill('Unsent draft');await page.getByRole('textbox',{name:'Email message'}).fill('Keep every word');
 const reads=graph.calls.filter(c=>c.command==='mail_page').length;graph.mailUnreadCount=9;await page.clock.runFor(61000);await expect(badge(page)).toHaveText('9');await expect(page.getByRole('textbox',{name:'Email message'})).toHaveValue('Keep every word');expect(graph.calls.filter(c=>c.command==='mail_page')).toHaveLength(reads);expect(graph.writes).toEqual([]);
});

test('Outlook mark-unread remains unread during quiet sync even when timed marking is enabled',async({page,graph})=>{
 graph.mailMessages[0].isRead=true;await page.addInitScript(()=>{localStorage.setItem('taut.mail.read-delay.v1','3');Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});});
 await signIn(page);await mail(page);await page.locator('.mail-row').first().click();await expect(page.getByRole('button',{name:'Mark unread',exact:true})).toBeVisible();
 graph.mailMessages[0].isRead=false;await page.clock.runFor(61000);await expect(page.getByRole('button',{name:'Mark read',exact:true})).toBeVisible();await expect(badge(page)).toHaveText('1');await page.clock.runFor(6000);expect(graph.writes).toEqual([]);
});

test('quiet refresh keeps search scope and marks failed refreshes without clearing messages',async({page,graph})=>{
 await signIn(page);await mail(page);await page.getByRole('textbox',{name:'Search mailbox'}).fill('project');await page.getByRole('button',{name:'Search mail',exact:true}).click();await page.locator('.mail-row').first().click();await expect(page.locator('.mail-body')).toBeVisible();
 await page.clock.runFor(61000);await expect(page.getByRole('textbox',{name:'Search mailbox'})).toHaveValue('project');expect(graph.calls.filter(c=>c.command==='mail_page'&&c.args.query.collection==='messages').at(-1)?.args.query.search).toBe('project');
 graph.mailError='Service unavailable';await page.clock.runFor(61000);await expect(page.locator('.mail-sync-notice')).toContainText('previously loaded messages');await expect(page.locator('.mail-body')).toBeVisible();await expect(page.locator('.mail-row')).toHaveCount(1);expect(graph.writes).toEqual([]);
});

test('a late quiet search response cannot replace a different folder',async({page,graph})=>{
 await signIn(page);await mail(page);await expect(badge(page)).toHaveText('1');
 let release!:()=>void;graph.mailGate=new Promise<void>(resolve=>release=resolve);const before=graph.calls.filter(c=>c.command==='mail_page').length;
 await page.clock.runFor(61000);await expect.poll(()=>graph.calls.filter(c=>c.command==='mail_page').length).toBeGreaterThan(before);
 await page.getByRole('button',{name:'Sent',exact:true}).click();graph.mailGate=undefined;release();await expect(page.locator('.mail-list-heading')).toContainText('SENT MAIL');await expect(page.getByRole('button',{name:'Sent',exact:true})).toHaveClass(/chosen/);expect(graph.writes).toEqual([]);
});
