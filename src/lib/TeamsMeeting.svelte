<script lang="ts">
 import {openUrl} from '@tauri-apps/plugin-opener';
 import {teamsJoinLink,type CalendarEvent} from './calendar';
 let {event}:{event:CalendarEvent}=$props();
 let error=$state('');
 const link=$derived(teamsJoinLink(event));
 $effect(()=>{event.id;error='';});
 async function join(){if(!link)return;error='';try{await openUrl(link);}catch{error='Teams could not be opened. Try again or open the meeting in Outlook.';}}
</script>
{#if event.isOnlineMeeting&&event.onlineMeetingProvider==='teamsForBusiness'&&!event.isCancelled}
 <section class="teams-meeting" aria-label="Teams meeting">
  {#if link}<button type="button" onclick={join}>Join Teams meeting ↗</button><small>Opens Teams or your browser.</small>{:else}<strong>Teams meeting</strong><p>Join link unavailable. Refresh meeting status or check Outlook.</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
 </section>
{/if}
<style>
 .teams-meeting{display:grid;gap:10px;margin-bottom:24px;padding:18px;border:1px solid var(--accent);border-radius:10px;background:var(--accent-soft)}button{padding:12px;border:1px solid var(--accent);border-radius:8px;color:var(--accent);text-align:center;font:inherit;cursor:pointer}small,p{color:var(--text-secondary);line-height:1.5}p{margin:0}[role=alert]{color:var(--danger-text)}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
</style>
