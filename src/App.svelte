<script lang="ts">
 import { tick, onMount } from 'svelte';
 import { MessageCircle, Bell, Users, Phone, Files, Settings, Search, Command, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Send, SquarePen, Paperclip, Smile, MoreHorizontal, Video, X, Check, ChevronRight, Moon, Sun, LayoutPanelTop, LogOut } from 'lucide-svelte';
 import { existingChat, pendingConversation, submitMessage, isUserMessage } from './lib/pending';
 import { conversations } from './lib/mock';
 import { invoke } from '@tauri-apps/api/core';
 import { openUrl } from '@tauri-apps/plugin-opener';
 import type { Conversation, WorkspaceMode, Attachment, InlineImage } from './lib/types';
 let newChatOpen=$state(false);
 let newChatEmail=$state('');
 let newChatRecipientId=$state('');
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
 let sendBusy=$state(false);
 let refreshBusy=$state(false);
 let syncStatus=$state<'idle'|'syncing'|'offline'|'paused'>('idle');
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
 let sidebarOpen=$state(true);
 let detailsOpen=$state(true);
 let paletteOpen=$state(false);
 let settingsOpen=$state(false);
 let search=$state('');
 let commandSearch=$state('');
 let draft=$state('');
 // Each chat has an independent draft; never carry text into another recipient.
 let drafts=$state<Record<string,string>>({});
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
 let paletteInput = $state<HTMLInputElement | undefined>(undefined);
 let selected=$derived(chats.find(c=>c.id===selectedId)??chats[0]);
 let filtered=$derived(chats.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())));
 const nav=[{id:'chats',icon:MessageCircle,label:'Chats'},{id:'activity',icon:Bell,label:'Activity'},{id:'people',icon:Users,label:'People'},{id:'calls',icon:Phone,label:'Calls'},{id:'files',icon:Files,label:'Files'}] as const;
 const commands=[
 {label:'Go to Chats',hint:'Workspace',run:()=>mode='chats'},
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
 function execCommand(fn:()=>void){fn();paletteOpen=false;}
 function keys(e:KeyboardEvent){
  if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='\\'){e.preventDefault();sidebarOpen=!sidebarOpen;}
  if(e.key==='Escape'){if(lightbox){lightbox=null;imageZoom=1;}else{paletteOpen=false;settingsOpen=false;newChatOpen=false;}}
 }
 function plainText(html:string):string { const el=document.createElement('div');el.innerHTML=html; const text=(el.textContent??'').trim(); if(text)return text; return /<img\b|<attachment\b|<file\b/i.test(html)?'[Image or attachment — preview coming soon]':''; }
 function isUnread(raw:ApiChat):boolean {const latest=Date.parse(raw.lastMessagePreview?.createdDateTime??'');const read=Date.parse(raw.viewpoint?.lastMessageReadDateTime??'');return Number.isFinite(latest)&&Number.isFinite(read)&&latest>read&&raw.lastMessagePreview?.from?.user?.id!==ownId;}
 type ChatMember={userId?:string;displayName?:string;email?:string;userPrincipalName?:string;roles?:string[]};
 type ApiChat={id:string;topic?:string;chatType?:string;lastUpdatedDateTime?:string;lastMessagePreview?:{createdDateTime?:string;from?:{user?:{id?:string}}};viewpoint?:{lastMessageReadDateTime?:string};members?:ChatMember[]};
 function memberLabel(m:ChatMember):string {return m.displayName?.trim()||m.email?.trim()||m.userPrincipalName?.trim()||'';}
 type ApiMessage={messageType?:string;id:string;createdDateTime?:string;from?:{user?:{id?:string;displayName?:string}};body?:{content?:string;contentType?:string};attachments?:{id?:string;name?:string;contentType?:string;contentUrl?:string}[]};
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
   const content=m.body?.content??'';
   if(!content.includes('<'))return [];
   const html=new DOMParser().parseFromString(content,'text/html');
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
   if(imageCache[key]||imageLoading[key])return;
   imageLoading[key]=true;delete imageErrors[key];
   try{imageCache[key]=await invoke<string>('graph_hosted_image',{chatId,messageId,contentId:imageId});}
   catch(e){imageErrors[key]=String(e);}
   finally{imageLoading[key]=false;}
 }
 function convertChat(chat:ApiChat):Conversation {
   const others=(chat.members??[]).filter(m=>m.userId!==ownId);
   const memberNames=others.map(memberLabel).filter((name):name is string=>Boolean(name));
   const title=chat.topic?.trim() || memberNames.join(', ') || chatNames[chat.id] || (chat.chatType==='oneOnOne'?'Unnamed conversation':'Group chat');
   return {id:chat.id,name:title,initials:title.split(/[\s,]+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase(),status:'offline',preview:'Open to load messages',time:chat.lastUpdatedDateTime?new Date(chat.lastUpdatedDateTime).toLocaleDateString():'',unread:isUnread(chat)?1:0,messages:[]};
 }
 // The session owns the polling loop; unmount always clears it.
 onMount(() => {
   let seconds=0;
   const timer=window.setInterval(async () => {
     if (!isLive || document.hidden || authBusy || Date.now()<pollDelayUntil) return;
     seconds+=1;
     if (seconds%5===0 && selectedId && selectedId!=='empty' && !sendBusy) {
       if (!pollingMessages && !refreshBusy) {
         pollingMessages=true;
         try { await loadMessages(selectedId,'poll'); syncStatus='idle'; }
         catch(e) { markSyncError(e); }
         finally {pollingMessages=false;}
       }
     }
     if (seconds%30===0 && !pollingChats) {
       pollingChats=true;
       try { await syncChatList(); } catch(e) { markSyncError(e); }
       finally {pollingChats=false;}
     }
   },1000);
   return () => window.clearInterval(timer);
 });
 function markSyncError(e:unknown) {
   lastSyncError=String(e);
   // Backoff avoids hammering Graph on 429/5xx or network failures.
   pollDelayUntil=Date.now()+ (lastSyncError.includes('429')?60000:15000);
   syncStatus='offline';
 }
 function isAtBottom(el:HTMLElement) { return el.scrollHeight-el.scrollTop-el.clientHeight<110; }
 function trackScroll(){ if(messageViewport)jumpVisible=!isAtBottom(messageViewport); }
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
 function openNewChat(){newChatEmail='';newChatRecipientId='';directoryResults=[];directoryError='';newChatError='';newChatOpen=true;}
 function onRecipientQuery(value:string){
   newChatEmail=value;newChatRecipientId='';directoryResults=[];directoryError='';
   directoryRequest++;const serial=directoryRequest;
   if(directoryTimer)clearTimeout(directoryTimer);
   if(!isLive||value.trim().length<2){directoryBusy=false;return;}
   directoryBusy=true;
   directoryTimer=setTimeout(async()=>{
     try{
       const result=await invoke<{value:DirectoryUser[]}>('graph_search_users',{query:value.trim()});
       if(serial===directoryRequest)directoryResults=(result.value??[]).filter(u=>u.id!==ownId);
     }catch(e){if(serial===directoryRequest)directoryError=String(e);}
     finally{if(serial===directoryRequest)directoryBusy=false;}
   },300);
 }
 function chooseCoworker(user:DirectoryUser){
   directoryRequest++;if(directoryTimer)clearTimeout(directoryTimer);
   newChatRecipientId=user.id;
   newChatEmail=user.displayName||user.mail||user.userPrincipalName||user.id;
   directoryResults=[];directoryBusy=false;directoryError='';
 }

 function openConversation(){
   if(!isLive || newChatBusy)return;
   newChatError='';
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

 async function signIn(){
   authBusy=true;authError='';
   try {
     await invoke('sign_in');
     const me=await invoke<{id:string;displayName:string}>('graph_profile'); ownId=me.id;signedInName=me.displayName;
     const result=await invoke<{value:ApiChat[]}>('graph_chats');
     knownChats=result.value??[];
     chats=knownChats.map(convertChat); if(!chats.length) chats=[{id:'empty',name:'No conversations found',initials:'—',status:'offline',preview:'Graph returned no chats',time:'',unread:0,messages:[]}];
     selectedId=chats[0]?.id??'';draft=drafts[selectedId]??''; isLive=true;syncStatus='idle';forceBottomForChat=selectedId;
     if(selectedId && selectedId!=='empty') await loadMessages(selectedId,'open');
     void resolveUnnamedChats();
   }catch(e){authError=String(e).replace(/access_token|refresh_token/ig,'[redacted]');}
   finally {authBusy=false;}
 }
 async function signOut(){
   if(sendBusy)return;
   knownChats=[];drafts={};isLive=false;openChatSerial++;await invoke('sign_out');sendError='';chats=structuredClone(conversations);
   selectedId='hannah';draft=drafts.hannah??'';signedInName='';ownId='';authError='';syncStatus='idle';
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
   const result=await invoke<{value:ApiChat[]}>('graph_chats');
   if(!isLive)return;
   knownChats=result.value??[];
   const byId=new Map(chats.map(c=>[c.id,c]));
   const ordered=(result.value??[]).map(raw=>{
     const incoming=convertChat(raw);
     const old=byId.get(raw.id);
     return old?{...incoming,messages:old.messages,preview:old.messages.length?old.preview:incoming.preview,favorite:old.favorite,unread:(raw.lastMessagePreview?.createdDateTime && raw.viewpoint?.lastMessageReadDateTime)?incoming.unread:old.unread}:incoming;
   });
   const retained=chats.filter(c=>c.id!=='empty' && !ordered.some(o=>o.id===c.id));
   if(ordered.length||retained.length){chats=[...retained,...ordered];void resolveUnnamedChats();}
 }
 async function loadMessages(chatId:string,reason:'open'|'poll'|'manual'|'sent'='manual'){
   if(chatId.startsWith('pending:') || messageInFlight.has(chatId))return;
   messageInFlight.add(chatId);
   const serial=openChatSerial;
   const viewport=messageViewport;
   const atBottom=viewport?isAtBottom(viewport):true;
   const oldScrollHeight=viewport?.scrollHeight??0;
   const oldScrollTop=viewport?.scrollTop??0;
   try {
     const data=await invoke<{value:ApiMessage[]}>('graph_messages',{chatId});
     if(!isLive || !chats.some(c=>c.id===chatId))return;
     const chat=chats.find(c=>c.id===chatId);if(!chat)return;
     const previousIDs=new Set(chat.messages.map(m=>m.id));
     const ordered=(data.value??[]).filter(isUserMessage).slice().sort((a,b)=>{
       const ta=Date.parse(a.createdDateTime??'');const tb=Date.parse(b.createdDateTime??'');
       return (Number.isFinite(ta)?ta:0)-(Number.isFinite(tb)?tb:0) || a.id.localeCompare(b.id);
     });
     const mapped=ordered.map(m=>({id:m.id,attachments:extractAttachments(m),images:extractImages(m),sender:m.from?.user?.id===ownId?'me' as const:'them' as const,text:plainText(m.body?.content??''),createdDateTime:m.createdDateTime??'',time:m.createdDateTime?new Date(m.createdDateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):''}));
     const changed=mapped.length!==chat.messages.length || mapped.some((m,i)=>m.id!==chat.messages[i]?.id || m.text!==chat.messages[i]?.text || JSON.stringify(m.attachments)!==JSON.stringify(chat.messages[i]?.attachments) || JSON.stringify(m.images)!==JSON.stringify(chat.messages[i]?.images));
     if(!changed)return;
     const newlyReceived=mapped.some(m=>m.sender==='them'&&!previousIDs.has(m.id));
     chat.messages=mapped;
     chat.preview=mapped.at(-1)?.text??'No messages';
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
   }catch(e){
     if(reason==='poll')throw e;
     authError=`Unable to load messages: ${String(e)}`;
   }finally{messageInFlight.delete(chatId);}
 }
 function selectChat(id:string){
   drafts[selectedId]=draft;
   draft=drafts[id]??'';
   sendError='';selectedId=id;mode='chats';openChatSerial++;jumpVisible=false;
   forceBottomForChat=id;
   const c=chats.find(c=>c.id===id);if(c)c.unread=0;
   if(isLive && id!=='empty'){
     void (async()=>{await loadMessages(id,'open');await bottomIfCurrent(id,openChatSerial);})();
   }else{void bottomIfCurrent(id,openChatSerial);}
 }
 async function refreshMessages(){
   if(!isLive || !selectedId || selectedId==='empty' || refreshBusy)return;
   const id=selectedId;refreshBusy=true;authError='';
   try {await loadMessages(id,'manual');}catch(e){authError=String(e);}finally{refreshBusy=false;}
 }
 async function send(){
   const text=draft.trim();
   if(!text || mode!=='chats' || sendBusy || !selected || selected.id==='empty')return;
   if(!isLive){
     selected.messages.push({id:crypto.randomUUID(),sender:'me',text,time:new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})});
     selected.preview=text;selected.time='Now';draft='';drafts[selected.id]='';await tick();await jumpToLatest();return;
   }
   const originalId=selected.id;
   const recipient=originalId.startsWith('pending:')?originalId.slice(8):undefined;
   const reusable=recipient?existingChat(knownChats,recipient,ownId):undefined;
   let chatId=reusable?.id??originalId;const draftAtSubmit=draft;sendBusy=true;sendError='';
   try {
     const retainChat=(id:string)=>{
       chatId=id;
       if(recipient && !knownChats.some(c=>c.id===id))knownChats=[{id,chatType:'oneOnOne',members:[{userId:ownId},{userId:recipient}]} ,...knownChats];
       const pending=chats.find(c=>c.id===originalId);
       if(pending && !chats.some(c=>c.id===id))chats=[{...pending,id,preview:'Conversation created · message not yet confirmed'},...chats];
       chats=chats.filter(c=>c.id!==originalId);
       drafts[id]=drafts[originalId]??draftAtSubmit;delete drafts[originalId];
       if(selectedId===originalId){selectedId=id;openChatSerial++;}
     };
     if(reusable)retainChat(reusable.id);
     chatId=await submitMessage(invoke,chatId,reusable?undefined:recipient,ownId,text,retainChat);
     // Clear only the submitted draft; never erase another conversation's input.
     if(drafts[chatId]===draftAtSubmit)drafts[chatId]='';
     if(selectedId===chatId && draft===draftAtSubmit)draft='';forceBottomForChat=chatId;
     // A poll may already be in progress; it will contain the sent message or the next poll will.
     if(!messageInFlight.has(chatId))await loadMessages(chatId,'sent');
     else await jumpToLatest();
   }catch(e){sendError=String(e);}
   finally{sendBusy=false;}
 }
 function startDrag(e:PointerEvent){dragStart=true;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}
 function moveDrag(e:PointerEvent){if(dragStart)sidebarWidth=Math.min(490,Math.max(220,e.clientX-68));}
 function endDrag(){dragStart=false;}
</script>
<svelte:window onkeydown={keys}/>
{#if authError}<div class="auth-error" role="alert">{authError}<button onclick={()=>authError=""} aria-label="Dismiss error">×</button></div>{/if}
<div class="app" class:dense style={`--accent:${accent==='amber'?'#efbb70':accent==='teal'?'#63d4c1':'#b3a0ff'};--sidebar-width:${sidebarWidth}px`}>
 <aside class="rail" aria-label="TAUT navigation">
  <img class="brand" src="/icon.png" alt="TAUT"/>
  <div class="rail-buttons">
   {#each nav as item}
    <button class:active={mode===item.id} class="rail-button" title={item.label} aria-label={item.label} onclick={()=>mode=item.id}><item.icon size={20} strokeWidth={1.8}/></button>
   {/each}
  </div>
  <div class="rail-bottom">
   <button class="rail-button" title="Command Palette (⌘⇧K)" aria-label="Command Palette" onclick={openPalette}><Command size={20}/></button>
   <button class="rail-button" title="Settings" aria-label="Settings" onclick={()=>settingsOpen=true}><Settings size={20}/></button>
   <div class="my-avatar" title={signedInName||"Demo profile"}>{signedInName? signedInName[0]:"J"}</div>
  </div>
 </aside>
 {#if sidebarOpen}
 <aside class="sidebar" aria-label="Conversations">
  <div class="sidebar-head"><div><div class="eyebrow">WORKSPACE</div><h1>{mode==='chats'?'Messages':nav.find(n=>n.id===mode)?.label}</h1></div><div class="sidebar-head-actions">{#if mode==='chats'}<button class="small-button" title="New conversation" aria-label="New conversation" onclick={openNewChat}><SquarePen size={18}/></button>{/if}<button class="small-button" aria-label="Collapse sidebar" title="Collapse sidebar" onclick={()=>sidebarOpen=false}><PanelLeftClose size={18}/></button></div></div>
  {#if mode==='chats'}
   <label class="search-field"><Search size={17}/><input bind:value={search} placeholder="Search conversations" aria-label="Search conversations"/><kbd>⌘ K</kbd></label>
   <div class="list-scroll"><div class="list-label">PINNED <span>{filtered.filter(c=>c.favorite).length}</span></div>
   {#each filtered.filter(c=>c.favorite) as c}<button class:selected={c.id===selectedId} class="chat-row" onclick={()=>selectChat(c.id)}><span class="avatar">{c.initials}<i class:away={c.status==='away'} class:offline={c.status==='offline'}></i></span><span class="chat-copy"><strong>{c.name}</strong><small>{c.preview}</small></span><span class="chat-meta"><small>{c.time}</small>{#if c.unread}<em>{c.unread}</em>{/if}</span></button>{/each}
   <div class="list-label recent">RECENT <span>{filtered.filter(c=>!c.favorite).length}</span></div>
   {#each filtered.filter(c=>!c.favorite) as c}<button class:selected={c.id===selectedId} class="chat-row" onclick={()=>selectChat(c.id)}><span class="avatar">{c.initials}<i class:away={c.status==='away'} class:offline={c.status==='offline'}></i></span><span class="chat-copy"><strong>{c.name}</strong><small>{c.preview}</small></span><span class="chat-meta"><small>{c.time}</small>{#if c.unread}<em>{c.unread}</em>{/if}</span></button>{/each}
   {#if filtered.length===0}<div class="empty">No matching conversations</div>{/if}</div>
  {:else}<div class="sidebar-note"><span class="note-icon"><LayoutPanelTop size={19}/></span><strong>{nav.find(n=>n.id===mode)?.label}</strong><p>This section is a UI placeholder. Microsoft Graph integration comes next.</p><button class="text-action" onclick={()=>mode='chats'}>Back to Chats <ChevronRight size={14}/></button></div>{/if}
  <div class="sidebar-foot"><span class="live-dot"></span>{isLive?'MICROSOFT 365 · CONNECTED':'MOCK DATA'} <span class="spacer"></span>{#if isLive}<button class="auth-action" onclick={signOut}>Sign out</button>{:else}<button class="auth-action" disabled={authBusy} onclick={signIn}>{authBusy?'Signing in…':'Sign in'}</button>{/if}</div>
 </aside><div class="resize-handle" role="separator" aria-label="Resize conversation panel" aria-orientation="vertical" tabindex="0" onpointerdown={startDrag} onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={endDrag} onkeydown={(e)=>{if(e.key==='ArrowRight')sidebarWidth=Math.min(490,sidebarWidth+20);if(e.key==='ArrowLeft')sidebarWidth=Math.max(220,sidebarWidth-20)}}></div>
 {/if}
 <main class="main">
  {#if mode==='chats'}
   <header class="conversation-header"><div class="header-person">{#if !sidebarOpen}<button class="small-button" title="Expand sidebar" aria-label="Expand sidebar" onclick={()=>sidebarOpen=true}><PanelLeftOpen size={19}/></button>{/if}<span class="avatar header-avatar">{selected.initials}<i class:away={selected.status==='away'} class:offline={selected.status==='offline'}></i></span><div><strong>{selected.name}</strong><small>{selected.status==='online'?'Available':selected.status==='away'?'Away':'Offline'}</small></div></div><div class="header-actions"><button title="Calls require integration" aria-label="Call (not yet implemented)" disabled><Phone size={18}/></button><button title="Meetings require integration" aria-label="Video (not yet implemented)" disabled><Video size={18}/></button><div class="vert-divider"></div><button class:chosen={detailsOpen} title="Details panel" aria-label="Toggle details panel" onclick={()=>detailsOpen=!detailsOpen}>{#if detailsOpen}<PanelRightClose size={19}/>{:else}<PanelRightOpen size={19}/>{/if}</button>{#if isLive}<button title="Refresh messages" aria-label="Refresh messages" disabled={refreshBusy} onclick={refreshMessages}><span class="refresh-symbol" class:spinning={refreshBusy}>↻</span></button>{/if}<button title="Command Palette" aria-label="Commands" onclick={openPalette}><MoreHorizontal size={19}/></button></div></header>
   <section class="messages" bind:this={messageViewport} onscroll={trackScroll} aria-label="Chat messages">{#each selected.messages as m,i (m.id)}
    {#if i===0 || (m.createdDateTime && dateKey(m.createdDateTime)!==dateKey(selected.messages[i-1].createdDateTime??''))}
      <div class="day-marker"><span>{m.createdDateTime?dayLabel(m.createdDateTime):'History'}</span></div>
    {/if}<div class:mine={m.sender==='me'} class="message-line"><div class="message-stack">{#if m.sender==='them'}<span class="sender-name">{selected.name}</span>{/if}<div class="bubble">
      {#if m.text && !(m.images?.length || m.attachments?.length) || (m.text && !m.text.startsWith('[Image or attachment'))}<div>{m.text}</div>{/if}
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
     </div><div class="message-foot"><span>{m.time}</span>{#if m.reactions}<span class="reaction">{m.reactions.join(' ')}</span>{/if}{#if m.sender==='me'}<Check size={12}/>{/if}</div></div></div>{/each}<div bind:this={listEnd}></div></section>
   {#if jumpVisible && mode==='chats'}<button class="jump-latest" onclick={jumpToLatest}>↓ Snap to Now</button>{/if}
   {#if isLive && syncStatus==='offline'}<div class="sync-warning" role="status">Sync paused after an error. Automatic retry is enabled.</div>{/if}
   {#if fileOpenError}<div class="send-error" role="alert">{fileOpenError}<button type="button" onclick={()=>fileOpenError=''} aria-label="Dismiss file error">×</button></div>{/if}
   {#if sendError}<div class="send-error" role="alert">{sendError}<button type="button" onclick={()=>sendError=''} aria-label="Dismiss send error">×</button></div>{/if}
   {#if selected.id.startsWith('pending:')}<div class="sync-warning" role="status">Local draft. Pressing Send will create the Teams conversation and send your first message.</div>{/if}
   <form class="composer" onsubmit={(e)=>{e.preventDefault();send()}}><button type="button" title="Attachments coming later" aria-label="Attachments unavailable" disabled><Paperclip size={19}/></button><input value={draft} oninput={(e)=>{draft=e.currentTarget.value;drafts[selectedId]=draft}} placeholder={isLive?`Message ${selected.name}…`:`Demo message ${selected.name}…`} disabled={sendBusy || selected.id==='empty'} aria-label="Message"/><button type="button" title="Reactions coming later" aria-label="Emoji unavailable" disabled><Smile size={19}/></button><button type="submit" class="send" disabled={sendBusy||!draft.trim()||selected.id==='empty'} aria-label="Send message"><Send size={18}/></button></form>
  {:else}<div class="section-placeholder">{#if !sidebarOpen}<button class="small-button left-restore" onclick={()=>sidebarOpen=true}><PanelLeftOpen size={18}/></button>{/if}<LayoutPanelTop size={36}/><h2>{nav.find(n=>n.id===mode)?.label}</h2><p>TAUT owns this workspace. Connecting Microsoft 365 data is the next phase.</p><button class="outline-button" onclick={()=>mode='chats'}>Return to messages</button></div>{/if}
 </main>
 {#if detailsOpen&&mode==='chats'}<aside class="details" aria-label="Conversation details"><div class="details-title"><strong>Conversation</strong><button aria-label="Close details" title="Close details" onclick={()=>detailsOpen=false}><X size={17}/></button></div><div class="profile"><span class="avatar big-avatar">{selected.initials}</span><h3>{selected.name}</h3><span class="status"><span class="live-dot"></span>{selected.status}</span></div><div class="detail-section"><div class="detail-heading">SHARED MEDIA <span>0</span></div><div class="tile-row"><div class="media-tile"></div><div class="media-tile"></div><div class="media-tile"></div></div><p>Files and images will appear here after Graph integration.</p></div><div class="detail-section"><div class="detail-heading">WORKSPACE</div>{#if isLive && legacyDiagnostics[selected.id]}<p title="Names are returned only where Graph exposes them">{legacyDiagnostics[selected.id]}</p>{/if}<button class="detail-action" onclick={()=>detailsOpen=false}><PanelRightClose size={16}/> Hide details <ChevronRight size={14}/></button></div><div class="details-bottom">{isLive?"MICROSOFT 365 · CONNECTED":"PRIVATE PREVIEW · MOCK DATA"}</div></aside>{/if}
</div>
{#if lightbox}<div class="image-lightbox" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget)lightbox=null}}><div class="image-lightbox-toolbar"><span>Shared image</span><button aria-label="Zoom out" title="Zoom out" onclick={()=>imageZoom=Math.max(0.5,imageZoom-0.25)}>−</button><button aria-label="Fit image" title="Fit to window" onclick={()=>imageZoom=1}>Fit</button><button aria-label="Zoom in" title="Zoom in" onclick={()=>imageZoom=Math.min(4,imageZoom+0.25)}>+</button><button aria-label="Close viewer" title="Close (Esc)" onclick={()=>lightbox=null}>×</button></div><div class="image-lightbox-body"><img src={lightbox.src} alt={lightbox.name} style={`transform:scale(${imageZoom})`}/></div></div>{/if}
{#if paletteOpen}<div class="overlay" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget)paletteOpen=false}}><div class="palette" role="dialog" aria-label="Command Palette" aria-modal="true"><div class="palette-search"><Command size={19}/><input bind:this={paletteInput} bind:value={commandSearch} placeholder="Type a command…" aria-label="Search commands" onkeydown={(e)=>{if(e.key==='Enter'&&matchingCommands[0])execCommand(matchingCommands[0].run)}}/><button onclick={()=>paletteOpen=false} aria-label="Close"><X size={17}/></button></div><div class="palette-list">{#each matchingCommands as command}<button onclick={()=>execCommand(command.run)}><span>{command.label}</span><small>{command.hint}</small></button>{/each}{#if matchingCommands.length===0}<div class="empty">No matching commands</div>{/if}</div><div class="palette-foot">ENTER to run first result <span>ESC to close</span></div></div></div>{/if}
{#if newChatOpen}<div class="overlay" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget&&!newChatBusy)newChatOpen=false}}><div class="settings-dialog new-chat-dialog" role="dialog" aria-modal="true" aria-label="New conversation"><div class="dialog-top"><div><span class="eyebrow">TAUT / MESSAGING</span><h2>New conversation</h2></div><button aria-label="Close" disabled={newChatBusy} onclick={()=>newChatOpen=false}><X size={18}/></button></div><p>Search coworkers by name, username, or email. Selecting someone opens an existing chat or a local draft. A new Teams conversation is created only when you press Send with a message.</p><form onsubmit={(e)=>{e.preventDefault();openConversation()}}><label for="new-chat-email">Find a coworker</label><input id="new-chat-email" type="text" required autocomplete="off" placeholder="Start typing a name…" value={newChatEmail} oninput={(e)=>onRecipientQuery(e.currentTarget.value)} disabled={!isLive||newChatBusy}/>
{#if directoryBusy}<p class="new-chat-hint">Searching Microsoft 365…</p>{/if}
{#if directoryError}<p class="new-chat-error" role="status">{directoryError} — you can still enter a full email address.</p>{/if}
{#if directoryResults.length>0 && !newChatRecipientId}<div class="directory-results" role="listbox" aria-label="Matching coworkers">{#each directoryResults as user (user.id)}<button type="button" role="option" aria-selected="false" onclick={()=>chooseCoworker(user)}><strong>{user.displayName||user.userPrincipalName||'Coworker'}</strong><small>{user.mail||user.userPrincipalName||''}</small></button>{/each}</div>{/if}
{#if newChatRecipientId}<p class="new-chat-hint">Coworker selected ✓</p>{/if}
{#if newChatError}<p class="new-chat-error" role="alert">{newChatError}</p>{/if}<div class="new-chat-actions"><button type="button" onclick={()=>newChatOpen=false} disabled={newChatBusy}>Cancel</button><button type="submit" class="new-chat-primary" disabled={!isLive||newChatBusy||!newChatEmail.trim()}>{newChatBusy?'Opening…':'Open draft'}</button></div></form>{#if !isLive}<p>Sign in to Microsoft 365 first.</p>{/if}<small>Selecting a coworker does not create a Teams conversation or notify them. Full email address entry still works as fallback.</small></div></div>{/if}
{#if settingsOpen}<div class="overlay" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget)settingsOpen=false}}><div class="settings-dialog" role="dialog" aria-modal="true" aria-label="TAUT preferences"><div class="dialog-top"><div><span class="eyebrow">TAUT PREFERENCES</span><h2>Make it yours.</h2></div><button onclick={()=>settingsOpen=false} aria-label="Close settings"><X size={18}/></button></div><div class="setting-row"><div><strong>Accent</strong><p>Subtle highlights, not an entire screen of purple.</p></div><div class="swatches">{#each ['amber','teal','violet'] as value}<button class:chosen={accent===value} style={`--swatch:${value==='amber'?'#efbb70':value==='teal'?'#63d4c1':'#b3a0ff'}`} aria-label={`${value} accent`} title={value} onclick={()=>accent=value as typeof accent}></button>{/each}</div></div><div class="setting-row"><div><strong>Compact conversations</strong><p>Reduce vertical spacing and fit more on screen.</p></div><input type="checkbox" bind:checked={dense}/></div><div class="setting-row"><div><strong>Details panel</strong><p>Show information alongside the conversation.</p></div><input type="checkbox" bind:checked={detailsOpen}/></div><div class="setting-row"><div><strong>Microsoft 365 connection</strong><p>{isLive?`Connected as ${signedInName}. Messages can be sent after confirmation by Graph.`:"Not connected. Sign in to load real chats."}</p></div>{#if isLive}<button onclick={signOut}>Sign out</button>{:else}<button disabled={authBusy} onclick={signIn}>{authBusy?"Signing in…":"Sign in"}</button>{/if}</div><div class="settings-bottom"><span>TAUT Alpha · Svelte + Tauri</span><button onclick={()=>settingsOpen=false}>Done</button></div></div></div>{/if}
