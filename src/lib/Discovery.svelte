<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 import {invoke} from '@tauri-apps/api/core';
 import {Search,X} from 'lucide-svelte';
 import {searchLoadedChats} from './discovery';
 import {mailConversations,mergeMail,addressLabel,type MailMessage,type MailPage} from './mail';
 import type {Conversation} from './types';
 let {chats,onClose,onChat,onMail}:{chats:Conversation[];onClose:()=>void;onChat:(id:string,messageId:string)=>void;onMail:(message:MailMessage)=>void}=$props();
 let query=$state(''),applied=$state(''),mail=$state<MailMessage[]>([]),next=$state<string|null>(null),busy=$state(false),error=$state('');
 let alive=true,serial=0,input:HTMLInputElement;
 const chatResults=$derived(searchLoadedChats(chats,applied));
 const mailResults=$derived(mailConversations(mail));
 async function search(more=false){const text=more?applied:query.trim();if(!text)return;const version=++serial;busy=true;error='';if(!more){applied=text;mail=[];next=null;}try{
  if(!await invoke<boolean>('mail_permission'))throw new Error('Mail search needs Mail.Read consent and a fresh sign-in. Loaded chat results remain available.');
  if(!alive||version!==serial)return;
  const result=await invoke<MailPage<MailMessage>>('mail_page',{query:{collection:'messages',search:text,next:more?next:null}});
  if(alive&&version===serial){mail=more?mergeMail(mail,result.value):result.value;next=result.next;}
 }catch(e){if(alive&&version===serial)error=String(e);}finally{if(alive&&version===serial)busy=false;}}
 function focusDialog(node:HTMLElement){const previous=document.activeElement as HTMLElement|null;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}if(event.key==='Tab'){const controls=Array.from(node.querySelectorAll<HTMLElement>('input,button:not(:disabled)'));const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};node.addEventListener('keydown',key);return {destroy(){node.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();}};}
 onMount(()=>input?.focus());onDestroy(()=>{alive=false;++serial;});
</script>
<div class="overlay" role="presentation" onclick={e=>{if(e.target===e.currentTarget)onClose();}}>
 <div class="discovery" role="dialog" aria-modal="true" aria-label="Search chats and mail" use:focusDialog>
 <header><div><span class="eyebrow">FIND YOUR SIGNAL</span><h2>Where did they send it?</h2></div><button aria-label="Close unified search" onclick={onClose}><X size={20}/></button></header>
 <form onsubmit={e=>{e.preventDefault();void search();}}><Search size={18}/><input bind:this={input} bind:value={query} maxlength="500" aria-label="Search chats and mail" placeholder="A person, phrase or attachment name…"/><button disabled={!query.trim()} type="submit">Search</button></form>
 <div class="results"><p>Chats: loaded history only, up to 100 matches. Mail: mailbox search. Channels are not included yet. Searching changes no read state.</p>
 {#if applied}<h3>Chats · {chatResults.length}</h3>{#each chatResults as result}<button class="result" onclick={()=>onChat(result.chatId,result.messageId)}><span>CHAT · {result.name}</span><strong>{result.preview||'Open conversation'}</strong></button>{/each}{#if !chatResults.length}<p>No matches in loaded chats. Open older history to include it.</p>{/if}
 <h3>Mail · {mailResults.length} conversations loaded</h3>{#if busy}<p role="status">Searching your mailbox…</p>{/if}{#if error}<p role="alert">{error}</p><button onclick={()=>search(!!mail.length)}>Retry mail search</button>{/if}
 {#each mailResults as result}<button class="result" onclick={()=>onMail(result.latest)}><span>MAIL · {addressLabel(result.latest.from)}</span><strong>{result.latest.subject||'(No subject)'}</strong><small>{result.latest.bodyPreview}</small></button>{/each}
 {#if !busy&&!error&&!mail.length}<p>No matching mail.</p>{/if}{#if next}<button disabled={busy} onclick={()=>search(true)}>Load more mail results</button>{/if}
 {:else}<p>Search once. Choose a result to return to its conversation.</p>{/if}</div>
 </div>
</div>
<style>
.discovery{width:min(860px,calc(100vw - 32px));max-height:85dvh;display:flex;flex-direction:column;background:var(--surface-panel);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:16px;overflow:hidden}.discovery header{display:flex;align-items:center;justify-content:space-between;padding:24px}.discovery h2{margin:8px 0 0}.discovery form{display:flex;gap:12px;align-items:center;margin:0 24px 16px;padding:12px;border:1px solid var(--accent-border);border-radius:9px;background:var(--surface-raised)}input{flex:1;min-width:0;background:transparent;color:inherit;border:0}button{color:var(--accent);padding:8px}.results{overflow:auto;padding:0 24px 24px}.results p{font-size:12px;color:var(--text-secondary);line-height:1.7}.result{display:flex;flex-direction:column;gap:6px;text-align:left;width:100%;padding:14px;margin:8px 0;border:1px solid var(--border);border-radius:8px;background:var(--surface-raised);color:var(--text-primary)}.result:hover{border-color:var(--accent-border)}.result span{font-size:10px;color:var(--accent)}.result strong,.result small{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}.result small{color:var(--text-secondary)}h3{font-size:14px;margin-top:22px}
</style>
