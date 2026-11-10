import type {Conversation} from './types.ts';
export function searchLoadedChats(chats:Conversation[],query:string){
 const needle=query.trim().toLocaleLowerCase();if(!needle)return [];
 return chats.filter(c=>!c.hidden&&!c.id.startsWith('pending:')).flatMap(chat=>{
  const matches=chat.messages.filter(m=>!m.deleted&&!m.activity&&(m.text+' '+(m.attachments??[]).map(a=>a.name).join(' ')).toLocaleLowerCase().includes(needle));
  return matches.length?matches.map(message=>({chatId:chat.id,name:chat.name,messageId:message.id,preview:message.text,date:message.createdDateTime??''})):chat.name.toLocaleLowerCase().includes(needle)?[{chatId:chat.id,name:chat.name,messageId:'',preview:chat.preview,date:chat.previewAt??''}]:[];
 }).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,100);
}
