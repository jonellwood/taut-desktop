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
   const grid=node.querySelector<HTMLElement>('.emoji-grid');const columns=grid?getComputedStyle(grid).gridTemplateColumns.split(' ').length:8;
   const offset=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:event.key==='ArrowDown'?columns:-columns;
   event.preventDefault();items[Math.max(0,Math.min(items.length-1,index+offset))]?.focus();
  }
 }
</script>
<svelte:window onkeydown={keys}/>
<div class="overlay" role="presentation" onclick={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
 <div class="emoji-dialog" role="dialog" aria-modal="true" aria-label={mode==='compose'?'Insert emoji':'React to message'} tabindex="-1" bind:this={root} use:focusPicker>
  <div class="dialog-top"><div><span class="eyebrow">TAUT / EMOJI</span><h2>{mode==='compose'?'Insert emoji':'React to message'}</h2></div><button type="button" aria-label="Close emoji picker" disabled={busy} onclick={onClose}>×</button></div>
  <div class="picker-content">
  <p>{mode==='compose'?'Insert into your draft at the cursor.':'Choose an emoji to add a reaction in Teams.'}</p>
  <div class="emoji-search"><input type="search" aria-label="Search emoji" placeholder="Search emoji…" bind:value={query} disabled={busy}/><select aria-label="Emoji category" bind:value={category} disabled={busy}>{#each categories as name}<option>{name}</option>{/each}</select></div>
  {#if error}<p class="emoji-error" role="alert">{error}</p>{/if}
  {#if uncertain}<p>Refresh reaction status before another attempt. Nothing is repeated automatically.</p><button class="outline-button" type="button" data-check disabled={busy} onclick={onCheck}>Refresh reaction status</button>{/if}
  <div class="emoji-grid" role="group" aria-label="Emoji choices">{#each results as item (item.emoji)}<button type="button" class="emoji-option" title={item.name} aria-label={`${item.name} ${item.emoji}`} disabled={busy||uncertain} onclick={()=>onChoose(item.emoji)}>{item.emoji}</button>{/each}</div>
  {#if !results.length}<p>No matching emoji. Try another search.</p>{/if}
  {#if busy}<p role="status">Updating reaction…</p>{/if}
  </div>
 </div>
</div>

<style>
.overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;overflow:hidden}
.emoji-dialog{box-sizing:border-box;width:480px;max-width:100%;height:auto;min-height:0;max-height:calc(100dvh - 32px);margin:0;display:flex;flex-direction:column;overflow:hidden;background:var(--surface-panel);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:14px;box-shadow:0 24px 80px #0006}
.dialog-top{flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px;border-bottom:1px solid var(--border)}.dialog-top h2{font-size:20px;margin:8px 0 0}.dialog-top button{flex:none;width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--border);border-radius:8px;font-size:22px;color:var(--text-secondary)}.dialog-top button:hover{background:var(--surface-hover);color:var(--text-primary)}
.picker-content{min-height:0;overflow:auto;padding:18px 20px 20px;overscroll-behavior:contain}.picker-content>p{margin:0 0 16px;font-size:12px;line-height:1.6;color:var(--text-secondary)}.emoji-search{display:flex;gap:8px;margin-bottom:16px}.emoji-search input,.emoji-search select{font:inherit;font-size:13px;min-width:0;padding:10px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface-base);color:var(--text-primary)}.emoji-search input{flex:1;width:0}.emoji-search select{flex:0 1 135px;max-width:42%}
.emoji-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:6px;max-height:min(320px,45dvh);min-height:0;overflow:auto;overscroll-behavior:contain;padding:4px}.emoji-option{min-width:0;min-height:44px;display:grid;place-items:center;padding:6px;font-size:23px;line-height:1;border:1px solid var(--border);border-radius:8px;background:var(--surface-raised)}.emoji-option:hover{background:var(--accent-soft);border-color:var(--accent)}.picker-content .emoji-error{color:var(--error)}.outline-button{padding:8px 12px;margin-bottom:12px;border:1px solid var(--border-strong);border-radius:7px}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(max-width:400px){.dialog-top{padding:16px}.picker-content{padding:14px 16px 16px}.emoji-search{flex-wrap:wrap}.emoji-search input{flex-basis:100%;width:100%}.emoji-search select{max-width:100%;flex-basis:100%}}
</style>
