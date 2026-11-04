import { test as base, expect, type Page } from '@playwright/test';

export const me = { id: '11111111-1111-1111-1111-111111111111', displayName: 'Test User' };
export const alex = { id: '22222222-2222-2222-2222-222222222222', displayName: 'Alex Example', mail: 'alex@example.com' };
export const blair = { id: '33333333-3333-3333-3333-333333333333', displayName: 'Blair Example', mail: 'blair@example.com' };
export const casey = { id: '44444444-4444-4444-4444-444444444444', displayName: 'Casey Example', mail: 'casey@example.com' };
export const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';
export type TestMember={id:string;userId:string;displayName:string;email?:string;roles?:string[]};
export type TestChat={id:string;chatType:string;topic?:string;lastUpdatedDateTime?:string;lastMessagePreview?:import('../../src/lib/chat-summary').ChatPreview;viewpoint?:{isHidden?:boolean;lastMessageReadDateTime?:string};members:TestMember[]};
export function chat(id: string, person: typeof alex):TestChat {
  return { id, chatType: 'oneOnOne', members: [{id:'member-me', userId: me.id, displayName: me.displayName,roles:['owner'] }, {id:`member-${person.id}`, userId: person.id, displayName: person.displayName, email: person.mail,roles:['owner'] }] };
}
export type MockMessage = {
  id: string; messageType: string; createdDateTime: string; deletedDateTime?:string|null;
  from?: { user: { id: string; displayName?:string } }; body: { content: string; contentType: string };
  eventDetail?:import('../../src/lib/activity').EventDetail;
  reactions?:import('../../src/lib/reactions').ApiReaction[];
  attachments?: { id: string; name?: string; contentType: string; contentUrl?: string; content?:string }[];
};
export function message(id: string, content: string, sender = alex.id): MockMessage {
  return { id, messageType: 'message', createdDateTime: '2026-01-01T12:00:00Z', from: { user: { id: sender } }, body: { content, contentType: 'html' } };
}

type Call = { command: string; args: Record<string, any> };
export class MockGraph {
  calls: Call[] = [];
  unexpected: string[] = [];
  chats = [chat('chat-alex', alex), chat('chat-blair', blair)];
  messages: Record<string, MockMessage[]> = { 'chat-alex': [message('hello', 'Hello from Alex')] };
  // Write commands fail closed unless a test deliberately enables its fake writes.
  allowWrites = false;
  teamsPermissions={teams:true,channels:true,messages:true};
  teamError='';
  teamErrors:Record<string,string>={};
  teamGate?:Promise<void>;
  teamReplyGate?:Promise<void>;
  teamPages:Record<string,{value:any[];next:string|null}>={};
  teamData:Record<string,any[]>={joined:[{id:'team-dev',displayName:'IT Development',description:'A shared space for building better things.'}],associated:[{id:'team-dev',displayName:'IT Development'}],channels:[{id:'general',displayName:'General',membershipType:'standard',hostTeamId:'team-dev'}],shared:[],posts:[{id:'post-1',subject:'Welcome to the channel',createdDateTime:'2026-11-03T12:00:00Z',from:{user:{displayName:'Alex Example'}},body:{contentType:'html',content:'<p>Today’s project updates.</p><p>Keep the conversation focused.</p>'}}],replies:[{id:'reply-1',createdDateTime:'2026-11-03T12:01:00Z',from:{user:{displayName:'Blair Example'}},body:{contentType:'text',content:'Ready for the next step.'}}]};
  notificationSettings={enabled:false,showNames:false,error:null as string|null};
  notificationConfigError='';
  notificationTestError='';
  notificationTests=0;
  pendingNotificationChat:string|null=null;
  restoredSession = false;
  sessionSaved = true;
  persistenceNotice: string|null = null;
  restoreGate?: Promise<void>;
  signOutError = '';
  profileError = '';
  profileId = me.id;
  messagesError = '';
  parentError='';
  parentGate?:Promise<void>;
  parentMessages:Record<string,MockMessage>={};
  readError = '';
  reactionError = '';
  reactionGate?: Promise<void>;
  reactionStatusError = '';
  readConfirmed = true;
  createError = '';
  sendError = '';
  attachmentPermission = false;
  groupPermission = false;
  chatWritePermission = false;
  changeError = '';
  visibilityError = '';
  statusError = '';
  originals = new Map<string, MockMessage>();
  groupCreateError = '';
  memberError = '';
  membershipIncomplete = false;
  prepareError = '';
  prepared = new Map<string, {id:string; name:string; chatId:string}>();
  uploadCount = 0;
  sendGate?: Promise<void>;
  imageGate?: Promise<void>;
  messagesGate?: Promise<void>;
  createId = 'chat-casey';
  get writes() { return this.calls.filter(c => ['graph_create_chat', 'graph_send_message', 'graph_prepare_attachment', 'graph_send_attachments','graph_create_group_chat','graph_add_group_member','graph_remove_group_member','graph_change_message','graph_set_chat_visibility','graph_mark_chat_read','graph_change_reaction'].includes(c.command)); }
  async invoke(command: string, args: Call['args'] = {}) {
    this.calls.push({ command, args });
    switch (command) {
      case 'teams_permissions': return this.teamsPermissions;
      case 'graph_teams_page': {
        if(this.teamError||this.teamErrors[args.query.collection])throw Error(this.teamError||this.teamErrors[args.query.collection]);
        if(args.query.collection==='posts')await this.teamGate;
        if(args.query.collection==='replies')await this.teamReplyGate;
        const q=args.query;
        return this.teamPages[q.next??`${q.collection}:${q.teamId??''}:${q.channelId??''}:${q.messageId??''}`]??{value:this.teamData[q.collection]??[],next:null};
      }
      case 'notification_settings': return this.notificationSettings;
      case 'notification_view': return null;
      case 'notification_configure':
        if(this.notificationConfigError)throw Error(this.notificationConfigError);
        this.notificationSettings={enabled:args.enabled,showNames:args.showNames,error:null};return this.notificationSettings;
      case 'notification_test':
        if(this.notificationTestError)throw Error(this.notificationTestError);
        return ++this.notificationTests;
      case 'notification_take_open': {const id=this.pendingNotificationChat;this.pendingNotificationChat=null;return id;}
      case 'restore_session': await this.restoreGate; return {restored:this.restoredSession,saved:this.restoredSession,notice:this.persistenceNotice};
      case 'auth_persistence_status': return {restored:true,saved:this.sessionSaved,notice:this.persistenceNotice};
      case 'sign_in': return null;
      case 'sign_out': this.restoredSession=false;if(this.signOutError)throw Error(this.signOutError);return null;
      case 'graph_chat_message': await this.parentGate;if(this.parentError)throw Error(this.parentError);return this.parentMessages[args.messageId]??this.messages[args.chatId]?.find(m=>m.id===args.messageId)??Promise.reject(Error('Quoted message unavailable'));
      case 'graph_profile': if(this.profileError)throw Error(this.profileError);return {...me,id:this.profileId};
      case 'attachment_permission': return this.attachmentPermission;
      case 'group_member_permission': return this.groupPermission;
      case 'chat_write_permission': return this.chatWritePermission;
      case 'graph_message_status':
        if(this.statusError)throw Error(this.statusError);
        return Boolean(this.messages[args.chatId]?.find(m=>m.id===args.messageId)?.deletedDateTime);
      case 'graph_chat_visibility':
        if(this.statusError)throw Error(this.statusError);
        return Boolean(this.chats.find(c=>c.id===args.chatId)?.viewpoint?.isHidden);
      case 'graph_change_message': {
        if(!this.allowWrites)break;
        if(this.changeError)throw Error(this.changeError);
        const rows=this.messages[args.chatId];
        const index=rows.findIndex(m=>m.id===args.messageId);
        const key=JSON.stringify([args.chatId,args.messageId]);
        if(args.restore){rows[index]={...(this.originals.get(key)??rows[index]),deletedDateTime:null};}
        else{this.originals.set(key,structuredClone(rows[index]));rows[index]={...rows[index],deletedDateTime:'2026-01-01T12:01:00Z',body:{content:'',contentType:'html'}};}
        return null;
      }
      case 'graph_set_chat_visibility':
        if(!this.allowWrites)break;
        if(this.visibilityError)throw Error(this.visibilityError);
        this.chats.find(c=>c.id===args.chatId)!.viewpoint={isHidden:args.hidden};
        return null;
      case 'graph_mark_chat_read': {
        if(!this.allowWrites)break;
        if(this.readError)throw Error(this.readError);
        const latest=[...(this.messages[args.chatId]??[])].sort((a,b)=>Date.parse(b.createdDateTime)-Date.parse(a.createdDateTime))[0];
        if(!this.readConfirmed||latest?.id!==args.messageId)return false;
        const target=this.chats.find(c=>c.id===args.chatId)!;
        target.viewpoint={...target.viewpoint,lastMessageReadDateTime:latest.createdDateTime};return true;
      }
      case 'graph_reaction_state': {
        if(this.reactionStatusError)throw Error(this.reactionStatusError);
        return (this.messages[args.chatId]?.find(m=>m.id===args.messageId)?.reactions??[]).filter(r=>r.user?.user?.id===me.id).map(r=>r.reactionType);
      }
      case 'graph_change_reaction': {
        if(!this.allowWrites)break;
        await this.reactionGate;
        if(this.reactionError)throw Error(this.reactionError);
        const target=this.messages[args.chatId]!.find(m=>m.id===args.messageId)!;
        const aliases:Record<string,string>={like:'👍',heart:'❤️',laugh:'😆',surprised:'😮',sad:'😢',angry:'😠'};
        const matches=(r:NonNullable<MockMessage['reactions']>[number])=>r.user?.user?.id===me.id&&(aliases[r.reactionType??'']??r.reactionType)===args.emoji;
        if(args.remove)target.reactions=(target.reactions??[]).filter(r=>!matches(r));
        else if(!(target.reactions??[]).some(matches))target.reactions=[...(target.reactions??[]),{reactionType:args.emoji,user:{user:{id:me.id,displayName:me.displayName}}}];
        return null;
      }
      case 'graph_chat_members': return {value:this.chats.find(c=>c.id===args.chatId)?.members??[],...(this.membershipIncomplete?{'@odata.nextLink':'https://graph.microsoft.com/next'}:{})};
      case 'graph_chats': return { value: this.chats };
      case 'graph_search_users': return { value: [me, alex, blair, casey].filter(u => `${u.displayName} ${'mail' in u ? u.mail : ''}`.toLowerCase().includes(args.query.toLowerCase())) };
      case 'graph_messages':
        await this.messagesGate;
        if(this.messagesError)throw Error(this.messagesError);
        if (args.chatId.startsWith('pending:')) this.unexpected.push('Read of a local pending chat');
        return { value: this.messages[args.chatId] ?? [] };
      case 'graph_event_names': return args.people.flatMap((p:{id:string;tenantId?:string})=>{const user=[me,alex,blair,casey].find(u=>u.id===p.id);return user?[{...p,displayName:user.displayName}]:[];});
      case 'graph_hosted_image': await this.imageGate; return image;
      case 'plugin:opener|open_url': return null; // Record only; never launch a browser.
      case 'graph_create_group_chat':
        if (!this.allowWrites) break;
        if (this.groupCreateError) throw Error(this.groupCreateError);
        const people=[alex,blair,casey];
        this.chats.push({id:'chat-group',chatType:'group',topic:args.topic,members:[{id:'member-me',userId:me.id,displayName:me.displayName,roles:['owner']},...args.recipients.map((id:string)=>({id:`member-${id}`,userId:id,displayName:people.find(p=>p.id===id)!.displayName,roles:['owner']}))]});
        return {id:'chat-group'};
      case 'graph_add_group_member':
        if (!this.allowWrites) break;
        if (this.memberError) throw Error(this.memberError);
        const person=[alex,blair,casey].find(p=>p.id===args.recipient)!;
        this.chats.find(c=>c.id===args.chatId)!.members.push({id:`member-${person.id}`,userId:person.id,displayName:person.displayName,roles:['owner']});
        return null;
      case 'graph_remove_group_member':
        if (!this.allowWrites) break;
        if (this.memberError) throw Error(this.memberError);
        const group=this.chats.find(c=>c.id===args.chatId)!;
        group.members=group.members.filter(m=>m.id!==args.membershipId);
        return null;
      case 'graph_create_chat':
        if (!this.allowWrites) break;
        if (this.createError) throw Error(this.createError);
        this.chats = [...this.chats.filter(c => c.id !== this.createId), chat(this.createId, casey)];
        return { id: this.createId };
      case 'graph_prepare_attachment':
        if (!this.allowWrites) break;
        if (this.prepareError) throw Error(this.prepareError);
        if (!this.prepared.has(args.id)) { this.uploadCount++; this.prepared.set(args.id, {id:args.id,name:args.name,chatId:args.chatId}); }
        return null;
      case 'graph_send_attachments':
        if (!this.allowWrites) break;
        await this.sendGate;
        if (this.sendError) throw Error(this.sendError);
        const attached = message(`attached-${this.writes.length}`, args.text, me.id);
        attached.attachments = args.ids.map((id:string) => ({ id, name:this.prepared.get(id)!.name, contentType:'reference', contentUrl:`https://example.sharepoint.com/${id}` }));
        this.messages[args.chatId] = [...(this.messages[args.chatId] ?? []), attached];
        return { id:attached.id };
      case 'graph_send_message':
        if (!this.allowWrites) break;
        await this.sendGate;
        if (this.sendError) throw Error(this.sendError);
        const sent = message(`sent-${this.writes.length}`, args.text, me.id);
        this.messages[args.chatId] = [...(this.messages[args.chatId] ?? []), sent];
        return { id: sent.id };
    }
    this.unexpected.push(`Unexpected IPC command: ${command}`);
    throw Error(`Blocked unexpected mock command: ${command}`);
  }
}

export const test = base.extend<{ graph: MockGraph }>({
  graph: async ({ page, context }, use) => {
    const graph = new MockGraph();
    const external: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // No native runtime, OAuth session, Microsoft endpoint, or real external opener.
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:1421') return route.continue();
      external.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    await page.exposeFunction('__mockInvoke', (command: string, args: Call['args']) => graph.invoke(command, args));
    await page.addInitScript(() => {
      Object.defineProperty(window, '__TAURI_INTERNALS__', {
        value: { invoke: (command: string, args: Record<string, unknown>) => (window as any).__mockInvoke(command, args) },
      });
    });
    const now = new Date('2026-01-01T00:00:00Z');
    await page.clock.install({ time: now });
    // Pause ahead of installation time so a slow browser cannot advance past it.
    await page.clock.pauseAt(new Date(now.getTime()+60_000));
    await use(graph);
    expect(graph.unexpected, 'All IPC must use explicit mocks').toEqual([]);
    expect(external, 'Browser must never contact an external service').toEqual([]);
    expect(errors, 'No unhandled browser errors').toEqual([]);
  },
});
export { expect };
export async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
  await row(page,alex.displayName).click();
  await expect(page.locator('.conversation-header')).toContainText(alex.displayName);
}
export async function choosePerson(page: Page, name: string) {
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.getByLabel('Find a coworker').fill(name);
  await page.clock.runFor(350);
  await page.getByRole('option', { name: new RegExp(name) }).click();
}
export async function openDraft(page: Page, name = casey.displayName) {
  await choosePerson(page, name);
  await page.getByRole('button', { name: 'Open draft', exact: true }).click();
  await expect(page.locator('.conversation-header')).toContainText(name);
}
export function row(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(name) }).filter({ has: page.locator('.chat-copy') });
}
export type { Page } from '@playwright/test';
