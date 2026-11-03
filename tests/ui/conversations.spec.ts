import { test, expect, signIn, choosePerson, openDraft, row, alex, blair, casey, me, chat, message } from './fixtures';

test('choosing, canceling, opening, and revisiting a pending draft never writes', async ({ page, graph }) => {
  await signIn(page);
  await choosePerson(page, casey.displayName);
  expect(graph.writes).toEqual([]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.conversation-header')).toContainText(alex.displayName);
  await openDraft(page);
  await expect(page.getByRole('status')).toContainText('Local draft.');
  await page.getByRole('button', { name: 'Refresh messages', exact: true }).click();
  await page.clock.runFor(31_000);
  await expect.poll(() => graph.calls.filter(c => c.command === 'graph_chats').length).toBe(2);
  await row(page, alex.displayName).click();
  await row(page, casey.displayName).click();
  await expect(page.getByRole('status')).toContainText('Local draft.');
  expect(graph.writes).toEqual([]);
});

test('blank first messages cannot be sent by button or form submission', async ({ page, graph }) => {
  await signIn(page);
  await openDraft(page);
  const send = page.getByRole('button', { name: 'Send message', exact: true });
  await expect(send).toBeDisabled();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('   ');
  await expect(send).toBeDisabled();
  await page.locator('form.composer').dispatchEvent('submit');
  await page.clock.runFor(5_000);
  expect(graph.writes).toEqual([]);
});

test('first Send creates then sends once, ignores duplicate submission, and clears the draft', async ({ page, graph }) => {
  graph.allowWrites = true;
  let finish!: () => void;
  graph.sendGate = new Promise(resolve => { finish = resolve; });
  await signIn(page);
  await openDraft(page);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('  First message  ');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => graph.writes.length).toBe(2);
  await expect(input).toBeDisabled();
  await page.locator('form.composer').dispatchEvent('submit');
  expect(graph.writes.map(c => c.command)).toEqual(['graph_create_chat', 'graph_send_message']);
  expect(graph.writes[0].args).toEqual({ recipient: casey.id, ownId: me.id, firstMessage: 'First message' });
  expect(graph.writes[1].args).toEqual({ chatId: 'chat-casey', text: 'First message' });
  finish();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Chat messages' })).toContainText('First message');
  await row(page, alex.displayName).click();
  await row(page, casey.displayName).click();
  await expect(input).toHaveValue('');
  expect(graph.writes).toHaveLength(2);
});

test('known coworker opens the existing chat and only sends a message', async ({ page, graph }) => {
  graph.allowWrites = true;
  await signIn(page);
  await openDraft(page, blair.displayName);
  await expect(page.getByText('Local draft. Pressing Send', { exact: false })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Existing conversation');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
  expect(graph.writes.map(c => c.command)).toEqual(['graph_send_message']);
  expect(graph.writes[0].args.chatId).toBe('chat-blair');
});

test('creation failure preserves the local draft and never attempts message delivery', async ({ page, graph }) => {
  graph.allowWrites = true;
  graph.createError = 'Mock creation failed';
  await signIn(page);
  await openDraft(page);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep my draft');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Mock creation failed');
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep my draft');
  await expect(page.getByRole('status')).toContainText('Local draft.');
  await page.clock.runFor(31_000);
  expect(graph.writes.map(c => c.command)).toEqual(['graph_create_chat']);
});

test('failed first delivery retains server ID and draft through sync and explicit retry', async ({ page, graph }) => {
  graph.allowWrites = true;
  graph.sendError = 'Mock uncertain delivery';
  await signIn(page);
  await openDraft(page);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Keep until confirmed');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Check Teams or refresh before explicitly retrying');
  await expect(input).toHaveValue('Keep until confirmed');
  await expect(page.getByText('Local draft. Pressing Send', { exact: false })).toHaveCount(0);
  await page.clock.runFor(31_000);
  await expect.poll(() => graph.calls.filter(c => c.command === 'graph_chats').length).toBe(2);
  expect(graph.writes).toHaveLength(2);
  await row(page, alex.displayName).click();
  // Reopening from the picker must reuse the retained/known server chat.
  await openDraft(page);
  await expect(input).toHaveValue('Keep until confirmed');
  graph.sendError = '';
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(input).toHaveValue('');
  expect(graph.writes.map(c => c.command)).toEqual(['graph_create_chat', 'graph_send_message', 'graph_send_message']);
  expect(graph.writes[2].args.chatId).toBe('chat-casey');
});

test('separate drafts survive switching and both message and chat list sync', async ({ page, graph }) => {
  await signIn(page);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Alex draft');
  await row(page, blair.displayName).click();
  await expect(input).toHaveValue('');
  await input.fill('Blair draft');
  await openDraft(page);
  await expect(input).toHaveValue('');
  await input.fill('Casey local draft');
  graph.messages['chat-alex'].push(message('incoming', 'New synced message'));
  await page.clock.runFor(31_000);
  await expect.poll(() => graph.calls.filter(c => c.command === 'graph_chats').length).toBe(2);
  await expect(input).toHaveValue('Casey local draft');
  await row(page, alex.displayName).click();
  await expect(input).toHaveValue('Alex draft');
  await expect(page.getByRole('region', { name: 'Chat messages' })).toContainText('New synced message');
  await row(page, blair.displayName).click();
  await expect(input).toHaveValue('Blair draft');
  await page.clock.runFor(5_000);
  await expect(input).toHaveValue('Blair draft');
  await row(page, casey.displayName).click();
  await expect(input).toHaveValue('Casey local draft');
  expect(graph.writes).toEqual([]);
});

test('finishing a send while viewing another chat preserves that chat draft', async ({ page, graph }) => {
  graph.allowWrites = true;
  let finish!: () => void;
  graph.sendGate = new Promise(resolve => { finish = resolve; });
  await signIn(page);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Alex untouched');
  await openDraft(page);
  await input.fill('For Casey only');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => graph.writes.length).toBe(2);
  await row(page, alex.displayName).click();
  await expect(input).toHaveValue('Alex untouched');
  finish();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('Alex untouched');
  await row(page, casey.displayName).click();
  await expect(input).toHaveValue('');
});

test('a conversation discovered by sync before first Send is reused', async ({ page, graph }) => {
  graph.allowWrites = true;
  await signIn(page);
  await openDraft(page);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Use synced chat');
  graph.chats.push(chat('chat-casey', casey));
  await page.clock.runFor(31_000);
  await expect.poll(() => graph.calls.filter(c => c.command === 'graph_chats').length).toBe(2);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
  expect(graph.writes.map(c => c.command)).toEqual(['graph_send_message']);
  expect(graph.writes[0].args.chatId).toBe('chat-casey');
  await expect(row(page, casey.displayName)).toHaveCount(1);
});
