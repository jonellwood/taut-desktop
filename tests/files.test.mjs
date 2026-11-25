import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeFiles,fileSize,fileDate,fileLocation} from '../src/lib/files.ts';
test('OneDrive pages retain identity and safe presentation of missing metadata',()=>{
 assert.deepEqual(mergeFiles([{id:'a',name:'old'}],[{id:'a',name:'new'},{id:'b',name:'other'}]).map(x=>x.name),['new','other']);
 assert.equal(fileSize(1024),'1.0 KB');assert.equal(fileSize(NaN),'Size unavailable');assert.equal(fileDate('bad'),'Date unavailable');
 assert.equal(fileLocation({location:'/drives/drive/root:/Project%20files'}),'/Project files');assert.equal(fileLocation({location:null}),'My OneDrive');
});

test('file categories use folders, MIME and extensions consistently',async()=>{
 const {fileKind,filterFiles}=await import('../src/lib/files.ts');
 const item=(name,mime='',folder=false)=>({id:name,name,mime,folder});
 for(const [file,category,icon] of [[item('Notes.PDF'),'pdf','pdf'],[item('report.docx'),'documents','document'],[item('budget.xlsx'),'documents','sheet'],[item('slides.pptx'),'documents','slides'],[item('main.rs'),'documents','code'],[item('photo','image/jpeg'),'images','image'],[item('movie.mov'),'video','video'],[item('song.mp3'),'audio','audio'],[item('backup.zip'),'archives','archive'],[item('Pictures.pdf','',true),'folders','folder'],[item('unknown.bin'),'other','file']]){
  assert.equal(fileKind(file).category,category);assert.equal(fileKind(file).icon,icon);
 }
 const rows=[item('one.pdf'),item('two.docx'),item('three.zip')];assert.deepEqual(filterFiles(rows,'pdf').map(x=>x.name),['one.pdf']);assert.equal(filterFiles(rows,'all').length,3);assert.equal(filterFiles(rows,'images').length,0);
});

test('recently added uses creation instant, folders first and unknown dates last',async()=>{
 const {sortFiles}=await import('../src/lib/files.ts');
 const rows=[{id:'a',name:'Old',created:'2026-11-24T10:00:00Z',modified:'2026-11-25T10:00:00Z'},{id:'b',name:'New',created:'2026-11-24T06:00:00-05:00'},{id:'c',name:'Unknown'},{id:'d',name:'Folder',folder:true}];
 assert.deepEqual(sortFiles(rows,'created').map(x=>x.id),['d','b','a','c']);
 assert.deepEqual(sortFiles(rows,'modified').map(x=>x.id),['d','a','b','c']);
 assert.equal(rows[0].id,'a');
});
