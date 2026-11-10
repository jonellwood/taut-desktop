<script lang="ts">
 import {untrack} from 'svelte';
 import {readSignature,signatureKey} from './mail-signature';
 import MessageBody from './MessageBody.svelte';
 import {formatDraft} from './compose-format';
 let {account}:{account:string}=$props();
 let signature=$state(untrack(()=>readSignature(account))),notice=$state('');
 function save(){try{localStorage.setItem(signatureKey(account),JSON.stringify(signature));notice='Signature defaults saved. Existing drafts keep their signature.';}catch{notice='Signature could not be saved.';}}
</script>
<section class="signature-preferences" aria-label="Signature preferences">
 <h3>Signature</h3><p>Your sign-off, saved for this account on this Mac.</p>
 <label>Signature text<textarea aria-label="Saved signature" maxlength="10000" rows="5" bind:value={signature.text} placeholder="Your name, role and contact details"></textarea></label>
 <small>Supports bold, links and other message formatting.</small>
 <div class="defaults">{#each [{key:'newMail',label:'New emails'},{key:'replies',label:'Replies'},{key:'forwards',label:'Forwards'}] as item}<div class="default-row"><strong>{item.label}</strong><div class="choices" role="group" aria-label={`${item.label} signature`}><button aria-pressed={signature[item.key as 'newMail'|'replies'|'forwards']} onclick={()=>signature[item.key as 'newMail'|'replies'|'forwards']=true}>Include</button><button aria-pressed={!signature[item.key as 'newMail'|'replies'|'forwards']} onclick={()=>signature[item.key as 'newMail'|'replies'|'forwards']=false}>Omit</button></div></div>{/each}</div>
 {#if signature.text}<div class="preview" aria-label="Saved signature preview"><MessageBody body={{contentType:'html',content:formatDraft(signature.text).html}}/></div>{/if}
 <button onclick={save}>Save signature defaults</button><p role="status">{notice}</p>
</section>
<style>
.signature-preferences{border-top:1px solid var(--border);margin-top:24px;padding-top:24px}.signature-preferences h3{margin:0 0 8px}.signature-preferences p,.signature-preferences small{color:var(--text-secondary)}label{display:grid;gap:10px}textarea{box-sizing:border-box;width:100%;padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--surface-panel);color:var(--text-primary);font:inherit;resize:vertical}.defaults{margin:20px 0}.default-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--border)}.choices{display:flex;gap:4px}button{font:inherit;color:var(--text-primary);background:transparent;border:1px solid var(--border);border-radius:8px;padding:8px 14px;cursor:pointer}button[aria-pressed="true"]{background:var(--accent);color:var(--text-on-accent);border-color:var(--accent)}.preview{padding:12px 16px;border-left:3px solid var(--accent);margin:16px 0}
</style>
