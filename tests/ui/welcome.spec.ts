import {test,expect,row,alex} from './fixtures';

test('welcome replaces empty conversation chrome without reading chats',async({page,graph},info)=>{
 graph.restoredSession=true;
 await page.goto('/');
 const welcome=page.getByRole('region',{name:'Welcome to TAUT'});
 await expect(welcome).toBeVisible();
 await expect(welcome.getByRole('heading',{name:'Less noise. More signal.'})).toBeVisible();
 await expect(page.locator('.conversation-header,.composer,.details')).toHaveCount(0);
 expect(graph.calls.some(c=>c.command==='graph_messages')).toBe(false);expect(graph.writes).toEqual([]);
 await page.screenshot({path:info.outputPath('welcome.png'),animations:'disabled'});
 await welcome.getByRole('button',{name:'Start a conversation',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'New conversation',exact:true})).toBeVisible();
 expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await row(page,alex.displayName).click();
 await expect(page.locator('.conversation-header')).toContainText(alex.displayName);
 await expect(page.locator('.composer')).toBeVisible();await expect(page.locator('.details')).toBeVisible();
 await expect(welcome).toHaveCount(0);
});

test('welcome search restores collapsed sidebar and focuses conversation filter',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');
 await expect(page.getByRole('region',{name:'Welcome to TAUT'})).toBeVisible();
 await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
 await page.getByRole('button',{name:'Search conversations',exact:false}).click();
 await expect(page.getByRole('textbox',{name:'Search conversations',exact:true})).toBeFocused();
 await page.getByRole('textbox',{name:'Search conversations',exact:true}).fill('Alex');
 await expect(row(page,alex.displayName)).toBeVisible();
 expect(graph.writes).toEqual([]);
});

test('reduced motion shows a still mark and controls fit a short window',async({page,graph},info)=>{
 graph.restoredSession=true;await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1100,height:650});
 await page.goto('/');await expect(page.getByRole('region',{name:'Welcome to TAUT'})).toBeVisible();
 expect(await page.locator('.signal-mark path').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await expect(page.getByRole('button',{name:'Start a conversation',exact:true})).toBeInViewport();
 await page.screenshot({path:info.outputPath('welcome-short-reduced-motion.png')});expect(graph.writes).toEqual([]);
});
