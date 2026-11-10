import {mailText,type MailMessage} from './mail.ts';
import {formatDraft} from './compose-format.ts';
export type MailDraft={id:string;to:string;cc:string;bcc:string;subject:string;text:string;formatted:boolean;attemptId?:string;uncertain?:boolean;updated:number;action?:'reply'|'replyAll'|'forward';sourceId?:string;context?:string};
export const draftKey=(account:string)=>`taut.mail.drafts.v1.${account.toLowerCase()}`;
export const newMailDraft=():MailDraft=>({id:crypto.randomUUID(),to:'',cc:'',bcc:'',subject:'',text:'',formatted:false,updated:Date.now()});
export function recipients(value:string){return value.split(/[;,\n]/).map(s=>s.trim()).filter(Boolean);}
export function draftError(d:MailDraft){
 const to=recipients(d.to),all=[...to,...recipients(d.cc),...recipients(d.bcc)];
 if(!to.length)return 'Add at least one To recipient.';
 if(all.length>100)return 'Use at most 100 recipients.';
 if(all.some(a=>a.length>254||!/^[a-z\d.!#$%&'*+\-/=?^_`{|}~]+@[a-z\d-]+(?:\.[a-z\d-]+)+$/i.test(a)))return 'Check each full email address. Separate recipients with commas or semicolons.';
 if(new Set(all.map(a=>a.toLowerCase())).size!==all.length)return 'Remove duplicate recipients across To, Cc and Bcc.';
 if(!d.subject.trim()||new TextEncoder().encode(d.subject).length>1000||/[\r\n\x00-\x1f]/.test(d.subject))return 'Add a subject within 1,000 bytes.';
 if(!d.text.trim())return 'Write a message first.';
 if(new TextEncoder().encode(mailContent(d)).length>200000)return 'This message exceeds the 200 KB limit.';
 return '';
}
export function mailContent(d:MailDraft){const quote=d.context?`\n\n--- Original message ---\n${d.context}`:'';const text=d.text+quote;return d.formatted?(formatDraft(d.text).html+(quote?'<blockquote><pre>'+quote.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</pre></blockquote>':'')).replace(/<codeblock class="([a-z]+)"><code>/g,'<pre><code class="language-$1">').replaceAll('</code></codeblock>','</code></pre>'):text;}
export function restoreDrafts(raw:string|null):MailDraft[]{
 try{if(!raw||raw.length>2000000)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows))return [];return rows.slice(0,20).filter(d=>d&&typeof d.id==='string'&&['to','cc','bcc','subject','text'].every(k=>typeof d[k]==='string'&&d[k].length<=200000)&&typeof d.formatted==='boolean'&&typeof d.updated==='number'&&(!d.action||(['reply','replyAll','forward'].includes(d.action)&&typeof d.sourceId==='string'&&typeof d.context==='string'&&d.context.length<=100000))).map(d=>({...d,uncertain:!!d.uncertain}));}catch{return [];}
}

export function responseDraft(message:MailMessage,action:'reply'|'replyAll'|'forward',own:string[]):MailDraft{
 const self=new Set(own.map(a=>a.toLowerCase()));const seen=new Set<string>();
 const pick=(items:MailMessage['toRecipients'])=>(items??[]).map(a=>a.emailAddress?.address??'').filter(a=>a&&!self.has(a.toLowerCase())&&!seen.has(a.toLowerCase())&&!!seen.add(a.toLowerCase())).join('; ');
 const fromSelf=self.has((message.from?.emailAddress?.address??'').toLowerCase());
 const sender=fromSelf?(message.toRecipients??[]):message.replyTo?.length?message.replyTo:[message.from??{}];
 const to=action==='forward'?'':pick(action==='replyAll'?[...sender,...message.toRecipients??[]]:sender);
 const cc=action==='replyAll'?pick(message.ccRecipients):'';
 const prefix=action==='forward'?'FW: ':'RE: ';const subject=message.subject||'(No subject)';
 return {...newMailDraft(),action,sourceId:message.id,to,cc,subject:(action==='forward'?/^(fw|fwd):/i:/^re:/i).test(subject)?subject:prefix+subject,context:`From: ${message.from?.emailAddress?.address??'Unknown sender'}\nSubject: ${subject}\n\n${mailText(message)}`.slice(0,100000)};
}
