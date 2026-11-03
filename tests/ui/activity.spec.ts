import { test, expect, signIn, row, alex, blair, casey, me, message, type MockMessage } from './fixtures';
const identity=(id:string,displayName?:string)=>({id,displayName});
function event(id:string,type:string,detail:NonNullable<MockMessage['eventDetail']>,minute:number):MockMessage{
 return {id,messageType:'systemEventMessage',createdDateTime:`2026-01-01T12:${String(minute).padStart(2,'0')}:00Z`,body:{content:'<systemEventMessage/>',contentType:'html'},eventDetail:{'@odata.type':`#microsoft.graph.${type}EventMessageDetail`,...detail}};
}
const notices=(page:import('@playwright/test').Page)=>page.getByRole('note',{name:'Group activity'});

test('group activity is chronological with its own styling, timestamps, and history details',async({page,graph},testInfo)=>{
 const hello={...message('hello','Hello group'),createdDateTime:'2026-01-01T12:02:00Z'};
 graph.messages['chat-alex']=[
  event('remove','membersDeleted',{initiator:{user:identity(me.id)},members:[identity(casey.id,casey.displayName)]},4),
  event('rename','chatRenamed',{initiator:{user:identity(me.id)},chatDisplayName:'Project group'},1),
  hello,
  event('add','membersAdded',{initiator:{user:identity(me.id)},members:[identity(alex.id,alex.displayName),identity(blair.id,blair.displayName)],visibleHistoryStartDateTime:'0001-01-01T00:00:00Z'},0),
  event('add-casey','membersAdded',{initiator:{user:identity(me.id)},members:[identity(casey.id,casey.displayName)]},3),
  event('left','membersDeleted',{initiator:{user:identity(blair.id,blair.displayName)},members:[identity(blair.id,blair.displayName)]},5),
 ];
 await signIn(page);
 await expect(notices(page)).toHaveCount(5);
 await expect(notices(page).nth(0)).toContainText(`You added ${alex.displayName} and ${blair.displayName}`);
 await expect(notices(page).nth(0)).toContainText('All previous messages shared');
 await expect(notices(page).nth(1)).toContainText('You renamed the group to “Project group”');
 await expect(notices(page).nth(3)).toContainText(`You removed ${casey.displayName}`);
 await expect(notices(page).nth(4)).toContainText(`${blair.displayName} left the group`);
 const order=await page.locator('.messages>.conversation-activity,.messages>.message-line').evaluateAll(nodes=>nodes.map(node=>node.textContent));
 expect(order[2]).toContain('Hello group');
 await expect(notices(page).locator('.bubble')).toHaveCount(0);
 await expect(notices(page).locator('time')).toHaveCount(5);
 await expect(page.getByText('Unsupported message content',{exact:true})).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('activity-timeline.png')});
 expect(graph.writes).toEqual([]);
});

test('refresh and polling do not duplicate events, replace the message preview, or lose drafts',async({page,graph})=>{
 graph.messages['chat-alex']=[message('hello','Latest actual message'),event('add','membersAdded',{members:[identity(casey.id,casey.displayName)],initiator:{user:identity(me.id)}},1)];
 await signIn(page);
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep draft while activity syncs');
 await expect(notices(page)).toHaveCount(1);
 await page.getByRole('button',{name:'Refresh messages',exact:true}).click();
 await page.clock.runFor(5_000);
 await expect(notices(page)).toHaveCount(1);
 await expect(row(page,alex.displayName)).toContainText('Latest actual message');
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep draft while activity syncs');
 graph.messages['chat-alex'].push(event('rename','chatRenamed',{chatDisplayName:'Updated group',initiator:{user:identity(me.id)}},2));
 await page.getByRole('button',{name:'Refresh messages',exact:true}).click();
 await expect(notices(page)).toHaveCount(2);
 expect(graph.writes).toEqual([]);
});

test('missing historic names resolve through cached read-only directory lookup with neutral fallback',async({page,graph})=>{
 const unavailable='55555555-5555-5555-5555-555555555555';
 graph.messages['chat-alex']=[event('removed','membersDeleted',{initiator:{user:identity(me.id)},members:[identity(casey.id),identity(unavailable)]},0)];
 await signIn(page);
 await expect(notices(page)).toContainText(`You removed ${casey.displayName} and a participant`);
 expect(graph.calls.filter(c=>c.command==='graph_event_names')).toHaveLength(1);
 await page.getByRole('button',{name:'Refresh messages',exact:true}).click();await page.clock.runFor(5_000);
 await expect(notices(page)).toHaveCount(1);
 expect(graph.calls.filter(c=>c.command==='graph_event_names')).toHaveLength(1);
 await expect(notices(page)).not.toContainText(unavailable);
 expect(graph.writes).toEqual([]);
});

test('unsupported system events remain hidden and event labels render as text',async({page,graph})=>{
 graph.messages['chat-alex']=[event('unknown','unknown',{members:[identity(casey.id)]},0),{...message('missing',''),messageType:'systemEventMessage'},event('rename','chatRenamed',{chatDisplayName:'<img src="https://example.invalid/leak" onerror="alert(1)">',initiator:{user:identity(me.id)}},1)];
 await signIn(page);
 await expect(notices(page)).toHaveCount(1);
 await expect(notices(page)).toContainText('<img src=');
 await expect(notices(page).locator('img')).toHaveCount(0);
 await expect(page.getByText('Unsupported message content',{exact:true})).toHaveCount(0);
 expect(graph.calls.filter(c=>c.command==='graph_event_names')).toHaveLength(0);
 expect(graph.writes).toEqual([]);
});
