import { test as base, expect, type Page } from '@playwright/test';

export const me = { id: '11111111-1111-1111-1111-111111111111', displayName: 'Test User' };
export const alex = { id: '22222222-2222-2222-2222-222222222222', displayName: 'Alex Example', mail: 'alex@example.com' };
export const blair = { id: '33333333-3333-3333-3333-333333333333', displayName: 'Blair Example', mail: 'blair@example.com' };
export const casey = { id: '44444444-4444-4444-4444-444444444444', displayName: 'Casey Example', mail: 'casey@example.com' };
export const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';
export function chat(id: string, person: typeof alex) {
  return { id, chatType: 'oneOnOne', members: [{ userId: me.id, displayName: me.displayName }, { userId: person.id, displayName: person.displayName, email: person.mail }] };
}
export type MockMessage = {
  id: string; messageType: string; createdDateTime: string;
  from?: { user: { id: string } }; body: { content: string; contentType: string };
  attachments?: { id: string; name: string; contentType: string; contentUrl: string }[];
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
  createError = '';
  sendError = '';
  attachmentPermission = false;
  prepareError = '';
  prepared = new Map<string, {id:string; name:string; chatId:string}>();
  uploadCount = 0;
  sendGate?: Promise<void>;
  createId = 'chat-casey';
  get writes() { return this.calls.filter(c => ['graph_create_chat', 'graph_send_message', 'graph_prepare_attachment', 'graph_send_attachments'].includes(c.command)); }
  async invoke(command: string, args: Call['args'] = {}) {
    this.calls.push({ command, args });
    switch (command) {
      case 'sign_in': case 'sign_out': return null;
      case 'graph_profile': return me;
      case 'attachment_permission': return this.attachmentPermission;
      case 'graph_chats': return { value: this.chats };
      case 'graph_search_users': return { value: [me, alex, blair, casey].filter(u => `${u.displayName} ${'mail' in u ? u.mail : ''}`.toLowerCase().includes(args.query.toLowerCase())) };
      case 'graph_messages':
        if (args.chatId.startsWith('pending:')) this.unexpected.push('Read of a local pending chat');
        return { value: this.messages[args.chatId] ?? [] };
      case 'graph_hosted_image': return image;
      case 'plugin:opener|open_url': return null; // Record only; never launch a browser.
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
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
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
