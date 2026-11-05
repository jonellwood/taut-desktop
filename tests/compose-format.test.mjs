import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatDraft,bulletEnter} from '../src/lib/compose-format.ts';
import {submitMessage} from '../src/lib/pending.ts';
test('formatted code retains whitespace and treats HTML as literal code',()=>{
 const code="\t$x = '<script>'\n\n  Write-Host $x";
 const result=formatDraft('**Try this**\n```powershell\n'+code+'\n```\n- One\n- Two');
 assert.match(result.html,/<strong>Try this<\/strong>/);assert.match(result.html,/codeblock class="powershell"/);assert.match(result.html,/\t\$x = &#39;&lt;script&gt;&#39;\n\n  Write-Host \$x/);assert.match(result.html,/<ul><li>One<\/li><li>Two<\/li><\/ul>/);
 assert.equal(formatDraft('```php\n \n```').visible,'');
 assert.equal(formatDraft('```malicious" onclick="x\necho 1;\n```').html,'<codeblock class="plaintext"><code>echo 1;</code></codeblock>');
});
test('inline formatting and links escape markup and unsafe URLs',()=>{
 const {html}=formatDraft('`<b>` **safe** [Go](https://example.com) [No](javascript:alert) <img>\n1. First\n2. Second');
 assert.match(html,/<code>&lt;b&gt;<\/code>/);assert.match(html,/<ol><li>First<\/li><li>Second<\/li><\/ol>/);assert.ok(!html.includes('<img>'));assert.ok(!html.includes('href="javascript:'));assert.ok(html.includes('<a href="https://example.com">Go</a>'));
});
test('blank formatting cannot create a conversation or prepare attachments',async()=>{
 const calls=[];const invoke=async(...args)=>{calls.push(args);return{id:'id'}};
 for(const group of [undefined,{recipients:['a','b'],topic:'Test'}])await assert.rejects(submitMessage(invoke,'pending:x',group?undefined:'other','me','```php\n \n```',()=>{},async()=>{throw Error('must not prepare')},group,true),/nonempty/);
 assert.deepEqual(calls,[]);
});
test('formatted first send forwards source safely and retains created ID on partial failure',async()=>{
 const calls=[];let retained='';const invoke=async(command,args)=>{calls.push({command,args});if(command==='graph_send_message')throw Error('network');return{id:'created'}};
 await assert.rejects(submitMessage(invoke,'pending:other','other','me','**Hello**',id=>retained=id,undefined,undefined,true),/draft is saved/);
 assert.equal(retained,'created');assert.deepEqual(calls.map(c=>c.command),['graph_create_chat','graph_send_message']);assert.equal(calls[0].args.formatted,true);assert.equal(calls[1].args.text,'**Hello**');
});

test('Enter continues and exits bullets only at a collapsed end caret outside code',()=>{
 assert.deepEqual(bulletEnter('- First',7,7),{text:'- First\n- ',caret:10});
 assert.deepEqual(bulletEnter('- First\n- ',10,10),{text:'- First\n\n',caret:9});
 assert.deepEqual(bulletEnter('- ',2,2),{text:'\n',caret:1});
 assert.equal(bulletEnter('- First',4,4),null);
 assert.equal(bulletEnter('- First',2,7),null);
 assert.equal(bulletEnter('ordinary',8,8),null);
 const code='```text\n- literal';assert.equal(bulletEnter(code,code.length,code.length),null);
 const after='```text\n- literal\n```\n- First';assert.ok(bulletEnter(after,after.length,after.length));
 assert.deepEqual(bulletEnter('- First\nAfter',7,7),{text:'- First\n- \nAfter',caret:10});
});

test('message budget accepts long snippets and counts UTF-8, UTF-16 and escaped HTML',async()=>{
 const {messageSizeError,messageBytes,changeCodeLanguage,currentCodeLanguage}=await import('../src/lib/compose-format.ts');
 const code='```php\n'+"$value = 'hello';\n".repeat(400)+'```';
 assert.equal(messageSizeError(code,true),'');assert.equal(messageBytes('😀'),4);
 assert.match(messageSizeError('😀'.repeat(17000)),/too large/);
 assert.match(messageSizeError('```php\n'+'&'.repeat(8000)+'\n```',true),/too large/);
 const calls=[];await assert.rejects(submitMessage(async(...args)=>{calls.push(args);return{id:'created'}},'pending:other','other','me','```php\n'+'&'.repeat(8000)+'\n```',()=>{},async()=>['file'],undefined,true),/too large/);assert.deepEqual(calls,[]);
 assert.equal(currentCodeLanguage('```php\necho 1;\n```',10,10),'php');
 const crlf=changeCodeLanguage('```powershell\r\necho 1;\r\n```',16,16,'php');assert.equal(crlf.text,'```php\r\necho 1;\r\n```');
 const source='```powershell\necho "<safe>";\n```';const changed=changeCodeLanguage(source,20,20,'php');assert.equal(changed.text,'```php\necho "<safe>";\n```');assert.equal(changed.start,13);
 const multiple='```php\nfirst\n```\n```javascript\nsecond\n```';assert.ok(changeCodeLanguage(multiple,multiple.indexOf('second'),multiple.indexOf('second'),'php').text.includes('```php\nsecond'));
});
