export const MAX_FILE_BYTES=10*1024*1024;
export const MAX_FILES=5;
export const MAX_DRAFT_BYTES=25*1024*1024;
export type StagedFile={id:string;name:string;size:number;file:File;preview?:string;attempted?:boolean;prepared?:boolean};
export function validateFiles(current:{size:number}[],incoming:{name:string;size:number}[]){
 if(current.length+incoming.length>MAX_FILES)throw Error('Attach up to 5 files per message.');
 for(const file of incoming){
  if(!file.size || file.size>MAX_FILE_BYTES)throw Error(`${file.name}: choose a nonempty file up to 10 MB.`);
  if(!file.name.trim() || file.name.length>180 || /[\x00-\x1f<>:"/\\|?*]/.test(file.name) || /[. ]$/.test(file.name))throw Error(`${file.name}: this filename is not supported by OneDrive.`);
 }
 if([...current,...incoming].reduce((n,f)=>n+f.size,0)>MAX_DRAFT_BYTES)throw Error('Attachments must total 25 MB or less per message.');
}
export async function fileBase64(file:File){
 const bytes=new Uint8Array(await file.arrayBuffer());
 let binary='';
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(binary);
}
export function fileSize(bytes:number){return bytes<1024?`${bytes} B`:bytes<1024*1024?`${Math.ceil(bytes/1024)} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`;}

const clipboardImageTypes=new Map([['image/png','png'],['image/jpeg','jpg'],['image/gif','gif'],['image/webp','webp']]);
// Read only the user-triggered paste event. Never use clipboard polling/read permission.
export function clipboardImages(data:Pick<DataTransfer,'items'|'files'>):File[]{
 const items=Array.from(data.items??[]).filter(item=>item.kind==='file'&&item.type.toLowerCase().startsWith('image/'));
 const images=items.length?items.map(item=>({file:item.getAsFile(),type:item.type.toLowerCase()})):Array.from(data.files??[]).filter(file=>file.type.toLowerCase().startsWith('image/')).map(file=>({file,type:file.type.toLowerCase()}));
 return images.map(({file,type})=>{
  const extension=clipboardImageTypes.get(type);
  if(!extension||!file)throw Error('Paste a PNG, JPEG, GIF or WebP image, or use the paperclip to attach a file.');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  return new File([file],`Clipboard image ${stamp}-${crypto.randomUUID().slice(0,8)}.${extension}`,{type,lastModified:file.lastModified});
 });
}
export function transferHasFiles(data:DataTransfer|null){return !!data&&(Array.from(data.types??[]).includes('Files')||Array.from(data.items??[]).some(item=>item.kind==='file')||!!data.files?.length);}
export function droppedFiles(data:DataTransfer):File[]{
 for(const item of Array.from(data.items??[])){
  if(item.kind==='file'&&item.webkitGetAsEntry?.()?.isDirectory)throw Error('Folders cannot be attached. Drop individual files instead.');
 }
 const files=Array.from(data.files??[]);
 if(!files.length)throw Error('No readable files were dropped. Use the paperclip to choose files.');
 return files;
}
