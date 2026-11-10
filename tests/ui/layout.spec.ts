import {test,expect,row,alex} from './fixtures';
const toolbar=(page:import('@playwright/test').Page)=>page.getByRole('toolbar',{name:'Workspace layout'});

test('layout toolbar controls persist and remain available on the welcome screen',async({page,graph},info)=>{
 graph.restoredSession=true;await page.goto('/');
 await expect(page.getByRole('region',{name:'Welcome to TAUT'})).toBeVisible();
 const bar=toolbar(page);
 await expect(bar.getByRole('button',{name:'Toggle conversation sidebar'})).toHaveAttribute('aria-pressed','true');
 await bar.getByRole('button',{name:'Toggle conversation sidebar'}).click();
 await expect(page.getByRole('complementary',{name:'Conversations',exact:true})).toHaveCount(0);
 await page.reload();await expect(page.getByRole('region',{name:'Welcome to TAUT'})).toBeVisible();
 await expect(bar.getByRole('button',{name:'Toggle conversation sidebar'})).toHaveAttribute('aria-pressed','false');
 await expect(page.getByRole('complementary',{name:'Conversations',exact:true})).toHaveCount(0);
 await bar.getByRole('button',{name:'Toggle conversation sidebar'}).click();
 await expect(row(page,alex.displayName)).toBeVisible();
 await page.screenshot({path:info.outputPath('layout-welcome.png'),animations:'disabled'});expect(graph.writes).toEqual([]);
});

test('focus mode restores the previous panel arrangement and preserves the conversation draft',async({page,graph},info)=>{
 graph.restoredSession=true;await page.goto('/');await row(page,alex.displayName).click();
 const bar=toolbar(page);const message=page.getByRole('textbox',{name:'Message',exact:true});
 await message.fill('Keep my focus draft');
 await bar.getByRole('button',{name:'Toggle details panel'}).click();
 await bar.getByRole('button',{name:'Focus mode',exact:true}).click();
 await expect(bar.getByRole('button',{name:'Focus mode',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.sidebar,.details')).toHaveCount(0);await expect(message).toHaveValue('Keep my focus draft');
 await page.screenshot({path:info.outputPath('layout-focus.png')});
 await bar.getByRole('button',{name:'Focus mode',exact:true}).click();
 await expect(page.locator('.sidebar')).toBeVisible();await expect(page.locator('.details')).toHaveCount(0);
 await expect(message).toHaveValue('Keep my focus draft');expect(graph.writes).toEqual([]);
 await bar.getByRole('button',{name:'Focus mode',exact:true}).click();await page.reload();
 await expect(page.getByRole('region',{name:'Welcome to TAUT'})).toBeVisible();
 await expect(bar.getByRole('button',{name:'Focus mode',exact:true})).toHaveAttribute('aria-pressed','true');
 await bar.getByRole('button',{name:'Focus mode',exact:true}).click();
 await expect(page.locator('.sidebar')).toBeVisible();await expect(bar.getByRole('button',{name:'Toggle details panel'})).toHaveAttribute('aria-pressed','false');
 expect(graph.writes).toEqual([]);
});

test('invalid saved layout falls back safely and selected chat details can be toggled',async({page,graph})=>{
 graph.restoredSession=true;await page.addInitScript(()=>localStorage.setItem('taut.layout.v1','{"sidebar":"bad"}'));await page.goto('/');
 await expect(row(page,alex.displayName)).toBeVisible();await row(page,alex.displayName).click();
 await expect(page.locator('.details')).toBeVisible();
 await toolbar(page).getByRole('button',{name:'Toggle details panel'}).click();await expect(page.locator('.details')).toHaveCount(0);
 await toolbar(page).getByRole('button',{name:'Toggle details panel'}).click();await expect(page.locator('.details')).toBeVisible();expect(graph.writes).toEqual([]);
});

test('chat and channel navigation reveals the collapsed sidebar without opening a chat or losing drafts',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await row(page,alex.displayName).click();
 const draft=page.getByRole('textbox',{name:'Message',exact:true});await draft.fill('Keep chat draft');
 const bar=toolbar(page);await bar.getByRole('button',{name:'Toggle conversation sidebar'}).click();
 await expect(page.locator('.sidebar')).toHaveCount(0);
 await page.getByRole('button',{name:'Chats',exact:true}).click();await expect(page.locator('.sidebar')).toBeVisible();
 await expect(draft).toHaveValue('Keep chat draft');
 await bar.getByRole('button',{name:'Focus mode',exact:true}).click();
 await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();
 await expect(page.getByRole('complementary',{name:'Teams and channels browser',exact:true})).toBeVisible();
 await expect(bar.getByRole('button',{name:'Focus mode',exact:true})).toHaveAttribute('aria-pressed','false');
 await expect(bar.getByRole('button',{name:'Toggle details panel'})).toHaveAttribute('aria-pressed','false');
 await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 await page.getByRole('textbox',{name:'New channel post',exact:true}).fill('Keep channel draft');
 await bar.getByRole('button',{name:'Toggle conversation sidebar'}).click();
 await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();
 await expect(page.getByRole('complementary',{name:'Teams and channels browser',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'New channel post',exact:true})).toHaveValue('Keep channel draft');
 await bar.getByRole('button',{name:'Toggle conversation sidebar'}).click();
 await page.getByRole('button',{name:'Chats',exact:true}).click();await expect(row(page,alex.displayName)).toBeVisible();await expect(draft).toHaveValue('Keep chat draft');
 expect(graph.writes).toEqual([]);
});
