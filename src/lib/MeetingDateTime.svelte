<script lang="ts">
 import {tick,onDestroy} from 'svelte';
 import {Clock,CalendarDays} from 'lucide-svelte';
 let {label,value,disabled=false,onChange}:{label:'Start'|'End';value:string;disabled?:boolean;onChange:(value:string)=>void}=$props();
 const date=$derived(value.split('T')[0]??'');
 const rawTime=$derived(value.includes('T')?value.split('T')[1]:'');
 // Keep the source's seconds internally, but expose only hours/minutes.
 const time=$derived(rawTime.slice(0,5));
 const hours=Array.from({length:12},(_,i)=>String(i+1));
 const minutes=Array.from({length:12},(_,i)=>String(i*5).padStart(2,'0'));
 let open=$state(false),hour=$state('9'),minute=$state('00'),period=$state('AM'),original=$state('');
 let root:HTMLDivElement|undefined,input:HTMLInputElement|undefined;
 let hourWheel=$state<HTMLDivElement>(),minuteWheel=$state<HTMLDivElement>();
 const timers:Partial<Record<'hour'|'minute',ReturnType<typeof setTimeout>>>={};
 const ignore={hour:0,minute:0};let alive=true;
 function align(kind:'hour'|'minute'){
  clearTimeout(timers[kind]);delete timers[kind];const wheel=kind==='hour'?hourWheel:minuteWheel;
  const index=kind==='hour'?Math.max(0,hours.indexOf(hour)):Math.min(11,Math.round(Number(minute)/5));
  ignore[kind]=Date.now()+250;if(wheel)wheel.scrollTop=index*40;
 }
 async function showPicker(){
  if(disabled||input?.matches(':disabled'))return;
  const parts=time.split(':'),h=Number(parts[0]);
  hour=String(time&&Number.isFinite(h)?h%12||12:9);minute=/^\d{2}$/.test(parts[1]??'')?parts[1]:'00';period=time&&h>=12?'PM':'AM';original=`${hour}:${minute} ${period}`;
  open=true;await tick();if(!alive||!open)return;align('hour');align('minute');root?.querySelector<HTMLElement>('[role=listbox]')?.focus({preventScroll:true});root?.querySelector<HTMLElement>('.time-picker')?.scrollIntoView({block:'nearest'});
 }
 async function dateChosen(event:Event){const field=event.currentTarget as HTMLInputElement;if(!field.value||!field.validity.valid)return;await tick();input?.focus();}
 function clearTimers(){for(const kind of ['hour','minute'] as const){clearTimeout(timers[kind]);delete timers[kind];}}
 function close(focus=true){clearTimers();open=false;if(focus)input?.focus();}
 function select(kind:'hour'|'minute',selected:string){if(kind==='hour')hour=selected;else minute=selected;align(kind);}
 function scroll(kind:'hour'|'minute'){
  if(!open||Date.now()<ignore[kind])return;clearTimeout(timers[kind]);
  timers[kind]=setTimeout(()=>{delete timers[kind];if(!open||!alive)return;const wheel=kind==='hour'?hourWheel:minuteWheel;const values=kind==='hour'?hours:minutes;if(!wheel)return;const index=Math.min(11,Math.max(0,Math.round(wheel.scrollTop/40)));if(kind==='hour')hour=values[index];else minute=values[index];},140);
 }
 function wheelKey(event:KeyboardEvent,kind:'hour'|'minute'){
  if(input?.matches(':disabled'))return;
  const values=kind==='hour'?hours:minutes;let index=values.indexOf(kind==='hour'?hour:minute);
  if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();
  if(event.key==='Home')index=0;else if(event.key==='End')index=11;
  else if(index<0)index=event.key==='ArrowDown'?Math.ceil(Number(minute)/5):Math.floor(Number(minute)/5);
  else index=(index+(event.key==='ArrowDown'?1:-1)+12)%12;
  select(kind,values[Math.min(11,Math.max(0,index))]);
 }
 function choose(){
  // Flush a wheel selection if Set time is clicked before its debounce ends.
  for(const kind of ['hour','minute'] as const){if(timers[kind]&&Date.now()>=ignore[kind]){const wheel=kind==='hour'?hourWheel:minuteWheel;const values=kind==='hour'?hours:minutes;if(wheel){const selected=values[Math.min(11,Math.max(0,Math.round(wheel.scrollTop/40)))];if(kind==='hour')hour=selected;else minute=selected;}}}
  if(`${hour}:${minute} ${period}`!==original||!time){const h=String(Number(hour)%12+(period==='PM'?12:0)).padStart(2,'0');onChange(`${date}T${h}:${minute}`);}close();
 }
 onDestroy(()=>{alive=false;clearTimers();});
</script>
<svelte:window onpointerdown={event=>{if(open&&event.target instanceof Node&&!root?.contains(event.target))close(false);}} onkeydown={event=>{if(open&&event.key==='Escape'){event.preventDefault();close();}}}/>
<fieldset {disabled}><legend>{label==='Start'?'Starts':'Ends'}</legend><div class="date-time"><div class="date-wrap"><label>{label} date<input type="date" {disabled} value={date} oninput={event=>onChange(`${event.currentTarget.value}T${rawTime}`)} onchange={dateChosen}/></label><span class="calendar-icon" aria-hidden="true"><CalendarDays size={16}/></span></div><div class="time-wrap" bind:this={root}><label>{label} time<input bind:this={input} type="time" step="60" {disabled} value={time} onclick={showPicker} onkeydown={event=>{if(event.altKey&&event.key==='ArrowDown'){event.preventDefault();void showPicker();}}} oninput={event=>{close(false);if(event.currentTarget.value!==time)onChange(`${date}T${event.currentTarget.value}`);}}/></label><button class="clock" type="button" aria-label={`Choose ${label.toLowerCase()} time`} aria-haspopup="dialog" aria-expanded={open} {disabled} onclick={()=>open?close():showPicker()}><Clock size={16}/></button>
{#if open}<div class="time-picker" role="dialog" aria-label={`${label} time picker`}><div class="picker-heading"><strong>{label} time</strong><span class="preview" aria-live="polite">{hour}:{minute} {period}</span></div>
 <div class="choices"><div class="column"><span class="column-label">Hour</span><div class="wheel" role="listbox" aria-label="Hour" tabindex="0" bind:this={hourWheel} onscroll={()=>scroll('hour')} onwheel={()=>ignore.hour=0} onpointerdown={()=>ignore.hour=0} onkeydown={event=>wheelKey(event,'hour')}>{#each hours as option}<button type="button" role="option" tabindex="-1" aria-selected={hour===option} onclick={()=>select('hour',option)}>{option.padStart(2,'0')}</button>{/each}</div></div>
 <div class="column"><span class="column-label">Minute</span><div class="wheel" role="listbox" aria-label="Minute" tabindex="0" bind:this={minuteWheel} onscroll={()=>scroll('minute')} onwheel={()=>ignore.minute=0} onpointerdown={()=>ignore.minute=0} onkeydown={event=>wheelKey(event,'minute')}>{#each minutes as option}<button type="button" role="option" tabindex="-1" aria-selected={minute===option} onclick={()=>select('minute',option)}>{option}</button>{/each}</div></div>
 <div class="period" role="group" aria-label="AM or PM">{#each ['AM','PM'] as option}<button type="button" aria-pressed={period===option} onclick={()=>period=option}>{option}</button>{/each}</div></div>
 <p class="hint">Pick in 5-minute steps, or type an exact time in the field.</p>{#if !minutes.includes(minute)}<p class="exact">Exact minute {minute} is kept until you select another minute.</p>{/if}
 <div class="actions"><button type="button" onclick={()=>close()}>Cancel</button><button type="button" class="apply" onclick={choose}>Set time</button></div></div>{/if}
</div></div></fieldset>
<style>
 fieldset{border:0;padding:0;margin:0;min-width:0}legend{font-weight:600;font-size:13px;margin-bottom:10px}.date-time{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}label{display:grid;gap:8px;font-size:12px;color:var(--text-secondary)}input{width:100%;min-width:0;box-sizing:border-box;font:inherit;font-size:14px;color:var(--text-primary);border:1px solid var(--border-strong);border-radius:9px;background:var(--surface-panel);padding:11px 10px}input:disabled{opacity:.5}.time-wrap,.date-wrap{position:relative;min-width:0}.time-wrap input,.date-wrap input{padding-left:8px;padding-right:30px}.clock,.calendar-icon{position:absolute;right:5px;bottom:5px;height:32px;width:26px;display:grid;place-items:center;color:var(--accent);padding:0}.calendar-icon{pointer-events:none}
 .time-picker{position:absolute;right:0;top:calc(100% + 6px);width:280px;max-width:calc(100vw - 40px);padding:16px;border:1px solid var(--border-strong);border-radius:12px;background:var(--surface-panel);box-shadow:0 10px 28px #0003;z-index:30;color:var(--text-primary)}.picker-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px}.preview{color:var(--accent);font-variant-numeric:tabular-nums;font-weight:650}.choices{display:grid;grid-template-columns:1fr 1fr .8fr;gap:10px;margin:16px 0 10px}.column{min-width:0}.column-label{display:block;font-size:11px;color:var(--text-secondary);text-align:center;margin-bottom:6px}.wheel{height:200px;overflow-y:auto;scroll-snap-type:y mandatory;scrollbar-width:none;padding:80px 0;background:var(--surface-base);border-radius:9px;box-sizing:border-box}.wheel::-webkit-scrollbar{display:none}.wheel button{height:40px;min-height:40px;width:100%;display:block;scroll-snap-align:center;border:0;border-radius:6px;padding:0;font:inherit;font-size:18px;font-variant-numeric:tabular-nums;color:var(--text-secondary);background:transparent;cursor:pointer}.wheel button[aria-selected=true]{background:var(--accent-soft);color:var(--accent);font-weight:700}.period{display:flex;flex-direction:column;justify-content:center;gap:8px}.period button{font:inherit;font-size:13px;border:1px solid var(--border);padding:10px 4px;border-radius:7px;color:var(--text-secondary)}.period button[aria-pressed=true]{background:var(--accent);color:var(--text-on-accent);border-color:var(--accent)}.hint,.exact{font-size:11px;line-height:1.5;color:var(--text-secondary);margin:8px 0}.exact{color:var(--accent)}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}.actions button{padding:8px 12px;border:1px solid var(--border-strong);border-radius:7px;font:inherit}.apply{background:var(--accent);color:var(--text-on-accent)}button:focus-visible,input:focus-visible,.wheel:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
 input[type=date]::-webkit-calendar-picker-indicator{position:absolute;right:5px;bottom:5px;width:26px;height:32px;opacity:0;cursor:pointer}input[type=time]::-webkit-calendar-picker-indicator{display:none}
</style>
