import type {Attachment} from './types';
type Reference={id?:string;name?:string;contentType?:string;contentUrl?:string};
// Graph may repeat attachment IDs within one message. Display identity includes
// the URL so different files survive, while identical references render once.
export function chatAttachments(references:Reference[]|undefined):Attachment[]{
 const files=new Map<string,Attachment>();
 for(const file of references??[]){
  if(file.contentType!=='reference'||typeof file.contentUrl!=='string'||!/^https:\/\//i.test(file.contentUrl))continue;
  const key=JSON.stringify([file.id??'',file.contentUrl]);
  if(!files.has(key))files.set(key,{id:key,name:file.name||'Shared file',url:file.contentUrl,kind:'reference'});
 }
 return [...files.values()];
}
