<script lang="ts">
 type Target={kind:'delete'|'restore'|'hide'|'unhide';chatId:string;messageId?:string;name:string;preview?:string};
 let {target,busy,uncertain,error,onConfirm,onCheck,onClose}:{target:Target;busy:boolean;uncertain:boolean;error:string;onConfirm:()=>void;onCheck:()=>void;onClose:()=>void}=$props();
 let title=$derived(target.kind==='delete'?'Delete message':target.kind==='restore'?'Restore message':target.kind==='hide'?'Hide conversation for me':'Unhide conversation');
 function focusDialog(node:HTMLDivElement){
  const previous=document.activeElement as HTMLElement|null;
  node.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
  return {destroy:()=>{if(previous?.isConnected)previous.focus();}};
 }
 function keys(event:KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy)onClose();}
  if(event.key==='Tab'){
   const buttons=Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
   const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
   if(!buttons.length){event.preventDefault();return;}
   if(event.shiftKey&&index<=0){event.preventDefault();buttons.at(-1)?.focus();}
   else if(!event.shiftKey&&(index===buttons.length-1||index===-1)){event.preventDefault();buttons[0].focus();}
  }
 }
</script>
<div class="overlay" role="presentation" onclick={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
 <div class="settings-dialog deletion-dialog" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onkeydown={keys} use:focusDialog>
  <div class="dialog-top"><div><span class="eyebrow">TAUT / CONVERSATION</span><h2>{title}</h2></div></div>
  {#if target.kind==='delete'}
   <p>Delete this message from the shared Teams conversation? A deleted-message marker may remain for participants.</p>
   {#if target.preview}<blockquote>{target.preview}</blockquote>{/if}
   <p>Uploaded files remain in OneDrive. Microsoft 365 retention policies still apply. Restoration is subject to tenant policy.</p>
  {:else if target.kind==='restore'}
   <p>Restore this message to the shared conversation? Other participants may see its contents again. Microsoft 365 policy determines whether restoration is allowed.</p>
  {:else if target.kind==='hide'}
   <p>Hide “{target.name}” from your chat list?</p><p>This affects only you. Shared history, membership, and files remain. New activity can bring the chat back. Your drafts stay in this session.</p>
  {:else}<p>Return “{target.name}” to your chat list? This affects only you and does not send a message.</p>{/if}
  {#if error}<p class="member-error" role="alert">{error}</p>{/if}
  {#if uncertain}<p>Check status or official Teams before another attempt. TAUT will not repeat this action automatically.</p>{/if}
  <div class="new-chat-actions">
   <button type="button" data-cancel disabled={busy} onclick={onClose}>Cancel</button>
   {#if uncertain}<button type="button" disabled={busy} onclick={onCheck}>Check status</button>{/if}
   <button type="button" class:danger-button={target.kind==='delete'} disabled={busy||uncertain} onclick={onConfirm}>{busy?'Working…':target.kind==='delete'?'Delete message':target.kind==='restore'?'Restore message':target.kind==='hide'?'Hide for me':'Unhide for me'}</button>
  </div>
 </div>
</div>
