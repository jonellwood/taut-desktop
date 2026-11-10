<script lang="ts">
 import {tick} from 'svelte';
 import {formattingPreference,toggleFormatting} from './formatting-preference.svelte';
 import MessageBody from './MessageBody.svelte';
 import {composeLanguages,formatDraft,messageSizeError,changeCodeLanguage,currentCodeLanguage} from './compose-format';
 let {showSizeWarning=true,text,formatted=false,input,disabled=false,onText,onFormat}:{showSizeWarning?:boolean;text:string;formatted?:boolean;input?:HTMLTextAreaElement;disabled?:boolean;onText:(text:string)=>void;onFormat:(value:boolean)=>void}=$props();
 let language=$state('powershell'),preview=$state(false);
 $effect(()=>{
  const source=text,node=input;if(!node||!formatted)return;
  const sync=()=>{const value=currentCodeLanguage(source,node.selectionStart,node.selectionEnd);if(value)language=value;};
  sync();for(const name of ['select','click','keyup'])node.addEventListener(name,sync);
  return ()=>{for(const name of ['select','click','keyup'])node.removeEventListener(name,sync);};
 });
 const sizeError=$derived(messageSizeError(text,formatted));
 function setLanguage(value:string){
  language=value;if(disabled||!input)return;
  const edit=changeCodeLanguage(text,input.selectionStart,input.selectionEnd,value);
  if(edit){onText(edit.text);void tick().then(()=>{input?.focus();input?.setSelectionRange(edit.start,edit.end);});}
 }

 async function insert(kind:string){
  if(disabled||!input)return;
  onFormat(true);
  await tick();
  if(kind==='code'&&changeCodeLanguage(text,input.selectionStart,input.selectionEnd,language)){setLanguage(language);return;}
  const start=input.selectionStart,end=input.selectionEnd,selected=text.slice(start,end);let value='',offset=0,selectionLength=selected.length;
  if(kind==='bold'){value=`**${selected||'bold text'}**`;offset=2;}
  if(kind==='inline'){value='`'+(selected||'code')+'`';offset=1;}
  if(kind==='link'){value=`[${selected||'link text'}](https://example.com)`;offset=1;}
  if(kind==='list'){const prefix=start&&text[start-1]!=='\n'?'\n':'';value=prefix+(selected||'List item').split('\n').map(s=>'- '+s).join('\n');offset=prefix.length+2;selectionLength=selected?value.length-offset:'List item'.length;}
  if(kind==='code'){value=(start&&text[start-1]!=='\n'?'\n':'')+'```'+language+'\n'+selected+'\n```\n';offset=value.indexOf('\n')+1;}
  onText(text.slice(0,start)+value+text.slice(end));
  void tick().then(()=>{input?.focus();input?.setSelectionRange(start+offset,start+offset+selectionLength);});
 }
</script>
<div class="formatting" aria-label="Message formatting">
 <button type="button" class:active={formattingPreference.visible} aria-pressed={formattingPreference.visible} disabled={disabled} onclick={()=>{toggleFormatting();if(formattingPreference.visible)onFormat(true);preview=false;}}>Format</button>
 {#if formattingPreference.visible}
  <button type="button" title="Bold selection" aria-label="Bold" disabled={disabled} onclick={()=>insert('bold')}><strong>B</strong></button>
  <button type="button" title="Inline code" disabled={disabled} onclick={()=>insert('inline')}>`code`</button>
  <button type="button" disabled={disabled} onclick={()=>insert('list')}>List</button>
  <button type="button" disabled={disabled} onclick={()=>insert('link')}>Link</button>
  <select aria-label="Code language" value={language} onchange={event=>setLanguage(event.currentTarget.value)} title="Language for the block at your cursor, or the next new block" disabled={disabled}>{#each composeLanguages as lang}<option value={lang}>{lang==='text'?'Plain text':lang==='powershell'?'PowerShell':lang==='php'?'PHP':lang}</option>{/each}</select>
  <button type="button" disabled={disabled} onclick={()=>insert('code')}>Code block</button>
  <button type="button" aria-pressed={preview} disabled={disabled} onclick={()=>{onFormat(true);preview=!preview;}}>{preview?'Close preview':'Preview'}</button>
  <span class="hint">Edit with **bold**, `code`, or fenced code blocks. {formatted?"Enter adds a line.":"Choose a format to enable formatted writing."}</span>
 {/if}
</div>
{#if showSizeWarning&&sizeError}<p class="size-warning" role="status">{sizeError}</p>{/if}
{#if formatted&&preview}<section class="format-preview" aria-label="Formatted message preview"><MessageBody body={{contentType:'html',content:formatDraft(text).html}} fallback="Your formatted message will appear here."/></section>{/if}
<style>
 .size-warning{font-size:11px;color:var(--accent);line-height:1.6;margin:4px 0 8px}.formatting{display:flex;align-items:center;flex-wrap:wrap;gap:5px;padding:7px 0;color:var(--text-secondary);font-size:11px}.formatting button,.formatting select{font:inherit;border:1px solid var(--border-strong);border-radius:5px;padding:5px 8px;background:var(--surface-panel);color:var(--text-primary)}.formatting button:hover,.formatting button.active{color:var(--accent);border-color:var(--accent-border)}.formatting button:disabled{opacity:.4}.hint{font-size:10px;margin-left:4px}.format-preview{background:var(--surface-panel);border:1px solid var(--border-strong);border-radius:8px;padding:14px;margin-bottom:8px;max-height:280px;overflow:auto;min-width:0;color:var(--text-primary);font-size:13px}
</style>
