import type { ReactionGroup, ApiReaction } from './reactions';
import type { ConversationActivity } from './activity';
export type Attachment={id:string;name:string;url:string;kind:string};
export type InlineImage={id:string};
export type Message={id:string;sender:'me'|'them';replyIds?:string[];deleted?:boolean;activity?:ConversationActivity;senderName?:string;text:string;time:string;createdDateTime?:string;reactions?:ReactionGroup[];reactionSource?:ApiReaction[];attachments?:Attachment[];images?:InlineImage[]};
export type Conversation={id:string;name:string;initials:string;status:'online'|'away'|'offline';preview:string;previewAt?:string;time:string;unread:number;favorite?:boolean;chatType?:string;hidden?:boolean;pendingGroup?:{recipients:string[];topic:string};creationUncertain?:boolean;messages:Message[]};
export type WorkspaceMode='chats'|'teams'|'activity'|'people'|'calls'|'files';
