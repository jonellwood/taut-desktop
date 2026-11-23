<script lang="ts">
 import {onMount} from 'svelte';
 import {invoke} from '@tauri-apps/api/core';
 let status=$state<{enabled:boolean;error?:string|null}>({enabled:false}),busy=$state(true),error=$state('');
 onMount(()=>{void invoke<typeof status>('calendar_reminder_settings').then(value=>status=value).catch(()=>error='Calendar reminder preferences could not be loaded.').finally(()=>busy=false);});
 async function configure(enabled:boolean){const previous={...status};status={...status,enabled};busy=true;error='';try{status=await invoke<typeof status>('calendar_reminder_configure',{enabled});}catch{status=previous;error='Calendar reminders could not be updated. Check system notification permission and local storage, then try again.';}finally{busy=false;}}
</script>
<div class="reminder-setting"><div><strong>Calendar reminders</strong><p>Use Outlook’s reminder settings while TAUT is running, even outside Calendar. Notifications include the meeting title and start time; clicking opens the event in TAUT.</p><p>Checks run about every 30 seconds with a 31-day lookahead. Missed reminders older than two minutes are skipped after sleep or downtime. Snooze and custom timing stay in Outlook for now.</p></div><input type="checkbox" aria-label="Calendar reminders" checked={status.enabled} disabled={busy} onchange={event=>configure(event.currentTarget.checked)}/></div>
{#if error||status.error}<p role="alert">{error||status.error}</p>{/if}
<style>.reminder-setting{display:flex;gap:20px;align-items:center;border-top:1px solid var(--border);padding:20px 0;margin-top:20px}p{color:var(--text-secondary);font-size:13px;line-height:1.6}input{accent-color:var(--accent);width:18px;height:18px;flex:none}[role=alert]{color:var(--danger-text)}</style>
