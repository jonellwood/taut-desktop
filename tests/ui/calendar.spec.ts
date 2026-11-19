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
 await page.goto('/');await page.getByRole('button',{name:'Mail',exact:true}).click();await page.locator('.mail-row').first().click();await expect(page.locator('.meeting')).toContainText('Accepted');await expect(page.getByRole('button',{name:'Change response',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'View in Calendar',exact:true}).click();await expect(page.locator('.event-details')).toContainText('Project planning');await expect(page.locator('#calendar-day')).toHaveValue('2026-11-12');await expect(page.getByRole('button',{name:'Change response',exact:true})).toBeVisible();expect(graph.calls.some(c=>c.command==='calendar_event'&&c.args.eventId==='event-1')).toBe(true);expect(graph.calls.some(c=>c.command==='calendar_event'&&c.args.messageId==='mail-1')).toBe(true);expect(graph.writes).toEqual([]);
});

test('uncertain response stays blocked after reopening details',async({page,graph})=>{
 graph.restoredSession=true;Object.assign(graph.calendarEvents[0],{changeKey:'uncertain-v1',isOrganizer:false,isCancelled:false});graph.calendarResponseResult={status:'uncertain',error:'Response not confirmed. Check Outlook.'};
 await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button').filter({hasText:'Project planning'}).click();await page.getByRole('button',{name:'Change response',exact:true}).click();await page.getByRole('button',{name:'Review response',exact:true}).click();await page.getByRole('button',{name:'Send response',exact:true}).click();await expect(page.getByText('Response not confirmed. Check Outlook.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close event details'}).click();await page.getByRole('button').filter({hasText:'Project planning'}).click();await expect(page.getByText('A response was already attempted',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Change response',exact:true})).toHaveCount(0);expect(graph.writes.filter(c=>c.command==='calendar_response')).toHaveLength(1);
});

test('Mail navigation handles an unavailable event with read-only retry',async({page,graph})=>{
 graph.restoredSession=true;graph.mailMessages[0]['@odata.type']='#microsoft.graph.eventMessageRequest';Object.assign(graph.calendarEvents[0],{changeKey:'v1',isOrganizer:false,isCancelled:false});
 await page.goto('/');await page.getByRole('button',{name:'Mail',exact:true}).click();await page.locator('.mail-row').first().click();await expect(page.getByRole('button',{name:'View in Calendar',exact:true})).toBeVisible();
 graph.calendarEventError='Meeting is unavailable (HTTP 404)';await page.getByRole('button',{name:'View in Calendar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('404');expect(graph.writes).toEqual([]);
 graph.calendarEventError='';await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.locator('.event-details')).toContainText('Project planning');expect(graph.writes).toEqual([]);
});


test('Calendar refresh reconciles the selected response card and agenda from Outlook without writes',async({page,graph})=>{
 graph.restoredSession=true;Object.assign(graph.calendarEvents[0],{changeKey:'v1',isOrganizer:false,isCancelled:false});
 await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.locator('.agenda .event').first().click();
 await expect(page.getByRole('button',{name:'Change response',exact:true})).toBeVisible();
 Object.assign(graph.calendarEvents[0],{changeKey:'v2',responseStatus:{response:'notResponded'},responseRequested:true});
 await page.getByRole('button',{name:'Refresh calendar',exact:true}).click();
 await expect(page.locator('.meeting')).toContainText('Not yet responded');await expect(page.getByRole('button',{name:'Respond to invitation',exact:true})).toBeVisible();
 Object.assign(graph.calendarEvents[0],{changeKey:'v3',responseStatus:{response:'accepted'}});
 await page.getByRole('button',{name:'Refresh calendar',exact:true}).click();
 await expect(page.locator('.meeting')).toContainText('Accepted');await expect(page.locator('.agenda .event').first()).toContainText('Accepted');
 await expect(page.getByRole('button',{name:'Change response',exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
});

test('accepted response waits for recorded status using reads and stops after confirmation',async({page,graph})=>{
 graph.restoredSession=true;Object.assign(graph.calendarEvents[0],{changeKey:'v1',isOrganizer:false,isCancelled:false});
 await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.locator('.agenda .event').first().click();
 await page.getByRole('button',{name:'Change response',exact:true}).click();await page.getByLabel('Tentative',{exact:true}).check();
 await page.getByRole('button',{name:'Review response',exact:true}).click();await page.getByRole('button',{name:'Send response',exact:true}).click();
 await expect(page.locator('.meeting [role=status]')).toContainText('Checking the recorded');
 Object.assign(graph.calendarEvents[0],{changeKey:'v2',responseStatus:{response:'tentativelyAccepted'}});
 await page.clock.runFor(2500);
 await expect(page.locator('.meeting [role=status]')).toHaveText('Calendar records your response: Tentative.');
 await expect(page.locator('.agenda .event').first()).toContainText('Tentative');
 await expect(page.getByRole('button',{name:'Change response',exact:true})).toBeVisible();
 const reads=graph.calls.filter(c=>c.command==='calendar_event').length;await page.clock.runFor(20000);
 expect(graph.calls.filter(c=>c.command==='calendar_event')).toHaveLength(reads);expect(graph.writes.filter(c=>c.command==='calendar_response')).toHaveLength(1);
});

test('post-response checks are bounded and cancelled on navigation',async({page,graph})=>{
 graph.restoredSession=true;Object.assign(graph.calendarEvents[0],{changeKey:'v1',isOrganizer:false,isCancelled:false});
 await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.locator('.agenda .event').first().click();
 await page.getByRole('button',{name:'Change response',exact:true}).click();await page.getByLabel('Tentative',{exact:true}).check();await page.getByRole('button',{name:'Review response',exact:true}).click();await page.getByRole('button',{name:'Send response',exact:true}).click();
 await expect(page.locator('.meeting [role=status]')).toContainText('Checking the recorded');
 const reads=graph.calls.filter(c=>c.command==='calendar_event').length;
 for(const [index,wait] of [2500,5500,10500].entries()){await page.clock.runFor(wait);await expect.poll(()=>graph.calls.filter(c=>c.command==='calendar_event').length).toBe(reads+index+1);}
 const bounded=graph.calls.filter(c=>c.command==='calendar_event').length;expect(bounded-reads).toBe(3);await page.clock.runFor(30000);expect(graph.calls.filter(c=>c.command==='calendar_event')).toHaveLength(bounded);
 await page.getByRole('button',{name:'Chats',exact:true}).click();await page.clock.runFor(20000);expect(graph.calls.filter(c=>c.command==='calendar_event')).toHaveLength(bounded);expect(graph.writes.filter(c=>c.command==='calendar_response')).toHaveLength(1);
});

test('old invitation and response mail show current status without duplicate response prompts',async({page,graph})=>{
 graph.restoredSession=true;graph.mailMessages[0]['@odata.type']='#microsoft.graph.eventMessageRequest';
 Object.assign(graph.calendarEvents[0],{changeKey:'v1',isOrganizer:false,isCancelled:false,responseStatus:{response:'notResponded'},responseRequested:true});
 graph.calendarInvitations['mail-1']={meetingMessageType:'meetingRequest',isOutOfDate:true,previousStartDateTime:{dateTime:'2026-11-11T15:00:00',timeZone:'UTC'}};
 await page.goto('/');await page.getByRole('button',{name:'Mail',exact:true}).click();await page.locator('.mail-row').first().click();
 await expect(page.locator('.meeting')).toContainText('superseded');await expect(page.locator('.meeting')).toContainText('previously');await expect(page.getByRole('button',{name:'Respond in Calendar',exact:true})).toHaveCount(0);
 graph.calendarInvitations['mail-1']={meetingMessageType:'meetingRequest',isOutOfDate:false};
 await page.getByRole('button',{name:'Refresh mail',exact:true}).click();await expect(page.getByRole('button',{name:'Respond in Calendar',exact:true})).toBeVisible();
 Object.assign(graph.calendarEvents[0],{changeKey:'v2',responseStatus:{response:'accepted'}});
 await page.getByRole('button',{name:'Refresh mail',exact:true}).click();await expect(page.getByRole('button',{name:'Respond in Calendar',exact:true})).toHaveCount(0);await expect(page.locator('.meeting')).toContainText('Accepted');
 Object.assign(graph.calendarEvents[0],{changeKey:'v3',responseStatus:{response:'declined'}});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.meeting')).toContainText('Declined');
 expect(graph.mailMessages[0].isRead).toBe(false);expect(graph.writes).toEqual([]);
});

test('meeting response mail without a calendar event stays compact and never claims own RSVP',async({page,graph})=>{
 graph.restoredSession=true;graph.mailMessages[0]['@odata.type']='#microsoft.graph.eventMessageResponse';graph.mailMessages[0].body={contentType:'html',content:''};
 graph.calendarEventResults=[{event:null,calendarUnavailable:true,meetingMessageType:'meetingAccepted'}];
 await page.goto('/');await page.getByRole('button',{name:'Mail',exact:true}).click();await page.locator('.mail-row').first().click();
 await expect(page.locator('.meeting')).toContainText('Meeting acceptance');await expect(page.locator('.meeting')).toContainText('Current calendar status unavailable');
 await expect(page.getByRole('button',{name:'Respond in Calendar',exact:true})).toHaveCount(0);await expect(page.locator('iframe[title="Formatted email"]')).toHaveCount(0);expect(graph.writes).toEqual([]);
});


test('leaving a pending RSVP reconciliation cancels future reads and never repeats the response',async({page,graph})=>{
 graph.restoredSession=true;Object.assign(graph.calendarEvents[0],{changeKey:'v1',isOrganizer:false,isCancelled:false});
 await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.locator('.agenda .event').first().click();await page.getByRole('button',{name:'Change response',exact:true}).click();await page.getByLabel('Tentative',{exact:true}).check();await page.getByRole('button',{name:'Review response',exact:true}).click();await page.getByRole('button',{name:'Send response',exact:true}).click();
 await expect(page.locator('.meeting [role=status]')).toContainText('Checking the recorded');await page.getByRole('button',{name:'Chats',exact:true}).click();
 const reads=graph.calls.filter(c=>c.command==='calendar_event').length;await page.clock.runFor(30000);expect(graph.calls.filter(c=>c.command==='calendar_event')).toHaveLength(reads);expect(graph.writes.filter(c=>c.command==='calendar_response')).toHaveLength(1);
});

test('failed refresh keeps old status non-actionable until a fresh calendar read succeeds',async({page,graph})=>{
 graph.restoredSession=true;Object.assign(graph.calendarEvents[0],{changeKey:'v1',isOrganizer:false,isCancelled:false});
 await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.locator('.agenda .event').first().click();await expect(page.getByRole('button',{name:'Change response',exact:true})).toBeVisible();
 graph.calendarEventError='Calendar status unavailable';await page.getByRole('button',{name:'Refresh meeting status',exact:true}).click();await expect(page.locator('.meeting [role=alert]')).toContainText('Calendar status unavailable');await expect(page.getByRole('button',{name:'Change response',exact:true})).toHaveCount(0);
 graph.calendarEventError='';await page.getByRole('button',{name:'Refresh meeting status',exact:true}).click();await expect(page.getByRole('button',{name:'Change response',exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
});
