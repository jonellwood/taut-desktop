<script lang="ts">
 import {directoryKey,directoryRows,type Coworker} from './people';
 let {label,value,ownId,onChange,onFocus}:{label:string;value:string;ownId:string;onChange:(value:string)=>void;onFocus:()=>void}=$props();
 let rows=$state<Coworker[]>([]),focused=$state(false),dismissed=$state(false),active=$state(-1),input=$state<HTMLInputElement>(),caret=$state(0);
 const id=$props.id();
 $effect(()=>{try{rows=directoryRows(JSON.parse(localStorage.getItem(directoryKey(ownId))??'null')?.rows);}catch{rows=[];}});
 const start=$derived(Math.max(value.lastIndexOf(';',caret-1),value.lastIndexOf(',',caret-1))+1);
 const end=$derived.by(()=>{const tail=value.slice(caret).search(/[;,]/);return tail<0?value.length:caret+tail;});
 const query=$derived(value.slice(start,caret).trim().toLowerCase());
 const matches=$derived.by(()=>{
  if(!focused||dismissed||query.length<2)return [];
  const used=new Set(value.slice(0,start).concat(value.slice(end)).split(/[;,]/).map(v=>v.trim().toLowerCase()));
  const seen=new Set<string>();
  return rows.flatMap(person=>{const email=person.mail||person.userPrincipalName||'';const key=email.toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||used.has(key)||seen.has(key)||![person.displayName,email].some(v=>v.toLowerCase().includes(query)))return [];
   seen.add(key);return [{name:person.displayName,email}];
  }).slice(0,5);
 });
 function select(index:number){const person=matches[index];if(!person)return;const prefix=value.slice(0,start),suffix=value.slice(end);const next=prefix+(prefix?' ':'')+person.email+(suffix||'; ');onChange(next);dismissed=true;active=-1;input?.focus();queueMicrotask(()=>{const position=prefix.length+(prefix?1:0)+person.email.length+(suffix?0:2);input?.setSelectionRange(position,position);caret=position;});}
 function keydown(e:KeyboardEvent){if(!matches.length)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();active=active<0?(e.key==='ArrowDown'?0:matches.length-1):(active+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length;}else if(e.key==='Enter'&&active>=0){e.preventDefault();select(active);}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismissed=true;}}
</script>
<div class="recipient">
 <label for={id}>{label}</label>
 <div class="entry">
 <input bind:this={input} id={id} aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={matches.length>0} aria-controls={id+'-options'} aria-activedescendant={active>=0&&matches[active]?id+'-'+active:undefined} autocomplete="off" value={value} placeholder="name@example.com"
 onfocus={()=>{focused=true;onFocus();}} onblur={()=>focused=false} onclick={e=>{caret=e.currentTarget.selectionStart??value.length;dismissed=false;active=-1;}}
 oninput={e=>{caret=e.currentTarget.selectionStart??e.currentTarget.value.length;dismissed=false;active=-1;onChange(e.currentTarget.value);}} onkeydown={keydown}/>
 {#if matches.length}<div class="suggestions" role="listbox" id={id+'-options'} aria-label={label+' suggestions'}>
 {#each matches as person,i}<button type="button" role="option" id={id+'-'+i} aria-selected={active===i} tabindex="-1" onpointerdown={e=>e.preventDefault()} onclick={()=>select(i)}><strong>{person.name}</strong><span>{person.email}</span></button>{/each}
 </div>{/if}
 </div>
</div>
<style>
.recipient{display:flex;align-items:center;gap:14px;margin:12px 0}label{flex:0 0 30px;font-size:12px;color:var(--text-secondary)}.entry{flex:1;min-width:0;position:relative}input{width:100%;box-sizing:border-box;background:var(--surface-base);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:7px;padding:10px;font:inherit;font-size:12px}.suggestions{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:5;padding:5px;background:var(--surface-panel);border:1px solid var(--border-strong);border-radius:10px;box-shadow:0 10px 30px #0003}.suggestions button{display:block;width:100%;text-align:left;padding:10px;border:0;border-radius:6px;background:transparent;color:var(--text-primary);cursor:pointer}.suggestions button:hover,.suggestions button[aria-selected="true"]{background:var(--accent-soft)}strong,span{display:block;overflow-wrap:anywhere}strong{font-size:13px}span{font-size:12px;color:var(--text-secondary);margin-top:3px}
</style>
