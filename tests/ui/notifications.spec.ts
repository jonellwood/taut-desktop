import {test,expect,signIn,row,alex,blair} from './fixtures';
const settings=(page:import('@playwright/test').Page)=>page.getByRole('dialog',{name:'TAUT preferences'});

test('notifications start disabled without prompting or sending anything',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Notifications',exact:true}).click();
 await expect(settings(page).getByLabel('Message notifications',{exact:true})).not.toBeChecked();
 await expect(settings(page).getByRole('button',{name:'Send test notification'})).toHaveCount(0);
 expect(graph.calls.filter(c=>['notification_configure','notification_test'].includes(c.command))).toEqual([]);expect(graph.writes).toEqual([]);
});

test('explicit enable persists across reload and names remain off until requested',async({page,graph},testInfo)=>{
 await signIn(page);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Notifications',exact:true}).click();
 await settings(page).getByLabel('Message notifications',{exact:true}).check();
 await expect(settings(page).getByLabel('Include conversation names',{exact:true})).not.toBeChecked();
 await settings(page).getByLabel('Include conversation names',{exact:true}).check();
 await expect.poll(()=>graph.notificationSettings.showNames).toBe(true);
 await page.screenshot({path:testInfo.outputPath('notification-preferences.png')});
 await page.reload();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Notifications',exact:true}).click();
 await expect(settings(page).getByLabel('Message notifications',{exact:true})).toBeChecked();
 await expect(settings(page).getByLabel('Include conversation names',{exact:true})).toBeChecked();
 expect(graph.calls.filter(c=>c.command==='notification_test')).toEqual([]);expect(graph.writes).toEqual([]);
});

test('test notification is explicit and reports a request rather than promising delivery',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Notifications',exact:true}).click();
 await settings(page).getByLabel('Message notifications',{exact:true}).check();
 await settings(page).getByRole('button',{name:'Send test notification',exact:true}).click();
 await expect(settings(page).getByRole('status')).toContainText('Test notification requested');
 await expect(settings(page).getByRole('status')).toContainText('#1');
 await settings(page).getByRole('button',{name:'Send test notification',exact:true}).click();
 await expect(settings(page).getByRole('status')).toContainText('#2');
 await expect(settings(page)).toContainText('Terminal');expect(graph.notificationTests).toBe(2);expect(graph.writes).toEqual([]);
});

test('settings failure keeps notifications off and displays the actual error',async({page,graph})=>{
 graph.notificationConfigError='Notification preferences cannot be saved';
 await signIn(page);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Notifications',exact:true}).click();
 await settings(page).getByLabel('Message notifications',{exact:true}).click();
 await expect(settings(page).getByRole('alert')).toContainText('cannot be saved');
 await expect(settings(page).getByLabel('Message notifications',{exact:true})).not.toBeChecked();
 expect(graph.notificationSettings.enabled).toBe(false);expect(graph.notificationTests).toBe(0);expect(graph.writes).toEqual([]);
});

test('test dispatch failure stays actionable without changing authentication',async({page,graph})=>{
 graph.notificationSettings.enabled=true;graph.notificationTestError='Test notification could not be requested';
 await signIn(page);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Notifications',exact:true}).click();
 await settings(page).getByRole('button',{name:'Send test notification',exact:true}).click();
 await expect(settings(page).getByRole('alert')).toContainText('could not be requested');
 await expect(page.getByRole('button',{name:'Sign out',exact:true}).first()).toBeVisible();expect(graph.writes).toEqual([]);
});

test('view context distinguishes reading a chat from overlays and no selection',async({page,graph})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 expect(graph.calls.filter(c=>c.command==='notification_view').at(-1)?.args.chatId).toBeNull();
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeEnabled();
 expect(graph.calls.filter(c=>c.command==='notification_view').at(-1)?.args.chatId).toBeNull();
 await row(page,alex.displayName).click();await expect(page.locator('.messages')).toContainText('Hello from Alex');
 await expect.poll(()=>graph.calls.filter(c=>c.command==='notification_view').at(-1)?.args.atLatest).toBe(true);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Notifications',exact:true}).click();
 await expect.poll(()=>graph.calls.filter(c=>c.command==='notification_view').at(-1)?.args.atLatest).toBe(false);expect(graph.writes).toEqual([]);
});

test('notification click opens its conversation while preserving the previous draft',async({page,graph})=>{
 graph.notificationSettings.enabled=true;await signIn(page);
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep Alex draft');
 graph.pendingNotificationChat='chat-blair';
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('.conversation-header')).toContainText(blair.displayName);
 await row(page,alex.displayName).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep Alex draft');
 expect(graph.pendingNotificationChat).toBeNull();expect(graph.writes).toEqual([]);
});

test('live presence is unavailable and never presented as green Offline',async({page,graph})=>{
 await signIn(page);
 await expect(page.locator('.header-person small')).toHaveText('Presence unavailable');
 await expect(page.locator('.header-person small')).toHaveClass(/presence-muted/);
 await expect(page.locator('.profile .status')).toHaveText('Presence unavailable');
 await expect(page.locator('.profile .live-dot')).toHaveClass(/presence-muted/);
});
