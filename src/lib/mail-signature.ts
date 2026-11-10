export type MailSignature={text:string;newMail:boolean;replies:boolean;forwards:boolean};
export const signatureKey=(account:string)=>`taut.mail.signature.v1.${account.toLowerCase()}`;
export function readSignature(account:string):MailSignature{
 const empty={text:'',newMail:true,replies:false,forwards:false};
 try{const value=JSON.parse(localStorage.getItem(signatureKey(account))??'null');return value&&typeof value.text==='string'&&value.text.length<=10000?{text:value.text,newMail:!!value.newMail,replies:!!value.replies,forwards:!!value.forwards}:empty;}catch{return empty;}
}
export function signatureFor(account:string,action?:string){const s=readSignature(account);return (action==='forward'?s.forwards:action?s.replies:s.newMail)?s.text:'';}
