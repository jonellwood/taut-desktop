<script lang="ts">
 import {recurrenceDays,startWeekday,type RecurrenceForm} from './meeting-recurrence';
 let {value,start,onChange}:{value:RecurrenceForm;start:string;onChange:(value:RecurrenceForm)=>void}=$props();
 function frequency(raw:string){const frequency=raw as RecurrenceForm['frequency'];onChange({...value,frequency,daysOfWeek:frequency==='weekly'?[startWeekday(start)??'monday']:[]});}
</script>
<section aria-label="Meeting recurrence"><label>Repeat<select aria-label="Repeat" value={value.frequency} onchange={e=>frequency(e.currentTarget.value)}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
{#if value.frequency!=='none'}
 <label>Repeat every<input aria-label="Repeat every" type="number" min="1" max="52" value={value.interval} oninput={e=>onChange({...value,interval:e.currentTarget.valueAsNumber})}/><small>{value.frequency==='daily'?'days':'weeks'}</small></label>
 {#if value.frequency==='weekly'}<fieldset><legend>Repeats on</legend><div class="days">{#each recurrenceDays as day}<label><input type="checkbox" checked={value.daysOfWeek.includes(day)} onchange={e=>onChange({...value,daysOfWeek:e.currentTarget.checked?[...value.daysOfWeek,day]:value.daysOfWeek.filter(d=>d!==day)})}/>{day[0].toUpperCase()+day.slice(1)}</label>{/each}</div></fieldset>{/if}
 <label>Series ends<select aria-label="Series ends" value={value.ending} onchange={e=>onChange({...value,ending:e.currentTarget.value as RecurrenceForm['ending']})}><option value="count">After occurrences</option><option value="date">On a date</option></select></label>
 {#if value.ending==='count'}<label>Number of occurrences<input type="number" min="1" max="365" value={value.count} oninput={e=>onChange({...value,count:e.currentTarget.valueAsNumber})}/></label>{:else}<label>Series end date<input type="date" min={start.slice(0,10)} value={value.endDate} oninput={e=>onChange({...value,endDate:e.currentTarget.value})}/></label>{/if}
 <small>Repeats at the same local time. Manage or cancel the series in Outlook.</small>
{/if}</section>
<style>
 section{display:grid;gap:16px;padding:18px;border:1px solid var(--border);border-radius:10px}label{display:grid;gap:8px;font-size:13px}input,select{font:inherit;color:var(--text-primary);background:var(--surface-panel);border:1px solid var(--border-strong);border-radius:8px;padding:10px;min-width:0;max-width:100%}fieldset{border:0;padding:0;margin:0;min-width:0}legend{font-size:13px;margin-bottom:10px}.days{display:flex;flex-wrap:wrap;gap:12px}.days label{display:flex;align-items:center;gap:7px}small{color:var(--text-secondary);line-height:1.6}input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
</style>
