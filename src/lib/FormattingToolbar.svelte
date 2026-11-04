<script lang="ts">
 import {tick} from 'svelte';
 import MessageBody from './MessageBody.svelte';
 import {composeLanguages,formatDraft} from './compose-format';
 let {text,formatted=false,input,disabled=false,onText,onFormat}:{text:string;formatted?:boolean;input?:HTMLTextAreaElement;disabled?:boolean;onText:(text:string)=>void;onFormat:(value:boolean)=>void}=$props();
 let language=$state('powershell'),preview=$state(false);
 function insert(kind:string){
  if(disabled||!input)return;const start=input.selectionStart,end=input.selectionEnd,selected=text.slice(start,end);let value='',offset=0,selectionLength=selected.length;
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
 <button type="button" class:active={formatted} aria-pressed={formatted} disabled={disabled} onclick={()=>{onFormat(!formatted);preview=false;}}>Format</button>
 {#if formatted}
  <button type="button" title="Bold selection" aria-label="Bold" disabled={disabled} onclick={()=>insert('bold')}><strong>B</strong></button>
  <button type="button" title="Inline code" disabled={disabled} onclick={()=>insert('inline')}>`code`</button>
  <button type="button" disabled={disabled} onclick={()=>insert('list')}>List</button>
  <button type="button" disabled={disabled} onclick={()=>insert('link')}>Link</button>
  <select aria-label="Code language" bind:value={language} disabled={disabled}>{#each composeLanguages as lang}<option value={lang}>{lang==='text'?'Plain text':lang==='powershell'?'PowerShell':lang==='php'?'PHP':lang}</option>{/each}</select>
  <button type="button" disabled={disabled} onclick={()=>insert('code')}>Code block</button>
  <button type="button" aria-pressed={preview} disabled={disabled} onclick={()=>preview=!preview}>{preview?'Close preview':'Preview'}</button>
  <span class="hint">Edit with **bold**, `code`, or fenced code blocks. Enter adds a line.</span>
 {/if}
</div>
{#if formatted&&preview}<section class="format-preview" aria-label="Formatted message preview"><MessageBody body={{contentType:'html',content:formatDraft(text).html}} fallback="Your formatted message will appear here."/></section>{/if}
<style>
 .formatting{display:flex;align-items:center;flex-wrap:wrap;gap:5px;padding:7px 0;color:#9cafbb;font-size:11px}.formatting button,.formatting select{font:inherit;border:1px solid #455762;border-radius:5px;padding:5px 8px;background:#17242c;color:#c5d1d9}.formatting button:hover,.formatting button.active{color:var(--accent);border-color:#b48b4d}.formatting button:disabled{opacity:.4}.hint{font-size:10px;margin-left:4px}.format-preview{background:#101b22;border:1px solid #51606b;border-radius:8px;padding:14px;margin-bottom:8px;max-height:280px;overflow:auto;min-width:0;color:#d7e1e7;font-size:13px}
</style>
