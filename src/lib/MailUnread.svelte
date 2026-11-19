<script lang="ts">
 import {onMount,onDestroy,untrack} from 'svelte';
 import {invoke} from '@tauri-apps/api/core';
 let {ownId,refreshKey=0,onChecked=()=>{},onStatus=()=>{}}:{ownId:string;refreshKey?:number;onChecked?:()=>void;onStatus?:(count:number|null,stale:boolean)=>void}=$props();
 let count=$state<number|null>(null),stale=$state(false),allowed=$state<boolean|null>(null);
 let alive=true,busy=false,queued=false,failures=0,lastAttempt=0,timer:ReturnType<typeof setTimeout>|undefined;
 const title=$derived(count===null?'Inbox unread count unavailable.':`${count} unread Inbox items${stale?' · last checked count; may be out of date':''}. Inbox only, including invitations; other folders and subfolders are excluded.`);
 function publish(){onStatus(count,stale);}
 function schedule(){clearTimeout(timer);if(alive&&!document.hidden&&navigator.onLine)timer=setTimeout(()=>void check(),Math.min(60000*2**Math.min(failures,3),300000));}
 async function check(){
  if(!alive)return;
  if(document.hidden||!navigator.onLine){stale=true;publish();return;}
  if(busy){queued=true;return;}
  busy=true;queued=false;lastAttempt=Date.now();clearTimeout(timer);const revision=refreshKey;
  try{
   const permitted=await invoke<boolean>('mail_permission');if(!alive)return;allowed=permitted;
   if(!permitted){count=null;stale=false;failures=0;publish();return;}
   const result=await invoke<{count:number}>('mail_unread',{ownId});
   if(!alive||revision!==refreshKey)return;
   if(!Number.isSafeInteger(result.count)||result.count<0)throw Error('Invalid Inbox count');
   count=result.count;stale=document.hidden||!navigator.onLine;failures=0;publish();onChecked();
  }catch{if(alive&&revision===refreshKey){stale=true;failures++;publish();}}
  finally{busy=false;if(alive){if(queued){queued=false;void check();}else schedule();}}
 }
 $effect(()=>{refreshKey;untrack(()=>{void check();});});
 function resume(){if(!document.hidden&&navigator.onLine&&Date.now()-lastAttempt>=15000)void check();}
 function visibility(){if(document.hidden){clearTimeout(timer);stale=true;publish();}else void check();}
 function online(){void check();}
 function offline(){clearTimeout(timer);stale=true;publish();}
 onMount(()=>{window.addEventListener('focus',resume);window.addEventListener('online',online);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',visibility);return()=>{window.removeEventListener('focus',resume);window.removeEventListener('online',online);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',visibility);};});
 onDestroy(()=>{alive=false;clearTimeout(timer);onStatus(null,false);});
</script>
{#if allowed!==false&&(count!==null&&count>0||stale&&allowed===true)}<span class="unread-total mail-unread" class:stale aria-label={title} {title}>{count!==null&&count>0?(count>99?'99+':count):'?'}</span>{/if}
<style>.mail-unread.stale{border-style:dashed;background:var(--surface-raised);color:var(--text-secondary)}</style>
