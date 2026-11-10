import {formatDraft,messageSizeError} from './compose-format.ts';
export type KnownChat = {id:string;chatType?:string;members?:{userId?:string;email?:string;userPrincipalName?:string}[]};
export function existingChat(chats:KnownChat[],recipient:string,ownId:string){
 const key=recipient.trim().toLowerCase();
 return chats.find(c=>c.chatType==='oneOnOne' && c.members?.length===2 && c.members.some(m=>m.userId?.toLowerCase()===ownId.toLowerCase()) && c.members.some(m=>m.userId?.toLowerCase()!==ownId.toLowerCase() && [m.userId,m.email,m.userPrincipalName].some(v=>v?.toLowerCase()===key)));
}
// Selection is deliberately pure: it has no Graph/IPC dependency.
export function pendingConversation(recipient:string,name:string,ownId:string){
 recipient=recipient.trim();
 if(!ownId.trim() || !recipient || recipient.toLowerCase()===ownId.toLowerCase())throw Error('Choose someone other than yourself.');
 return {id:`pending:${recipient.toLowerCase()}`,recipient,name,initials:name.slice(0,2).toUpperCase(),status:'offline' as const,preview:'Local draft · not sent',time:'',unread:0,messages:[]};
}
export function pendingGroupConversation(users:{id:string;displayName?:string}[],topic:string,ownId:string){
 const recipients=users.map(u=>u.id.trim().toLowerCase());
 const title=topic.trim();
 if(recipients.length<2 || recipients.length>19 || new Set(recipients).size!==recipients.length || recipients.some(id=>!id || id===ownId.toLowerCase()) || !ownId)throw Error('Choose 2–19 distinct coworkers other than yourself.');
 if([...title].length>250 || /[:\x00-\x1f]/.test(title))throw Error('Use a group name up to 250 characters without colons.');
 const name=title||users.map(u=>u.displayName||'Coworker').join(', ');
 return {id:`pending:group:${[...recipients].sort().join(',')}:${encodeURIComponent(title)}`,name,chatType:'group',pendingGroup:{recipients,topic:title},initials:'GR',status:'offline' as const,preview:'Local group draft · not sent',time:'',unread:0,messages:[]};
}
export type GroupCreation={recipients:string[];topic:string;onUnconfirmed?:()=>void};
export type GraphInvoke = <T>(command:string,args:Record<string,unknown>)=>Promise<T>;
export async function submitMessage(invoke:GraphInvoke,chatId:string,recipient:string|undefined,ownId:string,text:string,onCreated:(id:string)=>void,prepare?:(chatId:string)=>Promise<string[]>,group?:GroupCreation,formatted=false){
 const content=text.trim();
 const options=formatted?{formatted:true}:{};
 const sizeError=messageSizeError(content,formatted);if(sizeError)throw Error(sizeError);
 if(formatted&&!formatDraft(content).visible&&(!prepare||recipient!==undefined||group!==undefined))throw Error('Write a nonempty message before sending.');
 if((!content && (!prepare || recipient!==undefined || group!==undefined)))throw Error('Write a nonempty message before sending.');
 if((recipient!==undefined && group!==undefined) || chatId.startsWith('pending:') !== (recipient!==undefined || group!==undefined))throw Error('Invalid pending conversation. Reopen the draft before sending.');
 if(recipient!==undefined){
  recipient=recipient.trim();
  if(!ownId.trim() || !recipient)throw Error('Choose a coworker before sending.');
  if(recipient.toLowerCase()===ownId.toLowerCase())throw Error('Choose someone other than yourself.');
  const chat=await invoke<{id:string}>('graph_create_chat',{recipient,ownId,firstMessage:content,...options});
  if(!chat.id)throw Error('Chat creation was not confirmed. Refresh the chat list before retrying.');
  chatId=chat.id;
  // Retain the server ID before attempting the non-atomic message operation.
  onCreated(chatId);
 }
 if(group){
  pendingGroupConversation(group.recipients.map(id=>({id})),group.topic,ownId);
  let chat:{id:string};
  try{
   chat=await invoke<{id:string}>('graph_create_group_chat',{recipients:group.recipients,topic:group.topic,ownId,firstMessage:content,...options});
   if(!chat?.id)throw Error('Group creation was not confirmed. Check Teams before trying again.');
  }catch(e){group.onUnconfirmed?.();throw e;}
  chatId=chat.id;onCreated(chatId);
 }
 const ids=prepare?await prepare(chatId):[];
 if(prepare && !ids.length)throw Error('No attachments are ready. Your draft is saved.');
 try{
  const message=ids.length?await invoke<{id:string}>('graph_send_attachments',{chatId,text:content,ids,...options}):await invoke<{id:string}>('graph_send_message',{chatId,text:content,...options});
  if(!message.id)throw Error('No message identifier returned.');
 }catch{
  throw Error(`Message delivery was not confirmed. The conversation may exist and the message may have arrived.${ids.length?' Files may already be uploaded and shared.':''} Your draft is saved. Check Teams or refresh before explicitly retrying.`);
 }
 return chatId;
}

// Graph system events are not ordinary message bubbles.
export function isUserMessage(message:{messageType?:string}){
 return !message.messageType || message.messageType==='message';
}
