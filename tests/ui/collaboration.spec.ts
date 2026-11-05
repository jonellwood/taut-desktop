import {test,expect,signIn,me,alex} from './fixtures';
test('presence is read-only until explicit status apply; uncertain status never repeats',async({page,graph},info)=>{
 graph.collaboration.readPresence=true;graph.collaboration.writePresence=true;
 await signIn(page);await expect(page.locator('.header-person small')).toHaveText('Available');expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Your status and preferences'}).click();
 const status=page.getByRole('region',{name:'Your presence',exact:true});await status.getByLabel('Status',{exact:true}).selectOption('dnd');
 graph.allowWrites=true;graph.presenceStatus='uncertain';await status.getByRole('button',{name:'Apply status',exact:true}).click();
 await expect(status.getByRole('alert')).toContainText('not confirmed');await expect(status.getByRole('button',{name:'Apply status',exact:true})).toBeDisabled();
 await page.screenshot({path:info.outputPath('own-status.png')});expect(graph.calls.filter(c=>c.command==='graph_set_presence')).toHaveLength(1);expect(graph.calls.find(c=>c.command==='graph_set_presence')?.args).toEqual({ownId:me.id,status:'dnd',minutes:60});
});
test('away replies default to DMs and enabling requires an explicit settings save',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'Settings',exact:true}).click();const away=page.getByRole('region',{name:'Away replies',exact:true});
 for(const box of await away.getByRole('checkbox').all())await expect(box).not.toBeChecked();await away.getByRole('textbox',{name:'Away message',exact:true}).fill('Back tomorrow.');expect(graph.writes).toEqual([]);
 graph.allowWrites=true;await away.getByRole('button',{name:'Enable away replies',exact:true}).click();await expect(away.getByRole('button',{name:'Disable away replies'})).toBeVisible();await expect(page.getByRole('button',{name:'Disable away replies now',exact:true})).toBeVisible();expect(graph.awayConfig.groups).toBe(false);expect(graph.awayConfig.channels).toBe(false);
 await away.getByRole('button',{name:'Disable away replies'}).click();await expect(away.getByRole('button',{name:'Enable away replies'})).toBeVisible();expect(graph.calls.filter(c=>c.command==='away_configure')).toHaveLength(2);
});
test('membership changes explain team-wide scope and require confirmation',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();await page.getByRole('button',{name:'Manage members',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Manage membership',exact:true});await expect(dialog).toContainText('entire team');expect(graph.writes).toEqual([]);
 await dialog.getByRole('button',{name:'Remove',exact:true}).click();await expect(dialog.getByRole('region',{name:'Confirm membership change'})).toContainText('standard channels');expect(graph.writes).toEqual([]);
 graph.allowWrites=true;graph.memberStatus='uncertain';await dialog.getByRole('button',{name:'Confirm remove'}).click();await expect(dialog.getByRole('alert')).toContainText('not confirmed');await expect(dialog.getByRole('button',{name:'Remove',exact:true})).toBeDisabled();expect(graph.calls.find(c=>c.command==='collaboration_member_change')?.args.userId).toBe(alex.id);
});
