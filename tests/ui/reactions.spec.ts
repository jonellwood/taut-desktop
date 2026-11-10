import {test,expect,signIn,row,alex,blair,casey,me,message} from './fixtures';
const reacted=(type:string,id:string,name?:string)=>({reactionType:type,user:{user:{id,displayName:name}}});

test('reactions group counts and disclose names by keyboard without writes',async({page,graph},testInfo)=>{
 graph.messages['chat-alex']=[{...message('reacted','A message with reactions'),reactions:[reacted('like',alex.id),reacted('👍🏻',blair.id),reacted('👍',me.id),reacted('heart',casey.id,casey.displayName)]}];
 await signIn(page);
 const like=page.getByText('👍',{exact:true}).locator('..');
 await expect(like).toHaveAttribute('aria-label','Like: 3 reactions, including you');
 await like.focus();await page.keyboard.press('Enter');
 const people=page.locator('details.reaction-chip[open]');
 await expect(people).toContainText('You');await expect(people).toContainText(alex.displayName);await expect(people).toContainText(blair.displayName);
 await expect(page.locator('.message-reactions')).toContainText('3');await expect(page.locator('.message-reactions details')).toHaveCount(2);
 const closed=await page.locator('details.reaction-chip:not([open])').boundingBox();const expanded=await people.boundingBox();
 expect(closed!.height).toBeLessThan(expanded!.height);
 await page.screenshot({path:testInfo.outputPath('received-reactions.png')});expect(graph.writes).toEqual([]);
});

test('reaction additions, removals and replacements sync quietly without losing drafts or changing unread',async({page,graph})=>{
 const original=message('reacted','Stable message preview');graph.messages['chat-alex']=[original];
 await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Unsent draft');
 original.reactions=[reacted('like',alex.id)];await page.getByRole('button',{name:'Refresh messages'}).click();
 await expect(page.locator('.message-reactions details summary')).toHaveAttribute('aria-label','Like: 1 reaction');
 original.reactions=[reacted('heart',blair.id)];await page.clock.runFor(5_000);
 await expect(page.locator('.message-reactions details summary')).toHaveAttribute('aria-label','Heart: 1 reaction');
 original.reactions=[];await page.clock.runFor(5_000);await expect(page.locator('.message-reactions')).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Unsent draft');
 await expect(row(page,alex.displayName)).toContainText('Stable message preview');await expect(page.locator('.unread-total')).toHaveCount(0);
 expect(graph.writes).toEqual([]);
});

test('reactor names resolve read-only and missing or foreign identities stay neutral',async({page,graph})=>{
 graph.messages['chat-alex']=[{...message('reacted','Who reacted?'),reactions:[reacted('like',casey.id),reacted('like','not-a-directory-id'),{reactionType:'like',user:null},{reactionType:'like',user:{user:{id:casey.id,tenantId:'foreign-tenant',userIdentityType:'federatedUser'}}}]}];
 await signIn(page);await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_event_names').length).toBe(1);
 await page.locator('.reaction-chip summary').click();
 await expect(page.locator('.reaction-people')).toContainText(casey.displayName);
 await expect(page.locator('.reaction-people')).toContainText('Participant unavailable');
 await expect(page.locator('.reaction-people')).not.toContainText('not-a-directory-id');expect(graph.writes).toEqual([]);
});

test('custom reactions and supplied names render as text without external images or HTML execution',async({page,graph})=>{
 graph.messages['chat-alex']=[{...message('reacted','Custom reaction'),reactions:[{...reacted('custom',alex.id,'<img src="https://example.invalid/x" onerror="alert(1)">'),displayName:'<b>Custom badge</b>',reactionContentUrl:'https://example.invalid/custom.png'}]}];
 await signIn(page);await page.locator('.reaction-chip summary').click();
 await expect(page.locator('.reaction-people')).toContainText('<b>Custom badge</b>');
 await expect(page.locator('.reaction-people')).toContainText('<img src=');
 await expect(page.locator('.message-reactions img,.message-reactions b')).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('deleted messages and system activity do not display stale reactions',async({page,graph})=>{
 graph.messages['chat-alex']=[{...message('gone','Removed message'),deletedDateTime:'2026-01-01T12:01:00Z',reactions:[reacted('like',alex.id)]},{...message('system',''),messageType:'systemEventMessage',eventDetail:{'@odata.type':'#microsoft.graph.chatRenamedEventMessageDetail',chatDisplayName:'Group name'},reactions:[reacted('like',blair.id)]}];
 await signIn(page);await expect(page.locator('.messages')).toContainText('Message deleted');await expect(page.locator('.message-reactions')).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('reaction details stay with their own conversation through switching and refresh',async({page,graph})=>{
 graph.messages['chat-alex']=[{...message('reacted','Alex message'),reactions:[reacted('like',alex.id)]}];
 graph.messages['chat-blair']=[{...message('other','Blair message',blair.id),reactions:[reacted('heart',blair.id)]}];
 await signIn(page);await expect(page.locator('.reaction-chip summary')).toHaveAttribute('aria-label','Like: 1 reaction');
 await row(page,blair.displayName).click();await expect(page.locator('.reaction-chip summary')).toHaveAttribute('aria-label','Heart: 1 reaction');
 await row(page,alex.displayName).click();await page.getByRole('button',{name:'Refresh messages'}).click();
 await expect(page.locator('.reaction-chip summary')).toHaveAttribute('aria-label','Like: 1 reaction');expect(graph.writes).toEqual([]);
});
