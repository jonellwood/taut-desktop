import {test,expect,me} from './fixtures';
test.use({timezoneId:'America/New_York'});
async function open(page:any){await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button',{name:'New meeting',exact:true}).click();}
async function fill(page:any){await page.getByLabel('Subject',{exact:true}).fill('Recurring planning');await page.getByLabel('Start date',{exact:true}).fill('2026-11-23');await page.getByLabel('Start time',{exact:true}).fill('09:00');await page.getByLabel('Attendees',{exact:true}).fill('person@example.test');}
test('weekly hybrid recurrence persists, is reviewed, and creates exactly one series',async({page,graph},info)=>{
 graph.restoredSession=true;await page.goto('/');await open(page);await fill(page);
 await page.getByLabel('Repeat',{exact:true}).selectOption('weekly');await page.getByLabel('Repeat every',{exact:true}).fill('2');await page.getByRole('checkbox',{name:'Wednesday',exact:true}).check();await page.getByLabel('Number of occurrences',{exact:true}).fill('6');
 await page.getByRole('checkbox',{name:'Teams meeting',exact:true}).check();await page.getByRole('button').filter({hasText:'River room'}).click();
 await page.getByRole('button',{name:'Close editor',exact:true}).click();await page.getByRole('button',{name:'New meeting',exact:true}).click();await expect(page.getByLabel('Repeat',{exact:true})).toHaveValue('weekly');await expect(page.getByRole('checkbox',{name:'Wednesday',exact:true})).toBeChecked();
 await expect(page.locator('.meeting-summary')).toContainText('first occurrence only');await page.getByRole('button',{name:'Review meeting',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Every 2 weeks on Monday, Wednesday');await expect(page.getByRole('dialog')).toContainText('6 occurrences');await page.screenshot({path:info.outputPath('recurrence-review.png')});expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Create & send invitations',exact:true}).click();await expect(page.locator('.event-details')).toContainText('Manage the series in Outlook');
 const writes=graph.writes.filter(c=>c.command==='calendar_create');expect(writes).toHaveLength(1);expect(writes[0].args.draft.recurrence).toEqual({frequency:'weekly',interval:2,daysOfWeek:['monday','wednesday'],ending:'count',count:6,endDate:null,timeZone:'America/New_York'});expect(writes[0].args.draft.room.emailAddress).toBe('room@example.test');expect(writes[0].args.draft.online).toBe(true);
 await expect(page.getByRole('button',{name:'Edit meeting',exact:true})).toHaveCount(0);
});
test('daily end-date series works without a room and availability checks only the first time range',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await open(page);await fill(page);await page.getByLabel('Repeat',{exact:true}).selectOption('daily');await page.getByLabel('Series ends',{exact:true}).selectOption('date');await page.getByLabel('Series end date',{exact:true}).fill('2026-12-23');
 await page.getByRole('button',{name:'Check availability',exact:true}).click();expect(graph.calls.filter(c=>c.command==='calendar_availability')).toHaveLength(1);expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Review meeting',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('through 2026-12-23');await page.getByRole('button',{name:'Create & send invitations',exact:true}).click();
 expect(graph.writes[0].args.draft.recurrence.count).toBeNull();expect(graph.writes[0].args.draft.room).toBeNull();expect(graph.writes[0].args.draft.recurrence.endDate).toBe('2026-12-23');
});
test('invalid weekdays and series range prevent review without any writes',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await open(page);await fill(page);await page.getByLabel('Repeat',{exact:true}).selectOption('weekly');await page.getByRole('checkbox',{name:'Monday',exact:true}).uncheck();await expect(page.getByRole('button',{name:'Review meeting',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'Monday',exact:true}).check();await page.getByLabel('Number of occurrences',{exact:true}).fill('0');await expect(page.getByRole('button',{name:'Review meeting',exact:true})).toBeDisabled();
 await page.getByLabel('Repeat',{exact:true}).selectOption('none');await expect(page.getByRole('button',{name:'Review meeting',exact:true})).toBeEnabled();expect(graph.writes).toEqual([]);
});
test('uncertain series creation remains locked after restart',async({page,graph})=>{
 graph.restoredSession=true;graph.meetingResult={status:'uncertain',error:'Check Outlook before another attempt.'};await page.goto('/');await open(page);await fill(page);await page.getByLabel('Repeat',{exact:true}).selectOption('daily');await page.getByRole('button',{name:'Review meeting',exact:true}).click();await page.getByRole('button',{name:'Create & send invitations',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Check Outlook');
 await page.reload();await open(page);await expect(page.getByLabel('Repeat',{exact:true})).toHaveValue('daily');await expect(page.getByRole('button',{name:'Review meeting',exact:true})).toBeDisabled();expect(graph.writes).toHaveLength(1);
});
test('a recurring draft saved in another time zone cannot be sent silently',async({page,graph})=>{
 graph.restoredSession=true;await page.addInitScript(({key})=>localStorage.setItem(key,JSON.stringify({subject:'Old zone',start:'2026-11-23T09:00',end:'2026-11-23T10:00',zone:'America/Los_Angeles',recurrenceForm:{frequency:'daily',interval:1,daysOfWeek:[],ending:'count',count:10,endDate:''}})),{key:JSON.stringify(['taut-meeting-draft',me.id])});
 await page.goto('/');await open(page);await expect(page.getByRole('button',{name:'Review meeting',exact:true})).toBeDisabled();await expect(page.getByText('This recurring draft was saved in another time zone.',{exact:false})).toBeVisible();expect(graph.writes).toEqual([]);
});

test('created series with a named-zone response keeps a valid range and retry only reads',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await open(page);await page.getByLabel('Subject',{exact:true}).fill('Named-zone series');await page.getByLabel('Start date',{exact:true}).fill('2026-11-23');await page.getByLabel('Start time',{exact:true}).fill('12:30');await page.getByLabel('Repeat',{exact:true}).selectOption('daily');
 const series={...graph.calendarEvents[0],id:'created-series',subject:'Named-zone series',type:'seriesMaster',isOrganizer:true,start:{dateTime:'2026-11-23T12:30:00.0000000',timeZone:'America/New_York'},end:{dateTime:'2026-11-23T13:00:00.0000000',timeZone:'America/New_York'}};
 graph.meetingResult={status:'created',event:series};graph.calendarEventResults=Array.from({length:6},()=>({event:{...series,start:{dateTime:'2026-11-23T17:30:00.0000000',timeZone:'UTC'},end:{dateTime:'2026-11-23T18:00:00.0000000',timeZone:'UTC'}}}));
 await page.getByRole('button',{name:'Review meeting',exact:true}).click();graph.calendarError='Calendar temporarily unavailable';await page.getByRole('button',{name:'Create & send invitations',exact:true}).click();await expect(page.locator('.agenda')).toContainText('Meeting created');await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();await expect(page.locator('.agenda')).not.toContainText('Invalid Date');await expect(page.locator('.agenda')).not.toContainText('Date unavailable');
 graph.calendarError='';await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('button',{name:'Try again',exact:true})).toHaveCount(0);const read=graph.calls.filter(c=>c.command==='calendar_page').at(-1)!;expect(read.args.start).toBe('2026-11-23T05:00:00.000Z');expect(graph.writes.filter(c=>c.command==='calendar_create')).toHaveLength(1);
});
