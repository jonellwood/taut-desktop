<script lang="ts">
 import {invoke} from '@tauri-apps/api/core';
 let {ownId,folder,destination,disabled=false,onCreated,onBusyChange}:{ownId:string;folder:string|null;destination:string;disabled?:boolean;onCreated:()=>void;onBusyChange:(busy:boolean)=>void}=$props();
 let dialog:HTMLDialogElement,name=$state(''),busy=$state(false),error=$state(''),uncertain=$state(false);
 function open(){name='';error='';uncertain=false;dialog.showModal();dialog.querySelector('input')?.focus();onBusyChange(true);}
 function close(){if(busy)return;dialog.close();onBusyChange(false);}
 async function create(){if(busy||uncertain||!name.trim())return;error='';if(name!==name.trim()||name.endsWith('.')||/[<>:"/\\|?*\x00-\x1f]/.test(name)||new TextEncoder().encode(name).length>180){error='Choose a name without reserved characters or trailing spaces/dots (up to 180 bytes).';return;}busy=true;try{const result=await invoke<{status:string;error?:string}>('files_create_folder',{ownId,folder,name});if(result.status==='created'){busy=false;close();onCreated();return;}error=result.error||'Folder creation could not be confirmed. Refresh OneDrive before trying again.';uncertain=result.status!=='notSent';}catch{uncertain=true;error='Folder creation could not be confirmed. Close this dialog and refresh OneDrive before trying again. No retry was sent.';}finally{busy=false;}}
</script>
<button class="new-folder" {disabled} onclick={open}>New folder</button>
<dialog bind:this={dialog} aria-label="New folder" oncancel={event=>{event.preventDefault();close();}}>
 <h2>New folder</h2><p>Create in <strong>{destination}</strong></p><label>Folder name<input bind:value={name} maxlength="180" disabled={busy||uncertain}/></label>
 <p class="hint">Existing items will never be replaced or renamed. The folder inherits access from its destination.</p>
 {#if error}<p role="alert">{error}</p>{/if}
 <footer><button disabled={busy} onclick={close}>{uncertain?'Close':'Cancel'}</button><button class="primary" disabled={busy||uncertain||!name.trim()} onclick={create}>{busy?'Creating…':'Create folder'}</button></footer>
</dialog>
<style>
button,input{font:inherit;color:var(--text-primary);border:1px solid var(--border-strong);border-radius:8px;padding:10px 14px;background:transparent}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}.new-folder{margin-bottom:16px;color:var(--accent)}dialog{position:fixed;inset:0;margin:auto;width:min(460px,calc(100vw - 32px));box-sizing:border-box;padding:26px;background:var(--surface-panel);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:14px;box-shadow:0 20px 70px #0006}dialog::backdrop{background:#0008}h2{margin:0 0 16px}p{overflow-wrap:anywhere;line-height:1.6}label{display:flex;flex-direction:column;gap:8px}input{background:var(--surface-input,var(--surface-panel));min-width:0}.hint{font-size:12px;color:var(--text-secondary)}footer{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}.primary{background:var(--accent);color:var(--text-on-accent);border-color:var(--accent)}[role=alert]{color:var(--error)}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
