<script lang="ts">
 import {openUrl} from '@tauri-apps/plugin-opener';
 import ReceivedCode from './ReceivedCode.svelte';
 import {parseMessageBody,safeMessageLink,type BodyNode,type ReceivedBody} from './message-body';
 let {body,fallback='',deleted=false}:{body?:ReceivedBody;fallback?:string;deleted?:boolean}=$props();
 let content=$derived(body?.content);let contentType=$derived(body?.contentType);
 let nodes=$derived.by(()=>{if(deleted)return [];const parsed=parseMessageBody(content===undefined?undefined:{content,contentType},fallback);return parsed.length?parsed:[{kind:'text' as const,text:fallback}];});
 let linkError=$state('');
 async function openLink(url:string){if(!safeMessageLink(url))return;linkError='';try{await openUrl(url);}catch{linkError='The link could not be opened.';}}
</script>
{#snippet render(parts:BodyNode[])}
 {#each parts as part}
  {#if part.kind==='text'}<span class="received-text">{part.text}</span>
  {:else if part.kind==='br'}<br/>
  {:else if part.kind==='code'}<ReceivedCode text={part.text} language={part.language}/>
  {:else if part.kind==='link'}<button class="received-link" type="button" title={part.url} onclick={()=>openLink(part.url)}>{@render render(part.children)}</button>
  {:else if part.tag==='ol'}<ol start={part.start}>{@render render(part.children)}</ol>
  {:else}<svelte:element this={part.tag}>{@render render(part.children)}</svelte:element>{/if}
 {/each}
{/snippet}
<div class="received-body" class:deleted>{#if deleted}Message deleted{:else}{@render render(nodes)}{/if}</div>
{#if linkError}<small role="alert">{linkError}</small>{/if}
<style>
 .received-body{min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;line-height:1.65}.received-body.deleted{font-style:italic;color:#8fa2af}.received-text{white-space:pre-wrap}.received-body :global(p){margin:0 0 9px}.received-body :global(p:last-child){margin-bottom:0}.received-body :global(ul),.received-body :global(ol){padding-left:24px;margin:8px 0}.received-body :global(li){margin:3px 0}.received-body :global(blockquote){border-left:2px solid #b29565;margin:10px 0;padding:4px 12px;color:#b0c2cc}.received-body :global(code:not(pre code)){font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.95em;background:#0e191f99;padding:1px 4px;border-radius:4px}.received-body :global(h1),.received-body :global(h2),.received-body :global(h3),.received-body :global(h4),.received-body :global(h5),.received-body :global(h6){font-size:1.1em;margin:8px 0;font-weight:650;letter-spacing:normal}.received-link{display:inline;padding:0;color:var(--accent);text-decoration:underline;white-space:inherit;overflow-wrap:anywhere;text-align:left}small{color:#ffb5a9;font-size:11px}
</style>
