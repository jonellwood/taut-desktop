<script lang="ts">
 let {label,value,disabled=false,precise=false,onChange}:{label:'Start'|'End';value:string;disabled?:boolean;precise?:boolean;onChange:(value:string)=>void}=$props();
 const date=$derived(value.split('T')[0]??'');
 const time=$derived(value.includes('T')?value.split('T')[1]:'');
</script>
<fieldset {disabled}><legend>{label==='Start'?'Starts':'Ends'}</legend><div class="date-time"><label>{label} date<input type="date" {disabled} value={date} oninput={event=>onChange(`${event.currentTarget.value}T${time}`)}/></label><label>{label} time<input type="time" step={precise?'0.001':'60'} {disabled} value={time} oninput={event=>onChange(`${date}T${event.currentTarget.value}`)}/></label></div></fieldset>
<style>
 fieldset{border:0;padding:0;margin:0;min-width:0}legend{font-weight:600;font-size:13px;margin-bottom:10px}.date-time{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:10px}label{display:grid;gap:8px;font-size:12px;color:var(--text-secondary)}input{width:100%;min-width:0;box-sizing:border-box;font:inherit;font-size:14px;color:var(--text-primary);border:1px solid var(--border-strong);border-radius:9px;background:var(--surface-panel);padding:11px 10px}input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}input:disabled{opacity:.5}
</style>
