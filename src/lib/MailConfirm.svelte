<script lang="ts">
 import type {Snippet} from 'svelte';
 let {title,confirmLabel,cancelLabel="Cancel",onConfirm,onClose,children}:{title:string;confirmLabel:string;cancelLabel?:string;onConfirm:()=>void;onClose:()=>void;children:Snippet}=$props();
 function open(node:HTMLDialogElement){const previous=document.activeElement as HTMLElement|null;node.showModal();node.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();return{destroy(){node.close();if(previous?.isConnected)previous.focus({preventScroll:true});}};}
</script>
<dialog use:open aria-label={title} oncancel={e=>{e.preventDefault();onClose();}}>
 <h2>{title}</h2><div class="content">{@render children()}</div><footer><button data-cancel onclick={onClose}>{cancelLabel}</button><button class="confirm" onclick={onConfirm}>{confirmLabel}</button></footer>
</dialog>
<style>
dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(460px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:26px;background:var(--surface-panel);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:14px;box-shadow:0 20px 70px #0006}dialog::backdrop{background:#0008}h2{flex-shrink:0;font-size:21px;margin:0 0 16px}dialog[open]{display:flex;flex-direction:column}.content{overflow:auto;min-height:0;overflow-wrap:anywhere;font-size:14px;line-height:1.6}footer{flex-shrink:0;display:flex;justify-content:flex-end;gap:10px;margin-top:24px}button{font:inherit;font-size:13px;padding:10px 15px;border:1px solid var(--border-strong);border-radius:8px;color:var(--text-primary);background:transparent;cursor:pointer}.confirm{background:var(--accent);color:var(--text-on-accent);border-color:var(--accent)}
</style>
