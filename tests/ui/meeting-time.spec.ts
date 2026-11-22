import {test,expect} from './fixtures';
async function open(page:any){await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button',{name:'New meeting',exact:true}).click();}
async function start(page:any,date='2026-11-23',time='10:00'){await page.getByLabel('Start date',{exact:true}).fill(date);await page.getByLabel('Start time',{exact:true}).fill(time);}
test('calendar icons match the clock accent and a committed date focuses its matching time field',async({page,graph},info)=>{
 graph.restoredSession=true;await page.goto('/');await open(page);
 const startDate=page.getByLabel('Start date',{exact:true}),startTime=page.getByLabel('Start time',{exact:true});
 await startDate.fill('2026-11-23');await expect(startTime).toBeFocused();
 const icons=page.locator('.calendar-icon');await expect(icons).toHaveCount(2);
 const color=await page.getByRole('button',{name:'Choose start time',exact:true}).evaluate(el=>getComputedStyle(el).color);
 await expect(icons.first()).toHaveCSS('color',color);
 await startTime.fill('10:00');
 await page.getByLabel('End date',{exact:true}).fill('2026-11-24');await expect(page.getByLabel('End time',{exact:true})).toBeFocused();
 await page.screenshot({path:info.outputPath('calendar-clock-icons.png')});expect(graph.writes).toEqual([]);
});
test('clicking time opens an actual picker and applying updates the default end',async({page,graph},info)=>{
 graph.restoredSession=true;await page.goto('/');await open(page);await start(page);
 await page.getByLabel('Start time',{exact:true}).click();
 const picker=page.getByRole('dialog',{name:'Start time picker',exact:true});await expect(picker).toBeVisible();
 await picker.getByRole('combobox',{name:'Hour',exact:true}).selectOption('12');await picker.getByRole('combobox',{name:'Minute',exact:true}).selectOption('15');await picker.getByRole('combobox',{name:'AM or PM',exact:true}).selectOption('PM');
 await page.screenshot({path:info.outputPath('time-picker.png')});await picker.getByRole('button',{name:'Set time',exact:true}).click();
 await expect(page.getByLabel('Start time',{exact:true})).toHaveValue('12:15');await expect(page.getByLabel('End time',{exact:true})).toHaveValue('12:45');
 await page.getByRole('button',{name:'Choose start time',exact:true}).click();await picker.getByRole('combobox',{name:'AM or PM',exact:true}).selectOption('AM');await picker.getByRole('button',{name:'Set time',exact:true}).click();
 await expect(page.getByLabel('Start time',{exact:true})).toHaveValue('00:15');expect(graph.writes).toEqual([]);
});
test('picker cancellation and Escape leave times unchanged, while an end choice remains manual',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await open(page);await start(page);
 await page.getByRole('button',{name:'Choose end time',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'End time picker',exact:true});await picker.getByRole('combobox',{name:'Hour',exact:true}).selectOption('4');await picker.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(page.getByLabel('End time',{exact:true})).toHaveValue('10:30');
 await page.getByRole('button',{name:'Choose end time',exact:true}).click();await page.keyboard.press('Escape');await expect(picker).toHaveCount(0);await expect(page.getByLabel('End time',{exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Choose end time',exact:true}).click();await picker.getByRole('combobox',{name:'Hour',exact:true}).selectOption('11');await picker.getByRole('button',{name:'Set time',exact:true}).click();
 await page.getByLabel('Start time',{exact:true}).fill('10:15');await expect(page.getByLabel('End time',{exact:true})).toHaveValue('11:30');expect(graph.writes).toEqual([]);
});
test('show summary control appears only while the details panel is closed',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await open(page);
 await expect(page.getByRole('button',{name:'Show meeting summary',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Close meeting summary',exact:true}).click();await page.getByRole('button',{name:'Show meeting summary',exact:true}).click();
 await expect(page.getByRole('button',{name:'Show meeting summary',exact:true})).toHaveCount(0);expect(graph.writes).toEqual([]);
});
test('Calendar preference persists and supplies end times while manual overrides survive later start changes',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Calendar',exact:true}).click();
 await page.getByLabel('Default meeting length',{exact:true}).selectOption('45');await page.getByRole('button',{name:'Close settings',exact:true}).click();
 await page.reload();await open(page);await start(page);
 await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-23');await expect(page.getByLabel('End time',{exact:true})).toHaveValue('10:45');
 await page.getByLabel('Start time',{exact:true}).fill('11:00');await expect(page.getByLabel('End time',{exact:true})).toHaveValue('11:45');
 await page.getByLabel('End time',{exact:true}).fill('12:30');await page.getByLabel('Start time',{exact:true}).fill('11:30');await expect(page.getByLabel('End time',{exact:true})).toHaveValue('12:30');
 await page.getByRole('button',{name:'Save & close',exact:true}).click();await page.getByRole('button',{name:'New meeting',exact:true}).click();await page.getByLabel('Start time',{exact:true}).fill('11:45');await expect(page.getByLabel('End time',{exact:true})).toHaveValue('12:30');
 expect(graph.writes).toEqual([]);
});
test('separate date and time inputs default to thirty minutes and handle midnight',async({page,graph},info)=>{
 graph.restoredSession=true;await page.goto('/');await open(page);await start(page,'2026-11-23','23:45');
 await expect(page.getByLabel('Start date',{exact:true})).toHaveAttribute('type','date');await expect(page.getByLabel('Start time',{exact:true})).toHaveAttribute('type','time');
 await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-24');await expect(page.getByLabel('End time',{exact:true})).toHaveValue('00:15');
 await page.screenshot({path:info.outputPath('meeting-time.png')});expect(graph.writes).toEqual([]);
});
test('online meeting without a room checks attendees availability and sends no room resource',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await open(page);await start(page);await page.getByLabel('Subject',{exact:true}).fill('Online only');
 await page.getByRole('checkbox',{name:'Teams meeting',exact:true}).check();await page.getByLabel('Attendees',{exact:true}).fill('person@example.test');
 await page.getByRole('button',{name:'Check availability',exact:true}).click();
 expect(graph.calls.find(c=>c.command==='calendar_availability')?.args.addresses).toEqual(['person@example.test']);expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Review meeting',exact:true}).click();await page.getByRole('button',{name:'Create & send invitations',exact:true}).click();
 await expect(page.getByRole('button',{name:'Join Teams meeting ↗',exact:true})).toBeVisible();
 const call=graph.writes.find(c=>c.command==='calendar_create')!;expect(call.args.draft.room).toBeNull();expect(call.args.draft.online).toBe(true);
 await expect(page.locator('.event-details .room-booking')).toHaveCount(0);
});
test('availability explains missing inputs and is independent from creating a solo meeting',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await open(page);
 await expect(page.getByRole('button',{name:'Check availability',exact:true})).toBeDisabled();await expect(page.getByText('Set a valid start and end time to check availability.',{exact:true})).toBeVisible();
 await start(page);await page.getByLabel('Subject',{exact:true}).fill('Solo planning');
 await expect(page.getByText('Add an attendee or room to check availability. You can still create a meeting without either.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Review meeting',exact:true})).toBeEnabled();expect(graph.writes).toEqual([]);
});
