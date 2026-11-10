import {imageMarker,type MailDraftAttachment} from './mail-attachments.ts';
import {mailText,type MailMessage} from './mail.ts';
import {formatDraft} from './compose-format.ts';
export type MailDraft={referenceFirst?:boolean;signature?:string;attachments?:MailDraftAttachment[];id:string;to:string;cc:string;bcc:string;subject:string;text:string;formatted:boolean;attemptId?:string;uncertain?:boolean;updated:number;action?:'reply'|'replyAll'|'forward';sourceId?:string;context?:string};
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
 if((d.attachments??[]).length>5||(d.attachments??[]).reduce((n,f)=>n+f.size,0)>2*1024*1024)return 'Email files must total 2 MB or less, with up to 5 files.';
 if((d.attachments??[]).some(f=>f.inline&&!mailContent(d).includes(`src="cid:taut-${f.id}"`)))return 'An inline image marker is missing. Remove the image or insert it again.';
 if(!d.text.trim())return 'Write a message first.';
 if(new TextEncoder().encode(mailContent(d)).length>200000)return 'This message exceeds the 200 KB limit.';
 return '';
}
export const mailIsHtml=(d:MailDraft)=>!!d.referenceFirst||d.formatted||!!d.signature?.trim()||!!d.attachments?.some(f=>f.inline);
function withImages(html:string,d:MailDraft){for(const file of d.attachments??[]){if(file.inline)html=html.replaceAll(`<p>${imageMarker(file.id)}</p>`,`<p><img src="cid:taut-${file.id}" alt="${file.name.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}" style="max-width:100%;height:auto"></p>`);}return html;}
export function mailContent(d:MailDraft):string{
 const escape=(text:string)=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const signature=d.signature?.trim()?`\n\n${d.signature}`:'';
 const quote=d.context?`\n\n--- Original message ---\n${d.context}`:'';
 if(!mailIsHtml(d))return d.text+signature+quote;
 const body=d.formatted?formatDraft(d.text).html:d.text.split('\n').map(line=>`<p>${escape(line)||'<br>'}</p>`).join('');
 const signedBody=body+(signature?'<div>'+formatDraft(d.signature!).html+'</div>':'');
 const reference=d.referenceFirst&&d.context?'<section><h3>In reference to</h3><blockquote style="margin:12px 0;padding:8px 16px;border-left:3px solid #b88638;white-space:pre-wrap">'+escape(d.context).replaceAll('\n','<br>')+'</blockquote></section>':'';
 return reference+withImages(signedBody,d).replace(/<codeblock class="([a-z]+)"><code>/g,'<pre><code class="language-$1">').replaceAll('</code></codeblock>','</code></pre>')+(quote&&!d.referenceFirst?'<blockquote><pre>'+escape(quote)+'</pre></blockquote>':'');
}
export function restoreDrafts(raw:string|null):MailDraft[]{
 try{if(!raw||raw.length>2000000)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows))return [];return rows.slice(0,20).filter(d=>d&&typeof d.id==='string'&&['to','cc','bcc','subject','text'].every(k=>typeof d[k]==='string'&&d[k].length<=200000)&&typeof d.formatted==='boolean'&&typeof d.updated==='number'&&(d.context===undefined||(typeof d.context==='string'&&d.context.length<=100000))&&(d.referenceFirst===undefined||typeof d.referenceFirst==='boolean')&&(!d.signature||(typeof d.signature==='string'&&d.signature.length<=10000))&&(!d.attachments||(Array.isArray(d.attachments)&&d.attachments.length<=5&&d.attachments.every((f:MailDraftAttachment)=>f&&typeof f.id==='string'&&/^[a-f0-9-]{36}$/.test(f.id)&&typeof f.name==='string'&&f.name.length<=180&&typeof f.size==='number'&&f.size>0&&f.size<=2*1024*1024&&typeof f.contentType==='string'&&typeof f.inline==='boolean')))&&(!d.action||(['reply','replyAll','forward'].includes(d.action)&&typeof d.sourceId==='string'&&typeof d.context==='string'&&d.context.length<=100000))).map(d=>({...d,uncertain:!!d.uncertain}));}catch{return [];}
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
