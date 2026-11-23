<script lang="ts">
 import CalendarReminderSettings from './CalendarReminderSettings.svelte';
 import {onMount} from 'svelte';
 import {meetingDuration,meetingDurationKey,meetingDurations} from './meeting-time';
 let minutes=$state(30),error=$state('');
 onMount(()=>{minutes=meetingDuration(localStorage);});
 function save(event:Event){const next=Number((event.currentTarget as HTMLSelectElement).value);try{localStorage.setItem(meetingDurationKey,String(next));minutes=next;error='';}catch{(event.currentTarget as HTMLSelectElement).value=String(minutes);error='Meeting length could not be saved on this device.';}}
</script>
<header><h3>Calendar</h3><p>Choose defaults for new meetings on this device.</p></header>
<label>Default meeting length<select aria-label="Default meeting length" value={minutes} onchange={save}>{#each meetingDurations as value}<option {value}>{value} minutes</option>{/each}</select></label>
<p>After you enter a start date and time, TAUT fills in the end using this length. You can change the end yourself; existing meetings and manually edited end times stay as entered.</p>
{#if error}<p role="alert">{error}</p>{/if}
<CalendarReminderSettings/>
<style>
 h3{margin:0 0 8px}p{color:var(--text-secondary);line-height:1.6;font-size:13px}header{margin-bottom:24px}label{display:grid;gap:10px;font-weight:600;max-width:280px}select{font:inherit;padding:10px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface-panel);color:var(--text-primary)}[role=alert]{color:var(--danger-text)}select:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
</style>
