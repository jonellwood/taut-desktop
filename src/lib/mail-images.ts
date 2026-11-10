import type {MailAttachment} from './mail';
export const imageApprovalKey=(account:string,message:string,file:string)=>'taut.mail.image.v1.'+JSON.stringify([account,message,file]);
export function inlineCid(file:MailAttachment,html:string){
 if(!file.isInline||!file.contentId||!['image/png','image/jpeg','image/gif','image/webp'].includes(file.contentType?.toLowerCase()??''))return '';
 const cid=file.contentId.replace(/^<|>$/g,'');
 const template=document.createElement('template');template.innerHTML=html.slice(0,300000);
 return Array.from(template.content.querySelectorAll('img')).some(img=>img.getAttribute('src')===`cid:${cid}`)?cid:'';
}
