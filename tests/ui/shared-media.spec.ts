import {test,expect,signIn,message,row,blair,image} from './fixtures';

test('signed out has a quiet welcome and no sample conversations, including after sign out',async({page,graph})=>{
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Connect Microsoft 365'})).toBeVisible();
 await expect(page.locator('.chat-row,.composer,.details')).toHaveCount(0);
 await expect(page.getByText('MOCK DATA',{exact:true})).toHaveCount(0);
 await signIn(page);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('button',{name:'Connect Microsoft 365'})).toBeVisible();
 await expect(page.locator('.chat-row,.composer,.details')).toHaveCount(0);
 expect(graph.writes).toEqual([]);
});

test('shared media indexes loaded history and opens only explicitly selected resources',async({page,graph})=>{
 const shared=message('resources','<p><a href="https://example.com/docs">Project docs</a></p><pre><code>https://example.com/code-only</code></pre><img src="../hostedContents/image-1/$value"/>');
 shared.attachments=[{id:'file',name:'Guide.pdf',contentType:'reference',contentUrl:'https://example.sharepoint.com/Guide.pdf'}];
 graph.messages['chat-alex']=[shared,{...message('deleted','<a href="https://example.com/deleted">Deleted link</a>'),deletedDateTime:'2026-01-02T00:00:00Z'}];
 await signIn(page);
 const media=page.getByRole('region',{name:'Shared media',exact:true});
 await expect(media.getByRole('button',{name:'Images (1)',exact:true})).toBeVisible();
 expect(graph.calls.filter(c=>c.command==='graph_hosted_image')).toHaveLength(0);
 await media.getByRole('button',{name:/Image ·/}).click();
 await expect(page.locator('.image-lightbox img')).toHaveAttribute('src',image);
 await page.keyboard.press('Escape');
 await media.getByRole('button',{name:'Files (1)',exact:true}).click();
 await media.getByRole('button',{name:/Guide.pdf/}).click();
 await media.getByRole('button',{name:'Links (1)',exact:true}).click();
 await media.getByRole('button',{name:/Project docs/}).click();
 await expect.poll(()=>graph.calls.filter(c=>c.command==='plugin:opener|open_url').length).toBe(2);
 await row(page,blair.displayName).click();
 await expect(media.getByRole('button',{name:'Images (0)',exact:true})).toBeVisible();
 expect(graph.writes).toEqual([]);
});
