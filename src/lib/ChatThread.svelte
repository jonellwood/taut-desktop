<script lang="ts">
 import {X,Files,Image,MessagesSquare} from 'lucide-svelte';
 import FormattingToolbar from './FormattingToolbar.svelte';
 import {continueList} from './continue-list';
 import MessageBody from './MessageBody.svelte';
 import MessageReactions from './MessageReactions.svelte';
 import type {Message} from './types';
 let {formatted=false,onFormat,replyText,sendError,uncertain,disabled,onText,onSend,onAcknowledge,onRefresh,root,replies,loading,error,chatName,group=false,onClose,onRetry,onOpenFile,onViewImage}:
 {formatted?:boolean;onFormat:(value:boolean)=>void;replyText:string;sendError:string;uncertain:boolean;disabled:boolean;onText:(text:string)=>void;onSend:()=>void;onAcknowledge:()=>void;onRefresh:()=>void;root?:Message|null;replies:Message[];loading:boolean;error:string;chatName:string;group?:boolean;onClose:()=>void;onRetry:()=>void;onOpenFile:(url:string)=>void;onViewImage:(messageId:string,contentId:string)=>void}=$props();
 let replyInput=$state<HTMLTextAreaElement>();
 function author(message:Message){return message.sender==='me'?'You':message.senderName||(group?'Participant unavailable':chatName);}
 function time(message:Message){const value=new Date(message.createdDateTime??'');return Number.isNaN(value.getTime())?message.time:value.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
</script>
<aside class="chat-thread-pane" aria-label="Chat reply thread">
 <header><div><span class="eyebrow">REPLY THREAD</span><h2>{chatName}</h2></div><button type="button" aria-label="Close reply thread" title="Return to conversation details" onclick={onClose}><X size={18}/></button></header>
 <p class="thread-explanation">Quoted replies from loaded chat history. More replies may exist in older history.</p>
 <div class="chat-thread-scroll">
  {#if loading}<p class="chat-thread-status" role="status">Loading the quoted message…</p>{/if}
  {#if error}<div class="chat-thread-error" role="alert">{error}<button type="button" onclick={onRetry}>Retry quoted message</button></div>{/if}
  {#if root}
   <section aria-label="Original quoted message" class="chat-thread-root">
    <div class="thread-message-meta"><strong>{author(root)}</strong><time datetime={root.createdDateTime}>{time(root)}</time></div>
    <div class="thread-body"><MessageBody body={root.body} fallback={root.text} deleted={!!root.deleted}/></div>
    {#if !root.deleted}
     {#each root.attachments??[] as file}<button class="thread-file" onclick={()=>onOpenFile(file.url)}><Files size={15}/>{file.name}</button>{/each}
     {#each root.images??[] as image}<button class="thread-file" onclick={()=>onViewImage(root!.id,image.id)}><Image size={15}/>View original image</button>{/each}
     {#if root.reactions?.length}<MessageReactions groups={root.reactions}/>{/if}
    {/if}
   </section>
  {/if}
  <div class="thread-reply-heading"><MessagesSquare size={14}/>{replies.length} {replies.length===1?'reply':'replies'} in loaded history</div>
  {#each replies as reply (reply.id)}<article class="chat-thread-reply" aria-label={`Reply from ${author(reply)}`}>
   <div class="thread-message-meta"><strong>{author(reply)}</strong><time datetime={reply.createdDateTime}>{time(reply)}</time></div>
   <div class="thread-body"><MessageBody body={reply.body} fallback={reply.text} deleted={!!reply.deleted}/></div>
   {#if !reply.deleted}
    {#each reply.attachments??[] as file}<button class="thread-file" onclick={()=>onOpenFile(file.url)}><Files size={15}/>{file.name}</button>{/each}
    {#each reply.images??[] as image}<button class="thread-file" onclick={()=>onViewImage(reply.id,image.id)}><Image size={15}/>View reply image</button>{/each}
    {#if reply.reactions?.length}<MessageReactions groups={reply.reactions}/>{/if}
   {/if}
  </article>{/each}
  {#if !replies.length&&!loading}<p class="chat-thread-status">No quoted replies in loaded history.</p>{/if}
 </div>
 <footer>
  <form onsubmit={(event)=>{event.preventDefault();onSend();}}>
   <label for="quoted-reply">Reply with quote</label>
   <FormattingToolbar text={replyText} {formatted} input={replyInput} {disabled} {onText} {onFormat}/>
   <textarea use:continueList={{formatted,onText}} bind:this={replyInput} id="quoted-reply" aria-label="Quoted reply" rows="4" value={replyText} disabled={disabled} oninput={(event)=>onText(event.currentTarget.value)} placeholder="Write a reply…"></textarea>
   {#if sendError}<p role="alert">{sendError}</p>{/if}
   {#if uncertain}<button type="button" disabled={disabled} onclick={onRefresh}>Refresh chat messages</button><button type="button" disabled={disabled} onclick={onAcknowledge}>I checked Teams — enable retry</button>{/if}
   <button type="submit" disabled={disabled||uncertain||!replyText.trim()}>Send quoted reply</button>
  </form>
 </footer>
</aside>
<style>
 .chat-thread-pane{width:360px;flex:none;display:flex;flex-direction:column;min-height:0;border-left:1px solid #394b56;background:#142029}.chat-thread-pane header{display:flex;justify-content:space-between;gap:12px;padding:22px;border-bottom:1px solid #2c3e4b;align-items:center}.chat-thread-pane h2{font-size:18px;margin:8px 0 0;overflow-wrap:anywhere}.chat-thread-pane header button{padding:7px;color:#9eb0bd;border-radius:6px}.chat-thread-pane header button:hover{background:#30414c;color:var(--accent)}.thread-explanation{font-size:11px;color:#8ea5b3;line-height:1.7;margin:0;padding:16px 22px;border-bottom:1px solid #2c3e4b}.chat-thread-scroll{overflow:auto;flex:1;padding:20px 22px;min-height:0}.chat-thread-root{padding:0 0 20px;border-bottom:1px solid #687780}.thread-message-meta{display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:#b8c8d2}.thread-message-meta time{font-size:10px;color:#839eaf}.chat-thread-pane p:not(.thread-explanation):not(.chat-thread-status){white-space:pre-wrap;font-size:13px;line-height:1.8;overflow-wrap:anywhere;color:#d4dfe6}.thread-file{display:flex;gap:8px;align-items:center;text-align:left;color:var(--accent);font-size:11px;padding:9px 0;overflow-wrap:anywhere}.thread-reply-heading{display:flex;gap:8px;align-items:center;margin:22px 0 4px;color:#9fb2bf;font-size:10px}.chat-thread-reply{padding:18px 0;border-bottom:1px solid #2d404b}.chat-thread-status{color:#8ea5b3;font-size:12px;line-height:1.8}.chat-thread-error{color:#ffb5a9;font-size:12px;line-height:1.7;padding-bottom:17px}.chat-thread-error button{display:block;margin-top:10px;border:1px solid #79635b;padding:7px 10px;border-radius:6px}footer{padding:16px;font-size:10px;color:#7f98a8;border-top:1px solid #2c3e4b}
 textarea{display:block;box-sizing:border-box;width:100%;resize:vertical;min-height:90px;background:#0e191f;color:#d4dfe6;border:1px solid #61727c;border-radius:7px;padding:10px;margin:10px 0;font:inherit;font-size:13px}footer button{border:1px solid #79694e;color:var(--accent);border-radius:6px;padding:8px;margin:4px 4px 0 0}footer button:disabled{opacity:.45}footer p{color:#ffb5a9!important}.thread-body{font-size:13px;color:#d4dfe6;line-height:1.8;margin:12px 0;min-width:0} @media(max-width:1000px){.chat-thread-pane{width:min(420px,calc(100vw - 68px));position:absolute;right:0;top:36px;bottom:0;z-index:9;box-shadow:-20px 0 60px #0007}}
</style>
