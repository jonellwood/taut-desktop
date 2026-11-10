import {newMailDraft,type MailDraft} from './mail-drafts.ts';
import {receivedText} from './message-body.ts';
import type {Message} from './types.ts';
export function chatMailDraft(name:string,message:Message,replies:Message[]=[],recipient=''):MailDraft{
 const messages=[message,...replies].filter(m=>!m.deleted&&!m.activity);
 const context=messages.map(m=>`${m.senderName||(m.sender==='me'?'You':name)} · ${m.createdDateTime||m.time}\n${receivedText(m.body,m.text)}${m.attachments?.length?'\nShared file names (not attached): '+m.attachments.map(f=>f.name).join(', '):''}`).join('\n\n');
 return {...newMailDraft(),to:recipient,referenceFirst:true,subject:`From chat: ${name}`.slice(0,200),context:`Quoted from TAUT chat: ${name}\n\n${context}`.slice(0,100000)};
}
