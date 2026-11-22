<script lang="ts">
 import {tick} from 'svelte';
 import {Clock,CalendarDays} from 'lucide-svelte';
 let {label,value,disabled=false,precise=false,onChange}:{label:'Start'|'End';value:string;disabled?:boolean;precise?:boolean;onChange:(value:string)=>void}=$props();
 const date=$derived(value.split('T')[0]??'');
 const time=$derived(value.includes('T')?value.split('T')[1]:'');
 let open=$state(false),hour=$state('9'),minute=$state('00'),period=$state('AM');
 let root:HTMLDivElement|undefined,input:HTMLInputElement|undefined;
 async function showPicker(){
  if(disabled||input?.matches(':disabled'))return;
  const parts=time.split(':'),h=Number(parts[0]);
  hour=String(time&&Number.isFinite(h)?h%12||12:9);minute=/^\d{2}$/.test(parts[1]??'')?parts[1]:'00';period=time&&h>=12?'PM':'AM';
  open=true;await tick();root?.querySelector('select')?.focus();
 }
 async function dateChosen(event:Event){
  const field=event.currentTarget as HTMLInputElement;
  if(!field.value||!field.validity.valid)return;
  await tick();input?.focus();
 }
 function close(){open=false;input?.focus();}
 function choose(){const h=String(Number(hour)%12+(period==='PM'?12:0)).padStart(2,'0');onChange(`${date}T${h}:${minute}`);close();}
</script>
<svelte:window onpointerdown={event=>{if(open&&event.target instanceof Node&&!root?.contains(event.target))open=false;}} onkeydown={event=>{if(open&&event.key==='Escape'){event.preventDefault();close();}}}/>
<fieldset {disabled}><legend>{label==='Start'?'Starts':'Ends'}</legend><div class="date-time"><div class="date-wrap"><label>{label} date<input type="date" {disabled} value={date} oninput={event=>onChange(`${event.currentTarget.value}T${time}`)} onchange={dateChosen}/></label><span class="calendar-icon" aria-hidden="true"><CalendarDays size={16}/></span></div><div class="time-wrap" bind:this={root}><label>{label} time<input bind:this={input} type="time" step={precise?'0.001':'60'} {disabled} value={time} onclick={showPicker} onkeydown={event=>{if(event.altKey&&event.key==='ArrowDown'){event.preventDefault();void showPicker();}}} oninput={event=>{open=false;onChange(`${date}T${event.currentTarget.value}`);}}/></label><button class="clock" type="button" aria-label={`Choose ${label.toLowerCase()} time`} aria-haspopup="dialog" aria-expanded={open} {disabled} onclick={()=>open?close():showPicker()}><Clock size={16}/></button>
{#if open}<div class="time-picker" role="dialog" aria-label={`${label} time picker`}><strong>{label} time</strong><div class="choices"><label>Hour<select aria-label="Hour" bind:value={hour}>{#each Array.from({length:12},(_,i)=>String(i+1)) as value}<option {value}>{value}</option>{/each}</select></label><label>Minute<select aria-label="Minute" bind:value={minute}>{#each Array.from({length:60},(_,i)=>String(i).padStart(2,'0')) as value}<option {value}>{value}</option>{/each}</select></label><label>AM or PM<select aria-label="AM or PM" bind:value={period}><option>AM</option><option>PM</option></select></label></div><div class="actions"><button type="button" onclick={close}>Cancel</button><button type="button" class="apply" onclick={choose}>Set time</button></div></div>{/if}
</div></div></fieldset>
<style>
 fieldset{border:0;padding:0;margin:0;min-width:0}legend{font-weight:600;font-size:13px;margin-bottom:10px}.date-time{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}label{display:grid;gap:8px;font-size:12px;color:var(--text-secondary)}input{width:100%;min-width:0;box-sizing:border-box;font:inherit;font-size:14px;color:var(--text-primary);border:1px solid var(--border-strong);border-radius:9px;background:var(--surface-panel);padding:11px 10px}input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}input:disabled{opacity:.5}
 .time-wrap,.date-wrap{position:relative;min-width:0}.time-wrap input,.date-wrap input{padding-left:8px;padding-right:30px}.clock,.calendar-icon{position:absolute;right:5px;bottom:5px;height:32px;width:26px;display:grid;place-items:center;color:var(--accent);padding:0}.time-picker{position:absolute;right:0;top:calc(100% + 6px);width:280px;max-width:calc(100vw - 40px);padding:16px;border:1px solid var(--border-strong);border-radius:12px;background:var(--surface-panel);box-shadow:0 10px 28px #0003;z-index:30;color:var(--text-primary)}.choices{display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:10px;margin:16px 0}select{width:100%;font:inherit;padding:8px 5px;border:1px solid var(--border-strong);border-radius:6px;background:var(--surface-base);color:var(--text-primary)}.actions{display:flex;justify-content:flex-end;gap:10px}.actions button{padding:8px 12px;border:1px solid var(--border-strong);border-radius:7px;font:inherit}.apply{background:var(--accent);color:var(--text-on-accent)}button:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
 .calendar-icon{pointer-events:none}
 input[type=date]::-webkit-calendar-picker-indicator{position:absolute;right:5px;bottom:5px;width:26px;height:32px;opacity:0;cursor:pointer}
 input[type=time]::-webkit-calendar-picker-indicator{display:none}
</style>
