import { test, expect, signIn, row, alex, blair } from './fixtures';

const input=(page:import('@playwright/test').Page)=>page.getByRole('textbox',{name:'Message',exact:true});
async function expectUnclipped(page:import('@playwright/test').Page){
  await expect.poll(()=>input(page).evaluate(node=>({vertical:node.scrollHeight<=node.clientHeight+1,horizontal:node.scrollWidth<=node.clientWidth+1}))).toEqual({vertical:true,horizontal:true});
}

test('composer grows for wrapping and newlines and shrinks when text is removed',async({page,graph},testInfo)=>{
  await signIn(page);
  const before=await input(page).evaluate(node=>node.clientHeight);
  const text=('A longer draft should stay readable without horizontal scrolling. ').repeat(18)+'\nFinal line of the message.';
  await input(page).fill(text);
  await expect.poll(()=>input(page).evaluate(node=>node.clientHeight)).toBeGreaterThan(before*3);
  await expectUnclipped(page);
  await expect(input(page)).toHaveValue(text);
  await page.screenshot({path:testInfo.outputPath('expanded-composer.png')});
  await input(page).fill('Short');
  await expect.poll(()=>input(page).evaluate(node=>node.clientHeight)).toBe(before);
  expect(graph.writes).toEqual([]);
});

test('draft restoration and window width changes resize the entire message',async({page,graph})=>{
  await signIn(page);
  await page.clock.resume();
  const text='This draft remains visible while switching between conversations and resizing the window. '.repeat(14);
  await input(page).fill(text);await expectUnclipped(page);
  const wide=await input(page).evaluate(node=>node.clientHeight);
  await row(page,blair.displayName).click();await expect(input(page)).toHaveValue('');
  await row(page,alex.displayName).click();await expect(input(page)).toHaveValue(text);await expectUnclipped(page);
  await page.setViewportSize({width:1000,height:1000});
  await expect.poll(()=>input(page).evaluate(node=>node.clientHeight)).toBeGreaterThan(wide);
  await expectUnclipped(page);
  await page.setViewportSize({width:1440,height:1000});await expectUnclipped(page);
  expect(graph.writes).toEqual([]);
});

test('Shift+Enter adds a newline, IME Enter does not send, Enter sends exactly once',async({page,graph})=>{
  graph.allowWrites=true;await signIn(page);
  await input(page).fill('First line');await input(page).press('End');
  await input(page).press('Shift+Enter');await input(page).pressSequentially('Second line');
  await expect(input(page)).toHaveValue('First line\nSecond line');
  expect(graph.writes).toEqual([]);
  await input(page).dispatchEvent('keydown',{key:'Enter',isComposing:true});expect(graph.writes).toEqual([]);
  await input(page).press('Enter');await expect(input(page)).toHaveValue('');
  expect(graph.writes.map(c=>c.command)).toEqual(['graph_send_message']);
  expect(graph.writes[0].args.text).toBe('First line\nSecond line');
  await expectUnclipped(page);
});
