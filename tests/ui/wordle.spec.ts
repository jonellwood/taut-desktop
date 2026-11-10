import {test,expect,signIn,message} from './fixtures';
const result='BC Wordle #309 5/6\n\n⬛⬛⬛⬛🟩\n⬛🟩⬛⬛🟩\n⬛🟩🟩⬛🟩\n🟨🟩🟩⬛🟩\n🟩🟩🟩🟩🟩\n\nmy.berkeleycountysc.gov/wordle';
test('Wordle plain text and Teams HTML keep the same compact rows',async({page,graph},info)=>{
 const html=result.replaceAll('\n','<br>\n');
 graph.messages['chat-alex']=[{...message('plain',''),body:{contentType:'text',content:result}},message('teams',html)];
 await signIn(page);
 const bodies=page.locator('.messages .received-body');
 await expect(bodies).toHaveCount(2);
 const heights=await bodies.evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().height));
 expect(Math.abs(heights[0]-heights[1])).toBeLessThan(3);
 await expect(bodies.nth(1).locator('br')).toHaveCount(result.split("\n").length-1);
 await page.screenshot({path:info.outputPath('wordle.png')});
 graph.allowWrites=true;
 await page.getByRole('textbox',{name:'Message',exact:true}).fill(result);
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(bodies).toHaveCount(3);
 await expect(bodies.nth(2).locator('br')).toHaveCount(result.split("\n").length-1);
 expect(graph.calls.find(c=>c.command==='graph_send_message')?.args.text).toBe(result);
});
