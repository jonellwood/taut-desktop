import {test,expect,signIn,openDraft,row,alex,blair,me,message} from './fixtures';

test('composer emoji replaces selected text, restores caret/focus, and never sends',async({page,graph},testInfo)=>{
 await signIn(page);const input=page.getByRole('textbox',{name:'Message',exact:true});await input.fill('Hello world');
 await input.evaluate((node:HTMLTextAreaElement)=>node.setSelectionRange(6,11));
 await page.getByRole('button',{name:'Insert emoji',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'Insert emoji',exact:true});
 await expect(page.getByRole('searchbox',{name:'Search emoji'})).toBeFocused();
 await page.getByRole('searchbox',{name:'Search emoji'}).fill('hello');
 await expect(picker.getByRole('button',{name:'Wave 👋',exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('emoji-picker.png')});
 await picker.getByRole('button',{name:'Wave 👋',exact:true}).click();
 await expect(picker).toBeHidden();await expect(input).toHaveValue('Hello 👋');await expect(input).toBeFocused();
 expect(await input.evaluate((node:HTMLTextAreaElement)=>node.selectionStart)).toBe(8);expect(graph.writes).toEqual([]);
});

test('pending emoji draft and attachment stay local through switching until explicit Send',async({page,graph})=>{
 await signIn(page);await openDraft(page);
 await page.locator('input[type=file]').setInputFiles({name:'note.txt',mimeType:'text/plain',buffer:Buffer.from('draft')});
 await page.getByRole('button',{name:'Insert emoji',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Celebrate 🎉',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('🎉');
 await row(page,alex.displayName).click();await row(page,'Casey Example').click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('🎉');
 await expect(page.getByRole('region',{name:'Draft attachments'})).toContainText('note.txt');expect(graph.writes).toEqual([]);
});

test('emoji insertion sends only after the normal explicit Send action',async({page,graph})=>{
 graph.allowWrites=true;await signIn(page);
 await page.getByRole('button',{name:'Insert emoji',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Thumbs up 👍',exact:true}).click();expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('');
 expect(graph.writes.map(c=>[c.command,c.args.text])).toEqual([['graph_send_message','👍']]);
});

test('picker category, search, Escape, and arrows work without writing',async({page,graph})=>{
 await signIn(page);await page.getByRole('button',{name:'Insert emoji',exact:true}).click();
 await page.getByLabel('Emoji category',{exact:true}).selectOption('Objects');
 const first=page.getByRole('button',{name:'Rocket 🚀',exact:true});await first.focus();await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('button',{name:'Light bulb 💡',exact:true})).toBeFocused();
 await page.getByRole('searchbox',{name:'Search emoji'}).fill('no-matching-emoji');await expect(page.getByRole('dialog')).toContainText('No matching emoji');
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();
 await expect(page.getByRole('button',{name:'Insert emoji',exact:true})).toBeFocused();expect(graph.writes).toEqual([]);
});

test('reaction picker cancel writes nothing and explicit choice sets Unicode once',async({page,graph},testInfo)=>{
 graph.chatWritePermission=true;graph.allowWrites=true;await signIn(page);
 await page.getByRole('button',{name:'Add reaction',exact:true}).click();expect(graph.writes).toEqual([]);
 await page.keyboard.press('Escape');expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Add reaction',exact:true}).click();
 await page.screenshot({path:testInfo.outputPath('reaction-picker.png')});
 await page.getByRole('dialog').getByRole('button',{name:'Thumbs up 👍',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeHidden();
 await expect(page.locator('.reaction-chip summary')).toHaveAttribute('aria-label','Like: 1 reaction, including you');
 expect(graph.writes.map(c=>[c.command,c.args])).toEqual([['graph_change_reaction',{chatId:'chat-alex',messageId:'hello',emoji:'👍',remove:false}]]);
});

test('remove mine uses the original own emoji and preserves other people reactions',async({page,graph})=>{
 graph.chatWritePermission=true;graph.allowWrites=true;
 graph.messages['chat-alex']=[{...message('reactions','Reacted'),reactions:[{reactionType:'like',user:{user:{id:me.id}}},{reactionType:'👍🏻',user:{user:{id:alex.id}}}]}];
 await signIn(page);await page.locator('.reaction-chip summary').click();
 await page.getByRole('button',{name:'Remove my Like reaction',exact:true}).click();
 await expect(page.locator('.reaction-chip summary')).toHaveAttribute('aria-label','Like: 1 reaction');
 expect(graph.writes.map(c=>c.args)).toEqual([{chatId:'chat-alex',messageId:'reactions',emoji:'👍',remove:true}]);
 expect(graph.messages['chat-alex'][0].reactions?.[0].user?.user?.id).toBe(alex.id);
});

test('missing permission disables reaction writes while draft emoji stays available',async({page,graph})=>{
 await signIn(page);await expect(page.getByRole('button',{name:'Add reaction',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Insert emoji',exact:true})).toBeEnabled();expect(graph.writes).toEqual([]);
});

test('unconfirmed reaction stays blocked across closing until explicit read-only status refresh',async({page,graph})=>{
 graph.chatWritePermission=true;graph.allowWrites=true;graph.reactionError='Reaction change was not confirmed';await signIn(page);
 await page.getByRole('button',{name:'Add reaction',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Thumbs up 👍',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('not confirmed');
 await expect(page.getByRole('dialog').getByRole('button',{name:'Thumbs up 👍',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Add reaction',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('button',{name:'Thumbs up 👍',exact:true})).toBeDisabled();expect(graph.writes).toHaveLength(1);
 graph.reactionError='';await page.getByRole('button',{name:'Refresh reaction status',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('button',{name:'Thumbs up 👍',exact:true})).toBeEnabled();expect(graph.writes).toHaveLength(1);
 expect(graph.calls.filter(c=>c.command==='graph_reaction_state')).toHaveLength(1);
 await page.getByRole('dialog').getByRole('button',{name:'Thumbs up 👍',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeHidden();expect(graph.writes).toHaveLength(2);
});

test('a pending mutation blocks duplicate choices and does not clear the draft',async({page,graph})=>{
 graph.chatWritePermission=true;graph.allowWrites=true;let release!:()=>void;graph.reactionGate=new Promise<void>(resolve=>release=resolve);
 await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep my draft');
 await page.getByRole('button',{name:'Add reaction',exact:true}).click();
 const choice=page.getByRole('dialog').getByRole('button',{name:'Heart ❤️',exact:true});await choice.click();
 await expect(choice).toBeDisabled();await expect(page.getByRole('button',{name:'Close emoji picker'})).toBeDisabled();expect(graph.writes).toHaveLength(1);
 release();await expect(page.getByRole('dialog')).toBeHidden();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep my draft');expect(graph.writes).toHaveLength(1);
});

test('reaction updates remain in the selected chat and deleted messages have no control',async({page,graph})=>{
 graph.chatWritePermission=true;graph.allowWrites=true;graph.messages['chat-blair']=[{...message('gone','Deleted'),deletedDateTime:'2026-01-01T00:00:00Z'}];
 await signIn(page);await page.getByRole('button',{name:'Add reaction',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Celebrate 🎉',exact:true}).click();
 await row(page,blair.displayName).click();await expect(page.getByRole('button',{name:'Add reaction',exact:true})).toHaveCount(0);
 expect(graph.writes[0].args.chatId).toBe('chat-alex');expect(graph.writes).toHaveLength(1);
});
