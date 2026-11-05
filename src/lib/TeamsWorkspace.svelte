<script lang="ts">
 import MessageBody from './MessageBody.svelte';
 import ChannelDetails from './ChannelDetails.svelte';
 import {formatDraft,messageSizeError} from './compose-format';
 import ChannelComposer from './ChannelComposer.svelte';
 import {channelDraftKey,type ChannelDrafts} from './teams';
 import {onDestroy} from 'svelte';
 import {invoke} from '@tauri-apps/api/core';
 import {Hash,Lock,Share2,ChevronRight,RefreshCw,Search,MessagesSquare,X,Building2} from 'lucide-svelte';
 import {mergeTeams,mergeChannels,channelText,postAuthor,postTime,isChannelActivity,activityLabel,type Team,type Channel,type ChannelPost,type TeamPage,type TeamQuery} from './teams';
 let {drafts,sendBusy,onSendBusy,isLive,ownId,sidebarOpen,detailsOpen,authBusy,onCloseDetails,onSignIn,onSignOut,onThreadOpen}:{drafts:ChannelDrafts;sendBusy:boolean;onSendBusy:(busy:boolean)=>void;isLive:boolean;ownId:string;sidebarOpen:boolean;detailsOpen:boolean;authBusy:boolean;onCloseDetails:()=>void;onSignIn:()=>void;onSignOut:()=>void;onThreadOpen:()=>void}=$props();
 type Feed<T>={rows:T[];next:string|null;seen:string[];busy:boolean;error:string};
 const feed=<T,>():Feed<T>=>({rows:[],next:null,seen:[],busy:false,error:''});
 let joined=$state(feed<Team>());let associated=$state(feed<Team>());
 let direct=$state(feed<Channel>());let shared=$state(feed<Channel>());
 let posts=$state(feed<ChannelPost>());let replies=$state(feed<ChannelPost>());
 let permissions=$state({teams:false,channels:false,messages:false,send:false,members:false});let permissionError=$state('');let checking=$state(false);
 let selectedTeam=$state<Team|null>(null);let selectedChannel=$state<Channel|null>(null);let selectedPost=$state<ChannelPost|null>(null);
 let conversationPosts=$derived(posts.rows.filter(post=>!isChannelActivity(post)));
 let channelEvents=$derived(posts.rows.filter(isChannelActivity));
 let threadReplies=$derived(replies.rows.filter(post=>!isChannelActivity(post)));
 let threadEvents=$derived(replies.rows.filter(isChannelActivity));
 let filter=$state('');let booted=false;let alive=true;let teamVersion=0;let channelVersion=0;let postVersion=0;let replyVersion=0;
 let teams=$derived(mergeTeams([associated.rows,joined.rows]));let channels=$derived(mergeChannels([shared.rows,direct.rows]));
 let visibleTeams=$derived(teams.filter(t=>(t.displayName??'').toLowerCase().includes(filter.toLowerCase())||t.id===selectedTeam?.id));
 let visibleChannels=$derived(channels.filter(c=>(c.displayName??'').toLowerCase().includes(filter.toLowerCase())||(selectedTeam?.displayName??'').toLowerCase().includes(filter.toLowerCase())));
 onDestroy(()=>{alive=false;teamVersion++;channelVersion++;postVersion++;replyVersion++;});
 $effect(()=>{if(isLive&&ownId&&!authBusy&&!booted){booted=true;void initialize();}});

 let postKey=$derived(selectedChannel?.hostTeamId?channelDraftKey(selectedChannel.hostTeamId,selectedChannel.id,null):'');
 let replyKey=$derived(selectedChannel?.hostTeamId&&selectedPost?channelDraftKey(selectedChannel.hostTeamId,selectedChannel.id,selectedPost.id):'');
 let cannotSend=$derived(!isLive||authBusy||sendBusy||!permissions.send||!selectedChannel?.hostTeamId||!!selectedTeam?.isArchived||!!selectedChannel?.isArchived);
 function editDraft(key:string,text:string){if(key)drafts[key]={...(drafts[key]??{error:'',uncertain:false}),text};}
 function acknowledge(key:string){if(drafts[key])drafts[key]={...drafts[key],uncertain:false,error:''};}
 async function sendMessage(reply:boolean){
   if(cannotSend||!selectedChannel)return;
   const channel=selectedChannel;const root=reply?selectedPost:null;
   if(reply&&(!root||root.deletedDateTime||isChannelActivity(root)))return;
   const key=reply?replyKey:postKey;const text=(drafts[key]?.text??'').trim();
   if(!text||drafts[key]?.uncertain)return;
   const sizeError=messageSizeError(text,drafts[key]?.formatted);if(sizeError){drafts[key]={...drafts[key],error:sizeError};return;}
   if(drafts[key]?.formatted&&!formatDraft(text).visible){drafts[key]={...drafts[key],error:'Write a nonempty message before sending.'};return;}
   const target={...(drafts[key]?.formatted?{formatted:true}:{}),teamId:channel.hostTeamId!,channelId:channel.id,messageId:root?.id??null,ownId,text};
   const capturedPosts=posts,capturedReplies=replies;
   onSendBusy(true);drafts[key]={...drafts[key],error:''};
   try{
     const result=await invoke<{status:string;message?:ChannelPost;error?:string}>('graph_send_channel',{target});
     if(result.status==='sent'&&result.message?.id){
       if((drafts[key]?.text??'').trim()===text)drafts[key]={text:'',error:'',uncertain:false};
       if(alive&&selectedChannel?.id===channel.id&&selectedChannel.hostTeamId===channel.hostTeamId){
         if(root&&selectedPost?.id===root.id&&replies===capturedReplies)replies.rows=[...replies.rows.filter(m=>m.id!==result.message!.id),result.message];
         if(root&&posts===capturedPosts)posts.rows=[root,...posts.rows.filter(m=>m.id!==root.id)];
         if(!root&&posts===capturedPosts)posts.rows=[result.message,...posts.rows.filter(m=>m.id!==result.message!.id)];
       }
     }else drafts[key]={...drafts[key],error:result.error??'Delivery was not confirmed. Check Teams before retrying.',uncertain:result.status!=='rejected'};
   }catch{drafts[key]={...drafts[key],error:'Delivery was not confirmed. Check Teams before retrying. Draft saved.',uncertain:true};}
   finally{onSendBusy(false);}
 }
 async function read<T>(target:Feed<T>,query:TeamQuery,current:()=>boolean,more=false){
   if(target.busy)return;
   const next=more?target.next:null;if(more&&!next)return;
   if(next&&target.seen.includes(next)){target.error='This list repeated a page. Refresh to continue.';target.next=null;return;}
   target.busy=true;target.error='';
   try{
     const result=await invoke<TeamPage<T>>('graph_teams_page',{query:{...query,next}});
     if(!alive||!current())return;
     if(next)target.seen=[...target.seen,next];
     if(result.next&&(target.seen.includes(result.next)||target.seen.length>=100)){target.error='Pagination stopped at a repeated page or safety limit. Refresh to continue.';target.next=null;}else target.next=result.next??null;
     const combined=more?[...target.rows,...result.value]:result.value;
     target.rows=[...new Map(combined.filter((r:any)=>r?.id).map((r:any)=>[r.id,r])).values()] as T[];
   }catch(error){if(alive&&current())target.error=String(error);}
   finally{if(alive&&current())target.busy=false;}
 }
 async function initialize(){
   if(checking||authBusy||!isLive)return;checking=true;permissionError='';const version=++teamVersion;
   try{const result=await invoke<typeof permissions>('teams_permissions');if(!alive||version!==teamVersion)return;permissions=result;
     if(result.teams)await refreshTeams();
   }catch(error){if(alive)permissionError=String(error);}finally{if(alive)checking=false;}
 }
 async function refreshTeams(){
   const version=++teamVersion;selectedTeam=null;selectedChannel=null;selectedPost=null;channelVersion++;postVersion++;replyVersion++;joined=feed();associated=feed();direct=feed();shared=feed();posts=feed();replies=feed();
   await Promise.all([read(joined,{collection:'joined'},()=>version===teamVersion),read(associated,{collection:'associated'},()=>version===teamVersion)]);
 }
 async function openTeam(team:Team){
   selectedTeam=team;selectedChannel=null;selectedPost=null;const version=++channelVersion;postVersion++;replyVersion++;direct=feed();shared=feed();posts=feed();replies=feed();
   if(!permissions.channels)return;
   await Promise.all([read(direct,{collection:'channels',teamId:team.id},()=>version===channelVersion),read(shared,{collection:'shared',teamId:team.id},()=>version===channelVersion)]);
 }
 async function openChannel(channel:Channel){
   if(!channel.hostTeamId)return;
   selectedChannel=channel;selectedPost=null;const version=++postVersion;replyVersion++;posts=feed();replies=feed();
   if(permissions.messages)await read(posts,{collection:'posts',teamId:channel.hostTeamId,channelId:channel.id},()=>version===postVersion);
 }
 async function openThread(post:ChannelPost){
   selectedPost=post;onThreadOpen();const version=++replyVersion;replies=feed();
   const channel=selectedChannel;if(channel&&permissions.messages)await read(replies,{collection:'replies',teamId:channel.hostTeamId!,channelId:channel.id,messageId:post.id},()=>version===replyVersion);
 }
 function moreTeams(target:Feed<Team>,collection:'joined'|'associated'){const version=teamVersion;void read(target,{collection},()=>version===teamVersion,true);}
 function moreChannels(target:Feed<Channel>,collection:'channels'|'shared'){const version=channelVersion;if(selectedTeam)void read(target,{collection,teamId:selectedTeam.id},()=>version===channelVersion,true);}
 function morePosts(){const version=postVersion;const channel=selectedChannel;if(channel)void read(posts,{collection:'posts',teamId:channel.hostTeamId!,channelId:channel.id},()=>version===postVersion,true);}
 function moreReplies(){const version=replyVersion;const channel=selectedChannel;if(channel&&selectedPost)void read(replies,{collection:'replies',teamId:channel.hostTeamId!,channelId:channel.id,messageId:selectedPost.id},()=>version===replyVersion,true);}
</script>
<div class="teams-workspace">
 {#if sidebarOpen}<aside class="team-sidebar" aria-label="Teams and channels browser">
  <div class="team-sidebar-head"><span class="eyebrow">WORKSPACE</span><h1>Teams &amp; channels</h1><p>Your teams. Room for every thread.</p></div>
  {#if isLive}<label class="search-field"><Search size={16}/><input aria-label="Filter teams and channels" placeholder="Find a team or channel" bind:value={filter}/></label>{/if}
  <div class="team-tree">
   {#if !isLive}<p class="team-note">Sign in to browse your Microsoft 365 teams.</p><button class="team-action" disabled={authBusy} onclick={onSignIn}>Sign in to Microsoft 365</button>
   {:else if checking&&!teams.length}<p class="team-note" role="status">Loading teams…</p>
   {:else if !permissions.teams}<p class="team-note">Teams browsing needs Team.ReadBasic.All. After consent, sign in again.</p>{/if}
   {#if permissionError}<p class="team-error" role="alert">{permissionError}</p>{/if}
   {#each [joined,associated] as source,i}
    {#if source.error}<div class="team-error" role="alert">{i===0?'Joined teams':'Shared-team discovery'}: {source.error}</div>{/if}
   {/each}
   {#if permissions.teams&&!checking&&!joined.busy&&!associated.busy&&!teams.length&&!joined.error&&!associated.error}<p class="team-note">No teams found for this account.</p>{/if}
   {#each visibleTeams as team (team.id)}<div class="team-node">
    <button class="team-toggle" class:chosen={team.id===selectedTeam?.id} aria-expanded={team.id===selectedTeam?.id} aria-label={`Browse team ${team.displayName??'Unnamed team'}`} onclick={()=>openTeam(team)}><ChevronRight size={15} class={team.id===selectedTeam?.id?'turned':''}/><span>{team.displayName??'Unnamed team'}{#if team.isArchived}<small>Archived</small>{/if}</span></button>
    {#if selectedTeam?.id===team.id}
     {#if !permissions.channels}<p class="team-note">Channel.ReadBasic.All consent and a fresh sign-in are needed to list channels.</p>{/if}
     {#if direct.busy||shared.busy}<p class="team-note" role="status">Loading channels…</p>{/if}
     {#each [direct,shared] as source,i}{#if source.error}<p class="team-error" role="alert">{i===0?'Team channels':'Shared channels'}: {source.error}</p>{/if}{/each}
     {#each visibleChannels as channel (channel.id)}<button class="channel-link" class:chosen={selectedChannel?.id===channel.id} aria-label={`Open channel ${channel.displayName??'Unnamed channel'}`} aria-current={selectedChannel?.id===channel.id?'page':undefined} disabled={!channel.hostTeamId} title={channel.hostTeamId?channel.description:'Channel host identity is unavailable. Use Teams to open this channel.'} onclick={()=>openChannel(channel)}>{#if channel.membershipType==='private'}<Lock size={14}/>{:else if channel.membershipType==='shared'}<Share2 size={14}/>{:else}<Hash size={14}/>{/if}<span>{channel.displayName??'Unnamed channel'}<small>{channel.membershipType??'standard'}{channel.isArchived?' · archived':''}{!channel.hostTeamId?' · unavailable':''}</small></span></button>{/each}
     {#if permissions.channels&&!direct.busy&&!shared.busy&&!channels.length&&!direct.error&&!shared.error}<p class="team-note">No accessible channels.</p>{/if}
     {#if direct.next}<button class="team-more" disabled={direct.busy} onclick={()=>moreChannels(direct,'channels')}>More team channels</button>{/if}
     {#if shared.next}<button class="team-more" disabled={shared.busy} onclick={()=>moreChannels(shared,'shared')}>More shared channels</button>{/if}
    {/if}
   </div>{/each}
   {#if filter&&teams.length&&!visibleTeams.length}<p class="team-note">No matching teams. Clear the filter to see all teams.</p>{/if}
   {#if joined.next}<button class="team-more" disabled={joined.busy} onclick={()=>moreTeams(joined,'joined')}>More joined teams</button>{/if}
   {#if associated.next}<button class="team-more" disabled={associated.busy} onclick={()=>moreTeams(associated,'associated')}>More associated teams</button>{/if}
  </div>
  <div class="team-sidebar-foot"><span>{isLive?'MICROSOFT 365 · CONNECTED':'MICROSOFT 365'}</span>{#if isLive}<button disabled={authBusy||sendBusy} onclick={onSignOut}>Sign out</button>{/if}</div>
 </aside>{/if}
 <section class="channel-workspace" aria-label="Channel conversations">
  <header class="channel-header"><div><nav class="channel-location" aria-label="Channel location"><span>{selectedTeam?.displayName??'TAUT / TEAMS'}</span>{#if selectedChannel}<ChevronRight size={13}/><span>{selectedChannel.displayName}</span>{/if}</nav><h2>{selectedChannel?.displayName??'Teams & channels'}</h2></div><div class="channel-header-actions">{#if selectedChannel}<button type="button" class="team-action" disabled={posts.busy} onclick={()=>selectedChannel&&openChannel(selectedChannel)}>Refresh posts</button>{:else if selectedTeam}<button type="button" class="team-action" disabled={direct.busy||shared.busy} onclick={()=>selectedTeam&&openTeam(selectedTeam)}>Refresh channels</button>{/if}<button type="button" class="team-icon" aria-label="Refresh teams" title="Refresh teams and permissions" disabled={checking||authBusy||!isLive} onclick={initialize}><RefreshCw size={18}/></button></div></header>
  {#if selectedChannel}
   {#if !permissions.messages}<div class="channel-empty"><Lock size={30}/><h3>Channel messages need consent</h3><p>Add delegated ChannelMessage.Read.All, grant admin consent, then sign in again.</p></div>
   {:else}<div class="thread-layout" class:thread-open={Boolean(selectedPost&&detailsOpen)}>
    <section class="channel-posts" aria-label="Channel posts">
     {#if !permissions.send}<p class="team-note">Posting needs delegated ChannelMessage.Send consent and a fresh sign-in.</p>{/if}
     {#if selectedTeam?.isArchived||selectedChannel.isArchived}<p class="team-note">Archived channel · browsing only.</p>{/if}
     <ChannelComposer formatted={drafts[postKey]?.formatted??false} onFormat={value=>drafts[postKey]={...(drafts[postKey]??{text:'',error:'',uncertain:false}),formatted:value}} label="New channel post" text={drafts[postKey]?.text??''} error={drafts[postKey]?.error??''} uncertain={drafts[postKey]?.uncertain??false} disabled={cannotSend} onText={text=>editDraft(postKey,text)} onSend={()=>sendMessage(false)} onRefresh={()=>selectedChannel&&openChannel(selectedChannel)} onAcknowledge={()=>acknowledge(postKey)}/>
     <p class="read-only-note">CHANNEL POSTS <span>Sorted by latest thread activity · replies stay with their post</span></p>

     {#if posts.error}<div class="team-error" role="alert">{posts.error}</div>{/if}
     {#if posts.busy&&!posts.rows.length}<p class="team-note" role="status">Loading channel posts…</p>{/if}
     {#if !posts.busy&&!posts.error&&!posts.rows.length}<p class="team-note">No posts in this channel.</p>{/if}
     {#if !posts.busy&&!posts.error&&posts.rows.length&&!conversationPosts.length}<p class="team-note">Only channel activity is loaded so far. {posts.next?'Load more posts to look further back.':'No conversation posts were returned.'}</p>{/if}
     {#each conversationPosts as post (post.id)}<article class="channel-post" class:chosen={selectedPost?.id===post.id} aria-label={post.deletedDateTime?'Deleted channel post':post.subject||`Post by ${postAuthor(post)}`}>
      <div class="post-meta"><span class="post-initial">{postAuthor(post).slice(0,1)}</span><strong>{postAuthor(post)}</strong><time datetime={post.createdDateTime}>{postTime(post)}</time></div>
      {#if post.subject&&!post.deletedDateTime}<h3>{post.subject}</h3>{/if}<div class="post-text"><MessageBody body={post.body} fallback={channelText(post)} deleted={!!post.deletedDateTime}/></div>
      {#if !post.deletedDateTime&&post.attachments?.length}<p class="post-attachment-note">{post.attachments.map(a=>a.name||'Attachment').join(' · ')} · previews coming later</p>{/if}
      <button class="thread-button" onclick={()=>openThread(post)}><MessagesSquare size={15}/>View replies</button>
     </article>{/each}
     {#if posts.next}<button class="team-action load-more" disabled={posts.busy} onclick={morePosts}>{posts.busy?'Loading…':'Load more posts'}</button>{/if}
    </section>
    {#if selectedPost&&detailsOpen}<aside class="thread-pane" aria-label="Channel thread"><div class="thread-title"><div><span class="eyebrow">THREAD</span><h3>{selectedPost.deletedDateTime?'Deleted message':selectedPost.subject||'Conversation'}</h3></div><button class="team-icon" aria-label="Close thread" onclick={()=>{selectedPost=null;replyVersion++;replies=feed();}}><X size={18}/></button></div>
      <div class="thread-scroll"><article class="thread-root"><div class="post-meta"><strong>{postAuthor(selectedPost)}</strong><time datetime={selectedPost.createdDateTime}>{postTime(selectedPost)}</time></div><div class="post-text"><MessageBody body={selectedPost.body} fallback={channelText(selectedPost)} deleted={!!selectedPost.deletedDateTime}/></div></article>
       {#if replies.error}<p class="team-error" role="alert">{replies.error}</p><button class="team-action" onclick={()=>selectedPost&&openThread(selectedPost)}>Retry replies</button>{/if}
       {#if replies.busy&&!replies.rows.length}<p class="team-note" role="status">Loading replies…</p>{/if}
       {#if !replies.busy&&!replies.error&&!replies.rows.length}<p class="team-note">No replies yet.</p>{/if}
       {#if threadEvents.length}<details class="channel-activity"><summary>Thread activity · {threadEvents.length}</summary>{#each threadEvents as event (event.id)}<div class="channel-event"><span>{activityLabel(event)}</span><time datetime={event.createdDateTime}>{postTime(event)}</time></div>{/each}</details>{/if}
       {#each threadReplies as reply (reply.id)}<article class="channel-reply"><div class="post-meta"><strong>{postAuthor(reply)}</strong><time datetime={reply.createdDateTime}>{postTime(reply)}</time></div><div class="post-text"><MessageBody body={reply.body} fallback={channelText(reply)} deleted={!!reply.deletedDateTime}/></div>{#if !reply.deletedDateTime&&reply.attachments?.length}<p class="post-attachment-note">{reply.attachments.map(a=>a.name||'Attachment').join(' · ')} · previews coming later</p>{/if}</article>{/each}
       {#if replies.next}<button class="team-action load-more" disabled={replies.busy} onclick={moreReplies}>{replies.busy?'Loading…':'Load more replies'}</button>{/if}
      </div><div class="thread-footer"><ChannelComposer formatted={drafts[replyKey]?.formatted??false} onFormat={value=>drafts[replyKey]={...(drafts[replyKey]??{text:'',error:'',uncertain:false}),formatted:value}} label="Channel reply" text={drafts[replyKey]?.text??''} error={drafts[replyKey]?.error??''} uncertain={drafts[replyKey]?.uncertain??false} disabled={cannotSend||!!selectedPost.deletedDateTime||isChannelActivity(selectedPost)} onText={text=>editDraft(replyKey,text)} onSend={()=>sendMessage(true)} onRefresh={()=>selectedPost&&openThread(selectedPost)} onAcknowledge={()=>acknowledge(replyKey)}/></div>
    </aside>{/if}
   </div>{/if}
  {:else}<div class="channel-empty"><Building2 size={42}/><span class="eyebrow">SHARED SPACE. CLEAR CONVERSATIONS.</span><h2>{selectedTeam?selectedTeam.displayName:'Where your teams come together.'}</h2><p>{selectedTeam?selectedTeam.description||'Choose a channel to read its conversations.':'Choose a team and channel to explore posts and replies.'}</p>{#if !sidebarOpen}<p>Use the layout toolbar to show the conversation sidebar.</p>{/if}{#if !isLive}<button class="team-action" disabled={authBusy} onclick={onSignIn}>Sign in to Microsoft 365</button>{/if}</div>{/if}
 </section>
 {#if detailsOpen&&!selectedPost}{#key JSON.stringify([selectedChannel?.hostTeamId,selectedChannel?.id])}<ChannelDetails team={selectedTeam} channel={selectedChannel} permitted={!!permissions.members} {ownId} activity={channelEvents} historyBusy={posts.busy} historyMore={!!posts.next} historyError={posts.error} onMoreHistory={morePosts} onClose={onCloseDetails}/>{/key}{/if}
</div>
<style>
 .teams-workspace{position:relative;display:flex;flex:1;min-height:0;min-width:0}.team-sidebar{width:var(--sidebar-width,306px);flex:none;display:flex;flex-direction:column;background:#172128;border-right:1px solid #2a343d;min-height:0}.team-sidebar-head{padding:28px 20px 17px}.team-sidebar-head h1{font-size:22px;letter-spacing:-.7px;margin:10px 0}.team-sidebar-head p{color:#8f9fa9;font-size:11px;line-height:1.6}.team-sidebar :global(.search-field){flex:none}.team-tree{overflow:auto;flex:1;padding:0 10px 20px}.team-node{margin-bottom:7px}.team-toggle{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:13px 8px;font-weight:650;border-radius:8px;color:#c9d3da}.team-toggle span,.channel-link span{min-width:0;overflow-wrap:anywhere}.team-toggle small,.channel-link small{display:block;color:#8499a5;font-size:10px;margin-top:4px;font-weight:400}:global(.turned){transform:rotate(90deg)}.chosen{background:#efbb7010;color:var(--accent)}.team-toggle:hover,.channel-link:hover{background:#27343e}.channel-link{display:flex;gap:10px;align-items:center;width:calc(100% - 20px);margin:3px 0 3px 20px;padding:10px;text-align:left;border-left:2px solid transparent;border-radius:0 7px 7px 0;font-size:12px;color:#b8c6cf}.channel-link.chosen{border-color:var(--accent);background:#efbb7012;color:var(--accent)}.team-note{padding:10px 13px;font-size:12px;color:#92a4af;line-height:1.7}.team-error{margin:10px;padding:12px;border:1px solid #8c574e;border-radius:7px;color:#ffb5a9;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.team-more{font-size:11px;padding:10px 14px;color:var(--accent)}.team-sidebar-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid #2a343d;padding:16px;font-size:8px;letter-spacing:1px;color:#8da0ad}.team-sidebar-foot button{font-size:11px;color:var(--accent);letter-spacing:0}.channel-workspace{display:flex;flex-direction:column;flex:1;min-width:0;background:#0e171c;min-height:0}.channel-header{min-height:83px;display:flex;align-items:center;justify-content:space-between;padding:18px 25px;gap:15px;border-bottom:1px solid #2a343d;background:#19232b}.channel-header h2{font-size:20px;margin:7px 0 0}.channel-location{display:flex;align-items:center;gap:8px;font-size:12px;color:#b7c6d0;flex-wrap:wrap}.channel-location span:first-child{color:var(--accent);font-weight:600}.channel-header-actions{display:flex;align-items:center;gap:8px}.team-icon{display:grid;place-items:center;padding:8px;color:#9aadb9;border-radius:7px}.team-icon:hover{background:#2c3b45;color:var(--accent)}.team-action{padding:9px 12px;border:1px solid #4b606d;border-radius:7px;color:var(--accent);font-size:11px}.team-action:hover{background:#2b393f}.channel-empty{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:30px;overflow:auto;color:#9aadb9;gap:17px}.channel-empty :global(svg){color:var(--accent)}.channel-empty .eyebrow{font-size:9px;margin-top:10px}.channel-empty h2,.channel-empty h3{color:#e8edf0;margin:0;font-size:26px;max-width:560px}.channel-empty p{max-width:450px;font-size:13px;line-height:1.8;margin:0}.thread-layout{display:flex;flex:1;min-height:0;min-width:0}.channel-posts{flex:1;overflow:auto;padding:22px 26px;min-width:0}.read-only-note{font-size:9px;letter-spacing:1.5px;color:#9caaaf;margin:2px 0 22px}.read-only-note span{display:block;font-size:11px;letter-spacing:0;margin-top:7px;color:#748c99}.channel-post{border:1px solid #2e414c;border-radius:12px;padding:19px 21px;margin-bottom:16px;background:#19252d}.channel-post.chosen{border-color:#8b7149;background:#1c2a32}.post-meta{display:flex;gap:10px;align-items:center;font-size:11px;color:#b9c8d1;flex-wrap:wrap}.post-meta strong{font-weight:600}.post-meta time{color:#8097a5;font-size:10px;margin-left:auto}.post-initial{display:grid;place-items:center;width:27px;height:27px;background:#3b5360;border-radius:9px;font-weight:700}.channel-post h3{font-size:17px;line-height:1.5;margin:17px 0 7px}.post-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.8;color:#d7e0e5;margin:14px 0}.thread-button{display:flex;align-items:center;gap:8px;color:var(--accent);font-size:11px;border-top:1px solid #30434f;padding:13px 0 0;width:100%;margin-top:17px}.post-attachment-note{font-size:11px;line-height:1.6;color:#8fa7b5;overflow-wrap:anywhere}.thread-pane{display:flex;flex-direction:column;width:42%;min-width:270px;max-width:500px;border-left:1px solid #3a4a55;background:#142029}.thread-title{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:20px;border-bottom:1px solid #2f414b}.thread-title h3{font-size:16px;overflow-wrap:anywhere;margin:8px 0 0}.thread-scroll{flex:1;overflow:auto;padding:20px}.thread-root{padding-bottom:15px;border-bottom:1px solid #53616a;color:#d7e0e5;font-size:12px}.channel-reply{padding:20px 0 10px;border-bottom:1px solid #2d404c}.thread-footer{padding:15px;border-top:1px solid #2f414b;font-size:10px;color:#7f95a2}.load-more{display:block;margin:15px auto}
 .channel-activity{border:1px solid #2b3c46;border-radius:8px;margin:0 0 19px;color:#8fa4b1;font-size:11px}.channel-activity summary{cursor:pointer;padding:12px 14px;color:#a9bbc6}.channel-event{display:flex;justify-content:space-between;gap:14px;padding:10px 14px;border-top:1px solid #293a44;font-size:11px;line-height:1.5}.channel-event time{color:#7c94a3;text-align:right}
 @media(max-width:1100px){.thread-open .channel-posts{display:none}.thread-pane{width:100%;max-width:none;min-width:0;border-left:0}}@media(max-width:700px){.team-sidebar{width:220px}.channel-header{padding:15px;flex-wrap:wrap}.channel-posts{padding:15px}.channel-post{padding:15px}.channel-empty{padding:20px}}
</style>
