import {fileBase64} from './attachments.ts';
export const MAIL_ATTACHMENT_LIMIT=2*1024*1024;
export type MailDraftAttachment={id:string;name:string;size:number;contentType:string;inline:boolean};
export type MailSendAttachment=MailDraftAttachment&{contentBytes:string};
const raster=new Set(['image/png','image/jpeg','image/gif','image/webp']);
export const inlineImageType=(type:string)=>raster.has(type);
export const imageMarker=(id:string)=>`[image:${id}]`;
export function validateMailFiles(current:MailDraftAttachment[],files:File[]){
 if(current.length+files.length>5)throw Error('Attach up to 5 files per email.');
 if(files.some(f=>!f.size||!f.name.trim()||f.name.length>180||/[\x00-\x1f/\\]/.test(f.name)))throw Error('Choose nonempty files with names up to 180 characters.');
 if(current.reduce((n,f)=>n+f.size,0)+files.reduce((n,f)=>n+f.size,0)>MAIL_ATTACHMENT_LIMIT)throw Error('Email files must total 2 MB or less for this first pass. Your draft is unchanged.');
}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open('taut.mail.files.v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Local file storage is unavailable.'));});}
async function access<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await database();return new Promise((resolve,reject)=>{const transaction=db.transaction('files',mode);const request=operation(transaction.objectStore('files'));transaction.oncomplete=()=>{db.close();resolve(request.result);};transaction.onabort=transaction.onerror=()=>{db.close();reject(Error('Local attachment storage failed. Keep the original files and try again.'));};});}
const key=(account:string,draft:string,id:string)=>JSON.stringify([account.toLowerCase(),draft,id]);
export async function saveMailFile(account:string,draft:string,file:File,inline=false):Promise<MailDraftAttachment>{
 const item:MailSendAttachment={id:crypto.randomUUID(),name:file.name,size:file.size,contentType:/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(file.type)?file.type:'application/octet-stream',inline,contentBytes:await fileBase64(file)};
 if(inline&&!inlineImageType(item.contentType))throw Error('Inline images must be PNG, JPEG, GIF or WebP.');
 await access('readwrite',store=>store.put(item,key(account,draft,item.id)));
 const {contentBytes:_,...metadata}=item;return metadata;
}
export async function loadMailFiles(account:string,draft:string,items:MailDraftAttachment[]):Promise<MailSendAttachment[]>{return Promise.all(items.map(async metadata=>{const item=await access<MailSendAttachment|undefined>('readonly',store=>store.get(key(account,draft,metadata.id)));if(!item||item.name!==metadata.name||item.size!==metadata.size||item.contentType!==metadata.contentType||typeof item.contentBytes!=='string')throw Error(`The local copy of ${metadata.name} is unavailable. Remove it and attach the original again.`);return {...item,inline:metadata.inline};}));}
export async function removeMailFile(account:string,draft:string,id:string){await access('readwrite',store=>store.delete(key(account,draft,id)));}
