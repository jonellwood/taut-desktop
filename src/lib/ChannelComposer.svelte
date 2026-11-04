<script lang="ts">
 let {label,text,error,uncertain,disabled,onText,onSend,onRefresh,onAcknowledge}:{label:string;text:string;error:string;uncertain:boolean;disabled:boolean;onText:(text:string)=>void;onSend:()=>void;onRefresh:()=>void;onAcknowledge:()=>void}=$props();
</script>
<form class="channel-composer" aria-label={label} onsubmit={event=>{event.preventDefault();onSend();}}>
 <label>{label}<textarea aria-label={label} value={text} maxlength="4000" rows="3" disabled={disabled} oninput={event=>onText(event.currentTarget.value)} placeholder={label==='New channel post'?'Start a conversation…':'Reply to this post…'}></textarea></label>
 {#if error}<p role="alert">{error}</p>{/if}
 {#if uncertain}<button type="button" disabled={disabled} onclick={onRefresh}>Refresh messages</button><button type="button" disabled={disabled} onclick={onAcknowledge}>I checked Teams — enable retry</button>{/if}
 <button type="submit" disabled={disabled||uncertain||!text.trim()}>{label==='New channel post'?'Post to channel':'Send channel reply'}</button>
</form>
<style>
 .channel-composer{border:1px solid #405762;border-radius:9px;padding:13px;margin:0 0 20px;background:#17242c;font-size:11px;color:#a5bac7;flex:none}.channel-composer textarea{display:block;box-sizing:border-box;width:100%;min-height:78px;max-height:28vh;resize:vertical;margin:9px 0;background:#0e191f;color:#e0e8ec;border:1px solid #435a66;border-radius:7px;padding:10px;font:inherit;font-size:13px;line-height:1.6}.channel-composer button{padding:8px 10px;color:var(--accent);border:1px solid #756445;border-radius:6px;margin:4px 6px 0 0}.channel-composer p{color:#ffb5a9;line-height:1.6;overflow-wrap:anywhere}
</style>
