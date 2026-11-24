import {test,expect} from './fixtures';
test('OneDrive browsing uses explicit folder navigation and downloads without Graph writes',async({page,graph},info)=>{
 graph.restoredSession=true;await page.goto('/');await page.getByRole('button',{name:'Files',exact:true}).click();
 const files=page.getByRole('region',{name:'Files',exact:true});await expect(files).toContainText('Project notes.pdf');expect(graph.calls.some(c=>c.command==='files_download')).toBe(false);
 await files.getByRole('article',{name:'Documents',exact:true}).getByRole('button').first().click();await expect.poll(()=>graph.calls.filter(c=>c.command==='files_page').at(-1)?.args.query.folder).toBe('folder-one');
 await files.getByRole('navigation',{name:'OneDrive folders'}).getByRole('button',{name:'My OneDrive'}).click();await expect.poll(()=>graph.calls.filter(c=>c.command==='files_page').at(-1)?.args.query.folder).toBeNull();
 await files.getByRole('article',{name:'Project notes.pdf',exact:true}).getByRole('button',{name:'Download Project notes.pdf'}).click();await expect(files.getByRole('status')).toContainText('downloaded');
 await page.screenshot({path:info.outputPath('onedrive-list.png')});expect(graph.writes).toEqual([]);
});
test('Files search is independent from mail consent and opens its containing folder',async({page,graph})=>{
 graph.restoredSession=true;graph.mailPermitted=false;await page.goto('/');await page.getByRole('button',{name:'Search chats, mail and files',exact:true}).click();const search=page.getByRole('dialog',{name:'Search chats, mail and files'});
 await search.getByRole('textbox').fill('Project');await search.getByRole('button',{name:'Search',exact:true}).click();await expect(search).toContainText('Mail search needs');
 await search.getByRole('article',{name:'Project notes.pdf',exact:true}).getByRole('button').first().click();await expect(page.getByRole('region',{name:'Files',exact:true})).toBeVisible();await expect.poll(()=>graph.calls.filter(c=>c.command==='files_page').at(-1)?.args.query.folder).toBe('folder-one');expect(graph.writes).toEqual([]);
});
test('OneDrive read failures are retryable and navigation remains available',async({page,graph})=>{
 graph.restoredSession=true;graph.filesError='OneDrive unavailable';await page.goto('/');await page.getByRole('button',{name:'Files',exact:true}).click();await expect(page.getByRole('alert')).toContainText('OneDrive unavailable');graph.filesError='';await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('article',{name:'Documents'})).toBeVisible();await page.getByRole('button',{name:'People',exact:true}).click();await expect(page.getByRole('region',{name:'Files',exact:true})).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('file pages merge without duplicates and download cancel/errors remain local',async({page,graph})=>{
 graph.restoredSession=true;graph.filesNext='mock-next';graph.fileNextRows=[graph.fileRows[1],{...graph.fileRows[1],id:'another',name:'Another file.pdf'}];await page.goto('/');await page.getByRole('button',{name:'Files',exact:true}).click();await page.getByRole('button',{name:'Load more files'}).click();await expect(page.getByRole('article')).toHaveCount(3);await expect(page.getByRole('button',{name:'Load more files'})).toHaveCount(0);
 graph.filesDownloadResult=false;await page.getByRole('button',{name:'Download Project notes.pdf'}).click();await expect(page.getByRole('status')).toContainText('Download cancelled');graph.filesActionError='File unavailable';await page.getByRole('button',{name:'Download Project notes.pdf'}).click();await expect(page.getByRole('alert')).toContainText('File unavailable');expect(graph.writes).toEqual([]);
});
test('shared shortcuts use browser action and OneDrive search errors do not hide mail',async({page,graph})=>{
 graph.restoredSession=true;graph.fileRows=[{...graph.fileRows[1],shortcut:true}];await page.goto('/');await page.getByRole('button',{name:'Files',exact:true}).click();await expect(page.getByRole('button',{name:'Download Project notes.pdf'})).toHaveCount(0);await page.getByRole('button',{name:'Open Project notes.pdf in browser'}).click();expect(graph.calls.filter(c=>c.command==='files_open')).toHaveLength(1);await page.getByRole('article',{name:'Project notes.pdf'}).getByRole('button').first().click();await expect.poll(()=>graph.calls.filter(c=>c.command==='files_open').length).toBe(2);
 graph.filesError='OneDrive search unavailable';await page.getByRole('button',{name:'Search chats, mail and files',exact:true}).click();const search=page.getByRole('dialog',{name:'Search chats, mail and files'});await search.getByRole('textbox').fill('Project');await search.getByRole('button',{name:'Search',exact:true}).click();await expect(search).toContainText('OneDrive search unavailable');await expect(search.getByRole('button',{name:/MAIL/})).toBeVisible();expect(graph.writes).toEqual([]);
});

test('List and Icons views persist and type filtering only changes loaded items',async({page,graph},info)=>{
 graph.restoredSession=true;graph.fileRows.push({...graph.fileRows[1],id:'sheet',name:'Budget.xlsx'},{...graph.fileRows[1],id:'photo',name:'Photo.jpg',mime:'image/jpeg'},{...graph.fileRows[1],id:'zip',name:'Backup.zip'});await page.goto('/');await page.getByRole('button',{name:'Files',exact:true}).click();
 await expect(page.getByRole('button',{name:'List view'})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.column-headings')).toContainText('Modified');await page.getByRole('button',{name:'Icons view'}).click();await expect(page.locator('.file-list')).toHaveClass(/icon-grid/);await expect(page.locator('[data-kind=sheet]')).toHaveCount(1);await expect(page.locator('[data-kind=image]')).toHaveCount(1);
 const before=graph.calls.filter(c=>c.command==='files_page').length;await page.getByLabel('Filter loaded items',{exact:true}).selectOption('pdf');await expect(page.getByRole('article')).toHaveCount(1);await expect(page.getByRole('article',{name:'Project notes.pdf'})).toBeVisible();expect(graph.calls.filter(c=>c.command==='files_page')).toHaveLength(before);
 await page.getByLabel('Filter loaded items',{exact:true}).selectOption('audio');await expect(page.getByText('No loaded items match this type.',{exact:true})).toBeVisible();await page.getByLabel('Filter loaded items',{exact:true}).selectOption('all');
 await page.screenshot({path:info.outputPath('files-icons.png')});await page.reload();await page.getByRole('button',{name:'Files',exact:true}).click();await expect(page.getByRole('button',{name:'Icons view'})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'List view'}).click();await page.screenshot({path:info.outputPath('files-list.png')});expect(graph.writes).toEqual([]);
});
