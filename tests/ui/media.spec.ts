import { test, expect, signIn, row, alex, blair, message, image } from './fixtures';

test('attachments still open through the mocked opener and reject unsafe domains', async ({ page, graph }) => {
  const files = message('files', 'Shared documents');
  files.attachments = [
    { id: 'safe', name: 'Planning.pdf', contentType: 'reference', contentUrl: 'https://example.sharepoint.com/Planning.pdf' },
    { id: 'unsafe', name: 'Untrusted.pdf', contentType: 'reference', contentUrl: 'https://example.invalid/Untrusted.pdf' },
  ];
  graph.messages['chat-alex'] = [files];
  await signIn(page);
  await page.getByRole('button', { name: 'Planning.pdf' }).click();
  await expect.poll(() => graph.calls.filter(c => c.command === 'plugin:opener|open_url').length).toBe(1);
  expect(graph.calls.find(c => c.command === 'plugin:opener|open_url')?.args.url).toBe(files.attachments[0].contentUrl);
  await page.getByRole('button', { name: 'Untrusted.pdf' }).click();
  await expect(page.getByRole('alert')).toContainText('cannot safely open');
  expect(graph.calls.filter(c => c.command === 'plugin:opener|open_url')).toHaveLength(1);
  expect(graph.writes).toEqual([]);
});

test('images load only on click, survive switching, and open and close in the viewer', async ({ page, graph }) => {
  graph.messages['chat-alex'] = [
    { ...message('system', ''), messageType: 'systemEventMessage' },
    message('picture', '<img src="../hostedContents/image-1/$value" />'),
  ];
  await signIn(page);
  await expect(page.getByText('Unsupported message content', { exact: true })).toHaveCount(0);
  expect(graph.calls.filter(c => c.command === 'graph_hosted_image')).toHaveLength(0);
  await page.getByRole('button', { name: 'View shared image', exact: true }).click();
  const preview = page.getByRole('button', { name: 'Open shared image full screen' });
  await expect(preview).toBeVisible();
  expect(graph.calls.find(c => c.command === 'graph_hosted_image')?.args).toEqual({ chatId: 'chat-alex', messageId: 'picture', contentId: 'image-1' });
  await preview.click();
  await expect(page.locator('.image-lightbox img')).toHaveAttribute('src', image);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.image-lightbox img')).toHaveAttribute('style', /scale\(1.25\)/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.image-lightbox')).toHaveCount(0);
  await row(page, blair.displayName).click();
  await row(page, alex.displayName).click();
  await expect(preview).toBeVisible();
  expect(graph.calls.filter(c => c.command === 'graph_hosted_image')).toHaveLength(1);
  expect(graph.writes).toEqual([]);
});

test('repeated attachment IDs preserve history and allow chat/workspace switching',async({page,graph})=>{
 const repeated='81496ff4-75b6-4961-bc40-b6915af5d737';
 const shared=message('shared','Shared files');shared.attachments=[
  {id:'first',name:'First.pdf',contentType:'reference',contentUrl:'https://example.sharepoint.com/first.pdf'},
  {id:repeated,name:'Report.pdf',contentType:'reference',contentUrl:'https://example.sharepoint.com/report.pdf'},
  {id:repeated,name:'Report.pdf',contentType:'reference',contentUrl:'https://example.sharepoint.com/report.pdf'},
  {id:repeated,name:'Different.pdf',contentType:'reference',contentUrl:'https://example.sharepoint.com/different.pdf'},
 ];
 graph.messages['chat-alex']=[message('old','Earlier conversation remains'),shared,message('new','Newest message')];graph.messages['chat-blair']=[message('blair-history','Blair history only')];
 await signIn(page);await expect(page.getByRole('region',{name:'Chat messages'})).toContainText('Earlier conversation remains');await expect(page.getByRole('button',{name:'Report.pdf',exact:true})).toHaveCount(1);await expect(page.getByRole('button',{name:'Different.pdf',exact:true})).toBeVisible();
 await row(page,blair.displayName).click();await expect(page.getByRole('region',{name:'Chat messages'})).toContainText('Blair history only');await expect(page.getByRole('region',{name:'Chat messages'})).not.toContainText('Newest message');
 for(const workspace of ['Calendar','People']){await page.getByRole('button',{name:workspace,exact:true}).click();await page.getByRole('button',{name:'Chats',exact:true}).click();await row(page,alex.displayName).click();await expect(page.getByRole('region',{name:'Chat messages'})).toContainText('Earlier conversation remains');await expect(page.locator('.calendar-workspace,.people-workspace')).toHaveCount(0);}
 expect(graph.writes).toEqual([]);
});
