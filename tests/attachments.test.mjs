import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateFiles,MAX_FILE_BYTES,MAX_DRAFT_BYTES} from '../src/lib/attachments.ts';
import {submitMessage} from '../src/lib/pending.ts';

test('attachment limits reject unsafe filenames, empty/large files, excess count and total size',()=>{
 for(const file of [{name:'empty.txt',size:0},{name:'big',size:MAX_FILE_BYTES+1},{name:'../secret',size:1},{name:'bad?.txt',size:1},{name:'bad.',size:1}])assert.throws(()=>validateFiles([],[file]));
 assert.throws(()=>validateFiles(Array(5).fill({size:1}),[{name:'sixth',size:1}]));
 assert.throws(()=>validateFiles([],[1,2,3].map(n=>({name:`${n}.txt`,size:MAX_DRAFT_BYTES/3+1}))));
 assert.doesNotThrow(()=>validateFiles([],[{name:'Report #1 & notes.pdf',size:MAX_FILE_BYTES}]));
});
test('pending attachment-only send never creates or uploads',async()=>{
 await assert.rejects(submitMessage(async()=>assert.fail(),'pending:other','other','me',' ',()=>assert.fail(),async()=>assert.fail()));
});
test('first attachment Send creates before preparing, then sends a reference message',async()=>{
 const calls=[];
 await submitMessage(async(cmd,args)=>{calls.push([cmd,args]);return {id:cmd==='graph_create_chat'?'created':'sent'};},'pending:other','other','me','Hello',id=>calls.push(['retained',id]),async id=>{calls.push(['prepare',id]);return ['file'];});
 assert.deepEqual(calls.map(c=>c[0]),['graph_create_chat','retained','prepare','graph_send_attachments']);
 assert.deepEqual(calls[3][1],{chatId:'created',text:'Hello',ids:['file']});
});
test('preparation failure keeps created ID and never sends text without its files',async()=>{
 let retained;const calls=[];
 await assert.rejects(submitMessage(async cmd=>{calls.push(cmd);return {id:'created'};},'pending:other','other','me','Hello',id=>retained=id,async()=>{throw Error('sharing failed');}),/sharing failed/);
 assert.equal(retained,'created');assert.deepEqual(calls,['graph_create_chat']);
});
test('existing chats accept attachment-only messages',async()=>{
 const calls=[];
 await submitMessage(async(cmd,args)=>{calls.push([cmd,args]);return {id:'sent'};},'chat',undefined,'me','',()=>assert.fail(),async()=>['file']);
 assert.equal(calls[0][0],'graph_send_attachments');assert.equal(calls[0][1].text,'');
});

test('empty preparation result never silently sends text without its attachments',async()=>{
 await assert.rejects(submitMessage(async()=>assert.fail('No write expected'),'chat',undefined,'me','Hello',()=>assert.fail(),async()=>[]),/No attachments are ready/);
});

test('pasted raster images keep exact bytes and receive safe unique filenames',async()=>{
 const {clipboardImages}=await import('../src/lib/attachments.ts');
 const file=new File([new Uint8Array([137,80,78,71,0,255])],'image.png',{type:'image/png'});
 const data={items:[{kind:'file',type:'image/png',getAsFile:()=>file}],files:[file]};
 const first=clipboardImages(data)[0],second=clipboardImages(data)[0];
 assert.deepEqual(new Uint8Array(await first.arrayBuffer()),new Uint8Array(await file.arrayBuffer()));
 assert.match(first.name,/^Clipboard image .*\.png$/);assert.notEqual(first.name,second.name);assert.doesNotThrow(()=>validateFiles([],[first]));assert.equal(clipboardImages(data).length,1);
 assert.deepEqual(clipboardImages({items:[{kind:'string',type:'text/html'}],files:[]}),[]);
 assert.throws(()=>clipboardImages({items:[{kind:'file',type:'image/svg+xml',getAsFile:()=>file}],files:[]}),/PNG/);
});
test('drop extraction rejects folders and never treats links as files',async()=>{
 const {droppedFiles,transferHasFiles}=await import('../src/lib/attachments.ts');
 assert.equal(transferHasFiles({types:['text/uri-list'],items:[],files:[]}),false);
 assert.equal(transferHasFiles({types:['Files'],items:[],files:[]}),true);
 const file=new File(['data'],'notes.txt');assert.deepEqual(droppedFiles({items:[],files:[file]}),[file]);
 assert.throws(()=>droppedFiles({items:[{kind:'file',webkitGetAsEntry:()=>({isDirectory:true})}],files:[]}),/Folders/);
});
