<script lang="ts">
 import {onMount} from 'svelte';
 import {openUrl} from '@tauri-apps/plugin-opener';
 import {mailText,type MailMessage} from './mail';
 import {safeMessageLink} from './message-body';
 import {renderMailHtml,mailHtmlDocument} from './mail-html';
 let {message,defaultPresentation="html"}:{message:MailMessage;defaultPresentation?:"html"|"plain"}=$props();
 let plain=$state(false),revision=$state(0),linkTarget=$state(''),error=$state('');
 $effect(()=>{message.id;plain=defaultPresentation==='plain';});
 const isHtml=$derived(message.body?.contentType?.toLowerCase()==='html');
 const rendered=$derived(isHtml?renderMailHtml(message.body?.content??''):null);
 const doc=$derived.by(()=>{revision;const theme=getComputedStyle(document.documentElement);return rendered?mailHtmlDocument(rendered.html,{text:theme.getPropertyValue('--text-primary').trim(),background:theme.getPropertyValue('--surface-raised').trim(),border:theme.getPropertyValue('--border-strong').trim(),accent:theme.getPropertyValue('--accent').trim()}):'';});
 onMount(()=>{const observer=new MutationObserver(()=>revision++);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-contrast','data-accent','style','class']});return ()=>observer.disconnect();});
 async function openLink(){const url=safeMessageLink(linkTarget);if(!url)return;try{await openUrl(url);linkTarget='';}catch{error='The link could not be opened.';}}
</script>
{#if isHtml&&rendered?.hasContent}<div class="mail-format" role="group" aria-label="Email presentation"><button aria-pressed={!plain} onclick={()=>plain=false}>HTML</button><button aria-pressed={plain} onclick={()=>plain=true}>Plain text</button><small>Images blocked · numbered links available below</small></div>{/if}
{#if rendered&&!rendered.hasContent}<p class="empty-body">This email has no readable message body. Open in Outlook for meeting or other message details.</p>
{:else if rendered&&!plain}
 <iframe title="Formatted email" sandbox="" referrerpolicy="no-referrer" srcdoc={doc}></iframe>
 {#if rendered.images}<p class="note">{rendered.images} blocked {rendered.images===1?'image':'images'}. Use the attachment controls below to preview inline files.</p>{/if}
 {#if rendered.shortened}<p class="note">Long or deeply nested content was shortened. Open in Outlook for the original.</p>{/if}
 {#if rendered.links.length}<details><summary>Email links ({rendered.links.length})</summary>{#each rendered.links as url,index}<button class="link" onclick={()=>{linkTarget=url;error='';}}><span>[{index+1}]</span> {url}</button>{/each}</details>{/if}
{:else}<div class="mail-body">{mailText(message)||'This message has no readable text. Open it in Outlook for the original presentation.'}</div>{/if}
{#if linkTarget}<div class="link-review" role="group" aria-label="Review email link"><strong>Open this destination in your browser?</strong><p>{linkTarget}</p><button onclick={openLink}>Open link</button><button onclick={()=>linkTarget=''}>Cancel</button>{#if error}<p role="alert">{error}</p>{/if}</div>{/if}
<style>
.empty-body{font-size:13px;color:var(--text-secondary);line-height:1.7;margin:12px 0}.mail-format{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}button{padding:7px 10px;border:1px solid var(--border);border-radius:6px;color:var(--accent)}button[aria-pressed=true]{background:var(--accent)!important;color:var(--text-on-accent)!important;border-color:var(--accent)!important;font-weight:750;box-shadow:0 0 0 1px var(--accent)}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}small,.note{font-size:11px;color:var(--text-secondary);line-height:1.6}iframe{display:block;width:100%;height:clamp(260px,48vh,650px);border:1px solid var(--border);border-radius:8px;background:var(--surface-raised)}.mail-body{font-size:14px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;padding:12px 0 20px}details{margin:12px 0;font-size:12px}summary{cursor:pointer;color:var(--accent)}.link{display:block;text-align:left;width:100%;margin:6px 0;overflow-wrap:anywhere}.link-review{border:1px solid var(--accent-border);padding:14px;border-radius:8px;margin:12px 0;font-size:12px}.link-review p{overflow-wrap:anywhere}.link-review button{margin-right:8px}
</style>
