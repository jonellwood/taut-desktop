<script lang="ts">
 import type { Message } from './types';
 import {collectSharedMedia} from './shared-media';
 let {messages,onImage,onFile,onLink}:{messages:Message[];onImage:(messageId:string,imageId:string)=>Promise<void>;onFile:(url:string)=>void;onLink:(url:string)=>void}=$props();
 let media=$derived(collectSharedMedia(messages));
 let tab=$state<'images'|'files'|'links'>('images');
 let limit=$state(12);let busy=$state('');let error=$state('');
 let items=$derived(media[tab]);
 async function view(messageId:string,imageId:string,key:string){busy=key;error='';try{await onImage(messageId,imageId);}catch{error='Image could not be loaded. Select it to try again.';}finally{busy='';}}
</script>
<section class="shared-media detail-section" aria-label="Shared media">
 <div class="detail-heading">SHARED MEDIA <span>{media.images.length+media.files.length+media.links.length}</span></div>
 <p>From loaded chat history</p>
 <div class="media-tabs" aria-label="Media categories">{#each ['images','files','links'] as category}<button aria-pressed={tab===category} onclick={()=>{tab=category as typeof tab;limit=12;error='';}}>{category[0].toUpperCase()+category.slice(1)} ({media[category as typeof tab].length})</button>{/each}</div>
 <div class="media-list">
 {#each items.slice(0,limit) as item (item.key)}
  <button class="shared-item" disabled={busy===item.key} onclick={()=>item.imageId?view(item.messageId,item.imageId,item.key):tab==='files'?onFile(item.url!):onLink(item.url!)} title={item.url??item.name}>
   <span>{busy===item.key?'Loading image…':item.name}</span><small>{item.time}</small>{#if item.url}<small>{new URL(item.url).hostname}</small>{/if}
  </button>
 {:else}<p>No {tab} in loaded history.</p>{/each}
 </div>
 {#if items.length>limit}<button class="more-media" onclick={()=>limit+=12}>Show more {tab}</button>{/if}
 {#if error}<p role="alert">{error}</p>{/if}
</section>
<style>
 .media-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:12px 0}.media-tabs button{font-size:11px;padding:6px;border:1px solid #40515c;border-radius:6px;color:#aabac4}.media-tabs button[aria-pressed=true]{color:var(--accent);border-color:var(--accent);background:#efbb7010}.media-list{max-height:320px;overflow:auto}.shared-item{display:flex;flex-direction:column;gap:5px;text-align:left;width:100%;padding:12px 8px;border-bottom:1px solid #34434d;overflow-wrap:anywhere}.shared-item:hover{background:#ffffff05}.shared-item span{font-size:12px;color:#e0e8ed}.shared-item small{font-size:10px;color:#8fa3af}.more-media{color:var(--accent);font-size:11px;padding-top:12px}
</style>
