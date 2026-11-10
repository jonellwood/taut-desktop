import {test,expect,signIn} from './fixtures';
test('toolbar starts visible and remembers hide/show across composers and restart',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:/^AE Alex Example/}).click();
 const format=page.getByRole('button',{name:'Format',exact:true});await expect(format).toHaveAttribute('aria-pressed','true');await format.click();await expect(page.getByRole('button',{name:'Bold',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Mail',exact:true}).click();await page.getByRole('button',{name:'New email',exact:true}).click();await expect(format).toHaveAttribute('aria-pressed','false');await format.click();await expect(page.getByRole('button',{name:'Bold',exact:true})).toBeVisible();
 await page.reload();await signIn(page);await page.getByRole('button',{name:/^AE Alex Example/}).click();await expect(format).toHaveAttribute('aria-pressed','true');expect(graph.writes).toEqual([]);
});

test('visible mail toolbar enables formatted sending when a format is chosen',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'Mail',exact:true}).click();await page.getByRole('button',{name:'New email',exact:true}).click();
 await page.getByRole('textbox',{name:'To',exact:true}).fill('alex@example.test');await page.getByRole('textbox',{name:'Email subject'}).fill('Formatted');await page.getByRole('button',{name:'Bold',exact:true}).click();await expect(page.getByRole('textbox',{name:'Email message'})).toHaveValue('**bold text**');
 await page.getByRole('button',{name:'Review & send'}).click();await page.getByRole('button',{name:'Send email',exact:true}).click();await expect(page.getByRole('status')).toContainText('Accepted for sending');const send=graph.calls.find(c=>c.command==='mail_send_new');expect(send?.args.draft.contentType).toBe('HTML');expect(send?.args.draft.content).toContain('<strong>bold text</strong>');
});
