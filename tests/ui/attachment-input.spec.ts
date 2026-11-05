import {test,expect,signIn,openDraft,row,alex,blair,image,type Page} from './fixtures';
const png=image.split(',')[1];
const tray=(page:Page)=>page.getByRole('region',{name:'Draft attachments'});
async function transfer(page:Page,kind:'paste'|'drop'|'dragover'|'dragleave',files:{name:string;type:string;data:string;base64?:boolean}[],target='form.composer',directory=false){
 return page.locator(target).evaluate((node,{kind,files,directory})=>{
  const data=new DataTransfer();for(const file of files){const bytes=file.base64?Uint8Array.from(atob(file.data),c=>c.charCodeAt(0)):file.data;data.items.add(new File([bytes],file.name,{type:file.type}));}
  if(directory)Object.defineProperty(data,'items',{value:[{kind:'file',type:'',webkitGetAsEntry:()=>({isDirectory:true})}]});
  const event=kind==='paste'?new Event('paste',{bubbles:true,cancelable:true}):new DragEvent(kind,{bubbles:true,cancelable:true,dataTransfer:data});
  if(kind==='paste')Object.defineProperty(event,'clipboardData',{value:data});
  node.dispatchEvent(event);return event.defaultPrevented;
 },{kind,files,directory});
}
const imageFile={name:'image.png',type:'image/png',data:png,base64:true};
const textFile=(name='notes.txt')=>({name,type:'text/plain',data:'exact local file contents'});

test('pasted images stage locally with preview and keep separate chat drafts',async({page,graph})=>{
 await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep text');
 expect(await transfer(page,'paste',[imageFile],'textarea[aria-label="Message"]')).toBe(true);
 await expect(tray(page)).toContainText('Clipboard image');await expect(tray(page).locator('img')).toHaveAttribute('src',image);
 const name=await tray(page).locator('strong').textContent();await page.getByRole('textbox',{name:'Message',exact:true}).press('ArrowRight');await row(page,blair.displayName).click();await expect(tray(page)).toHaveCount(0);
 await transfer(page,'drop',[textFile('blair.txt')]);await expect(tray(page)).toContainText('blair.txt');await row(page,alex.displayName).click();await expect(tray(page)).toContainText(name!);await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep text');
 await tray(page).getByRole('button',{name:/^Preview Clipboard image/}).click();await expect(page.locator('.image-lightbox img')).toHaveAttribute('src',image);await page.keyboard.press('Escape');
 await tray(page).getByRole('button',{name:/^Remove Clipboard image/}).click();await expect(tray(page)).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('drop cue is local and pending image/file send remains explicit with exact bytes',async({page,graph},info)=>{
 graph.attachmentPermission=true;graph.allowWrites=true;await signIn(page);await openDraft(page);
 await transfer(page,'dragover',[textFile()]);await expect(page.getByRole('status').filter({hasText:'Drop to attach'})).toBeVisible();await page.screenshot({path:info.outputPath('attachment-drop-cue.png')});
 await transfer(page,'drop',[textFile()]);await expect(page.getByRole('status').filter({hasText:'Drop to attach'})).toHaveCount(0);await expect(tray(page)).toContainText('notes.txt');
 await transfer(page,'paste',[imageFile],'textarea[aria-label="Message"]');await expect(tray(page)).toContainText('Clipboard image');await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();expect(graph.writes).toEqual([]);
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Explicit first message');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(tray(page)).toHaveCount(0);
 expect(graph.writes.map(c=>c.command)).toEqual(['graph_create_chat','graph_prepare_attachment','graph_prepare_attachment','graph_send_attachments']);
 expect(Buffer.from(graph.writes[1].args.data,'base64').toString()).toBe('exact local file contents');expect(graph.writes[2].args.data).toBe(png);
});

test('invalid drops, folders and unsupported clipboard images preserve existing drafts',async({page,graph})=>{
 await signIn(page);await transfer(page,'drop',[textFile()]);await expect(tray(page)).toContainText('notes.txt');
 await transfer(page,'drop',[{...textFile('empty.txt'),data:''}]);await expect(page.getByRole('alert')).toContainText('nonempty file');await expect(tray(page)).toContainText('notes.txt');
 await transfer(page,'drop',[textFile('folder')],'form.composer',true);await expect(page.getByRole('contentinfo',{name:'Workspace status'})).toContainText('Folders');await expect(tray(page).locator('strong')).toHaveCount(1);
 await transfer(page,'paste',[{name:'bad.svg',type:'image/svg+xml',data:'<svg onload="alert(1)"/>'}],'textarea[aria-label="Message"]');await expect(page.getByRole('contentinfo',{name:'Workspace status'})).toContainText('PNG');await expect(tray(page).locator('strong')).toHaveCount(1);
 await transfer(page,'drop',Array.from({length:5},(_,i)=>textFile(`more-${i}.txt`)));await expect(page.getByRole('alert')).toContainText('up to 5');await expect(tray(page).locator('strong')).toHaveCount(1);expect(graph.writes).toEqual([]);
});

test('outside drops never navigate and plain text and links retain normal paste/drop behavior',async({page,graph})=>{
 await signIn(page);const before=page.url();expect(await transfer(page,'drop',[textFile()],'aside[aria-label="Conversations"]')).toBe(true);await expect(page.getByRole('contentinfo',{name:'Workspace status'})).toContainText('main chat composer');expect(page.url()).toBe(before);await expect(tray(page)).toHaveCount(0);
 const blocked=await page.getByRole('textbox',{name:'Message',exact:true}).evaluate(node=>{
  const data=new DataTransfer();data.setData('text/plain','const x = "<tag>";');data.setData('text/html','<img src="https://untrusted.invalid/image">');const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:data});node.dispatchEvent(event);return event.defaultPrevented;
 });expect(blocked).toBe(false);await page.getByRole('textbox',{name:'Message',exact:true}).pressSequentially('const x = "<tag>";');await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('const x = "<tag>";');expect(graph.writes).toEqual([]);
});

test('missing upload permission still permits local image staging and blocks pending send before creation',async({page,graph})=>{
 await signIn(page);await openDraft(page);await transfer(page,'paste',[imageFile],'textarea[aria-label="Message"]');await expect(tray(page)).toContainText('Clipboard image');await page.getByRole('textbox',{name:'Message',exact:true}).fill('With image');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Files.ReadWrite');expect(graph.writes).toEqual([]);
});

test('local preview finishing after navigation stays in its original draft',async({page,graph})=>{
 await signIn(page);await page.evaluate(()=>{
  const original=File.prototype.arrayBuffer;(window as any).finishImage=null;
  File.prototype.arrayBuffer=function(){if(this.type==='image/png')return new Promise<ArrayBuffer>(resolve=>{(window as any).finishImage=()=>original.call(this).then(resolve);});return original.call(this);};
 });
 await transfer(page,'paste',[imageFile],'textarea[aria-label="Message"]');await row(page,blair.displayName).click();await page.evaluate(()=>{(window as any).finishImage();});await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeEnabled();await expect(tray(page)).toHaveCount(0);await row(page,alex.displayName).click();await expect(tray(page)).toContainText('Clipboard image');expect(graph.writes).toEqual([]);
});

test('an in-flight send rejects additional drops and another composer never receives attachments',async({page,graph})=>{
 graph.allowWrites=true;graph.attachmentPermission=true;let finish!:()=>void;graph.sendGate=new Promise(resolve=>finish=resolve);
 await signIn(page);await transfer(page,'drop',[textFile('original.txt')]);await expect(tray(page)).toContainText('original.txt');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect.poll(()=>graph.writes.at(-1)?.command).toBe('graph_send_attachments');
 await transfer(page,'drop',[textFile('blocked.txt')]);await expect(tray(page).locator('strong')).toHaveCount(1);await expect(tray(page)).not.toContainText('blocked.txt');finish();await expect(tray(page)).toHaveCount(0);expect(graph.writes.filter(c=>c.command==='graph_send_attachments')).toHaveLength(1);
 await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 expect(await transfer(page,'drop',[textFile('channel.txt')],'form.channel-composer')).toBe(true);await expect(page.getByRole('contentinfo',{name:'Workspace status'})).toContainText('main chat composer');expect(graph.writes.filter(c=>c.command==='graph_send_channel')).toEqual([]);
});
