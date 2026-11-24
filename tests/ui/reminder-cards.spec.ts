import {test,expect} from './fixtures';
const sample={key:'card-one',title:'Project planning',start:Date.parse('2026-11-23T15:30:00Z'),allDay:false,room:'River room',canJoin:true};
for(const action of ['join','open','snooze','dismiss'])test(`corner card ${action} is explicit and never sends a Graph write`,async({page,graph},info)=>{
 await page.setViewportSize({width:400,height:410});graph.reminderCards=[sample];await page.clock.setFixedTime(new Date('2026-11-23T15:15:00Z'));await page.goto('/?surface=reminders');const card=page.getByRole('article',{name:'Project planning'});await expect(card).toContainText('Starts in 15 minutes');await expect(card).toContainText('River room');await expect(card).not.toContainText('-05:00');expect(graph.reminderActions).toEqual([]);expect(graph.calls.some(c=>c.command==='graph_profile')).toBe(false);
 if(action==='open')await page.screenshot({path:info.outputPath('reminder-card.png')});
 const label=({join:'Join Teams',open:'Open meeting',snooze:'Snooze 5 min',dismiss:'Dismiss Project planning'} as any)[action];await card.getByRole('button',{name:label,exact:true}).click();await expect(card).toHaveCount(0);expect(graph.reminderActions).toEqual([{key:'card-one',action}]);expect(graph.writes).toEqual([]);
});
test('simultaneous meetings stack and offline meetings have no Join action',async({page,graph})=>{graph.reminderCards=[{...sample,canJoin:false},{...sample,key:'second',title:'Another meeting'}];await page.goto('/?surface=reminders');await expect(page.getByRole('article')).toHaveCount(2);await expect(page.getByRole('article',{name:'Project planning'}).getByRole('button',{name:'Join Teams'})).toHaveCount(0);expect(graph.reminderActions).toEqual([]);});

test('failed card action stays visible and explains the failure',async({page,graph})=>{graph.reminderCards=[sample];graph.reminderActionError='Meeting changed. Review it in Calendar.';await page.goto('/?surface=reminders');await page.getByRole('button',{name:'Open meeting'}).click();await expect(page.getByRole('alert')).toContainText('Meeting changed');await expect(page.getByRole('article')).toHaveCount(1);expect(graph.writes).toEqual([]);});
for(const theme of ['light','dark'])test(`reminder card fits its native dimensions in ${theme}`,async({page,graph},info)=>{await page.setViewportSize({width:400,height:410});await page.clock.setFixedTime(new Date('2026-11-23T15:15:00Z'));graph.reminderCards=[sample];await page.goto('/?surface=reminders');await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await expect(page.getByRole('button',{name:'Snooze 5 min'})).toBeInViewport();await page.screenshot({path:info.outputPath(`card-${theme}.png`)});});

for(const theme of ['light','dark'])test(`compact cards retain actions and fit a smaller window in ${theme}`,async({page,graph},info)=>{
 await page.clock.setFixedTime(new Date('2026-11-23T15:15:00Z'));graph.reminderSettings.compact=true;graph.reminderCards=[sample];await page.setViewportSize({width:400,height:295});await page.goto('/?surface=reminders');await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
 await expect(page.locator('main')).toHaveClass(/compact/);for(const name of ['Join Teams','Open meeting','Snooze 5 min','Dismiss Project planning'])await expect(page.getByRole('button',{name,exact:true})).toBeInViewport();
 await page.screenshot({path:info.outputPath(`compact-${theme}.png`)});graph.reminderSettings.compact=false;await page.clock.runFor(1100);await expect(page.locator('main')).not.toHaveClass(/compact/);expect(graph.reminderActions).toEqual([]);expect(graph.writes).toEqual([]);
});

test('sample preview is labeled, has no live meeting actions, and dismisses independently',async({page,graph})=>{
 graph.reminderCards=[sample,{...sample,key:'preview',title:'Your next meeting',preview:true} as any];await page.goto('/?surface=reminders');const preview=page.getByRole('article',{name:'Your next meeting'});await expect(preview).toContainText('Reminder preview');
 for(const name of ['Join Teams','Open meeting','Snooze 5 min'])await expect(preview.getByRole('button',{name,exact:true})).toBeDisabled();
 await preview.getByRole('button',{name:'Dismiss Your next meeting',exact:true}).click();await expect(preview).toHaveCount(0);await expect(page.getByRole('article',{name:'Project planning'})).toBeVisible();expect(graph.writes).toEqual([]);
});
