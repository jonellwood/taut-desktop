import {test,expect,signIn} from './fixtures';
test('People searches deliberately, shows presence and opens chat without writes',async({page,graph})=>{
 graph.collaboration.readPresence=true;await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();
 const directory=page.getByRole('region',{name:'People directory'});
 await directory.getByLabel('Find a coworker',{exact:true}).fill('Alex');
 expect(graph.calls.filter(c=>c.command==='graph_search_users')).toHaveLength(0);
 await directory.getByRole('button',{name:'Search',exact:true}).click();
 await directory.getByRole('button',{name:/Alex Example/}).click();
 const profile=page.getByRole('region',{name:'Coworker profile'});await expect(profile).toContainText('alex@example.com');await expect(profile).toContainText('Available');
 expect(graph.writes).toEqual([]);await profile.getByRole('button',{name:'Chat',exact:true}).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
});
test('People Email creates one local addressed draft and preserves it on navigation',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();await page.getByLabel('Find a coworker',{exact:true}).fill('Blair');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:/Blair Example/}).click();await page.getByRole('region',{name:'Coworker profile'}).getByRole('button',{name:'Email',exact:true}).click();await expect(page.getByRole('combobox',{name:'To',exact:true})).toHaveValue('blair@example.com');
 await page.getByRole('textbox',{name:'Email subject'}).fill('Keep this draft');await page.getByRole('button',{name:'Chats',exact:true}).click();await page.getByRole('button',{name:'Mail',exact:true}).click();await expect(page.getByText('1 local drafts',{exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
});
test('People handles empty results and has no fake directory before sign in',async({page,graph})=>{
 await page.goto('/');await page.getByRole('button',{name:'People',exact:true}).click();await expect(page.getByRole('heading',{name:'Your coworkers, within reach.'})).toBeVisible();expect(graph.calls.filter(c=>c.command==='graph_search_users')).toHaveLength(0);
 await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();await page.getByLabel('Find a coworker',{exact:true}).fill('Nobody');await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page.getByText('No coworkers found. Try a different name or filter.')).toBeVisible();expect(graph.writes).toEqual([]);
});

test('People opens a pending chat for a new coworker without creating it',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();await page.getByLabel('Find a coworker',{exact:true}).fill('Casey');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:/Casey Example/}).click();await page.getByRole('region',{name:'Coworker profile'}).getByRole('button',{name:'Chat',exact:true}).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeVisible();expect(graph.writes).toEqual([]);
});
test('People clear resets results and copy email writes only to clipboard',async({page,graph})=>{
 await signIn(page);await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{(window as any).__copiedEmail=value;}}});});
 await page.getByRole('button',{name:'People',exact:true}).click();await page.getByLabel('Find a coworker',{exact:true}).fill('Alex');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:/Alex Example/}).click();await page.getByRole('button',{name:'Copy email address'}).click();await expect(page.getByText('Email copied',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).__copiedEmail)).toBe('alex@example.com');
 await page.getByRole('button',{name:'Clear coworker search'}).click();await expect(page.getByLabel('Find a coworker',{exact:true})).toHaveValue('');await expect(page.getByLabel('Find a coworker',{exact:true})).toBeFocused();await expect(page.getByRole('region',{name:'Find coworkers'}).getByRole('button',{name:/Alex Example/})).toBeVisible();expect(graph.writes).toEqual([]);
});

test('People shows richer profiles, filters locally and restores the directory panel',async({page,graph},testInfo)=>{
 await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();
 await page.getByLabel('Department',{exact:true}).selectOption('Technology');
 await page.getByRole('button',{name:/Alex Example/}).click();
 const profile=page.getByRole('region',{name:'Coworker profile'});
 await expect(profile).toContainText('Main office');await expect(profile).toContainText('1234');await expect(profile).toContainText('Manager');
 await expect(page.getByRole('complementary',{name:'Shared connections'})).toContainText('Chats · 1');
 await page.screenshot({path:testInfo.outputPath('people.png')});
 await page.getByRole('button',{name:'Toggle conversation sidebar'}).click();await expect(page.getByLabel('Find a coworker',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'People',exact:true}).click();await expect(page.getByLabel('Find a coworker',{exact:true})).toBeVisible();
 expect(graph.writes).toEqual([]);
});
test('People keeps cached roster when background refresh fails',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();await expect(page.getByRole('button',{name:/Alex Example/})).toBeVisible();
 await page.getByRole('button',{name:'Chats',exact:true}).click();graph.peopleError='Directory temporarily unavailable';
 await page.getByRole('button',{name:'People',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Directory temporarily unavailable');await expect(page.getByRole('region',{name:'Find coworkers'}).getByRole('button',{name:/Alex Example/})).toBeVisible();expect(graph.writes).toEqual([]);
});
test('People directory cache is removed on sign-out',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();await expect(page.getByRole('button',{name:/Alex Example/})).toBeVisible();
 expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('taut.people.v1.')))).toBe(true);
 await page.getByRole('button',{name:'Chats',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();
 expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('taut.people.v1.')))).toBe(false);expect(graph.writes).toEqual([]);
});

test('People shared mail search is explicit and opens its source without writes',async({page,graph})=>{
 graph.mailPermitted=true;graph.mailMessages=[{id:'mail-alex',conversationId:'thread-alex',subject:'Shared plans',from:{emailAddress:{name:'Alex Example',address:'alex@example.com'}},bodyPreview:'Plans'}];graph.mailPages.first={value:graph.mailMessages,next:null};
 await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();await page.getByRole('button',{name:/Alex Example/}).click();
 expect(graph.calls.filter(c=>c.command==='mail_page')).toHaveLength(0);
 await page.getByRole('button',{name:'Find shared emails',exact:true}).click();
 await expect(page.getByRole('button',{name:/Shared plans/})).toBeVisible();
 expect(graph.calls.find(c=>c.command==='mail_page')?.args.query.search).toBe('from:alex@example.com OR to:alex@example.com');
 expect(graph.writes).toEqual([]);
});

test('People can hide and restore a coworker locally across navigation',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();
 const directory=page.getByRole('region',{name:'Find coworkers'});
 await expect(page.getByLabel('Department',{exact:true}).locator('option',{hasText:'Technology (1)'})).toHaveCount(1);
 await directory.getByRole('button',{name:/Alex Example/}).click({button:'right'});
 await page.getByRole('button',{name:'Hide this user',exact:true}).click();
 await expect(directory.getByRole('button',{name:/Alex Example/})).toHaveCount(0);
 await page.getByRole('button',{name:'Chats',exact:true}).click();await page.getByRole('button',{name:'People',exact:true}).click();
 await expect(directory.getByRole('button',{name:/Alex Example/})).toHaveCount(0);
 await page.getByRole('button',{name:'Hidden people (1)'}).click();
 await directory.getByRole('group',{name:'Alex Example',exact:true}).getByRole('button',{name:'Coworker options'}).click();
 await page.getByRole('button',{name:'Show this user',exact:true}).click();
 await expect(directory.getByRole('button',{name:/Alex Example/})).toBeVisible();
 expect(graph.writes).toEqual([]);
});

test('People controls stay fixed, search matches selects and profile actions align',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();
 await page.getByRole('region',{name:'Find coworkers'}).getByRole('button',{name:/Alex Example/}).click();
 const profile=page.getByRole('region',{name:'Coworker profile'});
 await expect(profile.getByRole('button',{name:'Chat',exact:true})).toContainText('Continue chat');
 const chat=await profile.getByRole('button',{name:'Chat',exact:true}).boundingBox();const email=await profile.getByRole('button',{name:'Email',exact:true}).boundingBox();
 expect(Math.abs(chat!.y-email!.y)).toBeLessThan(1);expect(chat!.height).toBe(email!.height);
 const search=await page.locator('.people-search .search-field').boundingBox();const select=await page.getByLabel('Department',{exact:true}).boundingBox();expect(search!.width).toBe(select!.width);
 const result=await page.locator('.people-search').evaluate(el=>{const list=el.querySelector('.people-list')!;const controls=el.querySelector('.directory-controls')!;const top=controls.getBoundingClientRect().top;const spacer=document.createElement('div');spacer.style.height='2000px';list.append(spacer);list.scrollTop=500;return {before:top,after:controls.getBoundingClientRect().top,scroll:list.scrollTop,overflow:getComputedStyle(list).overflowY};});
 expect(result.scroll).toBeGreaterThan(0);expect(result.before).toBe(result.after);expect(result.overflow).toBe('auto');expect(graph.writes).toEqual([]);
});

test('Manager cards retain the path and directory selection clears it',async({page,graph},testInfo)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await signIn(page);await page.getByRole('button',{name:'People',exact:true}).click();
 const directory=page.getByRole('region',{name:'Find coworkers'}),profile=page.getByRole('region',{name:'Coworker profile'});
 await directory.getByRole('button',{name:/Alex Example/}).click();
 await profile.locator('.manager-card').getByRole('button',{name:/Blair Example/}).click();
 await expect(profile.getByRole('heading',{name:'Blair Example',exact:true})).toBeVisible();
 await expect(profile.getByRole('button',{name:'Return to Alex Example',exact:true})).toBeVisible();
 await page.clock.runFor(250);
 await page.screenshot({path:testInfo.outputPath('people-stack.png')});
 await profile.getByRole('button',{name:'Close manager profile'}).click();
 await expect(profile.getByRole('heading',{name:'Alex Example',exact:true})).toBeVisible();
 await profile.locator('.manager-card').getByRole('button',{name:/Blair Example/}).click();
 await profile.getByRole('button',{name:'Return to Alex Example',exact:true}).click();
 await expect(profile.getByRole('heading',{name:'Alex Example',exact:true})).toBeVisible();
 await expect(profile.getByRole('button',{name:'Return to Blair Example',exact:true})).toBeVisible();
 const frontTop=await profile.locator('.profile-card').evaluate(el=>el.getBoundingClientRect().top);
 await profile.getByRole('button',{name:'Return to Blair Example',exact:true}).click();
 await page.clock.runFor(250);
 expect(await profile.locator('.profile-card').evaluate(el=>el.getBoundingClientRect().top)).toBe(frontTop);
 await expect(profile.getByRole('button',{name:'Return to Alex Example',exact:true})).toBeVisible();
 await profile.getByRole('button',{name:'Return to Alex Example',exact:true}).click();
 const copy=profile.getByRole('button',{name:'Copy email address'});
 const dimensions=await copy.evaluate(button=>{const a=button.getBoundingClientRect(),b=button.querySelector('svg')!.getBoundingClientRect();return {width:a.width,height:a.height,offset:Math.abs((a.top+a.bottom-b.top-b.bottom)/2)};});
 expect(dimensions.width).toBe(32);expect(dimensions.height).toBe(32);expect(dimensions.offset).toBeLessThan(1);
 await profile.locator('.manager-card').getByRole('button',{name:/Blair Example/}).click();
 await directory.getByRole('button',{name:/Casey Example/}).click();
 await expect(profile.getByRole('heading',{name:'Casey Example',exact:true})).toBeVisible();
 await expect(profile.getByRole('navigation',{name:'Manager profile history'})).toHaveCount(0);
 expect(graph.writes).toEqual([]);
});
