export type Attachment={id:string;name:string;url:string;kind:string};
export type InlineImage={id:string};
export type Message={id:string;sender:'me'|'them';senderName?:string;text:string;time:string;createdDateTime?:string;reactions?:string[];attachments?:Attachment[];images?:InlineImage[]};
export type Conversation={id:string;name:string;initials:string;status:'online'|'away'|'offline';preview:string;time:string;unread:number;favorite?:boolean;chatType?:string;pendingGroup?:{recipients:string[];topic:string};creationUncertain?:boolean;messages:Message[]};
export type WorkspaceMode='chats'|'activity'|'people'|'calls'|'files';
