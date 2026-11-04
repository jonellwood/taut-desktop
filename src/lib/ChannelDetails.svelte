<script lang="ts">
 import {onDestroy} from 'svelte';
 import {invoke} from '@tauri-apps/api/core';
 import {X,Users,Hash,Building2,History} from 'lucide-svelte';
 import {activityLabel,postTime,memberRoles,type Team,type Channel,type ChannelMember,type ChannelPost,type TeamPage} from './teams';
 let {team,channel,permitted,ownId,activity,historyBusy,historyMore,historyError,onMoreHistory,onClose}:
 {team:Team|null;channel:Channel|null;permitted:boolean;ownId:string;activity:ChannelPost[];historyBusy:boolean;historyMore:boolean;historyError:string;onMoreHistory:()=>void;onClose:()=>void}=$props();
 let rows=$state<ChannelMember[]>([]);let next=$state<string|null>(null);let busy=$state(false);let error=$state('');let loaded=$state(false);
 let alive=true;let version=0;let started=false;let seen=new Set<string>();
 onDestroy(()=>{alive=false;version++;});
 $effect(()=>{if(permitted&&channel?.hostTeamId&&!started){started=true;void load();}});
 async function load(more=false){
   if(busy||!permitted||!channel?.hostTeamId)return;
   const continuation=more?next:null;if(more&&!continuation)return;
   const current=++version;const target=channel;busy=true;error='';
   if(!more){rows=[];seen=new Set();next=null;loaded=false;}
   if(continuation&&seen.has(continuation)){error='Member pagination repeated. Refresh members to continue.';next=null;busy=false;return;}
   try{
     const page=await invoke<TeamPage<ChannelMember>>('graph_teams_page',{query:{collection:'members',teamId:target.hostTeamId,channelId:target.id,next:continuation}});
     if(!alive||current!==version)return;
     if(continuation)seen.add(continuation);
     rows=[...new Map((more?[...rows,...page.value]:page.value).filter(row=>row?.id).map(row=>[row.id,row])).values()];loaded=true;
     if(page.next&&(seen.has(page.next)||seen.size>=100)){error='Member pagination stopped at a repeated page or safety limit. Refresh members to continue.';next=null;}else next=page.next??null;
   }catch(e){if(alive&&current===version)error=String(e);}
   finally{if(alive&&current===version)busy=false;}
 }
</script>
<aside class="channel-details" aria-label="Channel details">
 <header><div><span class="eyebrow">{channel?'CHANNEL DETAILS':'TEAM DETAILS'}</span><h2>{channel?.displayName??team?.displayName??'Teams & channels'}</h2></div><button type="button" aria-label="Close channel details" title="Hide details panel" onclick={onClose}><X size={18}/></button></header>
 <div class="details-scroll">
  <section class="channel-summary"><div class="detail-heading"><Building2 size={15}/>{team?.displayName??'Choose a team'}</div>
   {#if channel}<p class="channel-kind"><Hash size={14}/>{channel.membershipType??'Channel'}{channel.isArchived||team?.isArchived?' · Archived':''}</p>{/if}
   <p>{channel?.description||team?.description||(channel?'No channel description provided.':'Choose a channel to see its members and history.')}</p>
  </section>
  {#if channel}
   <section aria-label="Channel members"><div class="detail-heading"><Users size={15}/>MEMBERS{#if loaded}<span>{rows.length}{next?' +':''}</span>{/if}</div>
    {#if !permitted}<p>Member lists need delegated ChannelMember.Read.All consent and a fresh sign-in.</p>
    {:else}<button class="detail-button" type="button" disabled={busy} onclick={()=>load()}>Refresh members</button>
     {#if busy}<p role="status">Loading channel members…</p>{/if}
     {#if error}<p class="detail-error" role="alert">{error}</p>{/if}
     {#if loaded}<p class="member-note">{rows.length} loaded membership {rows.length===1?'record':'records'}{next?' · more available':''}. Roles and access are reported by Microsoft 365.</p>{/if}
     {#each rows as member(member.id)}<div class="channel-member"><strong>{member.displayName||'Participant unavailable'}{#if member.userId===ownId} (You){/if}</strong><small>{memberRoles(member)}{member['@microsoft.graph.originalSourceMembershipUrl']?' · Inherited access':''}</small></div>{/each}
     {#if loaded&&!rows.length&&!error&&!busy}<p>No membership records were returned.</p>{/if}
     {#if next}<button class="detail-button" type="button" disabled={busy} onclick={()=>load(true)}>Load more members</button>{/if}
    {/if}
   </section>
   <section aria-label="Channel history"><div class="detail-heading"><History size={15}/>HISTORY</div>
    <p>Activity from loaded channel history. This is not a complete audit log.</p>
    {#each activity as event(event.id)}<div class="history-event"><strong>{activityLabel(event)}</strong><time datetime={event.createdDateTime}>{postTime(event)}</time></div>{/each}
    {#if !activity.length}<p>{historyBusy?'Loading channel history…':'No activity events in loaded history.'}</p>{/if}
    {#if historyError}<p class="detail-error" role="alert">{historyError}</p>{/if}
    {#if historyMore}<button class="detail-button" disabled={historyBusy} onclick={onMoreHistory}>Load more channel history</button>{/if}
   </section>
  {/if}
 </div>
</aside>
<style>
 .channel-details{width:340px;max-width:42%;min-width:270px;flex:none;display:flex;flex-direction:column;min-height:0;background:#142029;border-left:1px solid #3a4a55}.channel-details header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:22px;border-bottom:1px solid #2f414b}.channel-details h2{font-size:18px;overflow-wrap:anywhere;margin:9px 0 0}.channel-details header button{color:#9aadb9;padding:7px;border-radius:6px}.channel-details header button:hover{background:#30414c;color:var(--accent)}.details-scroll{overflow:auto;flex:1;min-height:0}.channel-details section{padding:20px 22px;border-bottom:1px solid #2f414b}.channel-details p{font-size:12px;color:#91a7b5;line-height:1.8;overflow-wrap:anywhere;margin:13px 0}.detail-heading{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:1px;color:#b9c8d1;font-weight:650;overflow-wrap:anywhere}.detail-heading span{margin-left:auto}.channel-kind{display:flex;gap:7px;align-items:center;text-transform:capitalize}.detail-button{color:var(--accent);border:1px solid #4b606d;padding:8px 10px;border-radius:6px;font-size:11px;margin-top:12px}.channel-member{padding:14px 0;border-bottom:1px solid #2d404b;overflow-wrap:anywhere}.channel-member strong{font-size:12px;font-weight:600;color:#d7e0e5}.channel-member small{display:block;color:#8fa7b5;font-size:10px;margin-top:7px}.channel-details p.member-note{font-size:10px}.channel-details p.detail-error{color:#ffb5a9}.history-event{padding:12px 0;border-bottom:1px solid #2d404b;display:flex;flex-direction:column;gap:6px}.history-event strong{font-size:11px;color:#c3d0d9;font-weight:500}.history-event time{font-size:10px;color:#829aaa}
 @media(max-width:1100px){.channel-details{position:absolute;right:0;top:0;bottom:0;z-index:5;width:min(340px,calc(100% - 25px));max-width:none;min-width:0;box-shadow:-20px 0 40px #0005}}
</style>
