import {receivedText} from './message-body.ts';
export type Address={emailAddress?:{name?:string;address?:string}};
export type MailMessage={id:string;conversationId?:string;subject?:string;from?:Address;toRecipients?:Address[];ccRecipients?:Address[];replyTo?:Address[];receivedDateTime?:string;sentDateTime?:string;bodyPreview?:string;body?:{contentType?:string;content?:string};isRead?:boolean;hasAttachments?:boolean;webLink?:string};
export type MailAttachment={id:string;name?:string;contentType?:string;size?:number;isInline?:boolean};
export type MailPage<T>={value:T[];next:string|null};
export function addressLabel(value?:Address){return value?.emailAddress?.name||value?.emailAddress?.address||'Unknown sender';}
export function addressFull(value?:Address){const email=value?.emailAddress;return email?.name&&email.address?`${email.name} <${email.address}>`:addressLabel(value);}
export function mailText(message:MailMessage){const body=message.body;return receivedText(body?{...body,content:body.content?.slice(0,300000)}:undefined,message.bodyPreview??'').slice(0,100000);}
export function mailDate(message:MailMessage){const raw=message.receivedDateTime??message.sentDateTime;const date=raw?new Date(raw):null;return date&&!Number.isNaN(+date)?date.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'Date unavailable';}
export function mergeMail<T extends {id:string}>(current:T[],incoming:T[]){const rows=new Map(current.map(row=>[row.id,row]));for(const row of incoming)if(row?.id)rows.set(row.id,row);return [...rows.values()];}
export function outlookLink(value?:string):string|null{try{const url=new URL(value??'');return url.protocol==='https:'&&!url.username&&!url.password&&['outlook.office.com','outlook.office365.com','outlook.live.com','outlook.office365.us'].includes(url.hostname)?url.href:null;}catch{return null;}}
export function canPreviewAttachment(file:MailAttachment){const type=file.contentType?.toLowerCase()??'';return ['image/png','image/jpeg','image/gif','image/webp','application/json','application/xml'].includes(type)||type.startsWith('text/');}
export function attachmentPreview(file:{contentType:string;base64:string}):{image?:string;text?:string}{
 if(file.base64.length>14000000)throw new Error('Attachment is too large to preview.');
 if(['image/png','image/jpeg','image/gif','image/webp'].includes(file.contentType.toLowerCase()))return {image:`data:${file.contentType.toLowerCase()};base64,${file.base64}`};
 if(file.contentType.toLowerCase().startsWith('text/')||['application/json','application/xml'].includes(file.contentType.toLowerCase())){
  const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));return {text:new TextDecoder().decode(bytes.subarray(0,100000))};
 }
 return {};
}

// Group by Graph identity, never by subject: unrelated alerts can share a title.
export function mailConversations(messages:MailMessage[]){
 const groups=new Map<string,{key:string;latest:MailMessage;count:number;unread:boolean;hasAttachments:boolean}>();
 for(const message of mergeMail([],messages)){
  const key=message.conversationId?`conversation:${message.conversationId}`:`message:${message.id}`;
  const group=groups.get(key);
  if(group){group.count++;group.unread ||= message.isRead===false;group.hasAttachments ||= !!message.hasAttachments;
   if((message.receivedDateTime??message.sentDateTime??'')>(group.latest.receivedDateTime??group.latest.sentDateTime??''))group.latest=message;
  }else groups.set(key,{key,latest:message,count:1,unread:message.isRead===false,hasAttachments:!!message.hasAttachments});
 }
 return [...groups.values()].sort((a,b)=>(b.latest.receivedDateTime??b.latest.sentDateTime??'').localeCompare(a.latest.receivedDateTime??a.latest.sentDateTime??''));
}
