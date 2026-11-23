import {test,expect,signIn} from './fixtures';
async function preferences(page:any){await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Calendar',exact:true}).click();return page.getByRole('dialog',{name:'TAUT preferences'});}
test('Calendar reminders are opt-in independent of message alerts and persist',async({page,graph},info)=>{
 await signIn(page);let settings=await preferences(page);await expect(settings.getByLabel('Calendar reminders',{exact:true})).not.toBeChecked();expect(graph.calls.filter(c=>c.command==='calendar_reminder_configure')).toHaveLength(0);
 await settings.getByLabel('Calendar reminders',{exact:true}).check();await expect.poll(()=>graph.reminderSettings.enabled).toBe(true);expect(graph.notificationSettings.enabled).toBe(false);
 await page.reload();settings=await preferences(page);await expect(settings.getByLabel('Calendar reminders',{exact:true})).toBeChecked();await expect(settings).toContainText('Outlook’s reminder settings');await page.screenshot({path:info.outputPath('calendar-reminders.png')});await settings.getByLabel('Calendar reminders',{exact:true}).uncheck();expect(graph.writes).toEqual([]);
});
test('permission or storage failure preserves disabled state and explains recovery',async({page,graph})=>{
 graph.reminderError='Cannot save';await signIn(page);const settings=await preferences(page);await settings.getByLabel('Calendar reminders',{exact:true}).click();await expect(settings.getByRole('alert')).toContainText('could not be updated');await expect(settings.getByLabel('Calendar reminders',{exact:true})).not.toBeChecked();expect(graph.writes).toEqual([]);
});
test('reminder click opens current event with message alerts off and also while Calendar is already open',async({page,graph})=>{
 await signIn(page);graph.pendingReminderEvent=graph.calendarEvents[0].id;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.event-details')).toContainText('Project planning');expect(graph.notificationSettings.enabled).toBe(false);
 await page.getByRole('button',{name:'Close event details'}).click();graph.pendingReminderEvent=graph.calendarEvents[0].id;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.event-details')).toBeVisible();expect(graph.writes).toEqual([]);
});
test('removed event gives an actionable error without sending or switching accounts',async({page,graph})=>{
 await signIn(page);graph.calendarEventError='HTTP 404';graph.pendingReminderEvent='removed';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('alert')).toContainText('reminder’s event could not be opened');await page.getByRole('button',{name:'Dismiss',exact:true}).click();await expect(page.getByText('reminder’s event could not be opened',{exact:false})).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('live reminder status shows the check and request separately from visible delivery',async({page,graph})=>{
 graph.reminderSettings={enabled:true,error:null,last_check:1795435200000,last_request:1795435200000,summary:'1 reminders due in the last two minutes; 1 banner requests.'} as any;
 await signIn(page);const settings=await preferences(page);const status=settings.getByRole('status',{name:'Calendar reminder status'});await expect(status).toContainText('Last check:');await expect(status).toContainText('Last reminder prepared:');await expect(status).toContainText('does not confirm the card appeared');expect(graph.writes).toEqual([]);
});

test('reminder corner is saved without changing Outlook',async({page,graph})=>{
 graph.reminderSettings.enabled=true;await signIn(page);const settings=await preferences(page);await settings.getByLabel('Reminder position').selectOption('top-left');await expect.poll(()=>(graph.reminderSettings as any).corner).toBe('top-left');expect(graph.writes).toEqual([]);
});
