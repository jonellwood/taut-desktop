<script lang="ts">
 import FormattingToolbar from './FormattingToolbar.svelte';
 import {continueList} from './continue-list';
 let input=$state<HTMLTextAreaElement>();
 let {formatted=false,onFormat,label,text,error,uncertain,disabled,onText,onSend,onRefresh,onAcknowledge}:{formatted?:boolean;onFormat:(value:boolean)=>void;label:string;text:string;error:string;uncertain:boolean;disabled:boolean;onText:(text:string)=>void;onSend:()=>void;onRefresh:()=>void;onAcknowledge:()=>void}=$props();
</script>
<form class="channel-composer" aria-label={label} onsubmit={event=>{event.preventDefault();onSend();}}>
 <FormattingToolbar {text} {formatted} {input} {disabled} {onText} {onFormat}/>
 <label>{label}<textarea use:continueList={{formatted,onText}} bind:this={input} aria-label={label} value={text} rows="3" disabled={disabled} oninput={event=>onText(event.currentTarget.value)} placeholder={label==='New channel post'?'Start a conversation…':'Reply to this post…'}></textarea></label>
 {#if error}<p role="alert">{error}</p>{/if}
 {#if uncertain}<button type="button" disabled={disabled} onclick={onRefresh}>Refresh messages</button><button type="button" disabled={disabled} onclick={onAcknowledge}>I checked Teams — enable retry</button>{/if}
 <button type="submit" disabled={disabled||uncertain||!text.trim()}>{label==='New channel post'?'Post to channel':'Send channel reply'}</button>
</form>
<style>
 .channel-composer{border:1px solid var(--border-strong);border-radius:9px;padding:13px;margin:0 0 20px;background:var(--surface-panel);font-size:11px;color:var(--text-secondary);flex:none}.channel-composer textarea{display:block;box-sizing:border-box;width:100%;min-height:78px;max-height:28vh;resize:vertical;margin:9px 0;background:var(--surface-base);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:7px;padding:10px;font:inherit;font-size:13px;line-height:1.6}.channel-composer button{padding:8px 10px;color:var(--accent);border:1px solid var(--accent-border);border-radius:6px;margin:4px 6px 0 0}.channel-composer p{color:var(--error);line-height:1.6;overflow-wrap:anywhere}
</style>
