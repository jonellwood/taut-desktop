export type ChatPreview={id?:string;messageType?:string;createdDateTime?:string;isDeleted?:boolean;body?:{content?:string;contentType?:string};from?:{user?:{id?:string}}};
export function messagePreview(preview?:ChatPreview):boolean {
 return Boolean(preview&&(!preview.messageType||preview.messageType==='message')&&Number.isFinite(Date.parse(preview.createdDateTime??'')));
}
// Unread is a conversation flag based on the server read position, not a message count.
export function previewUnread(preview:ChatPreview|undefined,ownId:string,serverRead?:string):boolean {
 if(!messagePreview(preview)||preview?.isDeleted)return false;
 const sender=preview?.from?.user?.id;
 const read=Date.parse(serverRead??'');
 // An explicit server read position also represents manually marked-unread own messages.
 if(Number.isFinite(read))return Date.parse(preview!.createdDateTime!)>read;
 return Boolean(sender&&sender.toLowerCase()!==ownId.toLowerCase());
}
