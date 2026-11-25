<script lang="ts">
 import {invoke} from '@tauri-apps/api/core';
 import type {DriveItem} from './files';
 export type DeleteResult={id:string;status:string;error?:string;coveredBy?:string};
 let {ownId,items,disabled=false,onResults,onBusyChange}:{ownId:string;items:DriveItem[];disabled?:boolean;onResults:(results:DeleteResult[])=>void;onBusyChange:(busy:boolean)=>void}=$props();
 let outcomes=$state<DeleteResult[]>([]);
 let dialog:HTMLDialogElement,review=$state<DriveItem[]>([]),busy=$state(false),error=$state(''),finished=$state(false);
 function open(){review=[...items];outcomes=[];error='';finished=false;dialog.showModal();dialog.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();onBusyChange(true);}
 function close(){if(busy)return;dialog.close();onBusyChange(false);}
 async function remove(){if(busy||finished)return;busy=true;try{const response=await invoke<{results:DeleteResult[]}>('files_delete_items',{ownId,items:review.map(({id,name,folder})=>({id,name,folder}))});finished=true;outcomes=response.results;onResults(response.results);if(response.results.every(r=>r.status==='deleted'||r.status==='covered')){busy=false;close();}else error='Some items were not confirmed deleted. See the item results below. Close and refresh OneDrive before trying again.';}catch{finished=true;error='Deletion could not be confirmed. Close and refresh OneDrive before trying again. No automatic retry was sent.';onResults(review.map(item=>({id:item.id,status:'unconfirmed',error:'Check OneDrive before retrying.'})));}finally{busy=false;}}
</script>
<button {disabled} onclick={open}>Delete selected</button>
<dialog bind:this={dialog} aria-label="Delete selected items" oncancel={event=>{event.preventDefault();close();}}>
 <h2>Move {review.length} {review.length===1?'item':'items'} to Recycle Bin?</h2>
 <p>You can restore deleted items from OneDrive’s Recycle Bin, subject to your organization’s retention policy.</p>
 {#if review.some(item=>item.folder)}<p class="warning"><strong>Folders include everything inside them.</strong> All files and subfolders will also be deleted, including contents not shown here. A selected folder covers any selected items inside it.</p>{/if}
 <ul>{#each review as item(item.id)}<li><strong>{item.name}</strong><small>{item.folder?'Folder and all contents':'File'}{item.location?` · ${item.location.replace(/^.*root:/,'My OneDrive')}`:''}</small></li>{/each}</ul>
 {#if error}<p role="alert">{error}</p>{/if}
 {#if outcomes.length}<ul aria-label="Deletion results">{#each outcomes as result}<li>{review.find(item=>item.id===result.id)?.name}: {result.status==='deleted'?'Moved to Recycle Bin':result.status==='covered'?'Included with selected parent folder':result.error}</li>{/each}</ul>{/if}
 <footer><button data-cancel disabled={busy} onclick={close}>{finished?'Close':'Cancel'}</button><button class="primary" disabled={busy||finished} onclick={remove}>{busy?'Deleting…':'Move to Recycle Bin'}</button></footer>
</dialog>
<style>
button{font:inherit;color:var(--text-primary);border:1px solid var(--border-strong);border-radius:7px;padding:9px 13px;cursor:pointer}button:disabled{opacity:.5;cursor:default}dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(540px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:26px;background:var(--surface-panel);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:14px;box-shadow:0 20px 70px #0006}dialog::backdrop{background:#0008}h2{font-size:21px;margin:0 0 16px}p{font-size:13px;line-height:1.6}.warning{border-left:3px solid var(--accent);padding:12px;background:var(--accent-soft)}ul{padding:0;list-style:none;max-height:260px;overflow:auto}li{padding:9px 0;border-bottom:1px solid var(--border);overflow-wrap:anywhere;font-size:13px}small{display:block;color:var(--text-secondary);font-size:11px;margin-top:4px}footer{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}.primary{background:var(--accent);color:var(--text-on-accent);border-color:var(--accent)}[role=alert]{color:var(--error)}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
