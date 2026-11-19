import {test,expect} from './fixtures';
test('calendar opens event details with recorded response and no writes',async({page,graph},info)=>{
 graph.restoredSession=true;await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();
 await page.getByRole('button').filter({hasText:'Project planning'}).click();
 await expect(page.locator('.event-details')).toContainText('Accepted');
 await expect(page.locator('.event-details')).toContainText('Review the plan.');
 await page.screenshot({path:info.outputPath('calendar.png')});
 await page.getByRole('button',{name:'Close event details'}).click();
 await page.getByRole('button').filter({hasText:'Project planning'}).click();await expect(page.locator('.event-details')).toBeVisible();
 expect(graph.writes).toEqual([]);
});
test('missing calendar consent never fetches events',async({page,graph})=>{
 graph.restoredSession=true;graph.calendarPermitted=false;await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();
 await expect(page.getByText('Connect your calendar',{exact:true})).toBeVisible();expect(graph.calls.some(c=>c.command==='calendar_page')).toBe(false);expect(graph.writes).toEqual([]);
});
test('calendar failure is recoverable without showing empty success',async({page,graph})=>{
 graph.restoredSession=true;graph.calendarError='Calendar returned HTTP 503';await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('503');
 graph.calendarError='';await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.locator('.agenda')).toContainText('Project planning');expect(graph.writes).toEqual([]);
});

test('answered meeting offers change response and sends only after modal confirmation',async({page,graph})=>{
 graph.restoredSession=true;graph.calendarEvents[0].changeKey='version-1';graph.calendarEvents[0].isOrganizer=false;graph.calendarEvents[0].isCancelled=false;graph.calendarEvents[0].type='occurrence';
 await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button').filter({hasText:'Project planning'}).click();
 await page.getByRole('button',{name:'Change response',exact:true}).click();await page.getByLabel('Tentative',{exact:true}).check();await page.getByRole('button',{name:'Review response',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Applies to this occurrence only');expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Send response',exact:true}).click();await expect(page.getByText('A response was already attempted',{exact:false})).toBeVisible();
 expect(graph.writes.filter(c=>c.command==='calendar_response')).toHaveLength(1);expect(graph.writes[0].args.action).toBe('tentativelyAccept');
 await page.getByRole('button',{name:'Refresh meeting status',exact:true}).click();expect(graph.writes).toHaveLength(1);
});
test('organizer event offers status without response controls',async({page,graph})=>{
 graph.restoredSession=true;Object.assign(graph.calendarEvents[0],{changeKey:'v1',isOrganizer:true,isCancelled:false});await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button').filter({hasText:'Project planning'}).click();await expect(page.locator('.meeting')).toContainText('You organize this event');await expect(page.getByRole('button',{name:'Change response',exact:true})).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('Mail invitation opens the exact meeting in Calendar without writing',async({page,graph})=>{
 graph.restoredSession=true;graph.mailMessages[0]['@odata.type']='#microsoft.graph.eventMessageRequest';Object.assign(graph.calendarEvents[0],{changeKey:'v1',isOrganizer:false,isCancelled:false});
 await page.goto('/');await page.getByRole('button',{name:'Mail',exact:true}).click();await page.locator('.mail-row').first().click();await expect(page.locator('.meeting')).toContainText('Accepted');await expect(page.getByRole('button',{name:'Change response',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Respond in Calendar',exact:true}).click();await expect(page.locator('.event-details')).toContainText('Project planning');await expect(page.locator('#calendar-day')).toHaveValue('2026-11-12');await expect(page.getByRole('button',{name:'Change response',exact:true})).toBeVisible();expect(graph.calls.some(c=>c.command==='calendar_event'&&c.args.eventId==='event-1')).toBe(true);expect(graph.calls.some(c=>c.command==='calendar_event'&&c.args.messageId==='mail-1')).toBe(true);expect(graph.writes).toEqual([]);
});

test('uncertain response stays blocked after reopening details',async({page,graph})=>{
 graph.restoredSession=true;Object.assign(graph.calendarEvents[0],{changeKey:'uncertain-v1',isOrganizer:false,isCancelled:false});graph.calendarResponseResult={status:'uncertain',error:'Response not confirmed. Check Outlook.'};
 await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button').filter({hasText:'Project planning'}).click();await page.getByRole('button',{name:'Change response',exact:true}).click();await page.getByRole('button',{name:'Review response',exact:true}).click();await page.getByRole('button',{name:'Send response',exact:true}).click();await expect(page.getByText('Response not confirmed. Check Outlook.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close event details'}).click();await page.getByRole('button').filter({hasText:'Project planning'}).click();await expect(page.getByText('A response was already attempted',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Change response',exact:true})).toHaveCount(0);expect(graph.writes.filter(c=>c.command==='calendar_response')).toHaveLength(1);
});

test('Mail navigation handles an unavailable event with read-only retry',async({page,graph})=>{
 graph.restoredSession=true;graph.mailMessages[0]['@odata.type']='#microsoft.graph.eventMessageRequest';Object.assign(graph.calendarEvents[0],{changeKey:'v1',isOrganizer:false,isCancelled:false});
 await page.goto('/');await page.getByRole('button',{name:'Mail',exact:true}).click();await page.locator('.mail-row').first().click();await expect(page.getByRole('button',{name:'Respond in Calendar',exact:true})).toBeVisible();
 graph.calendarEventError='Meeting is unavailable (HTTP 404)';await page.getByRole('button',{name:'Respond in Calendar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('404');expect(graph.writes).toEqual([]);
 graph.calendarEventError='';await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.locator('.event-details')).toContainText('Project planning');expect(graph.writes).toEqual([]);
});
