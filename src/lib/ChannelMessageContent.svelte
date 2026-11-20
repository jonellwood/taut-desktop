<script lang="ts">
 import MessageBody from './MessageBody.svelte';
 import {receivedText} from './message-body';
 import {formatDraft} from './compose-format';
 import {channelText,type ChannelPost} from './teams';
 import {cardPreviews,type CardNode} from './card-preview';
 let {post}:{post:ChannelPost}=$props();
 const cards=$derived(cardPreviews(post.attachments));
 const hasCard=$derived(cards.some(c=>c.status==='ready'));
</script>
{#snippet text(value:string)}<MessageBody body={{contentType:'html',content:formatDraft(value).html}}/>{/snippet}
{#snippet nodes(items:CardNode[])}
 {#each items as node}<div class="card-item" class:separator={node.separator}>
 {#if node.kind==='text'}<div class:card-heading={node.heading} class:attention={node.attention}>{@render text(node.text)}</div>
 {:else if node.kind==='facts'}<dl>{#each node.facts as fact}<dt>{@render text(fact.title)}</dt><dd>{@render text(fact.value)}</dd>{/each}</dl>
 {:else}<div class:card-columns={node.kind==='columns'}>{@render nodes(node.children)}</div>{/if}
 </div>{/each}
{/snippet}
{#if post.deletedDateTime}<MessageBody deleted fallback="Message deleted"/>
{:else}
 {#if receivedText(post.body)||!hasCard}<div class="post-text"><MessageBody body={post.body} fallback={channelText(post)}/></div>{/if}
 {#each cards as card}
  {#if card.status==='ready'}<section class="card-preview" aria-label="Shared card preview">{@render nodes(card.nodes)}{#if card.limited}<p class="card-note">Some card elements are unavailable in this preview. Use Teams for interactive controls and images.</p>{/if}</section>
  {:else}<p class="card-note">{card.name} · {card.status==='invalid'?'Card preview unavailable':'Preview unavailable'}</p>{/if}
 {/each}
 {#if (post.attachments?.length??0)>8}<p class="card-note">Additional attachments are available in Teams.</p>{/if}
{/if}
<style>
.card-preview{margin:14px 0;padding:20px;border:1px solid var(--border-strong);border-radius:10px;background:var(--surface-raised);max-width:900px;overflow-wrap:anywhere}.card-item{min-width:0;margin:8px 0}.card-item:first-child{margin-top:0}.card-heading{font-weight:700;font-size:17px}.attention{color:var(--error)}.separator{border-top:1px solid var(--border);padding-top:12px;margin-top:14px}.card-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr));gap:18px}.card-note{font-size:12px;color:var(--text-secondary);line-height:1.6;margin:12px 0 0}dl{display:grid;grid-template-columns:minmax(100px,1fr) minmax(100px,2fr);gap:10px 20px}dt{font-weight:600}dd{margin:0;min-width:0}.post-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.8;color:var(--text-primary);margin:14px 0}
</style>
