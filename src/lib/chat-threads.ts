import type {Message} from './types';
export type QuoteAttachment={id?:string;contentType?:string;content?:string;contentUrl?:string};
export function quotedMessageIds(attachments:QuoteAttachment[]|undefined,chatId:string):string[]{
 const result=new Set<string>();
 for(const attachment of attachments??[]){
  if(attachment.contentType!=='messageReference'||typeof attachment.content!=='string'||attachment.content.length>65536)continue;
  try{
   const value=JSON.parse(attachment.content);const id=value?.messageId;
   if(typeof id!=='string'||!id||id.length>512||/[\u0000-\u001f\u007f/\\?#]/.test(id)||id==='.'||id==='..')continue;
   if(attachment.id&&attachment.id!==id)continue;
   if([value.chatId,value.conversationId,value.originalConversationId].some(other=>other&&other!==chatId))continue;
   result.add(id);if(result.size===10)break;
  }catch{/* A malformed or forwarded attachment never creates an inferred thread. */}
 }
 return [...result];
}
export function chatReplies(root:string,messages:Message[]):Message[]{
 const children=new Map<string,Message[]>();
 for(const message of messages)if(!message.activity)for(const parent of message.replyIds??[]){
  const list=children.get(parent)??[];list.push(message);children.set(parent,list);
 }
 const found=new Set<string>([root]);const queue=[root];
 for(let index=0;index<queue.length;index++)for(const message of children.get(queue[index])??[]){if(found.has(message.id))continue;found.add(message.id);queue.push(message.id);}
 return messages.filter(message=>message.id!==root&&found.has(message.id)&&!message.activity);
}
