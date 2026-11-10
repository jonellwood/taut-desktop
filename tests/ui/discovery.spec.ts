import {test,expect,signIn} from './fixtures';
test('unified search finds chat and mail without writes and preserves the chat draft',async({page,graph})=>{
 await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep this draft');
 await page.getByRole('button',{name:'Search chats and mail',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Search chats and mail'});
 await dialog.getByRole('textbox').fill('Alex');await dialog.getByRole('button',{name:'Search',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:/Chats/})).toBeVisible();
 await expect(dialog.locator('.result').filter({hasText:'CHAT ·'}).first()).toBeVisible();
 await dialog.getByRole('button',{name:'Close unified search'}).click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep this draft');
 await page.getByRole('button',{name:'Search chats and mail',exact:true}).click();
 await dialog.getByRole('textbox').fill('project');await dialog.getByRole('button',{name:'Search',exact:true}).click();
 await dialog.locator('.result').filter({hasText:'MAIL ·'}).first().click();
 await expect(page.locator('.mail-body')).toContainText('Let me know what you think.');expect(graph.writes).toEqual([]);
});
test('mail permission failure leaves local chat search usable and Escape closes search',async({page,graph})=>{
 await signIn(page);graph.mailPermitted=false;await page.getByRole('button',{name:'Search chats and mail',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Search chats and mail'});
 await dialog.getByRole('textbox').fill('Alex');await dialog.getByRole('button',{name:'Search',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Mail.Read');await expect(dialog.locator('.result').first()).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(graph.writes).toEqual([]);
});
