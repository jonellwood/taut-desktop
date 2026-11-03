import { test, expect, signIn, openDraft, row, alex, blair, casey } from './fixtures';

const file = (name='notes.txt',content='local file contents') => ({name,mimeType:'text/plain',buffer:Buffer.from(content)});
const picker = (page:import('@playwright/test').Page) => page.getByLabel('Choose attachment files');
const tray = (page:import('@playwright/test').Page) => page.getByRole('region',{name:'Draft attachments'});

test('file selection, switching, sync, and removal are local and preserve separate file drafts',async({page,graph})=>{
  await signIn(page);
  await picker(page).setInputFiles(file());
  await expect(tray(page)).toContainText('notes.txt');
  await row(page,blair.displayName).click();
  await expect(tray(page)).toHaveCount(0);
  await picker(page).setInputFiles(file('blair.txt'));
  await expect(tray(page)).toContainText('blair.txt');
  await openDraft(page);
  await picker(page).setInputFiles(file('casey.txt'));
  await expect(tray(page)).toContainText('casey.txt');
  await page.clock.runFor(31_000);
  await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_chats').length).toBe(2);
  await expect(tray(page)).toContainText('casey.txt');
  await row(page,alex.displayName).click();
  await expect(tray(page)).toContainText('notes.txt');
  await page.getByRole('button',{name:'Remove notes.txt',exact:true}).click();
  await expect(tray(page)).toHaveCount(0);
  await row(page,blair.displayName).click();
  await expect(tray(page)).toContainText('blair.txt');
  expect(graph.writes).toEqual([]);
});

test('missing file permission blocks pending Send before chat creation or upload',async({page,graph})=>{
  await signIn(page);await openDraft(page);
  await picker(page).setInputFiles(file());
  await expect(tray(page)).toContainText('not enabled for this sign-in');
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('With file');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Files.ReadWrite');
  await expect(tray(page)).toContainText('notes.txt');
  expect(graph.writes).toEqual([]);
});

test('pending attachment-only submission never creates a chat',async({page,graph})=>{
  graph.attachmentPermission=true;
  await signIn(page);await openDraft(page);
  await picker(page).setInputFiles(file());
  await expect(tray(page)).toContainText('notes.txt');
  await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();
  await page.locator('form.composer').dispatchEvent('submit');
  await expect(page.getByRole('alert')).toContainText('Write a first message');
  expect(graph.writes).toEqual([]);
});

test('explicit first Send creates, prepares, and sends files then clears only submitted drafts',async({page,graph})=>{
  graph.attachmentPermission=true;graph.allowWrites=true;
  await signIn(page);await openDraft(page);
  await picker(page).setInputFiles([file(),file('second.txt')]);
  await expect(tray(page)).toContainText('second.txt');
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Files for Casey');
  expect(graph.writes).toHaveLength(0);
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(tray(page)).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('');
  await expect(page.getByRole('region',{name:'Chat messages'})).toContainText('notes.txt');
  expect(graph.writes.map(c=>c.command)).toEqual(['graph_create_chat','graph_prepare_attachment','graph_prepare_attachment','graph_send_attachments']);
  expect(graph.writes[1].args.chatId).toBe('chat-casey');
  expect(Buffer.from(graph.writes[1].args.data,'base64').toString()).toBe('local file contents');
  expect(graph.writes[3].args.ids).toHaveLength(2);
});

test('existing conversation accepts files without text',async({page,graph})=>{
  graph.attachmentPermission=true;graph.allowWrites=true;
  await signIn(page);await picker(page).setInputFiles(file());
  await expect(tray(page)).toContainText('notes.txt');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(tray(page)).toHaveCount(0);
  expect(graph.writes.map(c=>c.command)).toEqual(['graph_prepare_attachment','graph_send_attachments']);
  expect(graph.writes[1].args.text).toBe('');
});

test('upload or sharing failure retains first chat ID and all drafts without sending incomplete message',async({page,graph})=>{
  graph.attachmentPermission=true;graph.allowWrites=true;graph.prepareError='Mock upload or sharing failed';
  await signIn(page);await openDraft(page);await picker(page).setInputFiles(file());
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep files and text');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Mock upload or sharing failed');
  await expect(tray(page)).toContainText('notes.txt');
  await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep files and text');
  await page.clock.runFor(31_000);
  expect(graph.writes.map(c=>c.command)).toEqual(['graph_create_chat','graph_prepare_attachment']);
  graph.prepareError='';
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(tray(page)).toHaveCount(0);
  expect(graph.writes.filter(c=>c.command==='graph_create_chat')).toHaveLength(1);
  expect(graph.writes.at(-1)?.command).toBe('graph_send_attachments');
});

test('uncertain delivery saves prepared files and explicit retry reuses uploads',async({page,graph})=>{
  graph.attachmentPermission=true;graph.allowWrites=true;graph.sendError='Mock uncertain delivery';
  await signIn(page);await picker(page).setInputFiles(file());
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Check Teams');
  await expect(tray(page)).toContainText('Uploaded · ready to send');
  await page.clock.runFor(31_000);
  expect(graph.writes).toHaveLength(2);expect(graph.uploadCount).toBe(1);
  await row(page,blair.displayName).click();await row(page,alex.displayName).click();
  await expect(tray(page)).toContainText('notes.txt');
  graph.sendError='';await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(tray(page)).toHaveCount(0);expect(graph.uploadCount).toBe(1);
  expect(graph.writes.filter(c=>c.command==='graph_send_attachments')).toHaveLength(2);
});

test('finishing attachment send while viewing another chat preserves its text and files',async({page,graph})=>{
  graph.attachmentPermission=true;graph.allowWrites=true;
  let finish!:()=>void;graph.sendGate=new Promise(resolve=>{finish=resolve});
  await signIn(page);await picker(page).setInputFiles(file('alex.txt'));
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Alex draft');
  await openDraft(page);await picker(page).setInputFiles(file('casey.txt'));
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Casey files');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect.poll(()=>graph.writes.at(-1)?.command).toBe('graph_send_attachments');
  await row(page,alex.displayName).click();finish();
  await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeEnabled();
  await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Alex draft');
  await expect(tray(page)).toContainText('alex.txt');
  await row(page,casey.displayName).click();await expect(tray(page)).toHaveCount(0);
});

test('image preview is local and invalid or oversized selections leave existing files intact',async({page,graph})=>{
  await signIn(page);await picker(page).setInputFiles(file());
  await expect(tray(page)).toContainText('notes.txt');
  await picker(page).setInputFiles({name:'preview.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64')});
  await page.getByRole('button',{name:'Preview preview.png',exact:true}).click();
  await expect(page.locator('.image-lightbox img')).toHaveAttribute('src',/^data:image\/png;base64,/);
  await page.keyboard.press('Escape');
  await picker(page).setInputFiles(file('empty.txt',''));
  await expect(page.getByRole('alert')).toContainText('nonempty file');
  await expect(tray(page)).toContainText('notes.txt');
  await picker(page).setInputFiles({name:'huge.txt',mimeType:'text/plain',buffer:Buffer.alloc(10*1024*1024+1)});
  await expect(page.getByRole('alert')).toContainText('10 MB');
  await expect(tray(page)).toContainText('preview.png');
  expect(graph.writes).toEqual([]);
});
