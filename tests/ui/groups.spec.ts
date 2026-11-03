import { test, expect, signIn, row, alex, blair, casey, me, type MockGraph, type Page } from './fixtures';

async function chooseGroupPerson(page:Page,name:string){
 await page.getByLabel('Find a coworker').fill(name);await page.clock.runFor(350);
 await page.getByRole('option',{name:new RegExp(name)}).click();
}
async function openGroupDraft(page:Page,topic='Project group'){
 await page.getByRole('button',{name:'New conversation',exact:true}).click();
 await page.getByLabel('Group conversation').check();
 await page.getByLabel('Group name (optional)').fill(topic);
 await chooseGroupPerson(page,alex.displayName);await chooseGroupPerson(page,blair.displayName);
 await page.getByRole('button',{name:'Open draft',exact:true}).click();
 await expect(page.locator('.conversation-header')).toContainText(topic);
}
function existingGroup(graph:MockGraph){
 graph.chats.push({id:'existing-group',chatType:'group',topic:'Existing group',members:[
  {id:'self-opaque',userId:me.id,displayName:me.displayName,roles:['owner']},
  {id:'alex-opaque:/+=',userId:alex.id,displayName:alex.displayName,roles:['owner']},
  {id:'blair-opaque',userId:blair.id,displayName:blair.displayName,roles:['owner']},
 ]});
}
const memberSection=(page:Page)=>page.getByRole('region',{name:'Group members',exact:true});
async function selectGroup(page:Page){await row(page,'Existing group').click();await expect(memberSection(page)).toContainText(alex.displayName);}

test('group selection, cancel, pending draft, and synchronization make no writes',async({page,graph})=>{
 await signIn(page);
 await page.getByRole('button',{name:'New conversation',exact:true}).click();await page.getByLabel('Group conversation').check();
 await chooseGroupPerson(page,alex.displayName);
 await expect(page.getByRole('button',{name:'Open draft',exact:true})).toBeDisabled();
 await chooseGroupPerson(page,blair.displayName);expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await openGroupDraft(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Group draft only');
 await page.clock.runFor(31_000);await row(page,alex.displayName).click();await row(page,'Project group').click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Group draft only');
 expect(graph.writes).toEqual([]);
});

test('first group Send creates then sends once and later Send only sends',async({page,graph})=>{
 graph.allowWrites=true;await signIn(page);await openGroupDraft(page);
 await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();
 await page.locator('form.composer').dispatchEvent('submit');expect(graph.writes).toEqual([]);
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Hello group');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('');
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_create_group_chat','graph_send_message']);
 expect(graph.writes[0].args).toEqual({recipients:[alex.id,blair.id],topic:'Project group',ownId:me.id,firstMessage:'Hello group'});
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Next message');await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('');
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_create_group_chat','graph_send_message','graph_send_message']);
 expect(graph.writes[2].args.chatId).toBe('chat-group');
});

test('unconfirmed group creation preserves text and blocks another creation until explicit acknowledgement',async({page,graph})=>{
 graph.allowWrites=true;graph.groupCreateError='Group creation was not confirmed';await signIn(page);await openGroupDraft(page);
 const input=page.getByRole('textbox',{name:'Message',exact:true});await input.fill('Keep this draft');
 await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.getByRole('alert')).toContainText('not confirmed');
 await expect(input).toHaveValue('Keep this draft');await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();
 await page.clock.runFor(31_000);await page.locator('form.composer').dispatchEvent('submit');expect(graph.writes).toHaveLength(1);
 await row(page,alex.displayName).click();await row(page,'Project group').click();await expect(input).toHaveValue('Keep this draft');
 graph.groupCreateError='';await page.getByRole('button',{name:'I checked Teams — enable retry',exact:true}).click();
 await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(input).toHaveValue('');
 expect(graph.writes.filter(c=>c.command==='graph_create_group_chat')).toHaveLength(2);
});

test('uncertain first delivery retains real group ID and never repeats creation',async({page,graph})=>{
 graph.allowWrites=true;graph.sendError='timeout';await signIn(page);await openGroupDraft(page);
 const input=page.getByRole('textbox',{name:'Message',exact:true});await input.fill('Keep first message');
 await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Check Teams');
 await expect(input).toHaveValue('Keep first message');await page.clock.runFor(31_000);
 expect(graph.writes).toHaveLength(2);graph.sendError='';await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(input).toHaveValue('');
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_create_group_chat','graph_send_message','graph_send_message']);
});

test('viewing member list is read-only and missing permission disables membership changes',async({page,graph})=>{
 existingGroup(graph);await signIn(page);await selectGroup(page);
 await expect(memberSection(page)).toContainText('ChatMember.ReadWrite');
 await expect(page.getByRole('button',{name:`Remove ${alex.displayName}`,exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Leave group',exact:true})).toBeDisabled();
 await expect(page.getByLabel('Add a coworker',{exact:true})).toBeDisabled();
 expect(graph.writes).toEqual([]);
});

test('adding a member requires confirmation and defaults to no prior history',async({page,graph})=>{
 existingGroup(graph);graph.groupPermission=true;graph.allowWrites=true;await signIn(page);await selectGroup(page);
 await page.getByLabel('Add a coworker',{exact:true}).fill(casey.displayName);await page.clock.runFor(350);
 await page.getByRole('option',{name:new RegExp(casey.displayName)}).click();expect(graph.writes).toEqual([]);
 await expect(page.getByLabel('Conversation history',{exact:true})).toHaveValue('none');
 await page.getByRole('dialog',{name:'Confirm adding member'}).getByRole('button',{name:'Cancel',exact:true}).click();expect(graph.writes).toEqual([]);
 await page.getByLabel('Add a coworker',{exact:true}).fill('Casey');await page.clock.runFor(350);await page.getByRole('option',{name:new RegExp(casey.displayName)}).click();
 await page.getByLabel('Conversation history',{exact:true}).selectOption('all');
 await page.getByRole('button',{name:'Confirm add member',exact:true}).click();
 await expect(memberSection(page)).toContainText(casey.displayName);
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_add_group_member']);
 expect(graph.writes[0].args).toEqual({chatId:'existing-group',recipient:casey.id,history:'all'});
});

test('removing a member uses membership ID only after confirmation and preserves the draft',async({page,graph})=>{
 existingGroup(graph);graph.groupPermission=true;graph.allowWrites=true;await signIn(page);await selectGroup(page);
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep group draft');
 await page.getByRole('button',{name:`Remove ${alex.displayName}`,exact:true}).click();expect(graph.writes).toEqual([]);
 await page.getByRole('dialog',{name:'Confirm member removal'}).getByRole('button',{name:'Cancel',exact:true}).click();expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:`Remove ${alex.displayName}`,exact:true}).click();await page.getByRole('button',{name:'Confirm removal',exact:true}).click();
 await expect(page.getByRole('button',{name:`Remove ${alex.displayName}`,exact:true})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep group draft');
 expect(graph.writes[0].args).toEqual({chatId:'existing-group',membershipId:'alex-opaque:/+='});
});

test('leaving requires confirmation and sync does not reopen the departed group',async({page,graph})=>{
 existingGroup(graph);graph.groupPermission=true;graph.allowWrites=true;await signIn(page);await selectGroup(page);
 await page.getByRole('button',{name:'Leave group',exact:true}).click();expect(graph.writes).toEqual([]);
 await page.getByRole('button',{name:'Confirm leave',exact:true}).click();await expect(row(page,'Existing group')).toHaveCount(0);
 expect(graph.writes[0].args).toEqual({chatId:'existing-group',membershipId:'self-opaque'});
 await page.clock.runFor(31_000);await expect(row(page,'Existing group')).toHaveCount(0);
 await expect(page.locator('.conversation-header')).toContainText(alex.displayName);
});

test('unconfirmed membership change blocks another write until member refresh',async({page,graph})=>{
 existingGroup(graph);graph.groupPermission=true;graph.allowWrites=true;graph.memberError='Removal was not confirmed';await signIn(page);await selectGroup(page);
 await page.getByRole('button',{name:`Remove ${alex.displayName}`,exact:true}).click();await page.getByRole('button',{name:'Confirm removal',exact:true}).click();
 await expect(memberSection(page).getByRole('alert')).toContainText('not confirmed');
 await expect(page.getByRole('button',{name:'Confirm removal',exact:true})).toBeDisabled();
 await page.clock.runFor(31_000);expect(graph.writes).toHaveLength(1);
 graph.memberError='';await page.getByRole('button',{name:'Refresh members',exact:true}).click();
 await page.getByRole('button',{name:'Confirm removal',exact:true}).click();
 await expect(page.getByRole('button',{name:`Remove ${alex.displayName}`,exact:true})).toHaveCount(0);
 expect(graph.writes).toHaveLength(2);
});

test('incomplete membership disables changes and group messages show actual senders',async({page,graph})=>{
 existingGroup(graph);graph.groupPermission=true;graph.membershipIncomplete=true;
 graph.messages['existing-group']=[{id:'group-message',messageType:'message',createdDateTime:'2026-01-01T12:00:00Z',from:{user:{id:blair.id,displayName:blair.displayName}},body:{content:'Message from Blair',contentType:'text'}}];
 await signIn(page);await selectGroup(page);
 await expect(memberSection(page)).toContainText('incomplete');await expect(page.getByRole('button',{name:'Leave group',exact:true})).toBeDisabled();
 await expect(page.locator('.sender-name')).toHaveText(blair.displayName);expect(graph.writes).toEqual([]);
});
