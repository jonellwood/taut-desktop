<script lang="ts">
 import {invoke} from '@tauri-apps/api/core';
 import {onDestroy} from 'svelte';
 import {eventDay,eventWhen,type CalendarEvent} from './calendar';
 import {meetingConflicts} from './meeting-conflicts';
 let {start,end,events=[],exclude='',review=false,recurring=false}:{start:string;end:string;events?:CalendarEvent[];exclude?:string;review?:boolean;recurring?:boolean}=$props();
 let fetched=$state<CalendarEvent[]>([]),verified=$state(''),checking=$state(false),failed=$state(false);let serial=0,alive=true;
 const key=$derived(`${start}/${end}`);
 const valid=$derived(Number.isFinite(new Date(start).getTime())&&new Date(end)>new Date(start));
 const conflicts=$derived(meetingConflicts(verified===key?fetched:events,new Date(start).getTime(),new Date(end).getTime(),exclude));
 $effect(()=>{const current=key,force=review;if(!valid)return;const request=++serial;checking=true;failed=false;
  const timer=setTimeout(()=>{void (async()=>{try{
   const result=await invoke<{value:CalendarEvent[];next:string|null}>('calendar_page',{start:new Date(start).toISOString(),end:new Date(end).toISOString(),next:null});
   if(alive&&request===serial){fetched=[...new Map(result.value.map(event=>[event.id,event])).values()];verified=result.next?'':current;failed=!!result.next;}
  }catch{if(alive&&request===serial){verified='';failed=true;}}finally{if(alive&&request===serial)checking=false;}})();},force?0:450);
  return ()=>{clearTimeout(timer);serial++;};
 });
 onDestroy(()=>{alive=false;serial++;});
</script>
{#if valid}<section class="conflicts" aria-label="Your calendar conflicts" aria-live="polite">
 {#if conflicts.length}<strong>{conflicts.every(e=>e.showAs==='tentative')?'Possible conflict':'You have another event at this time'}</strong>
 {#each conflicts as event(event.id)}<p>{event.showAs==='tentative'?'Tentative · ':''}{event.subject||'Untitled event'} · {eventDay(event)} · {eventWhen(event)}</p>{/each}<p>You can still schedule this meeting.</p>{/if}
 <small>{checking?'Checking your calendar…':verified===key?conflicts.length?'Checked against your current calendar.':'No overlapping events found on your calendar.':failed?'Your calendar could not be fully checked. Any warnings shown use loaded events.':'Only loaded events have been checked.'}{recurring?' This checks the first occurrence only.':''}</small>
</section>{/if}
<style>.conflicts{border-left:3px solid var(--accent);padding:10px 14px;margin:12px 0;color:var(--text-primary);background:var(--accent-soft);border-radius:6px;font-size:13px}.conflicts strong{display:block}.conflicts p{margin:8px 0;line-height:1.5}.conflicts small{color:var(--text-secondary);line-height:1.6}</style>
