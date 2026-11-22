import {test,expect,me} from './fixtures';
async function open(page:any){await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button',{name:'New meeting',exact:true}).click();}
async function fill(page:any){await page.getByLabel('Subject',{exact:true}).fill('Hybrid planning');await page.getByLabel('Starts',{exact:true}).fill('2026-11-23T10:00');await page.getByLabel('Ends',{exact:true}).fill('2026-11-23T11:00');await page.getByLabel('Attendees',{exact:true}).fill('person@example.test');}
async function confirm(page:any){await page.getByRole('button',{name:'Review meeting',exact:true}).click();await page.getByRole('button',{name:'Create & send invitations',exact:true}).click();}
test('Teams choice persists locally, appears in review and creates hybrid invitations only on confirmation',async({page,graph},info)=>{
 graph.restoredSession=true;await page.goto('/');await open(page);await fill(page);
 const toggle=page.getByRole('checkbox',{name:'Teams meeting',exact:true});await expect(toggle).toBeEnabled();await expect(toggle).not.toBeChecked();
 await toggle.check();await page.getByRole('button').filter({hasText:'River room'}).click();
 await page.getByRole('button',{name:'Save & close',exact:true}).click();await page.getByRole('button',{name:'New meeting',exact:true}).click();await expect(toggle).toBeChecked();
 await page.getByRole('button',{name:'Review meeting',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Microsoft 365 will generate the join details');expect(graph.writes).toEqual([]);
 await page.screenshot({path:info.outputPath('online-meeting-review.png')});
 await page.getByRole('button',{name:'Create & send invitations',exact:true}).click();
 await expect(page.getByRole('button',{name:'Join Teams meeting ↗',exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('online-meeting-join.png')});
 expect(graph.writes.filter(c=>c.command==='calendar_create')).toHaveLength(1);expect(graph.writes[0].args.draft.online).toBe(true);expect(graph.writes[0].args.draft.room.emailAddress).toBe('room@example.test');
 expect(graph.calls.some(c=>c.command==='plugin:opener|open_url')).toBe(false);
 await page.getByRole('button',{name:'Join Teams meeting ↗',exact:true}).click();expect(graph.calls.filter(c=>c.command==='plugin:opener|open_url')).toHaveLength(1);
});
test('unsupported calendar keeps ordinary meetings usable and a restored online draft can be switched off',async({page,graph})=>{
 graph.restoredSession=true;graph.meetingOnlineSupported=false;
 await page.addInitScript(({key})=>localStorage.setItem(key,JSON.stringify({subject:'Saved',start:'2026-11-23T10:00',end:'2026-11-23T11:00',online:true})),{key:JSON.stringify(['taut-meeting-draft',me.id])});
 await page.goto('/');await open(page);
 await expect(page.getByText('This calendar does not support creating Teams meetings.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Review meeting',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:'Teams meeting',exact:true}).uncheck();
 await expect(page.getByRole('button',{name:'Review meeting',exact:true})).toBeEnabled();expect(graph.writes).toEqual([]);
});
test('support lookup failure can be retried without creating an event',async({page,graph})=>{
 graph.restoredSession=true;graph.meetingOnlineError='Unavailable';await page.goto('/');await open(page);
 await expect(page.getByRole('checkbox',{name:'Teams meeting',exact:true})).toBeDisabled();
 graph.meetingOnlineError='';await page.getByRole('button',{name:'Retry Teams support',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Teams meeting',exact:true})).toBeEnabled();expect(graph.writes).toEqual([]);
});
test('a native no-send preflight result leaves the draft editable for an explicit choice',async({page,graph})=>{
 graph.restoredSession=true;graph.meetingResult={status:'notSent',error:'Teams support changed. Nothing was sent.'};await page.goto('/');await open(page);await fill(page);await page.getByRole('checkbox',{name:'Teams meeting',exact:true}).check();await confirm(page);
 await expect(page.getByRole('alert')).toContainText('Nothing was sent');await expect(page.getByRole('checkbox',{name:'Teams meeting',exact:true})).toBeEnabled();
 await page.getByRole('checkbox',{name:'Teams meeting',exact:true}).uncheck();expect(graph.writes.filter(c=>c.command==='calendar_create')).toHaveLength(1);
});
test('existing Teams meeting exposes a join action only for a safe link and never for cancelled meetings',async({page,graph})=>{
 graph.restoredSession=true;Object.assign(graph.calendarEvents[0],{isOnlineMeeting:true,onlineMeetingProvider:'teamsForBusiness',onlineMeeting:{joinUrl:'https://evil.test/meet/123'}});
 await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button').filter({hasText:'Project planning'}).click();
 await expect(page.getByText('Join link unavailable. Refresh meeting status or check Outlook.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Join Teams meeting ↗',exact:true})).toHaveCount(0);
 graph.calendarEvents[0].onlineMeeting.joinUrl='https://teams.microsoft.com/meet/123?p=test';await page.getByRole('button',{name:'Refresh meeting status',exact:true}).click();
 await expect(page.getByRole('button',{name:'Join Teams meeting ↗',exact:true})).toBeVisible();
 graph.calendarEvents[0].isCancelled=true;await page.getByRole('button',{name:'Refresh meeting status',exact:true}).click();
 await expect(page.getByRole('button',{name:'Join Teams meeting ↗',exact:true})).toHaveCount(0);expect(graph.writes).toEqual([]);
});
test('created event without join metadata warns without repeating creation',async({page,graph})=>{
 graph.restoredSession=true;const event={...graph.calendarEvents[0],id:'created',subject:'Hybrid planning',isOnlineMeeting:true,onlineMeetingProvider:'teamsForBusiness'};
 graph.meetingResult={status:'created',event,warning:'Meeting created, but Teams join details are not available yet. Do not create another copy.'};graph.calendarEvents=[event];
 await page.goto('/');await open(page);await fill(page);await page.getByRole('checkbox',{name:'Teams meeting',exact:true}).check();await confirm(page);
 await expect(page.locator('.agenda')).toContainText('Do not create another copy');await page.getByRole('button',{name:'Refresh meeting status',exact:true}).click();
 expect(graph.writes.filter(c=>c.command==='calendar_create')).toHaveLength(1);await expect(page.getByRole('button',{name:'Join Teams meeting ↗',exact:true})).toHaveCount(0);
});
