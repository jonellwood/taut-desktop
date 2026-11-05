<script lang="ts">
 import { tick, onMount } from 'svelte';
 import { MessageCircle, Bell, Users, Phone, Files, Settings, Search, Command, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Send, SquarePen, Paperclip, Smile, MoreHorizontal, Video, X, Check, UserPlus, UserMinus, PencilLine, LogIn, Trash2, Undo2, EyeOff, Eye, ChevronRight, Moon, Sun, LayoutPanelTop, LogOut, PanelLeft, PanelRight, Scan, Pin, PinOff, Building2, MessagesSquare } from 'lucide-svelte';
 import { existingChat, pendingConversation, pendingGroupConversation, submitMessage, isUserMessage } from './lib/pending';
 import { validateFiles, fileBase64, fileSize, type StagedFile } from './lib/attachments';
 import { conversationActivity, activityIdentities, identityKey, type EventDetail, type EventIdentity, type IdentityNames } from './lib/activity';
 import type { Message } from './lib/types';
 import DeletionDialog from './lib/DeletionDialog.svelte';
 import Welcome from './lib/Welcome.svelte';
 import MessageBody from './lib/MessageBody.svelte';
 import {receivedText} from './lib/message-body';
 import ChatThread from './lib/ChatThread.svelte';
 import FormattingToolbar from './lib/FormattingToolbar.svelte';
 import {continueList} from './lib/continue-list';
 import {formatDraft,messageSizeError} from './lib/compose-format';
 import {quotedMessageIds,chatReplies} from './lib/chat-threads';
 import TeamsWorkspace from './lib/TeamsWorkspace.svelte';
 import EmojiPicker from './lib/EmojiPicker.svelte';
 import {insertEmoji} from './lib/emoji';
 import MessageReactions from './lib/MessageReactions.svelte';
 import {groupReactions,reactionIdentities,type ApiReaction} from './lib/reactions';
 import GroupMembers from './lib/GroupMembers.svelte';
 import { messagePreview, previewUnread, type ChatPreview } from './lib/chat-summary';
 import { conversations } from './lib/mock';
 import { invoke } from '@tauri-apps/api/core';
 import { openUrl } from '@tauri-apps/plugin-opener';
 import type { Conversation, WorkspaceMode, Attachment, InlineImage } from './lib/types';
 let newChatOpen=$state(false);
 let newChatEmail=$state('');
 let newChatRecipientId=$state('');
 let newGroupMode=$state(false);
 let newGroupUsers=$state<DirectoryUser[]>([]);
 let newGroupTopic=$state('');
 let groupMemberPermission=$state(false);
 let groupBusy=$state(false);
 let chatWritePermission=$state(false);
 let operationBusy=$state(false);
 let showHidden=$state(false);
 type ChangeTarget={kind:'delete'|'restore'|'hide'|'unhide';chatId:string;messageId?:string;name:string;preview?:string};
 let changeTarget=$state<ChangeTarget|null>(null);
 type EmojiTarget={mode:'compose';chatId:string;start:number;end:number}|{mode:'react';chatId:string;messageId:string};
 let emojiTarget=$state<EmojiTarget|null>(null);
 let reactionError=$state('');let reactionUncertain=$state(false);
 const uncertainReactions=new Set<string>();
 let composerInput=$state<HTMLTextAreaElement>();
 let emojiReturnFocus:HTMLElement|undefined;
 let changeError=$state('');let changeUncertain=$state(false);
 const confirmedDeleted=new Set<string>();
 const uncertainChanges=new Set<string>();
 const imageVersions=new Map<string,number>();
 function changeKey(target:ChangeTarget){return JSON.stringify([target.kind,target.chatId,target.messageId]);}
 let hiddenOverrides:Record<string,boolean>={};
 let chatListSerial=0;
 let selectedReadEligible=false;
 let readSelection=0;
 const readAttempts=new Set<string>();
 const readInFlight=new Set<string>();
 let readError=$state('');
 let activityNames:IdentityNames={};
 const attemptedNames=new Set<string>();
 let resolvingNames=false;
 let nameRetryAfter=0;
 let nameSession=0;
 const leftGroupIds=new Set<string>();
 type DirectoryUser={id:string;displayName?:string;mail?:string;userPrincipalName?:string};
 let directoryResults=$state<DirectoryUser[]>([]);
 let directoryBusy=$state(false);
 let directoryError=$state('');
 let directoryRequest=0;
 let directoryTimer:ReturnType<typeof setTimeout>|undefined;
 let newChatBusy=$state(false);
 let newChatError=$state('');
 let chats:Conversation[]= $state(structuredClone(conversations));
 let knownChats:ApiChat[]=[];
 let isLive=$state(false);
 let authBusy=$state(false);
 type NotificationSettings={enabled:boolean;showNames:boolean;error?:string|null};
 let notificationSettings=$state<NotificationSettings>({enabled:false,showNames:false});
 let notificationBusy=$state(false);let notificationError=$state('');let notificationHint=$state('');
 let authPhase=$state('Signing in…');
 let persistenceNotice=$state('');
 let sessionSaved=$state(false);
 let reauthRequired=$state(false);
 type PersistenceStatus={restored:boolean;saved:boolean;notice?:string|null};
 let sendBusy=$state(false);
 let refreshBusy=$state(false);
 let syncStatus=$state<'idle'|'syncing'|'offline'|'paused'>('idle');
 let syncIssues=$state({messages:false,chats:false});
 function clearSyncIssue(source:'messages'|'chats'){syncIssues[source]=false;if(!syncIssues.messages&&!syncIssues.chats)syncStatus='idle';}
 let jumpVisible=$state(false);
 let messageViewport=$state<HTMLElement | undefined>(undefined);
 let messageInFlight=new Set<string>();
 let pollingMessages=false;
 let pollingChats=false;
 let pollDelayUntil=0;
 let lastSyncError='';
 let openChatSerial=0;
 let forceBottomForChat='';
 let sendError=$state('');
 let authError=$state('');
 let signedInName=$state('');
 let ownId=$state('');
 let selectedId=$state('hannah');
 let mode:WorkspaceMode=$state('chats');
 function savedLayout(){
   const defaults={sidebar:true,details:true,restoreSidebar:true,restoreDetails:true};
   try{const value=JSON.parse(localStorage.getItem('taut.layout.v1')??'null');
     if(value&&Object.keys(defaults).every(key=>typeof value[key]==='boolean'))return value as typeof defaults;
   }catch{/* A blocked or invalid preference must not prevent startup. */}
   return defaults;
 }
 const initialLayout=savedLayout();
 let sidebarOpen=$state(initialLayout.sidebar);
 let detailsOpen=$state(initialLayout.details);
 let focusRestore=$state({sidebar:initialLayout.restoreSidebar,details:initialLayout.restoreDetails});
 let focusMode=$derived(!sidebarOpen&&!detailsOpen);
 function toggleFocus(){
   if(focusMode){sidebarOpen=focusRestore.sidebar;detailsOpen=focusRestore.details;if(!sidebarOpen&&!detailsOpen)sidebarOpen=true;}
   else{focusRestore={sidebar:sidebarOpen,details:detailsOpen};sidebarOpen=false;detailsOpen=false;}
 }
 $effect(()=>{try{localStorage.setItem('taut.layout.v1',JSON.stringify({sidebar:sidebarOpen,details:detailsOpen,restoreSidebar:focusRestore.sidebar,restoreDetails:focusRestore.details}));}catch{/* Layout controls still work when storage is unavailable. */}});
 let paletteOpen=$state(false);
 let settingsOpen=$state(false);
 let search=$state('');
 let commandSearch=$state('');
 let draft=$state('');
 // Each chat has an independent draft; never carry text into another recipient.
 let drafts=$state<Record<string,string>>({});
 let attachmentDrafts=$state<Record<string,StagedFile[]>>({});
 let attachmentPermission=$state(false);
 let stagingBusy=$state(false);
 let fileInput=$state<HTMLInputElement>();
 let attachmentProgress=$state<Record<string,string>>({});
 let selectedFiles=$derived(attachmentDrafts[selectedId]??[]);
 // Loaded images exist only in process memory; clicking Preview is required.
 let imageCache=$state<Record<string,string>>({});
 let imageLoading=$state<Record<string,boolean>>({});
 let imageErrors=$state<Record<string,string>>({});
 let lightbox=$state<{src:string;name:string}|null>(null);
 let imageZoom=$state(1);
 let chatNames=$state<Record<string,string>>({});
 let legacyDiagnostics=$state<Record<string,string>>({});
 let fileOpenError=$state('');
 const checkedLegacyNames = new Set<string>();
 let accent=$state<'amber'|'teal'|'violet'>('amber');
 let dense=$state(false);
 let sidebarWidth=$state(306);
 let dragStart=$state(false);
 let listEnd = $state<HTMLElement | undefined>(undefined);
 let conversationSearch=$state<HTMLInputElement>();
 let paletteInput = $state<HTMLInputElement | undefined>(undefined);
 const noSelection:Conversation={id:'empty',name:'Select a conversation',initials:'—',status:'offline',preview:'Choose a chat to read messages',time:'',unread:0,messages:[]};
 let selected=$derived(chats.find(c=>c.id===selectedId)??(isLive?noSelection:chats[0]));
 let replyThread=$state<{chatId:string;rootId:string}|null>(null);
 let quotedParent=$state<Message|null>(null);let quotedLoading=$state(false);let quotedError=$state('');let quoteVersion=0;
 let activeThread=$derived(replyThread?.chatId===selected.id?replyThread:null);
 let threadRoot=$derived(activeThread?(selected.messages.find(m=>m.id===activeThread.rootId)??quotedParent):null);
 let threadMessages=$derived(activeThread?chatReplies(activeThread.rootId,selected.messages):[]);

 let channelDrafts=$state<import('./lib/teams').ChannelDrafts>({});
 let formattedDrafts=$state<Record<string,boolean>>({});
 let formattedReplies=$state<Record<string,boolean>>({});
 let replyDrafts=$state<Record<string,string>>({});
 let replyErrors=$state<Record<string,string>>({});
 let replyUncertain=$state<Record<string,boolean>>({});
 let replyKey=$derived(activeThread?JSON.stringify([activeThread.chatId,activeThread.rootId]):'');
 async function sendQuotedReply(){
   if(!activeThread||!threadRoot||threadRoot.deleted||sendBusy||stagingBusy||authBusy||operationBusy||groupBusy||reauthRequired||selected.hidden)return;
   const {chatId,rootId}=activeThread;const key=replyKey;const text=(replyDrafts[key]??'').trim();const session=nameSession;
   if(!text||replyUncertain[key])return;
   const sizeError=messageSizeError(text,formattedReplies[key]);if(sizeError){replyErrors[key]=sizeError;return;}
   if(formattedReplies[key]&&!formatDraft(text).visible){replyErrors[key]='Write a nonempty reply before sending.';return;}
   sendBusy=true;replyErrors[key]='';
   try{
     const result=await invoke<{status:string;message?:ApiMessage;error?:string}>('graph_reply_with_quote',{chatId,messageId:rootId,ownId,text,...(formattedReplies[key]?{formatted:true}:{})});
     if(session!==nameSession)return;
     if(result.status==='sent'&&result.message?.id){
       const sent=convertChatMessage(result.message,chatId);sent.sender='me';sent.replyIds=[rootId];
       chats=chats.map(c=>c.id===chatId?{...c,messages:c.messages.some(m=>m.id===sent.id)?c.messages:[...c.messages,sent],preview:sent.text}:c);
       if((replyDrafts[key]??'').trim()===text)replyDrafts[key]='';
     }else{replyErrors[key]=result.error??'Reply delivery was not confirmed. Check Teams before retrying.';replyUncertain[key]=result.status!=='rejected';}
   }catch{if(session===nameSession){replyErrors[key]='Reply delivery was not confirmed. Check Teams before retrying. Your draft is saved.';replyUncertain[key]=true;}}
   finally{sendBusy=false;}
 }
 function closeReplyThread(){replyThread=null;quotedParent=null;quotedLoading=false;quotedError='';quoteVersion++;}
 async function openReplyThread(rootId:string){
   if(!isLive||selected.id==='empty'||selected.id.startsWith('pending:'))return;
   const chatId=selected.id;const session=nameSession;const version=++quoteVersion;
   replyThread={chatId,rootId};quotedParent=null;quotedError='';quotedLoading=false;detailsOpen=true;
   if(selected.messages.some(m=>m.id===rootId)){
     await tick();
     if(version===quoteVersion&&selected.id===chatId&&messageViewport){
       const original=Array.from(messageViewport.querySelectorAll<HTMLElement>('[data-message-id]')).find(node=>node.dataset.messageId===rootId);
       if(original)messageViewport.scrollTop+=original.getBoundingClientRect().top-messageViewport.getBoundingClientRect().top-16;
     }
     return;
   }
   quotedLoading=true;
   try{const raw=await invoke<ApiMessage>('graph_chat_message',{chatId,messageId:rootId});if(version!==quoteVersion||session!==nameSession||!isLive||selected.id!==chatId)return;
     quotedParent=convertChatMessage(raw,chatId);
   }catch{if(version===quoteVersion&&session===nameSession)quotedError='The quoted message is unavailable or could not be loaded. Its saved preview is not displayed.';}
   finally{if(version===quoteVersion&&session===nameSession)quotedLoading=false;}
 }
 async function viewThreadImage(messageId:string,contentId:string){const chatId=selected.id;const version=quoteVersion;const key=mediaKey(chatId,messageId,contentId);if(!imageCache[key])await loadImage(chatId,messageId,contentId);if(version===quoteVersion&&selected.id===chatId&&imageCache[key])openImageViewer(imageCache[key]);else if(imageErrors[key])fileOpenError='The shared image could not be loaded. Try again from the conversation.';}
 let unreadChats=$derived(chats.filter(c=>!c.hidden&&c.unread>0&&c.id!=='empty').length);
 let pinnedIds=$state<string[]>([]);
 let pinMenuId=$state<string|null>(null);
 let pinMenuAction=$state<HTMLButtonElement>();
 let pinError=$state('');
 function pinKey(){return `taut.pins.v1.${ownId.toLowerCase()}`;}
 function loadPins(){
   pinMenuId=null;pinError='';pinnedIds=[];
   try{const stored=JSON.parse(localStorage.getItem(pinKey())??'[]');
     if(Array.isArray(stored))pinnedIds=[...new Set(stored.filter((id):id is string=>typeof id==='string'&&id.length>0&&id.length<=512&&id!=='empty'&&!id.startsWith('pending:')))].slice(0,500);
   }catch{pinError='Saved pins could not be loaded on this device.';}
 }
 function isPinned(chat:Conversation){return isLive?pinnedIds.includes(chat.id):Boolean(chat.favorite);}
 async function openPinMenu(id:string){pinMenuId=pinMenuId===id?null:id;await tick();pinMenuAction?.focus();}
 async function togglePin(chat:Conversation){
   if(!isLive||!ownId||authBusy||chat.id==='empty'||chat.id.startsWith('pending:'))return;
   const next=isPinned(chat)?pinnedIds.filter(id=>id!==chat.id):[...pinnedIds,chat.id];
   if(next.length>500){pinError='You can pin up to 500 conversations on this device.';return;}
   try{localStorage.setItem(pinKey(),JSON.stringify(next));pinnedIds=next;pinError='';pinMenuId=null;await tick();document.getElementById(`pin-options-${chat.id}`)?.focus();}
   catch{pinError='This pin could not be saved on this device. Your pins have not changed.';}
 }
 function closePinMenu(event:MouseEvent){if(event.target instanceof Element&&!event.target.closest('.conversation-options,.pin-menu'))pinMenuId=null;}
 let filtered=$derived(chats.filter(c=>Boolean(c.hidden)===showHidden&&c.name.toLowerCase().includes(search.toLowerCase())));
 const nav=[{id:'chats',icon:MessageCircle,label:'Chats'},{id:'teams',icon:Building2,label:'Teams and Channels'},{id:'activity',icon:Bell,label:'Activity'},{id:'people',icon:Users,label:'People'},{id:'calls',icon:Phone,label:'Calls'},{id:'files',icon:Files,label:'Files'}] as const;
 const commands=[
 {label:'Go to Chats',hint:'Workspace',run:()=>mode='chats'},
 {label:'Go to Teams and Channels',hint:'Workspace',run:()=>mode='teams'},
 {label:'New conversation',hint:'Messaging',run:()=>openNewChat()},
 {label:'Go to Activity',hint:'Workspace',run:()=>mode='activity'},
 {label:'Toggle conversation sidebar',hint:'Layout',run:()=>sidebarOpen=!sidebarOpen},
 {label:'Toggle details panel',hint:'Layout',run:()=>detailsOpen=!detailsOpen},
 {label:'Toggle compact density',hint:'Appearance',run:()=>dense=!dense},
 {label:'Set Amber accent',hint:'Appearance',run:()=>accent='amber'},
 {label:'Set Teal accent',hint:'Appearance',run:()=>accent='teal'},
 {label:'Set Violet accent',hint:'Appearance',run:()=>accent='violet'},
 {label:'Open preferences',hint:'Settings',run:()=>settingsOpen=true}
 ];
 let matchingCommands=$derived(commands.filter(c=>c.label.toLowerCase().includes(commandSearch.toLowerCase())));
 function openPalette(){paletteOpen=true;commandSearch='';tick().then(()=>paletteInput?.focus());}
 async function focusConversationSearch(){sidebarOpen=true;mode='chats';await tick();conversationSearch?.focus();}
 function execCommand(fn:()=>void){fn();paletteOpen=false;}
 function keys(e:KeyboardEvent){
  if(changeTarget||emojiTarget)return;
  if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();}
  if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&e.key.toLowerCase()==='k'){e.preventDefault();void focusConversationSearch();}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='\\'){e.preventDefault();sidebarOpen=!sidebarOpen;}
  if(e.key==='Escape'&&pinMenuId){const id=pinMenuId;pinMenuId=null;document.getElementById(`pin-options-${id}`)?.focus();return;}
  if(e.key==='Escape'&&activeThread&&!lightbox&&!changeTarget&&!emojiTarget&&!settingsOpen&&!paletteOpen&&!newChatOpen){closeReplyThread();return;}
  if(e.key==='Escape'){if(lightbox){lightbox=null;imageZoom=1;}else{paletteOpen=false;settingsOpen=false;newChatOpen=false;}}
 }
 function plainText(html:string):string {const text=receivedText({contentType:'html',content:html});return text||(/<img\b|<attachment\b|<file\b/i.test(html)?'[Image or attachment — preview coming soon]':'');}
 function isUnread(raw:ApiChat):boolean {return previewUnread(raw.lastMessagePreview,ownId,raw.viewpoint?.lastMessageReadDateTime);}
 function summaryTime(value?:string){
   const date=new Date(value??'');if(Number.isNaN(date.getTime()))return '';
   return dateKey(date.toISOString())===dateKey(new Date().toISOString())?date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):date.toLocaleDateString();
 }
 function markVisibleRead(){
   if(!isLive||!selectedReadEligible||!chatWritePermission||reauthRequired||authBusy||mode!=='chats'||changeTarget||emojiTarget||newChatOpen||settingsOpen||paletteOpen||lightbox||document.hidden||!document.hasFocus()||!messageViewport||messageViewport.scrollHeight-messageViewport.scrollTop-messageViewport.clientHeight>2)return;
   const chat=chats.find(c=>c.id===selectedId);if(!chat||chat.hidden||!chat.unread||chat.id.startsWith('pending:'))return;
   const raw=knownChats.find(c=>c.id===chat.id);
   const latest=[...chat.messages].reverse().find(m=>!m.activity);
   if(!latest||!messagePreview(raw?.lastMessagePreview)||raw?.lastMessagePreview?.id!==latest.id)return;
   const key=JSON.stringify([chat.id,latest.id,readSelection]);if(readAttempts.has(key)||readInFlight.has(chat.id))return;
   readAttempts.add(key);readInFlight.add(chat.id);const session=nameSession;
   void (async()=>{
     try{
       const confirmed=await invoke<boolean>('graph_mark_chat_read',{chatId:chat.id,messageId:latest.id});
       if(session!==nameSession||!isLive)return;
       if(confirmed){const current=chats.find(c=>c.id===chat.id);if(current)current.unread=0;readError='';await syncChatList();}
       else readError='Newer messages arrived before read status could be updated. Refresh and read the latest messages.';
     }catch(e){if(session===nameSession&&isLive)readError=String(e);}
     finally{readInFlight.delete(chat.id);}
   })();
 }
 type ChatMember={id?:string;tenantId?:string;userId?:string;displayName?:string;email?:string;userPrincipalName?:string;roles?:string[]};
 type ApiChat={id:string;topic?:string;chatType?:string;lastUpdatedDateTime?:string;lastMessagePreview?:ChatPreview;viewpoint?:{isHidden?:boolean;lastMessageReadDateTime?:string};members?:ChatMember[]};
 function memberLabel(m:ChatMember):string {return m.displayName?.trim()||m.email?.trim()||m.userPrincipalName?.trim()||'';}
 type ApiMessage={reactions?:ApiReaction[];deletedDateTime?:string|null;eventDetail?:EventDetail|null;messageType?:string;id:string;createdDateTime?:string;from?:{user?:{id?:string;displayName?:string}};body?:{content?:string;contentType?:string};attachments?:{id?:string;name?:string;contentType?:string;contentUrl?:string;content?:string}[]};
 function allowedMicrosoftUrl(raw:string):boolean {
  try {
   const u=new URL(raw);
   const h=u.hostname.toLowerCase();
   return u.protocol==='https:' && (h.endsWith('.sharepoint.com') || h.endsWith('.sharepoint-df.com') || h==='onedrive.live.com' || h==='1drv.ms' || h==='teams.microsoft.com' || h==='teams.cloud.microsoft' || h==='microsoft365.com' || h==='www.microsoft365.com');
  } catch { return false; }
 }
 async function openAttachment(url:string){
  fileOpenError='';
  if(!allowedMicrosoftUrl(url)) {fileOpenError='This attachment uses a link TAUT cannot safely open. Please use Teams for this file.'; return;}
  try {await openUrl(url);} catch(e){fileOpenError=`Could not open the file: ${String(e)}`;}
 }
 function extractAttachments(m:ApiMessage):Attachment[] {
   return (m.attachments??[]).filter(a=>a.contentType==='reference' && typeof a.contentUrl==='string' && /^https:\/\//i.test(a.contentUrl)).map(a=>({id:a.id??a.contentUrl!,name:a.name||'Shared file',url:a.contentUrl!,kind:a.contentType??'reference'}));
 }
 function extractImages(m:ApiMessage):InlineImage[] {
   if(m.body?.contentType==='text')return [];
   const content=m.body?.content??'';
   if(!content.includes('<'))return [];
   const template=document.createElement('template');template.innerHTML=content;const html=template.content;
   const found=new Set<string>();
   for(const img of Array.from(html.querySelectorAll('img[src]'))){
     const src=img.getAttribute('src')??'';
     // Image URLs in Graph bodies often use ../hostedContents/<id>/$value.
     const match=src.match(/(?:^|\/)hostedContents\/([^/?#]+)\/\$value(?:[?#]|$)/i);
     if(match){try {found.add(decodeURIComponent(match[1]));}catch{/* invalid ID */}}
   }
   return [...found].map(id=>({id}));
 }
 function dateKey(value:string){
  if(!value)return '';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
 }
 function dayLabel(value:string){
  const d=new Date(value);if(Number.isNaN(d.getTime()))return 'Unknown date';
  const today=new Date();const yesterday=new Date(today);yesterday.setDate(today.getDate()-1);
  if(dateKey(value)===dateKey(today.toISOString()))return 'Today';
  if(dateKey(value)===dateKey(yesterday.toISOString()))return 'Yesterday';
  return d.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
 }
 function openImageViewer(src:string){lightbox={src,name:'Shared image'};imageZoom=1;}
 function mediaKey(chatId:string,messageId:string,imageId:string){return JSON.stringify([chatId,messageId,imageId]);}
 async function loadImage(chatId:string,messageId:string,imageId:string){
   const key=mediaKey(chatId,messageId,imageId);
   const messageKey=JSON.stringify([chatId,messageId]);
   const version=imageVersions.get(messageKey)??0;
   const session=nameSession;
   if(imageCache[key]||imageLoading[key])return;
   imageLoading[key]=true;delete imageErrors[key];
   const current=()=>session===nameSession&&(imageVersions.get(messageKey)??0)===version;
   try{const src=await invoke<string>('graph_hosted_image',{chatId,messageId,contentId:imageId});if(current())imageCache[key]=src;}
   catch(e){if(current())imageErrors[key]=String(e);}
   finally{if(current())imageLoading[key]=false;}
 }
 function convertChat(chat:ApiChat):Conversation {
   const others=(chat.members??[]).filter(m=>m.userId!==ownId);
   const memberNames=others.map(memberLabel).filter((name):name is string=>Boolean(name));
   const title=chat.topic?.trim() || memberNames.join(', ') || chatNames[chat.id] || (chat.chatType==='oneOnOne'?'Unnamed conversation':'Group chat');
   let hidden=chat.viewpoint?.isHidden??false;
   if(Object.hasOwn(hiddenOverrides,chat.id)){
     if(chat.viewpoint?.isHidden===hiddenOverrides[chat.id])delete hiddenOverrides[chat.id];
     else hidden=hiddenOverrides[chat.id];
   }
   const preview=chat.lastMessagePreview;
   const normal=messagePreview(preview);
   const deleted=preview?.isDeleted||confirmedDeleted.has(JSON.stringify([chat.id,preview?.id]))||chats.find(c=>c.id===chat.id)?.messages.find(m=>m.id===preview?.id)?.deleted;
   return {id:chat.id,hidden,chatType:chat.chatType,name:title,initials:title.split(/[\s,]+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase(),status:'offline',preview:normal?(deleted?'Message deleted':(preview?.body?.contentType==='text'?preview.body.content?.trim():plainText(preview?.body?.content??''))||'New message'):'Open to load messages',previewAt:normal?preview?.createdDateTime:undefined,time:summaryTime(normal?preview?.createdDateTime:chat.lastUpdatedDateTime),unread:isUnread(chat)?1:0,messages:[]};
 }
 // The session owns the polling loop; unmount always clears it.
 onMount(() => {
   void restoreSavedSession();
   void loadNotificationSettings();
   let seconds=0;
   const timer=window.setInterval(async () => {
     if (!isLive || reauthRequired || document.hidden || authBusy || Date.now()<pollDelayUntil) return;
     const elapsed=++seconds;
     if(notificationSettings.enabled&&!document.hasFocus())return;
     if(notificationSettings.enabled&&elapsed%5===0)void consumeNotificationOpen();
     if (elapsed%5===0 && selectedId && selectedId!=='empty' && !sendBusy && !operationBusy) {
       if (!pollingMessages && !refreshBusy) {
         pollingMessages=true;
         try { await loadMessages(selectedId,'poll'); }
         catch(e) { markSyncError(e,'messages'); }
         finally {pollingMessages=false;}
       }
     }
     if (elapsed%30===0 && !pollingChats && !operationBusy) {
       pollingChats=true;
       try { await syncChatList(); } catch(e) { markSyncError(e); }
       finally {pollingChats=false;}
     }
   },1000);
   return () => window.clearInterval(timer);
 });
 async function loadNotificationSettings(){
   try{notificationSettings=await invoke<NotificationSettings>('notification_settings');}
   catch{notificationError='Notification preferences could not be loaded.';}
 }
 async function configureNotifications(enabled:boolean,showNames:boolean){
   if(notificationBusy)return;const previous={...notificationSettings};notificationBusy=true;notificationError='';notificationHint='';
   notificationSettings={...previous,enabled,showNames};
   try{notificationSettings=await invoke<NotificationSettings>('notification_configure',{enabled,showNames});}
   catch(e){notificationSettings=previous;notificationError=String(e);}
   finally{notificationBusy=false;}
   if(isLive)try{await syncChatList();}catch(e){markSyncError(e);}
 }
 async function testNotification(){
   if(notificationBusy)return;notificationBusy=true;notificationError='';notificationHint='';
   try{const sequence=await invoke<number>('notification_test');notificationHint=`Test notification requested (#${sequence}). If no banner appears, check macOS Notifications and Focus settings.`;}
   catch(e){notificationError=String(e);}
   finally{notificationBusy=false;}
 }
 $effect(()=>{
   const chatId=isLive&&mode==='chats'&&selected.id!=='empty'&&!selected.id.startsWith('pending:')?selected.id:null;
   const atLatest=Boolean(chatId&&selected.messages.length&&!jumpVisible&&!settingsOpen&&!newChatOpen&&!paletteOpen&&!lightbox&&!changeTarget&&!emojiTarget&&!authBusy);
   void invoke('notification_view',{chatId,atLatest}).catch(()=>{});
 });
 async function consumeNotificationOpen(){
   if(!isLive||authBusy||operationBusy||sendBusy||stagingBusy||groupBusy)return;
   try{const id=await invoke<string|null>('notification_take_open');if(id){await syncChatList();if(chats.some(c=>c.id===id&&!c.hidden)){settingsOpen=false;newChatOpen=false;paletteOpen=false;lightbox=null;changeTarget=null;emojiTarget=null;selectChat(id,true);}}}
   catch{/* A notification click never changes authentication or retries a write. */}
 }
 function windowFocused(){
   markVisibleRead();
   if(notificationSettings.enabled)void loadNotificationSettings();
   if(isLive&&notificationSettings.enabled&&!authBusy&&!operationBusy)void(async()=>{await consumeNotificationOpen();await syncChatList().catch(markSyncError);})();
 }
 function markSyncError(e:unknown,source:'messages'|'chats'='chats') {
   syncIssues[source]=true;
   lastSyncError=String(e);
   if(/fresh sign-in|Session expired|Not signed in/i.test(lastSyncError))reauthRequired=true;
   // Backoff avoids hammering Graph on 429/5xx or network failures.
   pollDelayUntil=Date.now()+ (lastSyncError.includes('429')?60000:15000);
   syncStatus='offline';
 }
 function isAtBottom(el:HTMLElement) { return el.scrollHeight-el.scrollTop-el.clientHeight<110; }
 function trackScroll(){ if(messageViewport)jumpVisible=!isAtBottom(messageViewport);markVisibleRead(); }
 async function bottomIfCurrent(id:string, serial:number) {
   await tick();
   if (selectedId!==id || serial!==openChatSerial || !messageViewport)return;
   messageViewport.scrollTop=messageViewport.scrollHeight;
   trackScroll();
 }
 async function jumpToLatest(){
   if(!messageViewport)return;
   messageViewport.scrollTo({top:messageViewport.scrollHeight,behavior:'smooth'});
   jumpVisible=false;
 }
 function openNewChat(){newGroupMode=false;newGroupUsers=[];newGroupTopic='';newChatEmail='';newChatRecipientId='';directoryResults=[];directoryError='';newChatError='';newChatOpen=true;}
 function onRecipientQuery(value:string){
   newChatEmail=value;newChatRecipientId='';directoryResults=[];directoryError='';
   directoryRequest++;const serial=directoryRequest;
   if(directoryTimer)clearTimeout(directoryTimer);
   if(!isLive||value.trim().length<2){directoryBusy=false;return;}
   directoryBusy=true;
   directoryTimer=setTimeout(async()=>{
     try{
       const result=await invoke<{value:DirectoryUser[]}>('graph_search_users',{query:value.trim()});
       if(serial===directoryRequest)directoryResults=(result.value??[]).filter(u=>u.id.toLowerCase()!==ownId.toLowerCase()&&(!newGroupMode||!newGroupUsers.some(p=>p.id===u.id)));
     }catch(e){if(serial===directoryRequest)directoryError=String(e);}
     finally{if(serial===directoryRequest)directoryBusy=false;}
   },300);
 }
 function chooseCoworker(user:DirectoryUser){
   directoryRequest++;if(directoryTimer)clearTimeout(directoryTimer);
   if(newGroupMode){
     if(user.id.toLowerCase()!==ownId.toLowerCase()&&!newGroupUsers.some(p=>p.id===user.id))newGroupUsers=[...newGroupUsers,user];
     newChatEmail='';directoryResults=[];directoryBusy=false;return;
   }
   newChatRecipientId=user.id;
   newChatEmail=user.displayName||user.mail||user.userPrincipalName||user.id;
   directoryResults=[];directoryBusy=false;directoryError='';
 }

 function openConversation(){
   if(!isLive || newChatBusy)return;
   newChatError='';
   if(newGroupMode){
     try{
       const entry=pendingGroupConversation(newGroupUsers,newGroupTopic,ownId);
       if(!chats.some(c=>c.id===entry.id))chats=[entry,...chats.filter(c=>c.id!=='empty')];
       newChatOpen=false;mode='chats';selectChat(entry.id);
     }catch(e){newChatError=String(e);}
     return;
   }
   const email=newChatEmail.trim();
   const recipient=newChatRecipientId || email;
   if(!newChatRecipientId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){newChatError='Choose a coworker or enter a full email address.';return;}
   if(newChatRecipientId===ownId || (signedInName && email.toLowerCase()===signedInName.toLowerCase())){newChatError='Choose someone other than yourself.';return;}
   const existing=existingChat(knownChats,recipient,ownId);
   let entry;
   try{entry=pendingConversation(recipient,email,ownId);}catch(e){newChatError=String(e);return;}
   const id=existing?.id??entry.id;
   if(!existing && !chats.some(c=>c.id===id))chats=[entry,...chats.filter(c=>c.id!=='empty')];
   newChatOpen=false;mode='chats';selectChat(id);
 }

 async function connectSession(){
     const priorOwn=ownId;const priorSelected=selectedId;const priorChats=isLive?chats:[];
     const me=await invoke<{id:string;displayName:string}>('graph_profile');
     const sameAccount=priorOwn.toLowerCase()===me.id.toLowerCase();
     if(priorOwn&&!sameAccount){
       closeReplyThread();drafts={};attachmentDrafts={};attachmentProgress={};readAttempts.clear();selectedReadEligible=false;readSelection++;readError='';confirmedDeleted.clear();uncertainChanges.clear();uncertainReactions.clear();emojiTarget=null;hiddenOverrides={};
       imageCache={};imageErrors={};imageLoading={};lightbox=null;nameSession++;replyDrafts={};formattedDrafts={};formattedReplies={};replyErrors={};replyUncertain={};channelDrafts={};activityNames={};attemptedNames.clear();leftGroupIds.clear();chatNames={};checkedLegacyNames.clear();
     }
     ownId=me.id;signedInName=me.displayName;loadPins();
     const result=await invoke<{value:ApiChat[]}>('graph_chats');
     knownChats=(result.value??[]).filter(c=>!leftGroupIds.has(c.id));
     chats=knownChats.map(raw=>{const converted=convertChat(raw);const old=sameAccount?priorChats.find(c=>c.id===raw.id):undefined;return old?{...converted,messages:old.messages,favorite:old.favorite}:converted;});
     if(sameAccount)chats=[...priorChats.filter(c=>c.id.startsWith('pending:')),...chats];
     if(chats.length&&chats.every(c=>c.hidden))chats=[{id:'empty',name:'No visible conversations',initials:'—',status:'offline',preview:'Open Hidden chats to find a conversation',time:'',unread:0,messages:[]},...chats];
     if(!chats.length) chats=[{id:'empty',name:'No conversations found',initials:'—',status:'offline',preview:'Graph returned no chats',time:'',unread:0,messages:[]}];
     attachmentPermission=await invoke<boolean>('attachment_permission').catch(()=>false);
     groupMemberPermission=await invoke<boolean>('group_member_permission').catch(()=>false);
     chatWritePermission=await invoke<boolean>('chat_write_permission').catch(()=>false);
     selectedId=sameAccount&&chats.some(c=>c.id===priorSelected)?priorSelected:'';draft=drafts[selectedId]??''; isLive=true;syncIssues={messages:false,chats:false};syncStatus='idle';forceBottomForChat=selectedId;
     if(selectedId && selectedId!=='empty') await loadMessages(selectedId,'open');
     void resolveUnnamedChats();
     const status=await invoke<PersistenceStatus>('auth_persistence_status');
     sessionSaved=status.saved;persistenceNotice=status.notice??'';reauthRequired=false;
 }
 async function restoreSavedSession(){
   if(authBusy)return;
   authBusy=true;authPhase='Restoring sign-in…';authError='';
   try{
     const status=await invoke<PersistenceStatus>('restore_session');
     sessionSaved=status.saved;persistenceNotice=status.notice??'';
     if(status.restored)await connectSession();
   }catch{authError='Saved sign-in could not finish connecting. Retry saved sign-in in Preferences or sign in manually.';}
   finally{authBusy=false;}
 }
 async function signIn(){
   if(authBusy||sendBusy||stagingBusy||groupBusy||operationBusy)return;
   authBusy=true;authPhase='Signing in…';authError='';persistenceNotice='';
   try{await invoke('sign_in');await connectSession();}
   catch(e){authError=String(e).replace(/access_token|refresh_token/ig,'[redacted]');}
   finally{authBusy=false;}
 }
 async function signOut(){
   if(authBusy || sendBusy || stagingBusy || groupBusy || operationBusy)return;
   pinnedIds=[];pinMenuId=null;pinError='';closeReplyThread();
   authBusy=true;authError='';persistenceNotice='';sessionSaved=false;reauthRequired=false;
   readAttempts.clear();selectedReadEligible=false;readSelection++;readError='';chatWritePermission=false;showHidden=false;confirmedDeleted.clear();uncertainChanges.clear();uncertainReactions.clear();emojiTarget=null;imageVersions.clear();imageCache={};imageErrors={};imageLoading={};lightbox=null;hiddenOverrides={};changeTarget=null;chatListSerial++;
   nameSession++;replyDrafts={};formattedDrafts={};formattedReplies={};replyErrors={};replyUncertain={};channelDrafts={};leftGroupIds.clear();groupMemberPermission=false;activityNames={};attemptedNames.clear();nameRetryAfter=0;
   attachmentDrafts={};attachmentProgress={};attachmentPermission=false;
   knownChats=[];drafts={};isLive=false;openChatSerial++;
   try{await invoke('sign_out');}catch(e){authError=String(e);}finally{authBusy=false;}
   sendError='';chats=structuredClone(conversations);
   selectedId='hannah';draft=drafts.hannah??'';signedInName='';ownId='';syncIssues={messages:false,chats:false};syncStatus='idle';
 }
 async function resolveUnnamedChats(){
   if(!isLive)return;
   const targets=chats.filter(c=>(c.name==='Unnamed conversation'||c.name==='Group chat')&&!checkedLegacyNames.has(c.id)).slice(0,12);
   for(const chat of targets){
     if(!isLive)return;
     checkedLegacyNames.add(chat.id);
     try{
       const result=await invoke<{value:ChatMember[]}>('graph_chat_members',{chatId:chat.id});
       const others=(result.value??[]).filter(m=>m.userId!==ownId);
       const names=others.map(memberLabel).filter((name):name is string=>Boolean(name));
       legacyDiagnostics[chat.id]=`Members returned: ${(result.value??[]).length}; identifiable others: ${names.length}.`;
       if(!names.length && others.length){chatNames[chat.id]='Participants unavailable · Group chat'; const current=chats.find(c=>c.id===chat.id);if(current)current.name=chatNames[chat.id];}
       if(names.length){
         chatNames[chat.id]=names.join(', ');
         const current=chats.find(c=>c.id===chat.id);
         if(current && (current.name==='Unnamed conversation'||current.name==='Group chat')){
           current.name=names.join(', ');current.initials=names.slice(0,2).map(n=>n[0]).join('').toUpperCase();
         }
       }
     }catch(e){legacyDiagnostics[chat.id]=`Participant lookup unavailable: ${String(e)}`;}
   }
 }
 async function syncChatList(){
   if(!isLive)return;
   const serial=++chatListSerial;const session=nameSession;
   const result=await invoke<{value:ApiChat[]}>('graph_chats');
   if(!isLive || serial!==chatListSerial||session!==nameSession)return;
   knownChats=(result.value??[]).filter(c=>!leftGroupIds.has(c.id));
   const byId=new Map(chats.map(c=>[c.id,c]));
   const ordered=knownChats.map(raw=>{
     const incoming=convertChat(raw);
     const old=byId.get(raw.id);
     if(!old)return incoming;
     const useIncoming=Boolean(incoming.previewAt)&&(!old.previewAt||Date.parse(incoming.previewAt!)>=Date.parse(old.previewAt));
     return {...incoming,messages:old.messages,preview:useIncoming?incoming.preview:old.preview,previewAt:useIncoming?incoming.previewAt:old.previewAt,time:useIncoming?incoming.time:old.time,favorite:old.favorite,unread:raw.lastMessagePreview?incoming.unread:old.unread};
   });
   const retained=chats.filter(c=>c.id!=='empty' && !ordered.some(o=>o.id===c.id));
   if(ordered.length||retained.length){
     chats=[...retained,...ordered];
     if(selectedId==='empty'||(!showHidden&&chats.find(c=>c.id===selectedId)?.hidden))ensureVisibleSelection(selectedId);
     void resolveUnnamedChats();
   }
   const status=await invoke<PersistenceStatus>('auth_persistence_status');
   if(isLive&&serial===chatListSerial&&session===nameSession){sessionSaved=status.saved;persistenceNotice=status.notice??'';clearSyncIssue('chats');}
 }
 function rememberIdentity(identity:EventIdentity){
   if(identity.id && typeof identity.displayName==='string' && identity.displayName.trim())activityNames[identityKey(identity)]=identity.displayName.trim();
 }
 async function resolveActivityNames(identities:EventIdentity[]){
   if(resolvingNames || Date.now()<nameRetryAfter)return;
   const unique=new Map(identities.filter(p=>p.id&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(p.id)&&(!p.userIdentityType||['aadUser','onPremiseAadUser'].includes(p.userIdentityType))&&!p.displayName&&!activityNames[identityKey(p)]&&!attemptedNames.has(identityKey(p))).map(p=>[identityKey(p),p]));
   const people=[...unique.values()].slice(0,30);if(!people.length)return;
   const session=nameSession;resolvingNames=true;
   try{
     const names=await invoke<EventIdentity[]>('graph_event_names',{people:people.map(p=>({id:p.id,tenantId:p.tenantId}))});
     if(!isLive || nameSession!==session)return;
     names.forEach(rememberIdentity);people.forEach(p=>attemptedNames.add(identityKey(p)));
     const currentId=selectedId;const serial=openChatSerial;
     const atBottom=messageViewport?isAtBottom(messageViewport):true;
     const height=messageViewport?.scrollHeight??0;const top=messageViewport?.scrollTop??0;
     for(const chat of chats)for(const message of chat.messages){
       if(message.reactionSource)message.reactions=groupReactions(message.reactionSource,activityNames,ownId);
       if(!message.activity)continue;
       const activity=conversationActivity({messageType:'systemEventMessage',eventDetail:message.activity.source},activityNames,ownId);
       if(activity){message.activity=activity;message.text=activity.summary;}
     }
     await tick();
     if(currentId===selectedId && serial===openChatSerial && messageViewport){
       messageViewport.scrollTop=atBottom?messageViewport.scrollHeight:top+Math.max(0,messageViewport.scrollHeight-height);
     }
   }catch{/* Names are optional; keep history readable and back off without hiding messages. */nameRetryAfter=Date.now()+60000;}
   finally{resolvingNames=false;}
 }
 function convertChatMessage(m:ApiMessage,chatId:string):Message{
       const activity=conversationActivity(m,activityNames,ownId);
       const key=JSON.stringify([chatId,m.id]);
       const serverDeleted=Boolean(m.deletedDateTime);
       const deleted=serverDeleted||confirmedDeleted.has(key);
       if(serverDeleted){confirmedDeleted.delete(key);clearMessageImages(chatId,m.id);}
       const previous=chats.find(c=>c.id===chatId)?.messages.find(old=>old.id===m.id);
       const sender=m.from?.user?.id?(m.from.user.id.toLowerCase()===ownId.toLowerCase()?'me':'them'):(deleted?previous?.sender??'them':'them');
       return {body:activity||deleted?undefined:m.body,id:m.id,replyIds:activity?[]:quotedMessageIds(m.attachments,chatId),deleted,activity,reactions:activity||deleted?[]:groupReactions(m.reactions,activityNames,ownId),reactionSource:activity||deleted?undefined:m.reactions,attachments:activity||deleted?[]:extractAttachments(m),images:activity||deleted?[]:extractImages(m),senderName:m.from?.user?.displayName,sender,text:deleted?'Message deleted':activity?.summary??(m.body?.contentType==='text'?m.body.content??'':plainText(m.body?.content??'')),createdDateTime:m.createdDateTime??'',time:m.createdDateTime?new Date(m.createdDateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):''};
 }
 async function loadMessages(chatId:string,reason:'open'|'poll'|'manual'|'sent'='manual'){
   if(chatId.startsWith('pending:') || messageInFlight.has(chatId))return;
   messageInFlight.add(chatId);const session=nameSession;
   const serial=openChatSerial;
   const viewport=messageViewport;
   const atBottom=viewport?isAtBottom(viewport):true;
   const oldScrollHeight=viewport?.scrollHeight??0;
   const oldScrollTop=viewport?.scrollTop??0;
   try {
     const data=await invoke<{value:ApiMessage[]}>('graph_messages',{chatId});
     if(!isLive || session!==nameSession || !chats.some(c=>c.id===chatId))return;
     const chat=chats.find(c=>c.id===chatId);if(!chat)return;
     const previousIDs=new Set(chat.messages.map(m=>m.id));
     for(const raw of knownChats)for(const member of raw.members??[])rememberIdentity({id:member.userId,displayName:member.displayName,tenantId:member.tenantId});
     const identities=(data.value??[]).flatMap(m=>[...activityIdentities(m),...(m.deletedDateTime||confirmedDeleted.has(JSON.stringify([chatId,m.id]))?[]:reactionIdentities(m.reactions))]);
     for(const m of data.value??[]){if(m.from?.user)rememberIdentity(m.from.user);}
     identities.forEach(rememberIdentity);
     const ordered=(data.value??[]).filter(m=>isUserMessage(m)||conversationActivity(m,activityNames,ownId)).slice().sort((a,b)=>{
       const ta=Date.parse(a.createdDateTime??'');const tb=Date.parse(b.createdDateTime??'');
       return (Number.isFinite(ta)?ta:0)-(Number.isFinite(tb)?tb:0) || a.id.localeCompare(b.id);
     });
     const mapped:Message[]=ordered.map(m=>convertChatMessage(m,chatId));
     clearSyncIssue('messages');
     // Resolve missing historical names in the background; never delay normal messages.
     void resolveActivityNames(identities);
     const changed=mapped.length!==chat.messages.length || mapped.some((m,i)=>m.id!==chat.messages[i]?.id || m.text!==chat.messages[i]?.text || JSON.stringify(m.body)!==JSON.stringify(chat.messages[i]?.body) || m.deleted!==chat.messages[i]?.deleted || JSON.stringify(m.reactions)!==JSON.stringify(chat.messages[i]?.reactions) || JSON.stringify(m.reactionSource)!==JSON.stringify(chat.messages[i]?.reactionSource) || JSON.stringify(m.activity)!==JSON.stringify(chat.messages[i]?.activity) || JSON.stringify(m.replyIds)!==JSON.stringify(chat.messages[i]?.replyIds) || m.senderName!==chat.messages[i]?.senderName || JSON.stringify(m.attachments)!==JSON.stringify(chat.messages[i]?.attachments) || JSON.stringify(m.images)!==JSON.stringify(chat.messages[i]?.images));
     if(!changed){markVisibleRead();return;}
     const newlyReceived=mapped.some(m=>!m.activity&&!m.deleted&&m.sender==='them'&&!previousIDs.has(m.id));
     chat.messages=mapped;
     const latest=[...mapped].reverse().find(m=>!m.activity);
     if(!chat.previewAt||(latest?.createdDateTime&&Date.parse(latest.createdDateTime)>=Date.parse(chat.previewAt))){
       chat.preview=latest?.text??mapped.at(-1)?.text??'No messages';
       chat.previewAt=latest?.createdDateTime;
       if(latest?.createdDateTime)chat.time=summaryTime(latest.createdDateTime);
     }
     if(newlyReceived&&reason==='poll'&&!knownChats.find(c=>c.id===chatId)?.lastMessagePreview)chat.unread=1;
     // Preserve selected chat and unsubmitted input. Svelte updates the DOM after tick().
     if(selectedId!==chatId || serial!==openChatSerial || !messageViewport)return;
     await tick();
     if(!messageViewport || selectedId!==chatId || serial!==openChatSerial)return;
     if(reason==='open'||reason==='sent'||forceBottomForChat===chatId){
       forceBottomForChat='';messageViewport.scrollTop=messageViewport.scrollHeight;
     }else if(atBottom){
       messageViewport.scrollTop=messageViewport.scrollHeight;
     }else{
       // Keep the viewport anchored if history's height changes above it.
       messageViewport.scrollTop=oldScrollTop+Math.max(0,messageViewport.scrollHeight-oldScrollHeight);
     }
     if(newlyReceived && !atBottom && reason!=='open')jumpVisible=true;
     else trackScroll();
     markVisibleRead();
   }catch(e){
     if(session!==nameSession||!isLive)return;
     if(reason==='poll')throw e;
     authError=`Unable to load messages: ${String(e)}`;
   }finally{messageInFlight.delete(chatId);}
 }
 function selectChat(id:string,read=false){
   emojiTarget=null;closeReplyThread();
   selectedReadEligible=read;readSelection++;readError='';
   drafts[selectedId]=draft;
   draft=drafts[id]??'';
   sendError='';selectedId=id;mode='chats';openChatSerial++;jumpVisible=false;
   forceBottomForChat=id;
   if(isLive && id!=='empty'){
     void (async()=>{await loadMessages(id,'open');await bottomIfCurrent(id,openChatSerial);})();
   }else{void bottomIfCurrent(id,openChatSerial);}
 }
 async function refreshMessages(){
   if(!isLive||refreshBusy||operationBusy||authBusy)return;
   const id=selectedId;refreshBusy=true;authError='';readError='';readSelection++;
   try{await syncChatList();if(id&&id!=='empty')await loadMessages(id,'manual');}
   catch(e){markSyncError(e);authError=String(e);}
   finally{refreshBusy=false;}
 }
 async function selectFiles(event:Event){
   const input=event.currentTarget as HTMLInputElement;
   const files=Array.from(input.files??[]);input.value='';
   if(!isLive || sendBusy || stagingBusy || operationBusy || authBusy || reauthRequired || selected?.hidden || !files.length)return;
   const id=selectedId;const current=attachmentDrafts[id]??[];
   stagingBusy=true;sendError='';
   try{
     validateFiles(current,files);
     const staged:StagedFile[]=[];
     for(const file of files){
       const preview=/^image\/(png|jpeg|gif|webp)$/.test(file.type) && file.size<=2*1024*1024?`data:${file.type};base64,${await fileBase64(file)}`:undefined;
       staged.push({id:crypto.randomUUID(),name:file.name,size:file.size,file,preview});
     }
     attachmentDrafts[id]=[...current,...staged];
   }catch(e){sendError=String(e);}
   finally{stagingBusy=false;}
 }
 function removeFile(id:string){
   if(sendBusy || stagingBusy)return;
   const file=selectedFiles.find(f=>f.id===id);
   attachmentDrafts[selectedId]=selectedFiles.filter(f=>f.id!==id);
   if(file?.attempted)sendError='Removed from this draft. Any uploaded copy and its sharing permissions remain in OneDrive.';
 }
 async function send(){
   const text=draft.trim();
   const filesAtSubmit=[...selectedFiles];
   if((!text && !filesAtSubmit.length) || mode!=='chats' || sendBusy || stagingBusy || groupBusy || operationBusy || authBusy || reauthRequired || selected?.hidden || !selected || selected.id==='empty')return;
   const sizeError=messageSizeError(text,formattedDrafts[selectedId]);if(sizeError){sendError=sizeError;return;}
   if(filesAtSubmit.length){
     if(!isLive)return;
     if(selected.id.startsWith('pending:') && !text){sendError='Write a first message before creating this conversation.';return;}
     if(!attachmentPermission){sendError='Attachment sending needs Files.ReadWrite permission. No conversation was created and no file was uploaded. Sign in again after the permission is approved.';return;}
     try{validateFiles([],filesAtSubmit);}catch(e){sendError=String(e);return;}
   }
   if(!isLive){
     selected.messages.push({id:crypto.randomUUID(),sender:'me',text,time:new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})});
     selected.preview=text;selected.time='Now';draft='';drafts[selected.id]='';await tick();await jumpToLatest();return;
   }
   if(selected.creationUncertain){sendError='Check Teams and refresh before explicitly enabling another group creation attempt.';return;}
   const originalId=selected.id;
   const pendingGroup=selected.pendingGroup;
   const recipient=originalId.startsWith('pending:')&&!pendingGroup?originalId.slice(8):undefined;
   const reusable=recipient?existingChat(knownChats,recipient,ownId):undefined;
   let chatId=reusable?.id??originalId;const formattedAtSubmit=formattedDrafts[originalId]??false;
   const draftAtSubmit=draft;sendBusy=true;sendError='';
   try {
     const retainChat=(id:string)=>{
       chatId=id;
       if(pendingGroup&&!knownChats.some(c=>c.id===id))knownChats=[{id,chatType:'group',topic:pendingGroup.topic,members:[{userId:ownId},...pendingGroup.recipients.map(userId=>({userId}))]},...knownChats];
       if(recipient && !knownChats.some(c=>c.id===id))knownChats=[{id,chatType:'oneOnOne',members:[{userId:ownId},{userId:recipient}]} ,...knownChats];
       const pending=chats.find(c=>c.id===originalId);
       if(pending && !chats.some(c=>c.id===id))chats=[{...pending,pendingGroup:undefined,creationUncertain:false,id,preview:'Conversation created · message not yet confirmed'},...chats];
       chats=chats.filter(c=>c.id!==originalId);
       drafts[id]=drafts[originalId]??draftAtSubmit;delete drafts[originalId];
       formattedDrafts[id]=formattedDrafts[originalId]??false;delete formattedDrafts[originalId];
       attachmentDrafts[id]=[...(attachmentDrafts[id]??[]),...(attachmentDrafts[originalId]??[])];delete attachmentDrafts[originalId];
       if(selectedId===originalId){selectedId=id;openChatSerial++;}
     };
     if(reusable)retainChat(reusable.id);
     chatId=await submitMessage(invoke,chatId,reusable?undefined:recipient,ownId,text,retainChat,filesAtSubmit.length?async(id)=>{
       for(let i=0;i<filesAtSubmit.length;i++){
         const file=filesAtSubmit[i];
         attachmentProgress[id]=`Preparing file ${i+1} of ${filesAtSubmit.length}…`;
         const data=await fileBase64(file.file);
         const staged=(attachmentDrafts[id]??[]).find(f=>f.id===file.id);if(staged)staged.attempted=true;
         await invoke('graph_prepare_attachment',{chatId:id,id:file.id,name:file.name,data});
         if(staged)staged.prepared=true;
       }
       attachmentProgress[id]='Sending message…';
       return filesAtSubmit.map(f=>f.id);
     }:undefined,pendingGroup?{...pendingGroup,onUnconfirmed:()=>{const pending=chats.find(c=>c.id===originalId);if(pending)pending.creationUncertain=true;}}:undefined,formattedAtSubmit);
     attachmentDrafts[chatId]=(attachmentDrafts[chatId]??[]).filter(f=>!filesAtSubmit.some(sent=>sent.id===f.id));
     // Clear only the submitted draft; never erase another conversation's input.
     if(drafts[chatId]===draftAtSubmit)drafts[chatId]='';
     if(selectedId===chatId && draft===draftAtSubmit)draft='';forceBottomForChat=chatId;
     // A poll may already be in progress; it will contain the sent message or the next poll will.
     if(!messageInFlight.has(chatId))await loadMessages(chatId,'sent');
     else await jumpToLatest();
   }catch(e){sendError=String(e);}
   finally{delete attachmentProgress[chatId];sendBusy=false;}
 }
 // Resize on edits, restored drafts, and width changes without an inner scrollbar.
 function autosizeComposer(node:HTMLTextAreaElement,_value:string){
   let width=node.clientWidth;let frame=0;let active=true;
   const resize=()=>{if(!active)return;node.style.height='0px';node.style.height=`${node.scrollHeight}px`;};
   const observer=new ResizeObserver(()=>{if(node.clientWidth!==width){width=node.clientWidth;cancelAnimationFrame(frame);frame=requestAnimationFrame(resize);}});
   observer.observe(node);resize();
   return {update:()=>{void tick().then(resize);},destroy:()=>{active=false;observer.disconnect();cancelAnimationFrame(frame);}};
 }
 function composerKeys(event:KeyboardEvent){
   if(event.key==='Enter' && !event.isComposing && (formattedDrafts[selectedId]?(event.metaKey||event.ctrlKey):!event.shiftKey)){event.preventDefault();void send();}
 }
 function openComposerEmoji(event:MouseEvent){
   emojiReturnFocus=event.currentTarget as HTMLElement;
   if(!isLive||!composerInput||selected.id==='empty'||selected.hidden||sendBusy||stagingBusy||groupBusy||operationBusy||authBusy)return;
   reactionError='';reactionUncertain=false;
   emojiTarget={mode:'compose',chatId:selectedId,start:composerInput.selectionStart??draft.length,end:composerInput.selectionEnd??draft.length};
 }
 function openReaction(message:Message,trigger?:HTMLElement){
   if(!isLive||!chatWritePermission||selected.id==='empty'||selected.id.startsWith('pending:')||message.deleted||message.activity||sendBusy||stagingBusy||groupBusy||operationBusy||authBusy||reauthRequired)return false;
   emojiReturnFocus=trigger??document.activeElement as HTMLElement;
   emojiTarget={mode:'react',chatId:selectedId,messageId:message.id};
   reactionUncertain=uncertainReactions.has(JSON.stringify([selectedId,message.id]));
   reactionError=reactionUncertain?'An earlier reaction change was not confirmed. Refresh its status before retrying.':'';
   return true;
 }
 function returnEmojiFocus(){void tick().then(()=>{if(emojiReturnFocus?.isConnected)emojiReturnFocus.focus();else composerInput?.focus();});}
 function closeEmojiPicker(){if(operationBusy)return;emojiTarget=null;returnEmojiFocus();}
 async function chooseEmoji(emoji:string){
   const target=emojiTarget;if(!target||operationBusy)return;
   if(target.mode==='compose'){
     if(target.chatId!==selectedId)return;
     const result=insertEmoji(draft,emoji,target.start,target.end);draft=result.text;drafts[selectedId]=draft;emojiTarget=null;
     await tick();composerInput?.focus();composerInput?.setSelectionRange(result.caret,result.caret);
   }else await changeReaction(emoji,false);
 }
 async function changeReaction(emoji:string,remove:boolean){
   if(emojiTarget?.mode!=='react'||reactionUncertain||operationBusy||!chatWritePermission||reauthRequired)return;
   const target={...emojiTarget};const key=JSON.stringify([target.chatId,target.messageId]);
   operationBusy=true;reactionError='';
   try{
     await invoke('graph_change_reaction',{chatId:target.chatId,messageId:target.messageId,emoji,remove});
     uncertainReactions.delete(key);emojiTarget=null;
     await loadMessages(target.chatId,'manual');
   }catch(e){uncertainReactions.add(key);reactionError=String(e);reactionUncertain=true;}
   finally{operationBusy=false;if(!emojiTarget)returnEmojiFocus();}
 }
 function removeReaction(message:Message,emoji:string,trigger?:HTMLElement){if(openReaction(message,trigger)&&!reactionUncertain)void changeReaction(emoji,true);}
 async function checkReactionStatus(){
   if(emojiTarget?.mode!=='react'||operationBusy)return;
   const target={...emojiTarget};operationBusy=true;reactionError='';
   try{
     await invoke<string[]>('graph_reaction_state',{chatId:target.chatId,messageId:target.messageId});
     await loadMessages(target.chatId,'manual');
     uncertainReactions.delete(JSON.stringify([target.chatId,target.messageId]));reactionUncertain=false;
   }catch(e){reactionError=String(e);}
   finally{operationBusy=false;}
 }
 function leaveGroupLocally(id:string){
   leftGroupIds.add(id);knownChats=knownChats.filter(c=>c.id!==id);chats=chats.filter(c=>c.id!==id);
   if(!chats.length)chats=[{id:'empty',name:'No conversations found',initials:'—',status:'offline',preview:'Start a conversation',time:'',unread:0,messages:[]}];
   if(selectedId===id)selectChat(chats[0].id);
 }
 function clearMessageImages(chatId:string,messageId:string){
   const messageKey=JSON.stringify([chatId,messageId]);imageVersions.set(messageKey,(imageVersions.get(messageKey)??0)+1);
   const prefix=JSON.stringify([chatId,messageId]).slice(0,-1)+',';
   for(const key of new Set([...Object.keys(imageCache),...Object.keys(imageErrors),...Object.keys(imageLoading)])){
     if(!key.startsWith(prefix))continue;
     if(lightbox?.src===imageCache[key])lightbox=null;
     delete imageCache[key];delete imageErrors[key];delete imageLoading[key];
   }
 }
 function requestChange(kind:ChangeTarget['kind'],message?:Message){
   if(!isLive||!chatWritePermission||sendBusy||stagingBusy||groupBusy||operationBusy||authBusy||reauthRequired||selected.id==='empty'||selected.id.startsWith('pending:'))return;
   if((kind==='delete'||kind==='restore')&&(!message||message.sender!=='me'||message.activity))return;
   changeTarget={kind,chatId:selected.id,messageId:message?.id,name:selected.name,preview:message?.deleted?undefined:message?.text.slice(0,240)};
   changeUncertain=uncertainChanges.has(changeKey(changeTarget));
   changeError=changeUncertain?'An earlier attempt was not confirmed. Check status before retrying.':'';
 }
 function ensureVisibleSelection(hiddenId:string){
   if(selectedId!==hiddenId)return;
   let next=chats.find(c=>!c.hidden&&c.id!=='empty');
   if(!next){next={id:'empty',name:'No visible conversations',initials:'—',status:'offline',preview:'Open Hidden chats to find a conversation',time:'',unread:0,messages:[]};chats=[next,...chats.filter(c=>c.id!=='empty')];}
   selectChat(next.id);
 }
 function applyConfirmedChange(target:ChangeTarget){
   uncertainChanges.delete(changeKey(target));
   const chat=chats.find(c=>c.id===target.chatId);if(!chat)return;
   if(target.kind==='delete'){
     confirmedDeleted.add(JSON.stringify([target.chatId,target.messageId]));
     const message=chat.messages.find(m=>m.id===target.messageId);
     if(message){message.deleted=true;message.text='Message deleted';message.attachments=[];message.images=[];message.reactions=undefined;message.reactionSource=undefined;}
     clearMessageImages(target.chatId,target.messageId!);
     chat.preview=[...chat.messages].reverse().find(m=>!m.activity)?.text??'No messages';
   }else if(target.kind==='restore'){
     confirmedDeleted.delete(JSON.stringify([target.chatId,target.messageId]));
   }else{
     const hidden=target.kind==='hide';hiddenOverrides[target.chatId]=hidden;chat.hidden=hidden;
     showHidden=false;if(hidden)ensureVisibleSelection(target.chatId);else chats=chats.filter(c=>c.id!=='empty');
   }
 }
 async function confirmChange(){
   if(!changeTarget||operationBusy||changeUncertain||!chatWritePermission)return;
   const target={...changeTarget};operationBusy=true;changeError='';
   try{
     if(target.kind==='delete'||target.kind==='restore')await invoke('graph_change_message',{chatId:target.chatId,messageId:target.messageId,restore:target.kind==='restore'});
     else await invoke('graph_set_chat_visibility',{chatId:target.chatId,hidden:target.kind==='hide'});
     applyConfirmedChange(target);changeTarget=null;
     if(target.kind==='restore')await loadMessages(target.chatId,'manual');
   }catch(e){changeError=String(e);changeUncertain=true;uncertainChanges.add(changeKey(target));}
   finally{operationBusy=false;}
 }
 async function checkChangeStatus(){
   if(!changeTarget||operationBusy)return;
   const target={...changeTarget};operationBusy=true;changeError='';
   try{
     const messageAction=target.kind==='delete'||target.kind==='restore';
     const state=messageAction?await invoke<boolean>('graph_message_status',{chatId:target.chatId,messageId:target.messageId}):await invoke<boolean>('graph_chat_visibility',{chatId:target.chatId});
     const desired=target.kind==='delete'||target.kind==='hide';
     if(state===desired){applyConfirmedChange(target);changeTarget=null;if(target.kind==='restore')await loadMessages(target.chatId,'manual');}
     else{uncertainChanges.delete(changeKey(target));changeUncertain=false;changeError='The requested change is not reflected in Microsoft 365. You can explicitly retry.';}
   }catch(e){changeError=String(e);}
   finally{operationBusy=false;}
 }
 function startDrag(e:PointerEvent){dragStart=true;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}
 function moveDrag(e:PointerEvent){if(dragStart)sidebarWidth=Math.min(490,Math.max(220,e.clientX-68));}
 function endDrag(){dragStart=false;}
</script>
<svelte:window onclick={closePinMenu} onkeydown={keys} onfocus={windowFocused}/>
<div class="app" class:dense style={`--accent:${accent==='amber'?'#efbb70':accent==='teal'?'#63d4c1':'#b3a0ff'};--sidebar-width:${sidebarWidth}px`}>
 <div class="layout-bar"><span class="layout-caption">TAUT <span>/ YOUR WORKSPACE</span></span><div class="layout-controls" role="toolbar" aria-label="Workspace layout">
  <button type="button" aria-label="Toggle conversation sidebar" aria-pressed={sidebarOpen} title="Conversation sidebar" onclick={()=>sidebarOpen=!sidebarOpen}><PanelLeft size={17}/></button>
  <button type="button" aria-label="Toggle details panel" aria-pressed={detailsOpen&&(mode==='teams'||mode==='chats'&&selected.id!=='empty')} disabled={mode!=='teams'&&(mode!=='chats'||selected.id==='empty')} title={mode==='teams'?'Channel details or reply thread':mode==='chats'&&selected.id!=='empty'?'Conversation details':'Choose a conversation to show details'} onclick={()=>detailsOpen=!detailsOpen}><PanelRight size={17}/></button>
  <span class="layout-divider"></span>
  <button type="button" aria-label="Focus mode" aria-pressed={focusMode} title={focusMode?'Exit focus mode · restore panels':'Focus mode · hide both panels'} onclick={toggleFocus}><Scan size={17}/></button>
 </div></div>
 <div class="workspace">
 <aside class="rail" aria-label="TAUT navigation">
  <img class="brand" src="/icon.png" alt="TAUT"/>
  <div class="rail-buttons">
   {#each nav as item}
    <button class:active={mode===item.id} class="rail-button" title={item.label} aria-label={item.label} onclick={()=>{mode=item.id;if(item.id==='chats'||item.id==='teams')sidebarOpen=true;}}><item.icon size={20} strokeWidth={1.8}/>{#if item.id==='chats'&&unreadChats}<span class="unread-total" aria-label={`${unreadChats} unread conversations`}>{unreadChats}</span>{/if}</button>
   {/each}
  </div>
  <div class="rail-bottom">
   <button class="rail-button" title="Command Palette (⌘⇧K)" aria-label="Command Palette" onclick={openPalette}><Command size={20}/></button>
   <button class="rail-button" title="Settings" aria-label="Settings" onclick={()=>settingsOpen=true}><Settings size={20}/></button>
   <div class="my-avatar" title={signedInName||"Demo profile"}>{signedInName? signedInName[0]:"J"}</div>
  </div>
 </aside>
 {#if sidebarOpen&&mode!=='teams'}
 <aside class="sidebar" aria-label="Conversations">
  <div class="sidebar-head"><div><div class="eyebrow">WORKSPACE</div><h1>{mode==='chats'?'Messages':nav.find(n=>n.id===mode)?.label}</h1></div><div class="sidebar-head-actions">{#if mode==='chats'}<button class="small-button" title="New conversation" aria-label="New conversation" onclick={openNewChat}><SquarePen size={18}/></button>{/if}<button class="small-button" aria-label="Collapse sidebar" title="Collapse sidebar" onclick={()=>sidebarOpen=false}><PanelLeftClose size={18}/></button></div></div>
  {#if mode==='chats'}
   <label class="search-field"><Search size={17}/><input bind:this={conversationSearch} bind:value={search} placeholder="Search conversations" aria-label="Search conversations"/><kbd>⌘ K</kbd></label>
   {#if isLive}<button class="hidden-chats-toggle" type="button" aria-pressed={showHidden} onclick={()=>showHidden=!showHidden}>{showHidden?'Back to visible chats':`Hidden chats (${chats.filter(c=>c.hidden).length})`}</button>{/if}
   <div class="list-scroll">{#if pinError}<div class="pin-error" role="alert">{pinError}<button type="button" aria-label="Dismiss pin error" onclick={()=>pinError=''}>×</button></div>{/if}<div class="list-label">PINNED <span>{filtered.filter(c=>isPinned(c)).length}</span></div>
   {#each filtered.filter(c=>isPinned(c)) as c}<div class="chat-row-wrap" class:pinned={isPinned(c)}><button class:selected={c.id===selectedId} class:unread={c.unread>0} class="chat-row" onclick={()=>selectChat(c.id,true)}><span class="avatar">{c.initials}<i class:away={c.status==='away'} class:offline={c.status==='offline'}></i></span><span class="chat-copy"><strong>{c.name}</strong><small>{c.preview}</small></span><span class="chat-meta"><small>{c.time}</small>{#if c.unread}<span class="unread-dot" aria-label="Unread conversation" title="Unread message"></span>{/if}</span></button>{#if isLive&&c.id!=='empty'&&!c.id.startsWith('pending:')}<button type="button" class="conversation-options" disabled={authBusy} id={`pin-options-${c.id}`} aria-label={`Conversation options for ${c.name}`} aria-haspopup="menu" aria-expanded={pinMenuId===c.id} title="Conversation options" onclick={()=>openPinMenu(c.id)}><MoreHorizontal size={16}/></button>{#if pinMenuId===c.id}<div class="pin-menu" role="menu" aria-label={`Options for ${c.name}`}><span>ON THIS DEVICE · TAUT ONLY</span><button type="button" role="menuitem" bind:this={pinMenuAction} onclick={()=>togglePin(c)}>{#if isPinned(c)}<PinOff size={15}/>Unpin chat{:else}<Pin size={15}/>Pin chat{/if}</button></div>{/if}{/if}</div>{/each}
   <div class="list-label recent">RECENT <span>{filtered.filter(c=>!isPinned(c)).length}</span></div>
   {#each filtered.filter(c=>!isPinned(c)) as c}<div class="chat-row-wrap" class:pinned={isPinned(c)}><button class:selected={c.id===selectedId} class:unread={c.unread>0} class="chat-row" onclick={()=>selectChat(c.id,true)}><span class="avatar">{c.initials}<i class:away={c.status==='away'} class:offline={c.status==='offline'}></i></span><span class="chat-copy"><strong>{c.name}</strong><small>{c.preview}</small></span><span class="chat-meta"><small>{c.time}</small>{#if c.unread}<span class="unread-dot" aria-label="Unread conversation" title="Unread message"></span>{/if}</span></button>{#if isLive&&c.id!=='empty'&&!c.id.startsWith('pending:')}<button type="button" class="conversation-options" disabled={authBusy} id={`pin-options-${c.id}`} aria-label={`Conversation options for ${c.name}`} aria-haspopup="menu" aria-expanded={pinMenuId===c.id} title="Conversation options" onclick={()=>openPinMenu(c.id)}><MoreHorizontal size={16}/></button>{#if pinMenuId===c.id}<div class="pin-menu" role="menu" aria-label={`Options for ${c.name}`}><span>ON THIS DEVICE · TAUT ONLY</span><button type="button" role="menuitem" bind:this={pinMenuAction} onclick={()=>togglePin(c)}>{#if isPinned(c)}<PinOff size={15}/>Unpin chat{:else}<Pin size={15}/>Pin chat{/if}</button></div>{/if}{/if}</div>{/each}
   {#if filtered.length===0}<div class="empty">No matching conversations</div>{/if}</div>
  {:else}<div class="sidebar-note"><span class="note-icon"><LayoutPanelTop size={19}/></span><strong>{nav.find(n=>n.id===mode)?.label}</strong><p>This section is a UI placeholder. Microsoft Graph integration comes next.</p><button class="text-action" onclick={()=>mode='chats'}>Back to Chats <ChevronRight size={14}/></button></div>{/if}
  <div class="sidebar-foot"><span class="live-dot"></span>{isLive?'MICROSOFT 365 · CONNECTED':'MOCK DATA'} <span class="spacer"></span>{#if isLive}<button class="auth-action" disabled={authBusy} onclick={signOut}>Sign out</button>{:else}<button class="auth-action" disabled={authBusy} onclick={signIn}>{authBusy?authPhase:'Sign in'}</button>{/if}</div>
 </aside><div class="resize-handle" role="separator" aria-label="Resize conversation panel" aria-orientation="vertical" tabindex="0" onpointerdown={startDrag} onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={endDrag} onkeydown={(e)=>{if(e.key==='ArrowRight')sidebarWidth=Math.min(490,sidebarWidth+20);if(e.key==='ArrowLeft')sidebarWidth=Math.max(220,sidebarWidth-20)}}></div>
 {/if}
 <main class="main">
  {#if mode==='teams'}{#key ownId}<TeamsWorkspace onCloseDetails={()=>detailsOpen=false} drafts={channelDrafts} sendBusy={sendBusy} onSendBusy={(busy)=>sendBusy=busy} {isLive} {ownId} {sidebarOpen} {detailsOpen} {authBusy} onSignIn={signIn} onSignOut={signOut} onThreadOpen={()=>detailsOpen=true}/>{/key}
  {:else if mode==='chats'}
   {#if selected.id==='empty'}
    <Welcome onNew={openNewChat} onSearch={focusConversationSearch} onRefresh={refreshMessages} onSidebar={()=>sidebarOpen=true} {sidebarOpen} busy={refreshBusy||authBusy||operationBusy}/>

   {:else}
   <header class="conversation-header"><div class="header-person">{#if !sidebarOpen}<button class="small-button" title="Expand sidebar" aria-label="Expand sidebar" onclick={()=>sidebarOpen=true}><PanelLeftOpen size={19}/></button>{/if}<span class="avatar header-avatar">{selected.initials}<i class:away={selected.status==='away'} class:offline={selected.status==='offline'}></i></span><div><strong>{selected.name}</strong><small class:presence-muted={isLive||selected.status==='offline'}>{isLive?'Presence unavailable':selected.status==='online'?'Available':selected.status==='away'?'Away':'Offline'}</small></div></div><div class="header-actions">{#if isLive&&selected.id!=='empty'&&!selected.id.startsWith('pending:')}<button type="button" title={chatWritePermission?(selected.hidden?'Return this chat to your list':'Hide only for you; history stays'):'Requires delegated Chat.ReadWrite consent and a fresh sign-in'} aria-label={selected.hidden?'Unhide conversation for me':'Hide conversation for me'} disabled={!chatWritePermission||sendBusy||stagingBusy||groupBusy||operationBusy||authBusy||reauthRequired} onclick={()=>requestChange(selected.hidden?'unhide':'hide')}>{#if selected.hidden}<Eye size={18}/>{:else}<EyeOff size={18}/>{/if}</button>{/if}<button title="Calls require integration" aria-label="Call (not yet implemented)" disabled><Phone size={18}/></button><button title="Meetings require integration" aria-label="Video (not yet implemented)" disabled><Video size={18}/></button><div class="vert-divider"></div>{#if isLive}<button title="Refresh messages" aria-label="Refresh messages" disabled={refreshBusy} onclick={refreshMessages}><span class="refresh-symbol" class:spinning={refreshBusy}>↻</span></button>{/if}<button title="Command Palette" aria-label="Commands" onclick={openPalette}><MoreHorizontal size={19}/></button></div></header>
   <section class="messages" bind:this={messageViewport} onscroll={trackScroll} aria-label="Chat messages">{#each selected.messages as m,i (m.id)}
    {#if i===0 || (m.createdDateTime && dateKey(m.createdDateTime)!==dateKey(selected.messages[i-1].createdDateTime??''))}
      <div class="day-marker"><span>{m.createdDateTime?dayLabel(m.createdDateTime):'History'}</span></div>
    {/if}{#if m.activity}<div class="conversation-activity" role="note" aria-label="Group activity">
      <span class="activity-icon" aria-hidden="true">{#if m.activity.kind==='added'}<UserPlus size={16}/>{:else if m.activity.kind==='removed'}<UserMinus size={16}/>{:else if m.activity.kind==='renamed'}<PencilLine size={16}/>{:else if m.activity.kind==='joined'}<LogIn size={16}/>{:else}<LogOut size={16}/>{/if}</span>
      <div class="activity-copy"><span class="activity-label">{m.activity.kind==='renamed'?'GROUP NAME':m.activity.kind==='added'?'MEMBERS ADDED':m.activity.kind==='removed'?'MEMBERS REMOVED':m.activity.kind==='joined'?'JOINED':'LEFT'}</span><p>{m.activity.summary}</p>{#if m.activity.history}<small>{m.activity.history}</small>{/if}</div>
      {#if m.createdDateTime}<time datetime={m.createdDateTime} title={new Date(m.createdDateTime).toLocaleString()}>{m.time}</time>{/if}
    </div>{:else}<div class:mine={m.sender==='me'} class="message-line" data-message-id={m.id}><div class="message-stack">{#if m.sender==='them'}<span class="sender-name">{m.senderName||(selected.chatType==='group'?'Participant unavailable':selected.name)}</span>{/if}{#if !m.deleted&&m.replyIds?.length}<div class="quoted-reply-event" aria-label="Quoted reply activity"><MessagesSquare size={14}/><span>{m.sender==='me'?'You':m.senderName||(selected.chatType==='group'?'A participant':selected.name)} replied to a message</span>{#each m.replyIds as parentId,i}<button type="button" aria-label={`View quoted message ${i+1}`} onclick={()=>openReplyThread(parentId)}>View thread ↗</button>{/each}</div>{:else}<div class="bubble" class:deleted-message={m.deleted}>
      {#if !m.deleted}{#each m.replyIds??[] as parentId,i}<button class="chat-quote-link" type="button" aria-label={`View quoted message ${i+1}`} onclick={()=>openReplyThread(parentId)}><MessagesSquare size={13}/>{selected.messages.find(parent=>parent.id===parentId)?.deleted?'Quoted message deleted':'Reply to an earlier message'}<span aria-hidden="true">↗</span></button>{/each}{/if}
      {#if m.text && !(m.images?.length || m.attachments?.length) || (m.text && !m.text.startsWith('[Image or attachment'))}<div class="message-text"><MessageBody body={m.body} fallback={m.text} deleted={!!m.deleted}/></div>{/if}
      {#each (m.images ?? []) as img (img.id)}
       {@const key=mediaKey(selected.id,m.id,img.id)}
       <div class="image-preview">
        {#if imageCache[key]}<button type="button" class="image-open" aria-label="Open shared image full screen" onclick={()=>openImageViewer(imageCache[key])}><img src={imageCache[key]} alt="Image shared in Teams chat" loading="eager" onload={()=>{if(messageViewport && isAtBottom(messageViewport))void jumpToLatest();}} /><span class="image-expand">Expand ↗</span></button>
        {:else}<button type="button" disabled={imageLoading[key]} onclick={()=>loadImage(selected.id,m.id,img.id)}>{imageLoading[key]?'Loading image…':'View shared image'}</button>{/if}
        {#if imageErrors[key]}<small role="alert">{imageErrors[key]}</small>{/if}
       </div>
      {/each}
      {#each (m.attachments ?? []) as a (a.id)}
       <button type="button" class="file-card" title="Open shared file in your default browser" onclick={()=>openAttachment(a.url)}><Files size={18}/><span>{a.name}</span><span aria-hidden="true">↗</span></button>
      {/each}
      {#if !m.text && !(m.images?.length || m.attachments?.length)}<span>Unsupported message content</span>{/if}
      {#if m.text.startsWith('[Image or attachment') && !(m.images?.length || m.attachments?.length)}<span>{m.text}</span>{/if}
     </div>{/if}{#if !m.deleted&&m.reactions?.length}<MessageReactions groups={m.reactions} disabled={!chatWritePermission||sendBusy||stagingBusy||groupBusy||operationBusy||authBusy||reauthRequired} onRemove={isLive?(emoji,trigger)=>removeReaction(m,emoji,trigger):undefined}/>{/if}<div class="message-foot"><span>{m.time}</span>{#if isLive&&!m.deleted&&!m.activity}<button class="message-action" type="button" aria-label="Reply with quote" onclick={()=>openReplyThread(m.id)}><MessagesSquare size={13}/>Reply</button>{/if}{#if isLive&&chatReplies(m.id,selected.messages).length}<button class="message-action" type="button" title="Quoted replies in loaded chat history" aria-label="View chat replies" onclick={()=>openReplyThread(m.id)}><MessagesSquare size={13}/>{chatReplies(m.id,selected.messages).length} {chatReplies(m.id,selected.messages).length===1?'reply':'replies'}</button>{/if}{#if isLive&&!m.deleted&&!selected.id.startsWith('pending:')}<button class="message-action" type="button" aria-label="Add reaction" title={chatWritePermission?'React to this message':'Requires delegated Chat.ReadWrite and a fresh sign-in'} disabled={!chatWritePermission||sendBusy||stagingBusy||groupBusy||operationBusy||authBusy||reauthRequired} onclick={event=>openReaction(m,event.currentTarget)}><Smile size={13}/></button>{/if}{#if m.sender==='me'&&!m.deleted}<Check size={12}/>{/if}{#if isLive&&m.sender==='me'}<button type="button" class="message-action" aria-label={m.deleted?'Restore message':'Delete message'} title={chatWritePermission?(m.deleted?'Restore to the shared conversation':'Delete from the shared conversation'):'Requires delegated Chat.ReadWrite consent and a fresh sign-in'} disabled={!chatWritePermission||sendBusy||stagingBusy||groupBusy||operationBusy||authBusy||reauthRequired} onclick={()=>requestChange(m.deleted?'restore':'delete',m)}>{#if m.deleted}<Undo2 size={12}/>{:else}<Trash2 size={12}/>{/if}{m.deleted?'Restore':'Delete'}</button>{/if}</div></div></div>{/if}{/each}<div bind:this={listEnd}></div></section>
   {#if jumpVisible && mode==='chats'}<button class="jump-latest" onclick={jumpToLatest}>↓ Snap to Now</button>{/if}


   {#if fileOpenError}<div class="send-error" role="alert">{fileOpenError}<button type="button" onclick={()=>fileOpenError=''} aria-label="Dismiss file error">×</button></div>{/if}
   {#if selected.hidden}<div class="pending-notice" role="status">Hidden for you. History and drafts are preserved. Unhide this conversation to send again.</div>{/if}
   {#if sendError}<div class="send-error" role="alert">{sendError}<button type="button" onclick={()=>sendError=''} aria-label="Dismiss send error">×</button></div>{/if}
   {#if selected.id.startsWith('pending:')}<div class="pending-notice" role="status">Local draft. Pressing Send will create the Teams conversation and send your first message.</div>{/if}
   {#if selectedFiles.length}
    <section class="attachment-drafts" aria-label="Draft attachments">
     <div class="attachment-draft-list">{#each selectedFiles as file (file.id)}<div class="attachment-draft">
      {#if file.preview}<button type="button" aria-label={`Preview ${file.name}`} onclick={()=>{lightbox={src:file.preview!,name:file.name};imageZoom=1}}><img src={file.preview} alt={file.name}/></button>{:else}<Files size={20}/>{/if}
      <span><strong>{file.name}</strong><small>{fileSize(file.size)} · {file.prepared?'Uploaded · ready to send':file.attempted?'Send attempted · draft saved':'Local file'}</small></span>
      <button type="button" aria-label={`Remove ${file.name}`} disabled={sendBusy||stagingBusy} onclick={()=>removeFile(file.id)}><X size={16}/></button>
     </div>{/each}</div>
     <p aria-live="polite">{attachmentProgress[selectedId]??(attachmentPermission?'Send uploads to your OneDrive and grants chat members read access.':'Sending files requires Files.ReadWrite permission; it is not enabled for this sign-in.')}</p>
     {#if selected.id.startsWith('pending:')}<p>Add first-message text before sending these files.</p>{/if}
     {#if selectedFiles.some(f=>f.attempted)}<p>Files uploaded/shared during a Send attempt remain in OneDrive if removed from this draft.</p>{/if}
    </section>
   {/if}
   {#if selected.creationUncertain}<div class="pending-notice" role="status">A group creation attempt failed or was not confirmed. Check Teams before trying to create it again.
    <button type="button" onclick={()=>{if(selected)selected.creationUncertain=false;sendError=''}}>I checked Teams — enable retry</button>
   </div>{/if}
   <input class="file-picker" type="file" multiple bind:this={fileInput} aria-label="Choose attachment files" onchange={selectFiles} disabled={!isLive||sendBusy||stagingBusy}/>
   <div class="compose-format-area"><FormattingToolbar text={draft} formatted={formattedDrafts[selectedId]??false} input={composerInput} disabled={sendBusy||stagingBusy||groupBusy||operationBusy||authBusy||selected.hidden||selected.id==='empty'} onText={text=>{draft=text;drafts[selectedId]=text}} onFormat={value=>formattedDrafts[selectedId]=value}/></div>
   <form class="composer" onsubmit={(e)=>{e.preventDefault();send()}}><button type="button" title="Attach files (up to 5 files, 10 MB each)" aria-label="Attach files" disabled={!isLive||sendBusy||stagingBusy||operationBusy||authBusy||reauthRequired||selected.hidden||selected.id==='empty'} onclick={()=>fileInput?.click()}><Paperclip size={19}/></button><textarea rows="1" bind:this={composerInput} use:autosizeComposer={draft} use:continueList={{formatted:formattedDrafts[selectedId]??false,onText:text=>{draft=text;drafts[selectedId]=text}}} onkeydown={composerKeys} value={draft} oninput={(e)=>{draft=e.currentTarget.value;drafts[selectedId]=draft}} placeholder={isLive?`Message ${selected.name}…`:`Demo message ${selected.name}…`} disabled={sendBusy || stagingBusy || groupBusy || operationBusy || authBusy || selected.hidden || selected.id==='empty'} aria-label="Message" title={formattedDrafts[selectedId]?"Enter for a new line; ⌘Enter to send":"Enter to send; Shift+Enter for a new line"}></textarea><button type="button" title="Insert emoji into your draft" aria-label="Insert emoji" disabled={!isLive||sendBusy||stagingBusy||groupBusy||operationBusy||authBusy||selected.hidden||selected.id==='empty'} onclick={openComposerEmoji}><Smile size={19}/></button><button type="submit" class="send" disabled={sendBusy||stagingBusy||groupBusy||operationBusy||authBusy||reauthRequired||selected.hidden||selected.creationUncertain||(!draft.trim()&&(!selectedFiles.length||selected.id.startsWith('pending:')))||selected.id==='empty'} aria-label="Send message"><Send size={18}/></button></form>
   {/if}
  {:else}<div class="section-placeholder">{#if !sidebarOpen}<button class="small-button left-restore" onclick={()=>sidebarOpen=true}><PanelLeftOpen size={18}/></button>{/if}<LayoutPanelTop size={36}/><h2>{nav.find(n=>n.id===mode)?.label}</h2><p>TAUT owns this workspace. Connecting Microsoft 365 data is the next phase.</p><button class="outline-button" onclick={()=>mode='chats'}>Return to messages</button></div>{/if}
 </main>
 {#if detailsOpen&&mode==='chats'&&activeThread}<ChatThread formatted={formattedReplies[replyKey]??false} onFormat={value=>formattedReplies[replyKey]=value} replyText={replyDrafts[replyKey]??''} sendError={replyErrors[replyKey]??''} uncertain={replyUncertain[replyKey]??false} disabled={sendBusy||stagingBusy||authBusy||operationBusy||groupBusy||reauthRequired||!!selected.hidden||!threadRoot||!!threadRoot.deleted} onText={(text)=>replyDrafts[replyKey]=text} onSend={sendQuotedReply} onAcknowledge={()=>{replyUncertain[replyKey]=false;replyErrors[replyKey]='';}} onRefresh={()=>loadMessages(selected.id,'manual')} root={threadRoot} replies={threadMessages} loading={quotedLoading} error={quotedError} chatName={selected.name} group={selected.chatType==='group'} onClose={closeReplyThread} onRetry={()=>activeThread&&openReplyThread(activeThread.rootId)} onOpenFile={openAttachment} onViewImage={viewThreadImage}/>{:else if detailsOpen&&mode==='chats'&&selected.id!=='empty'}<aside class="details" aria-label="Conversation details"><div class="details-title"><strong>Conversation</strong><button aria-label="Close details" title="Close details" onclick={()=>detailsOpen=false}><X size={17}/></button></div><div class="profile"><span class="avatar big-avatar">{selected.initials}</span><h3>{selected.name}</h3><span class="status"><span class="live-dot" class:presence-muted={isLive||selected.status==='offline'} class:presence-away={!isLive&&selected.status==='away'}></span>{isLive?'Presence unavailable':selected.status==='online'?'Available':selected.status}</span></div>{#if isLive && selected.chatType==='group' && !selected.id.startsWith('pending:')}{#key selected.id}<GroupMembers chatId={selected.id} {ownId} permitted={groupMemberPermission} disabled={sendBusy||stagingBusy||operationBusy||authBusy||reauthRequired} onBusyChange={busy=>groupBusy=busy} onChanged={()=>{void syncChatList().catch(markSyncError)}} onLeft={leaveGroupLocally}/>{/key}{/if}<div class="detail-section"><div class="detail-heading">SHARED MEDIA <span>0</span></div><div class="tile-row"><div class="media-tile"></div><div class="media-tile"></div><div class="media-tile"></div></div><p>Files and images will appear here after Graph integration.</p></div><div class="detail-section"><div class="detail-heading">WORKSPACE</div>{#if isLive && legacyDiagnostics[selected.id]}<p title="Names are returned only where Graph exposes them">{legacyDiagnostics[selected.id]}</p>{/if}<button class="detail-action" onclick={()=>detailsOpen=false}><PanelRightClose size={16}/> Hide details <ChevronRight size={14}/></button></div><div class="details-bottom">{isLive?"MICROSOFT 365 · CONNECTED":"PRIVATE PREVIEW · MOCK DATA"}</div></aside>{/if}
</div>
<footer class="workspace-status" aria-label="Workspace status" class:warning={reauthRequired||!!authError||!!readError||!!persistenceNotice||isLive&&syncStatus==='offline'}>
 {#if reauthRequired}<div role="status"><span>Microsoft requires a fresh sign-in. Your drafts remain in this session.</span><button type="button" disabled={authBusy||sendBusy||stagingBusy||groupBusy||operationBusy} onclick={signIn}>Reconnect</button></div>
 {:else if authError}<div role="alert"><span>{authError}</span><button type="button" onclick={()=>authError=''} aria-label="Dismiss error">×</button></div>
 {:else if readError}<div role="status"><span>{readError}</span><button type="button" aria-label="Dismiss read status notice" onclick={()=>readError=''}>×</button></div>
 {:else if persistenceNotice}<div role="status"><span>{persistenceNotice}</span><button type="button" aria-label="Dismiss sign-in notice" onclick={()=>persistenceNotice=''}>×</button></div>
 {:else if isLive&&syncStatus==='offline'}<div role="status"><span>Sync paused after an error. Automatic retry is enabled.</span></div>
 {:else}<div><span class="status-indicator"></span><span>{authBusy?authPhase:isLive?'Microsoft 365 connected · background sync active':'TAUT · not connected to Microsoft 365'}</span></div>{/if}
</footer>
</div>
{#if lightbox}<div class="image-lightbox" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget)lightbox=null}}><div class="image-lightbox-toolbar"><span>{lightbox.name}</span><button aria-label="Zoom out" title="Zoom out" onclick={()=>imageZoom=Math.max(0.5,imageZoom-0.25)}>−</button><button aria-label="Fit image" title="Fit to window" onclick={()=>imageZoom=1}>Fit</button><button aria-label="Zoom in" title="Zoom in" onclick={()=>imageZoom=Math.min(4,imageZoom+0.25)}>+</button><button aria-label="Close viewer" title="Close (Esc)" onclick={()=>lightbox=null}>×</button></div><div class="image-lightbox-body"><img src={lightbox.src} alt={lightbox.name} style={`transform:scale(${imageZoom})`}/></div></div>{/if}
{#if paletteOpen}<div class="overlay" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget)paletteOpen=false}}><div class="palette" role="dialog" aria-label="Command Palette" aria-modal="true"><div class="palette-search"><Command size={19}/><input bind:this={paletteInput} bind:value={commandSearch} placeholder="Type a command…" aria-label="Search commands" onkeydown={(e)=>{if(e.key==='Enter'&&matchingCommands[0])execCommand(matchingCommands[0].run)}}/><button onclick={()=>paletteOpen=false} aria-label="Close"><X size={17}/></button></div><div class="palette-list">{#each matchingCommands as command}<button onclick={()=>execCommand(command.run)}><span>{command.label}</span><small>{command.hint}</small></button>{/each}{#if matchingCommands.length===0}<div class="empty">No matching commands</div>{/if}</div><div class="palette-foot">ENTER to run first result <span>ESC to close</span></div></div></div>{/if}
{#if newChatOpen}<div class="overlay" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget&&!newChatBusy)newChatOpen=false}}><div class="settings-dialog new-chat-dialog" role="dialog" aria-modal="true" aria-label="New conversation"><div class="dialog-top"><div><span class="eyebrow">TAUT / MESSAGING</span><h2>New conversation</h2></div><button aria-label="Close" disabled={newChatBusy} onclick={()=>newChatOpen=false}><X size={18}/></button></div><p>Search coworkers by name, username, or email. Selecting someone opens an existing chat or a local draft. A new Teams conversation is created only when you press Send with a message.</p><label class="group-toggle"><input type="checkbox" bind:checked={newGroupMode} onchange={()=>{newGroupUsers=[];newChatEmail='';newChatRecipientId='';directoryResults=[];newChatError=''}}/> Group conversation</label>
{#if newGroupMode}<label for="group-topic">Group name (optional)</label><input class="group-topic" id="group-topic" bind:value={newGroupTopic} maxlength="250" placeholder="Name this group…"/><div class="selected-group-users" aria-label="Selected coworkers">{#each newGroupUsers as person (person.id)}<button type="button" aria-label={`Remove selected ${person.displayName||person.id}`} onclick={()=>newGroupUsers=newGroupUsers.filter(u=>u.id!==person.id)}>{person.displayName||person.mail} ×</button>{/each}</div><p class="new-chat-hint">Choose 2–19 coworkers. No group is created until first Send.</p>{/if}
<form onsubmit={(e)=>{e.preventDefault();openConversation()}}><label for="new-chat-email">Find a coworker</label><input id="new-chat-email" type="text" required={!newGroupMode} autocomplete="off" placeholder="Start typing a name…" value={newChatEmail} oninput={(e)=>onRecipientQuery(e.currentTarget.value)} disabled={!isLive||newChatBusy}/>
{#if directoryBusy}<p class="new-chat-hint">Searching Microsoft 365…</p>{/if}
{#if directoryError}<p class="new-chat-error" role="status">{directoryError} — you can still enter a full email address.</p>{/if}
{#if directoryResults.length>0 && !newChatRecipientId}<div class="directory-results" role="listbox" aria-label="Matching coworkers">{#each directoryResults as user (user.id)}<button type="button" role="option" aria-selected="false" onclick={()=>chooseCoworker(user)}><strong>{user.displayName||user.userPrincipalName||'Coworker'}</strong><small>{user.mail||user.userPrincipalName||''}</small></button>{/each}</div>{/if}
{#if newChatRecipientId}<p class="new-chat-hint">Coworker selected ✓</p>{/if}
{#if newChatError}<p class="new-chat-error" role="alert">{newChatError}</p>{/if}<div class="new-chat-actions"><button type="button" onclick={()=>newChatOpen=false} disabled={newChatBusy}>Cancel</button><button type="submit" class="new-chat-primary" disabled={!isLive||newChatBusy||(newGroupMode?newGroupUsers.length<2:!newChatEmail.trim())}>{newChatBusy?'Opening…':'Open draft'}</button></div></form>{#if !isLive}<p>Sign in to Microsoft 365 first.</p>{/if}<small>Selecting a coworker does not create a Teams conversation or notify them. Full email address entry still works as fallback.</small></div></div>{/if}
{#if settingsOpen}<div class="overlay" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget)settingsOpen=false}}><div class="settings-dialog" role="dialog" aria-modal="true" aria-label="TAUT preferences"><div class="dialog-top"><div><span class="eyebrow">TAUT PREFERENCES</span><h2>Make it yours.</h2></div><button onclick={()=>settingsOpen=false} aria-label="Close settings"><X size={18}/></button></div><div class="setting-row"><div><strong>Accent</strong><p>Subtle highlights, not an entire screen of purple.</p></div><div class="swatches">{#each ['amber','teal','violet'] as value}<button class:chosen={accent===value} style={`--swatch:${value==='amber'?'#efbb70':value==='teal'?'#63d4c1':'#b3a0ff'}`} aria-label={`${value} accent`} title={value} onclick={()=>accent=value as typeof accent}></button>{/each}</div></div><div class="setting-row"><div><strong>Compact conversations</strong><p>Reduce vertical spacing and fit more on screen.</p></div><input type="checkbox" bind:checked={dense}/></div><div class="setting-row"><div><strong>Details panel</strong><p>Show information alongside the conversation.</p></div><input type="checkbox" bind:checked={detailsOpen}/></div><div class="setting-row"><div><strong>Message notifications</strong><p>Alert for new messages while TAUT is running. Reactions and system activity stay quiet.</p><p>macOS Notifications and Focus settings control banner delivery. Development builds may appear as Terminal.</p></div><input type="checkbox" aria-label="Message notifications" checked={notificationSettings.enabled} disabled={notificationBusy} onchange={event=>configureNotifications(event.currentTarget.checked,notificationSettings.showNames)}/></div>
{#if notificationSettings.enabled}<div class="setting-row"><div><strong>Include conversation names</strong><p>Otherwise banners say only that a new message arrived. Message text is never included.</p></div><input type="checkbox" aria-label="Include conversation names" checked={notificationSettings.showNames} disabled={notificationBusy} onchange={event=>configureNotifications(notificationSettings.enabled,event.currentTarget.checked)}/></div><button type="button" class="outline-button" disabled={notificationBusy} onclick={testNotification}>Send test notification</button>{/if}
{#if notificationError||notificationSettings.error}<p class="notification-error" role="alert">{notificationError||notificationSettings.error}</p>{/if}{#if notificationHint}<p class="notification-hint" role="status">{notificationHint}</p>{/if}
<div class="setting-row"><div><strong>Microsoft 365 connection</strong><p>{isLive?`Connected as ${signedInName}. Messages can be sent after confirmation by Graph.`:"Not connected. Sign in to load real chats."}</p></div>{#if isLive}<span class="session-storage-status">{sessionSaved?"Sign-in saved in macOS Keychain":"Temporary sign-in"}</span><button disabled={authBusy} onclick={signOut}>Sign out</button>{:else}<button disabled={authBusy} onclick={restoreSavedSession}>Retry saved sign-in</button><button disabled={authBusy} onclick={signOut}>Clear saved sign-in</button><button disabled={authBusy} onclick={signIn}>{authBusy?authPhase:"Sign in"}</button>{/if}</div><div class="settings-bottom"><span>TAUT Alpha · Svelte + Tauri</span><button onclick={()=>settingsOpen=false}>Done</button></div></div></div>{/if}

{#if changeTarget}<DeletionDialog target={changeTarget} busy={operationBusy} uncertain={changeUncertain} error={changeError} onConfirm={confirmChange} onCheck={checkChangeStatus} onClose={()=>{if(!operationBusy)changeTarget=null}}/>{/if}

{#if emojiTarget}<EmojiPicker mode={emojiTarget.mode} busy={operationBusy} error={reactionError} uncertain={reactionUncertain} onChoose={chooseEmoji} onClose={closeEmojiPicker} onCheck={checkReactionStatus}/>{/if}
