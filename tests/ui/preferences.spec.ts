import {test,expect,signIn} from './fixtures';
const category=(page:import('@playwright/test').Page,name:string)=>page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name,exact:true});
test('categorized preferences preserve unfinished forms and keep footer reachable',async({page,graph},info)=>{
 await signIn(page);await page.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page.getByRole('region',{name:'Appearance preferences',exact:true})).toBeVisible();
 await category(page,'Away replies').click();
 await page.getByRole('textbox',{name:'Away message',exact:true}).fill('Keep this unfinished message');
 await category(page,'Presence & status').click();
 await page.getByLabel('Status',{exact:true}).selectOption('away');
 await category(page,'Appearance').click();
 await page.getByRole('group',{name:'Appearance',exact:true}).getByRole('radio',{name:'Light',exact:true}).check();
 await page.screenshot({path:info.outputPath('preferences-light.png')});
 await category(page,'Away replies').click();await expect(page.getByRole('textbox',{name:'Away message',exact:true})).toHaveValue('Keep this unfinished message');
 await category(page,'Presence & status').click();await expect(page.getByLabel('Status',{exact:true})).toHaveValue('away');
 await category(page,'Account').click();const signOut=page.getByRole('dialog').getByRole('button',{name:'Sign out',exact:true});await expect(signOut).toBeVisible();
 expect(await signOut.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'Done',exact:true})).toBeInViewport();expect(graph.writes).toEqual([]);
});
test('preferences fit a small window with keyboard accessible segmented choices',async({page,graph},info)=>{
 await page.setViewportSize({width:620,height:600});await signIn(page);await page.getByRole('button',{name:'Settings',exact:true}).click();
 const group=page.getByRole('group',{name:'Appearance',exact:true});const system=group.getByRole('radio',{name:'System',exact:true});
 await system.focus();await page.keyboard.press('ArrowRight');await expect(group.getByRole('radio',{name:'Light',exact:true})).toBeChecked();
 await expect(page.getByRole('button',{name:'Done',exact:true})).toBeInViewport();
 const bounds=await page.getByRole('dialog',{name:'TAUT preferences'}).boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(600);
 await page.screenshot({path:info.outputPath('preferences-small.png')});expect(graph.writes).toEqual([]);
});
