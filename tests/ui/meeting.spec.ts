import {test,expect,me,alex} from './fixtures';
import {directoryKey} from '../../src/lib/people';
async function open(page:any){await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button',{name:'New meeting',exact:true}).click();}
async function fill(page:any){await page.getByLabel('Subject',{exact:true}).fill('Room planning');await page.getByLabel('Start date',{exact:true}).fill('2026-11-20');await page.getByLabel('Start time',{exact:true}).fill('10:00');await page.getByLabel('End date',{exact:true}).fill('2026-11-20');await page.getByLabel('End time',{exact:true}).fill('11:00');await page.getByLabel('Attendees',{exact:true}).fill('alex@example.test');}
test('room discovery, availability and saved drafts are read-only until confirmation',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await open(page);await fill(page);await page.getByRole('button').filter({hasText:'River room'}).click();await page.getByRole('button',{name:'Check availability',exact:true}).click();await expect(page.locator('.meeting-summary .availability').filter({hasText:'River room'}).getByText('Free at the requested time')).toBeVisible();expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Close editor',exact:true}).click();await page.getByRole('button',{name:'New meeting',exact:true}).click();await expect(page.getByLabel('Subject',{exact:true})).toHaveValue('Room planning');await expect(page.locator('.room-picker h3')).toHaveText('River room');
 await page.getByRole('button',{name:'Review meeting',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('not booked until the room accepts');await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Review meeting',exact:true}).click();await page.getByRole('button',{name:'Create & send invitations',exact:true}).click();await expect(page.locator('.event-details')).toContainText('Room planning');expect(graph.writes.filter(c=>c.command==='calendar_create')).toHaveLength(1);expect(graph.writes[0].args.draft.room.emailAddress).toBe('room@example.test');expect(graph.writes[0].args.draft.start).toMatch(/Z$/);
});
test('uncertain creation survives reload and cannot be sent again',async({page,graph})=>{
 graph.restoredSession=true;graph.meetingResult={status:'uncertain',error:'Creation unconfirmed. Check Outlook.'};await page.goto('/');await open(page);await fill(page);await page.getByRole('button',{name:'Review meeting',exact:true}).click();await page.getByRole('button',{name:'Create & send invitations',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Creation unconfirmed');await page.reload();await open(page);await expect(page.getByRole('button',{name:'Review meeting',exact:true})).toBeDisabled();expect(graph.writes.filter(c=>c.command==='calendar_create')).toHaveLength(1);
});

test('cached attendee autocomplete and live summary remain read-only and invalidate old availability',async({page,graph})=>{
 graph.restoredSession=true;
 await page.addInitScript(({key,rows})=>localStorage.setItem(key,JSON.stringify({rows})),{key:directoryKey(me.id),rows:[alex]});
 await page.goto('/');await open(page);await fill(page);
 const composer=page.locator('.meeting-composer');
 await expect(composer).toHaveCSS('display','block');
 const header=await composer.locator(':scope > header').boundingBox();
 const subject=await page.getByLabel('Subject',{exact:true}).boundingBox();
 expect(header).not.toBeNull();expect(subject).not.toBeNull();
 expect(subject!.y).toBeGreaterThan(header!.y+header!.height);
 expect(subject!.x).toBeLessThan(header!.x+80);
 const attendee=page.getByRole('combobox',{name:'Attendees',exact:true});await attendee.fill('Alex');await page.getByRole('option',{name:'Alex Example alex@example.com'}).click();
 await expect(attendee).toHaveValue('alex@example.com; ');await expect(page.getByRole('complementary',{name:'Meeting summary'})).toContainText('alex@example.com');
 await page.getByRole('button',{name:'Check availability',exact:true}).click();await expect(page.locator('.meeting-summary')).toContainText('Free at the requested time');
 await page.getByLabel('End date',{exact:true}).fill('2026-11-20');await page.getByLabel('End time',{exact:true}).fill('12:00');await expect(page.locator('.meeting-summary')).toContainText('Check availability again');await expect(page.locator('.meeting-summary .availability')).toHaveCount(0);
 await page.getByRole('button',{name:'Close meeting summary'}).click();await expect(page.locator('.meeting-summary')).toHaveCount(0);await page.getByRole('button',{name:'Show meeting summary'}).click();await expect(page.locator('.meeting-summary')).toContainText('Room planning');expect(graph.writes).toEqual([]);
});

test('new meeting review stays visible when the form is scrolled',async({page,graph})=>{await page.setViewportSize({width:1280,height:650});graph.restoredSession=true;await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button',{name:'New meeting',exact:true}).click();const editor=page.getByRole('region',{name:'New meeting',exact:true});await editor.evaluate(node=>node.scrollTop=node.scrollHeight);await expect(editor.getByRole('button',{name:'Review meeting',exact:true})).toBeInViewport();await expect(editor.getByRole('button',{name:'Close editor',exact:true})).toBeInViewport();expect(graph.writes).toEqual([]);});
