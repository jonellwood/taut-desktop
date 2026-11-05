<script lang="ts">
 import {invoke} from '@tauri-apps/api/core';
 let {ownId,permitted,onRefresh}:{ownId:string;permitted:boolean;onRefresh:()=>Promise<void>}=$props();
 let status=$state('busy'),minutes=$state(60),busy=$state(false),error=$state(''),uncertain=$state(false),notice=$state('');
 async function save(){if(busy||uncertain)return;busy=true;error='';notice='';try{const r=await invoke<{status:string;error?:string}>('graph_set_presence',{ownId,status,minutes});uncertain=r.status!=='confirmed';if(uncertain)error=r.error??'Status change was not confirmed.';else notice='Preference saved. Microsoft Teams may take a few minutes to update.';await onRefresh();}catch(e){error=String(e);}finally{busy=false;}}
</script>
<section aria-label="Your presence" class="own-status">
 <h3>Your presence</h3><p>Set a temporary preference, or return to automatic. Teams needs an active presence session to show you online; TAUT does not force Available at sign-in.</p>
 {#if !permitted}<p>Presence.ReadWrite consent and a fresh sign-in are needed.</p>{/if}
 <label>Status <select aria-label="Status" bind:value={status} disabled={busy}><option value="available">Available</option><option value="busy">Busy</option><option value="dnd">Do not disturb</option><option value="away">Away</option><option value="brb">Be right back</option><option value="offline">Appear offline</option><option value="automatic">Return to automatic</option></select></label>
 <label>Duration <select aria-label="Duration" bind:value={minutes} disabled={busy||status==='automatic'}>{#each [15,30,60,120,240] as value}<option value={value}>{value} minutes</option>{/each}</select></label>
 <button class="outline-button" disabled={!permitted||busy||uncertain} onclick={save}>{busy?'Saving…':'Apply status'}</button>
 {#if uncertain}<button class="outline-button" onclick={async()=>{await onRefresh();uncertain=false;error='';}}>Refresh before another change</button>{/if}
 {#if error}<p role="alert">{error}</p>{/if}{#if notice}<p role="status">{notice}</p>{/if}
</section>
<style>.own-status{border-top:1px solid #37444d;padding:18px 0}.own-status h3{font-size:14px}.own-status p{font-size:12px;color:#94a7b4;line-height:1.6}.own-status label{display:flex;justify-content:space-between;align-items:center;margin:12px 0;font-size:12px}.own-status select{background:#142029;color:#d7e1e8;border:1px solid #4b606d;padding:7px;border-radius:5px}.own-status button{font-size:11px;margin-right:8px}.own-status [role=alert]{color:#ffb5a9}</style>
