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
