import {test} from 'node:test';import assert from 'node:assert/strict';
import {draftError,mailContent,restoreDrafts,draftKey} from '../src/lib/mail-drafts.ts';
const draft=()=>({id:'draft',to:'a@example.test',cc:'',bcc:'',subject:'Subject',text:'Hello',formatted:false,updated:1});
test('mail drafts validate recipients, duplicates and message before Send',()=>{
 assert.equal(draftError(draft()),'');for(const patch of [{to:''},{to:'a@example.test\r\nBcc: other@example.test'},{cc:'A@example.test'},{subject:''},{text:' '},{text:'x'.repeat(200001)}])assert.ok(draftError({...draft(),...patch}));
});
test('mail formatting uses portable HTML and escapes raw markup',()=>{
 const html=mailContent({...draft(),formatted:true,text:'**hello**\n```php\n$a = "<script>";\n```'});assert.match(html,/<strong>hello<\/strong>/);assert.match(html,/<pre><code class="language-php">/);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('codeblock'));
});
test('local drafts preserve uncertain sends and isolate account storage',()=>{
 assert.deepEqual(restoreDrafts('oops'),[]);assert.deepEqual(restoreDrafts('{}'),[]);assert.equal(restoreDrafts(JSON.stringify([{...draft(),uncertain:true}]))[0].uncertain,true);assert.notEqual(draftKey('account-one'),draftKey('account-two'));assert.equal(draftKey('ABC'),draftKey('abc'));
});

test('reply recipients honor Reply-To, exclude self and deduplicate across To/Cc',async()=>{
 const {responseDraft}=await import('../src/lib/mail-drafts.ts');const a=address=>({emailAddress:{address}});
 const m={id:'original',subject:'Project',from:a('sender@example.test'),replyTo:[a('reply@example.test')],toRecipients:[a('me@example.test'),a('peer@example.test')],ccRecipients:[a('PEER@example.test'),a('other@example.test')],body:{contentType:'text',content:'Original **literal** <script>'}};
 const reply=responseDraft(m,'reply',['me@example.test']);assert.equal(reply.to,'reply@example.test');assert.equal(reply.cc,'');
 const all=responseDraft(m,'replyAll',['me@example.test']);assert.equal(all.to,'reply@example.test; peer@example.test');assert.equal(all.cc,'other@example.test');assert.equal(all.sourceId,'original');assert.equal(restoreDrafts(JSON.stringify([all]))[0].action,'replyAll');
 const html=mailContent({...all,text:'**New text**',formatted:true});assert.match(html,/<strong>New text<\/strong>/);assert.match(html,/Original \*\*literal\*\* &lt;script&gt;/);assert.ok(draftError(all));
 const f=responseDraft(m,'forward',[]);assert.equal(f.to,'');assert.equal(f.subject,'FW: Project');assert.ok(draftError({...f,text:'Forwarding'}));
 const sent=responseDraft({...m,from:a('me@example.test')},'reply',['me@example.test']);assert.equal(sent.to,'peer@example.test');
});

test('inline mail images use escaped CID markup and preserve draft metadata',()=>{
 const id='12345678-1234-1234-1234-123456789abc';const file={id,name:'photo"<.png',size:3,contentType:'image/png',inline:true};
 const d={...draft(),text:`Hello\n[image:${id}]`,attachments:[file]};
 assert.equal(draftError(d),'');assert.match(mailContent(d),/src="cid:taut-/);assert.match(mailContent(d),/photo&quot;&lt;.png/);assert.deepEqual(restoreDrafts(JSON.stringify([d]))[0].attachments,[file]);
 assert.ok(draftError({...d,text:'No marker'}));assert.ok(draftError({...d,formatted:true,text:`\`\`\`\n[image:${id}]\n\`\`\``}));
});
test('mail attachment staging rejects oversized and excessive files atomically',async()=>{
 const {validateMailFiles}=await import('../src/lib/mail-attachments.ts');
 assert.throws(()=>validateMailFiles([], [{name:'large.pdf',size:2097153}]),/2 MB/);
 assert.throws(()=>validateMailFiles([],Array.from({length:6},()=>({name:'a',size:1}))),/5 files/);
 assert.throws(()=>validateMailFiles([],[{name:'empty',size:0}]),/nonempty/);
 assert.doesNotThrow(()=>validateMailFiles([],[{name:'a.pdf',size:2097152}]));
});
test('signature content is escaped, separate and survives draft restoration',()=>{
 const d={...draft(),signature:'**Name**\n<script>no</script>'};assert.equal(d.text,'Hello');assert.match(mailContent(d),/<strong>Name<\/strong>/);assert.ok(!mailContent(d).includes('<script>'));assert.equal(restoreDrafts(JSON.stringify([d]))[0].signature,d.signature);
});
test('chat email drafts quote source and loaded replies without copying recipients or files',async()=>{
 const {chatMailDraft}=await import('../src/lib/chat-mail.ts');const d=chatMailDraft('Group',{id:'one',sender:'them',senderName:'Alex',text:'Original',time:'10:00',attachments:[{name:'report.pdf'}]},[{id:'two',sender:'me',text:'Reply',time:'10:01'}]);assert.equal(d.to,'');assert.equal(d.text,'');assert.match(d.context,/Alex.*10:00/);assert.match(d.context,/Reply/);assert.equal(d.attachments,undefined);assert.ok(draftError(d));
});

test('chat reference is HTML, escaped and precedes the reply',async()=>{
 const {chatMailDraft}=await import('../src/lib/chat-mail.ts');const d=chatMailDraft('Alex',{id:'one',sender:'them',text:'<script>original</script>',time:'10:00'},[],'alex@example.com');d.text='My reply';const html=mailContent(d);assert.equal(d.to,'alex@example.com');assert.match(html,/<h3>In reference to<\/h3>/);assert.match(html,/border-left:/);assert.ok(html.indexOf('original')<html.indexOf('My reply'));assert.ok(!html.includes('<script>'));assert.equal(restoreDrafts(JSON.stringify([d]))[0].referenceFirst,true);
});
