import {test,expect,signIn,message,me} from './fixtures';
const source='# Connect to Microsoft Graph\nConnect-MgGraph -Scopes "Directory.Read.All"\n\n\t$OUName = "EMS"\nif ($OUName -eq "EMS") {\n    Write-Host "<tag> & value"\n}\n'.replaceAll('\\n','\n');
function escape(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
function block(code=source,language='PowerShell'){return '<codeblock class="'+language+'"><code>'+escape(code).replaceAll('\n','<br>')+'</code></codeblock>';}
test('Teams codeblock retains exact PowerShell source and copies it without line numbers',async({page,graph},info)=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).copiedCode=text;}}}));
 graph.messages['chat-alex']=[{...message('code',''),body:{contentType:'html',content:'<p>Please try this:</p>'+block()}}];
 await signIn(page);const code=page.getByRole('region',{name:'PowerShell code block'});
 await expect(code).toBeVisible();expect(await code.locator('pre code').textContent()).toBe(source);
 await expect(code.locator('.command')).toContainText(['Connect-MgGraph','-eq','Write-Host'].filter(v=>v!=='-eq'));
 await code.getByRole('button',{name:'Copy code'}).click();await expect(code.getByRole('status')).toContainText('Copied');
 expect(await page.evaluate(()=>(window as any).copiedCode)).toBe(source);
 await page.screenshot({path:info.outputPath('powershell-formatting.png')});expect(graph.writes).toEqual([]);
});
test('rich text uses safe elements, explicit links and never loads embedded resources',async({page,graph})=>{
 const html='<p>Hello <strong>bold</strong> and <em>italic</em><br>next line <code>$literal</code></p><ol start="3"><li>First</li><li>Second</li></ol><blockquote>Quoted context</blockquote><a href="https://example.com/help">Open help</a><a href="javascript:alert(1)">Unsafe link</a><img src="https://untrusted.invalid/image" onerror="window.bad=true"><script>window.bad=true</script><iframe src="https://untrusted.invalid/frame"></iframe><svg onload="window.bad=true"></svg><object data="https://untrusted.invalid/object"></object>';
 graph.messages['chat-alex']=[{...message('rich',''),body:{contentType:'html',content:html}}];await signIn(page);
 const body=page.locator('.messages .received-body');await expect(body.locator('strong')).toHaveText('bold');await expect(body.locator('em')).toHaveText('italic');
 await expect(body.locator('ol')).toHaveAttribute('start','3');await expect(body.locator('blockquote')).toHaveText('Quoted context');await expect(body.locator('code')).toHaveText('$literal');
 await expect(body.getByRole('button',{name:'Unsafe link'})).toHaveCount(0);await expect(body.locator('script,img,iframe,svg,object')).toHaveCount(0);
 await body.getByRole('button',{name:'Open help'}).click();expect(graph.calls.filter(c=>c.command==='plugin:opener|open_url').at(-1)?.args.url).toBe('https://example.com/help');
 expect(await page.evaluate(()=>(window as any).bad)).toBeUndefined();expect(graph.writes).toEqual([]);
});
test('plain text remains literal and preformatted unknown languages fall back safely',async({page,graph})=>{
 graph.messages['chat-alex']=[{...message('plain',''),body:{contentType:'text',content:'<b>literal</b>\n  $name & value'}},{...message('unknown',''),body:{contentType:'html',content:'<pre class="language-unknownlang"><code>'+escape('  <literal>\n\tspaces\n\n')+'</code></pre>'}}];
 await signIn(page);await expect(page.locator('.messages .received-body').first()).toHaveText('<b>literal</b>\n  $name & value');
 await expect(page.locator('.messages .received-body').first().locator('b')).toHaveCount(0);
 const code=page.getByRole('region',{name:'unknownlang code block'});expect(await code.locator('pre code').textContent()).toBe('  <literal>\n\tspaces\n\n');expect(graph.writes).toEqual([]);
});
test('format-only refresh updates content and deleted bodies never render code',async({page,graph})=>{
 graph.messages['chat-alex']=[{...message('same',''),body:{contentType:'html',content:'<p>Same <strong>words</strong></p>'}},{...message('deleted',''),deletedDateTime:'2026-11-04',body:{contentType:'html',content:block('SECRET CODE')}}];await signIn(page);
 await expect(page.locator('.messages .received-body strong')).toHaveText('words');await expect(page.locator('.messages')).not.toContainText('SECRET CODE');await expect(page.getByRole('button',{name:'Copy code'})).toHaveCount(0);
 graph.messages['chat-alex'][0].body.content='<p>Same <em>words</em></p>';
 await page.getByRole('button',{name:'Refresh messages',exact:true}).click();await expect(page.locator('.messages .received-body em')).toHaveText('words');await expect(page.locator('.messages .received-body strong')).toHaveCount(0);expect(graph.writes).toEqual([]);
});
test('quoted parent and reply pane share code formatting and copy failure keeps code selectable',async({page,graph})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('Denied');}}}));
 graph.messages['chat-alex']=[{...message('root',''),body:{contentType:'html',content:block()}},{...message('reply','',me.id),body:{contentType:'html',content:'<pre><code>reply\n  code</code></pre>'},attachments:[{id:'root',contentType:'messageReference',content:JSON.stringify({messageId:'root'})}]}];
 await signIn(page);await page.getByRole('button',{name:'View chat replies',exact:true}).first().click();const pane=page.getByRole('complementary',{name:'Chat reply thread'});
 expect(await pane.getByRole('region',{name:'PowerShell code block'}).locator('pre code').textContent()).toBe(source);
 await expect(pane.getByRole('region',{name:'Plain text code block'})).toContainText('reply');
 await pane.getByRole('button',{name:'Copy code'}).first().click();await expect(pane.getByRole('status')).toContainText('Copy unavailable');expect(graph.writes).toEqual([]);
});
test('channel posts, originals and replies all use the shared renderer',async({page,graph})=>{
 graph.teamData.posts=[{id:'post',subject:'Code review',from:{user:{displayName:'Alex Example'}},body:{contentType:'html',content:block()}}];
 graph.teamData.replies=[{id:'reply',body:{contentType:'html',content:'<p><strong>Looks good</strong></p><pre><code>reply\ncode</code></pre>'}}];
 await signIn(page);await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 expect(await page.getByRole('region',{name:'Channel posts',exact:true}).locator('pre code').textContent()).toBe(source);
 await page.getByRole('button',{name:'View replies',exact:true}).click();const pane=page.getByRole('complementary',{name:'Channel thread',exact:true});
 expect(await pane.getByRole('region',{name:'PowerShell code block'}).locator('pre code').textContent()).toBe(source);await expect(pane.locator('strong').filter({hasText:'Looks good'})).toBeVisible();expect(graph.writes).toEqual([]);
});

test('highlight wrappers and HTML spaces preserve source and long lines scroll within the bubble',async({page,graph})=>{
 const long='Write-Host "'+'x'.repeat(400)+'"';
 const expected='\n\u00a0\u00a0$Value = "<safe>"\n\t'+long+'\n\n';
 graph.messages['chat-alex']=[{...message('long',''),body:{contentType:'html',content:'<codeblock class="PowerShell"><code><br>&nbsp;&nbsp;<span class="hljs-variable">$Value</span> = &quot;&lt;safe&gt;&quot;<br>\t'+escape(long)+'<br><br></code></codeblock>'}}];await signIn(page);
 const block=page.getByRole('region',{name:'PowerShell code block'});
 expect(await block.locator('pre code').textContent()).toBe(expected);
 await expect.poll(()=>block.locator('.code-scroll').evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
 const viewport=await page.locator('.messages').boundingBox();const code=await block.boundingBox();expect(code!.width).toBeLessThan(viewport!.width);
 expect(graph.writes).toEqual([]);
});
