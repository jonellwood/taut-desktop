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
