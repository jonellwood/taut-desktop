<script lang="ts">
 import catalog from './emoji-catalog.json';
 let {mode,busy=false,error='',uncertain=false,onChoose,onClose,onCheck}:{mode:'compose'|'react';busy?:boolean;error?:string;uncertain?:boolean;onChoose:(emoji:string)=>void;onClose:()=>void;onCheck?:()=>void}=$props();
 let query=$state('');let category=$state('Common');
 let root=$state<HTMLDivElement>();
 $effect(()=>{if(!root)return;if(busy)root.focus();else if(uncertain)root.querySelector<HTMLButtonElement>('[data-check]')?.focus();else if(document.activeElement===root)root.querySelector<HTMLInputElement>('input')?.focus();});
 const categories=['All',...new Set(catalog.map(e=>e.category))];
 let results=$derived(catalog.filter(e=>(query.trim()||category==='All'||e.category===category)&&`${e.name} ${e.keywords} ${e.emoji}`.toLowerCase().includes(query.trim().toLowerCase())));
 function focusPicker(node:HTMLDivElement){const search=node.querySelector<HTMLInputElement>('input');if(search&&!search.disabled)search.focus();else node.focus();}
 function keys(event:KeyboardEvent){
  if(event.key==='Escape'){event.stopPropagation();event.preventDefault();if(!busy)onClose();return;}
  const node=root;if(!node)return;
  if(event.key==='Tab'){
   const items=Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));
   const index=items.indexOf(document.activeElement as HTMLElement);
   if(!items.length){event.preventDefault();return;}
   if(event.shiftKey&&index<=0){event.preventDefault();items.at(-1)?.focus();}
   else if(!event.shiftKey&&(index===-1||index===items.length-1)){event.preventDefault();items[0].focus();}
  }
  if(event.target instanceof HTMLElement&&event.target.closest('.emoji-option')&&['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.key)){
   const items=Array.from(node.querySelectorAll<HTMLButtonElement>('.emoji-option:not(:disabled)'));const index=items.indexOf(document.activeElement as HTMLButtonElement);
   const offset=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:event.key==='ArrowDown'?8:-8;
   event.preventDefault();items[Math.max(0,Math.min(items.length-1,index+offset))]?.focus();
  }
 }
</script>
<svelte:window onkeydown={keys}/>
<div class="overlay" role="presentation" onclick={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
 <div class="settings-dialog emoji-dialog" role="dialog" aria-modal="true" aria-label={mode==='compose'?'Insert emoji':'React to message'} tabindex="-1" bind:this={root} use:focusPicker>
  <div class="dialog-top"><div><span class="eyebrow">TAUT / EMOJI</span><h2>{mode==='compose'?'Insert emoji':'React to message'}</h2></div><button type="button" aria-label="Close emoji picker" disabled={busy} onclick={onClose}>×</button></div>
  <p>{mode==='compose'?'Insert into your draft at the cursor.':'Choose an emoji to add a reaction in Teams.'}</p>
  <div class="emoji-search"><input type="search" aria-label="Search emoji" placeholder="Search emoji…" bind:value={query} disabled={busy}/><select aria-label="Emoji category" bind:value={category} disabled={busy}>{#each categories as name}<option>{name}</option>{/each}</select></div>
  {#if error}<p class="emoji-error" role="alert">{error}</p>{/if}
  {#if uncertain}<p>Refresh reaction status before another attempt. Nothing is repeated automatically.</p><button class="outline-button" type="button" data-check disabled={busy} onclick={onCheck}>Refresh reaction status</button>{/if}
  <div class="emoji-grid" role="group" aria-label="Emoji choices">{#each results as item (item.emoji)}<button type="button" class="emoji-option" title={item.name} aria-label={`${item.name} ${item.emoji}`} disabled={busy||uncertain} onclick={()=>onChoose(item.emoji)}>{item.emoji}</button>{/each}</div>
  {#if !results.length}<p>No matching emoji. Try another search.</p>{/if}
  {#if busy}<p role="status">Updating reaction…</p>{/if}
 </div>
</div>
