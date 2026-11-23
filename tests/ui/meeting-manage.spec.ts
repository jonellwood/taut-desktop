import {test,expect,me,row,alex} from './fixtures';
function organizer(graph:import('./fixtures').MockGraph){Object.assign(graph.calendarEvents[0],{type:'singleInstance',changeKey:'manage-v1',isOrganizer:true,isCancelled:false,isAllDay:false,isOnlineMeeting:false,body:{contentType:'text',content:'Keep this description'},attendees:[{type:'optional',emailAddress:{name:'Alex Example',address:'alex@example.test'},status:{response:'accepted'}},{type:'resource',emailAddress:{name:'River room',address:'room@example.test'},status:{response:'accepted'}}],location:{displayName:'River room'}});graph.restoredSession=true;}
async function select(page:import('@playwright/test').Page){await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.locator('.agenda .event').first().click();}
async function edit(page:import('@playwright/test').Page){await page.getByRole('button',{name:'Edit meeting',exact:true}).click();await expect(page.getByLabel('Subject',{exact:true})).toHaveValue('Project planning');}

test('editing is local and restorable; review cancel sends nothing and subject-only save preserves other fields',async({page,graph},info)=>{
 organizer(graph);await page.goto('/');await select(page);await edit(page);await expect(page.getByRole('combobox',{name:'Optional attendees',exact:true})).toHaveValue('alex@example.test');
 await page.getByLabel('Subject',{exact:true}).fill('Adjusted planning');await page.getByRole('button',{name:'Close editor',exact:true}).click();await page.getByRole('button',{name:'Edit meeting',exact:true}).click();await expect(page.getByLabel('Subject',{exact:true})).toHaveValue('Adjusted planning');
 await page.getByRole('button',{name:'Review changes',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Adjusted planning');await expect(page.getByRole('dialog')).toContainText('notify attendees');expect(graph.writes).toEqual([]);
 await page.screenshot({path:info.outputPath('meeting-update-review.png')});await page.getByRole('button',{name:'Keep editing',exact:true}).click();expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Review changes',exact:true}).click();await page.getByRole('button',{name:'Send meeting update',exact:true}).click();await expect(page.locator('.event-details h2')).toHaveText('Adjusted planning');
 const write=graph.writes.find(c=>c.command==='calendar_manage');expect(write?.args.changes).toEqual({subject:'Adjusted planning'});expect(graph.writes).toHaveLength(1);expect(graph.calendarEvents[0].body.content).toBe('Keep this description');expect(graph.calendarEvents[0].attendees[0].type).toBe('optional');await expect(page.locator('.room-booking')).toContainText('Room accepted');
});

test('time people description and room updates are reviewed together and room acceptance stays pending',async({page,graph},info)=>{
 organizer(graph);graph.meetingRooms.push({emailAddress:'lake@example.test',displayName:'Lake room'});await page.goto('/');await select(page);await edit(page);
 await page.getByLabel('Start date',{exact:true}).fill('2026-11-21');await page.getByLabel('Start time',{exact:true}).fill('10:00');await page.getByLabel('End date',{exact:true}).fill('2026-11-21');await page.getByLabel('End time',{exact:true}).fill('11:00');await page.getByLabel('Description',{exact:true}).fill('New details');await page.getByRole('combobox',{name:'Required attendees',exact:true}).fill('blair@example.test');await page.getByLabel('Change room / location',{exact:true}).check();await page.getByLabel('New room',{exact:true}).selectOption('lake@example.test');
 await page.screenshot({path:info.outputPath('meeting-editor.png')});await page.getByRole('button',{name:'Review changes',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Lake room');await expect(page.getByRole('dialog')).toContainText('New details');await expect(page.getByRole('dialog')).toContainText('alex@example.test (optional)');await page.getByRole('button',{name:'Send meeting update',exact:true}).click();
 await expect(page.locator('.room-booking')).toContainText('Lake room');await expect(page.locator('.room-booking')).toContainText('awaiting room response');const changes=graph.writes[0].args.changes;expect(changes.start).toMatch(/Z$/);expect(changes.people).toContainEqual({address:'alex@example.test',kind:'optional'});expect(changes.room.emailAddress).toBe('lake@example.test');expect(graph.writes).toHaveLength(1);
});

test('cancellation requires fresh review and sends the optional note once',async({page,graph},info)=>{
 organizer(graph);await page.goto('/');await select(page);await page.getByRole('button',{name:'Cancel meeting',exact:true}).click();await page.getByLabel('Cancellation note',{exact:true}).fill('Moving this discussion to next week.');await page.getByRole('button',{name:'Review cancellation',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('cancellation');await expect(page.getByRole('dialog')).toContainText('River room');expect(graph.writes).toEqual([]);await page.getByRole('button',{name:'Keep editing',exact:true}).click();expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Review cancellation',exact:true}).click();await page.screenshot({path:info.outputPath('meeting-cancel-review.png')});await page.getByRole('button',{name:'Cancel meeting & notify attendees',exact:true}).click();await expect(page.locator('.agenda')).toContainText('Cancellation submitted');await expect(page.locator('.agenda .event')).toHaveCount(0);expect(graph.writes).toHaveLength(1);expect(graph.writes[0].args).toMatchObject({eventId:'event-1',version:'manage-v1',action:'cancel',changes:null,comment:'Moving this discussion to next week.'});
});

for(const difference of [{isOrganizer:false},{type:'seriesMaster'},{type:'occurrence'},{isCancelled:true}])test(`organizer actions exclude ${JSON.stringify(difference)}`,async({page,graph})=>{
 organizer(graph);Object.assign(graph.calendarEvents[0],difference);await page.goto('/');await select(page);await expect(page.getByRole('button',{name:'Edit meeting',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Cancel meeting',exact:true})).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('a stale version is not sent and preserves editable draft',async({page,graph})=>{
 organizer(graph);await page.goto('/');await select(page);await edit(page);await page.getByLabel('Subject',{exact:true}).fill('My draft change');graph.calendarEvents[0].changeKey='changed-elsewhere';await page.getByRole('button',{name:'Review changes',exact:true}).click();await page.getByRole('button',{name:'Send meeting update',exact:true}).click();await expect(page.getByRole('alert')).toContainText('meeting changed');await expect(page.getByLabel('Subject',{exact:true})).toHaveValue('My draft change');await expect(page.getByRole('button',{name:'Review changes',exact:true})).toBeEnabled();expect(graph.calendarEvents[0].subject).toBe('Project planning');
});

test('uncertain update survives restart and blocks both edit and cancellation for the same version',async({page,graph})=>{
 organizer(graph);graph.meetingManageResult={status:'uncertain',error:'Update unconfirmed. Check Outlook.'};await page.goto('/');await select(page);await edit(page);await page.getByLabel('Subject',{exact:true}).fill('Keep uncertain draft');await page.getByRole('button',{name:'Review changes',exact:true}).click();await page.getByRole('button',{name:'Send meeting update',exact:true}).click();await expect(page.locator('.meeting-editor')).toContainText('Update unconfirmed');
 await page.reload();await select(page);await page.getByRole('button',{name:'Edit meeting',exact:true}).click();await expect(page.getByLabel('Subject',{exact:true})).toHaveValue('Keep uncertain draft');await expect(page.getByRole('button',{name:'Review changes',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Close editor',exact:true}).click();await page.getByRole('button',{name:'Cancel meeting',exact:true}).click();await expect(page.getByRole('button',{name:'Review cancellation',exact:true})).toBeDisabled();expect(graph.writes).toHaveLength(1);
});

test('online descriptions are preserved and only an explicit appended note is sent',async({page,graph})=>{
 organizer(graph);graph.calendarEvents[0].isOnlineMeeting=true;graph.calendarEvents[0].body={contentType:'html',content:'<div>ORIGINAL TEAMS LINK</div>'};await page.goto('/');await select(page);await edit(page);await expect(page.getByLabel('Description',{exact:true})).toHaveCount(0);await page.getByLabel('Add a description note',{exact:true}).fill('Bring the report');await page.getByRole('button',{name:'Review changes',exact:true}).click();await page.getByRole('button',{name:'Send meeting update',exact:true}).click();await expect(page.locator('.event-details')).toBeVisible();expect(graph.writes[0].args.changes).toEqual({descriptionNote:'Bring the report'});expect(graph.calendarEvents[0].body.content).toContain('ORIGINAL TEAMS LINK');
});

test('unavailable attempt storage prevents any update command',async({page,graph})=>{
 organizer(graph);await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes('taut-meeting-manage'))throw new DOMException('Unavailable','QuotaExceededError');return original.call(this,key,value);};});await page.goto('/');await select(page);await edit(page);await page.getByLabel('Subject',{exact:true}).fill('No unsafe send');await page.getByRole('button',{name:'Review changes',exact:true}).click();await page.getByRole('button',{name:'Send meeting update',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Nothing was sent');expect(graph.writes).toEqual([]);
});


test('corrupt local draft cannot bypass an uncertain attempt lock',async({page,graph})=>{
 organizer(graph);await page.goto('/');await page.evaluate(account=>{
 localStorage.setItem(JSON.stringify(['taut-meeting-edit',account,'event-1','manage-v1']),'{broken');
 localStorage.setItem(JSON.stringify(['taut-meeting-manage',account,'event-1','manage-v1']),'pending');
 },me.id);await select(page);await edit(page);await expect(page.locator('.meeting-editor')).toContainText('already attempted');await expect(page.getByLabel('Subject',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Review changes',exact:true})).toBeDisabled();expect(graph.writes).toEqual([]);
});

test('unreadable attempt storage leaves management unavailable',async({page,graph})=>{
 organizer(graph);await page.addInitScript(()=>{const original=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key.includes('taut-meeting-manage'))throw new DOMException('Unavailable','SecurityError');return original.call(this,key);};});await page.goto('/');await select(page);await page.getByRole('button',{name:'Edit meeting',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Unavailable');await expect(page.getByRole('button',{name:'Review changes',exact:true})).toBeDisabled();expect(graph.writes).toEqual([]);
});

test('pending cancellation cannot be submitted twice or closed from the editor',async({page,graph})=>{
 organizer(graph);let release!:()=>void;graph.meetingManageGate=new Promise<void>(resolve=>release=resolve);await page.goto('/');await select(page);await page.getByRole('button',{name:'Cancel meeting',exact:true}).click();await page.getByRole('button',{name:'Review cancellation',exact:true}).click();await page.getByRole('button',{name:'Cancel meeting & notify attendees',exact:true}).click();await expect(page.getByRole('button',{name:'Review cancellation',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Close editor',exact:true})).toBeDisabled();expect(graph.writes).toHaveLength(1);release();await expect(page.locator('.agenda')).toContainText('Cancellation submitted');expect(graph.writes).toHaveLength(1);
});


test('returning to Chats after cancellation replaces Calendar and opens a conversation',async({page,graph})=>{
 organizer(graph);await page.goto('/');await row(page,alex.displayName).click();await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep my chat draft');await select(page);await page.getByRole('button',{name:'Cancel meeting',exact:true}).click();await page.getByRole('button',{name:'Review cancellation',exact:true}).click();await page.getByRole('button',{name:'Cancel meeting & notify attendees',exact:true}).click();await expect(page.locator('.agenda')).toContainText('Cancellation submitted');
 await page.getByRole('button',{name:'Chats',exact:true}).click();await expect(page.locator('.calendar-workspace')).toHaveCount(0);await row(page,alex.displayName).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep my chat draft');expect(graph.writes.filter(c=>c.command==='calendar_manage')).toHaveLength(1);
});


test('selected cancelled event unmounts cleanly when returning to Chats',async({page,graph})=>{
 organizer(graph);graph.calendarEvents[0].isCancelled=true;await page.goto('/');await row(page,alex.displayName).click();await select(page);await expect(page.locator('.event-details')).toBeVisible();await page.getByRole('button',{name:'Chats',exact:true}).click();await expect(page.locator('.calendar-workspace')).toHaveCount(0);await row(page,alex.displayName).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
});

test('primary meeting review stays visible while scrolling and closing never sends',async({page,graph},info)=>{
 organizer(graph);await page.setViewportSize({width:1280,height:650});await page.goto('/');await select(page);await edit(page);
 const editor=page.getByRole('region',{name:'Edit meeting',exact:true});const review=editor.getByRole('button',{name:'Review changes',exact:true});
 await expect(review).toBeInViewport();await expect(review).toBeDisabled();await expect(editor.getByRole('button',{name:'Save & close'})).toHaveCount(0);
 await page.getByLabel('Subject',{exact:true}).fill('Visible review action');await expect(review).toBeEnabled();await editor.evaluate(node=>node.scrollTop=node.scrollHeight);await expect(review).toBeInViewport();
 await page.screenshot({path:info.outputPath('sticky-meeting-review.png')});await review.click();await expect(page.getByRole('dialog',{name:'Review meeting changes'})).toContainText('Visible review action');expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();await editor.getByRole('button',{name:'Close editor',exact:true}).click();expect(graph.writes).toEqual([]);await page.getByRole('button',{name:'Edit meeting',exact:true}).click();await expect(page.getByLabel('Subject',{exact:true})).toHaveValue('Visible review action');
});
