import {test,expect} from './fixtures';
test('own calendar conflicts are advisory during composition and review',async({page,graph})=>{
 graph.restoredSession=true;Object.assign(graph.calendarEvents[0],{subject:'Existing appointment',start:{dateTime:'2026-11-23T17:00:00Z',timeZone:'UTC'},end:{dateTime:'2026-11-23T17:30:00Z',timeZone:'UTC'},showAs:'busy',isCancelled:false});
 await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button',{name:'New meeting',exact:true}).click();
 await page.getByLabel('Start date',{exact:true}).fill('2026-11-23');await page.getByLabel('Start time',{exact:true}).fill('12:15');await page.getByLabel('Subject',{exact:true}).fill('Intentional overlap');
 await expect(page.getByLabel('Your calendar conflicts')).toContainText('Existing appointment');await page.getByRole('button',{name:'Review meeting',exact:true}).click();
 const review=page.getByRole('dialog',{name:'Create this meeting?',exact:true});await expect(review).toContainText('You can still schedule');await expect(review.getByRole('button',{name:'Create & send invitations',exact:true})).toBeEnabled();expect(graph.writes).toEqual([]);
});

test('failed checks never claim free time and moving outside the overlap clears the warning',async({page,graph})=>{
 graph.restoredSession=true;Object.assign(graph.calendarEvents[0],{subject:'Tentative appointment',start:{dateTime:'2026-11-23T17:00:00Z',timeZone:'UTC'},end:{dateTime:'2026-11-23T17:30:00Z',timeZone:'UTC'},showAs:'tentative',isCancelled:false});
 await page.goto('/');await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('button',{name:'New meeting',exact:true}).click();await page.getByLabel('Start date',{exact:true}).fill('2026-11-23');await page.getByLabel('Start time',{exact:true}).fill('12:15');
 const notice=page.getByLabel('Your calendar conflicts');await expect(notice).toContainText('Possible conflict');await page.clock.runFor(600);await expect(notice).toContainText('Checked against your current calendar.');graph.calendarError='Unavailable';
 await page.getByLabel('Start time',{exact:true}).fill('13:00');await page.clock.runFor(600);await expect(notice).toContainText('could not be fully checked');await expect(notice).not.toContainText('No overlapping');await expect(notice).not.toContainText('Tentative appointment');expect(graph.writes).toEqual([]);
});
