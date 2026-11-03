<script lang="ts">
 import { onMount } from 'svelte';
 import { invoke } from '@tauri-apps/api/core';
 type Member={id?:string;userId?:string;displayName?:string;email?:string;roles?:string[]};
 type Person={id:string;displayName?:string;mail?:string;userPrincipalName?:string};
 let {chatId,ownId,permitted,disabled=false,onLeft,onChanged,onBusyChange}:{chatId:string;ownId:string;permitted:boolean;disabled?:boolean;onLeft:(id:string)=>void;onChanged:()=>void;onBusyChange:(busy:boolean)=>void}=$props();
 let members=$state<Member[]>([]);
 let loading=$state(false),busy=$state(false),loaded=$state(false),incomplete=$state(false),uncertain=$state(false);
 let error=$state(''),notice=$state(''),query=$state(''),searching=$state(false);
 let results=$state<Person[]>([]),candidate=$state<Person|null>(null),removal=$state<Member|null>(null);
 let history=$state<'none'|'all'>('none');
 let active=true,serial=0;let timer:ReturnType<typeof setTimeout>|undefined;
 const label=(m:Member)=>m.displayName||m.email||'Participant unavailable';
 const isMe=(m:Member)=>m.userId?.toLowerCase()===ownId.toLowerCase();
 let canManage=$derived(permitted && loaded && !incomplete && !uncertain && !busy && !disabled && members.some(isMe));
 async function refresh(){
  loading=true;loaded=false;error='';
  try{
   const result=await invoke<{value:Member[];'@odata.nextLink'?:string}>('graph_chat_members',{chatId});
   if(!active)return;
   members=result.value??[];incomplete=Boolean(result['@odata.nextLink']);loaded=true;uncertain=false;
   if(candidate && members.some(m=>m.userId===candidate?.id))candidate=null;
   if(removal && !members.some(m=>m.id===removal?.id))removal=null;
  }catch(e){if(active)error=`Could not refresh members: ${String(e)}`;}
  finally{if(active)loading=false;}
 }
 onMount(()=>{void refresh();return()=>{active=false;serial++;if(timer)clearTimeout(timer);};});
 function search(value:string){
  query=value;results=[];candidate=null;error='';serial++;const request=serial;
  if(timer)clearTimeout(timer);
  if(value.trim().length<2){searching=false;return;}
  searching=true;
  timer=setTimeout(async()=>{
   try{
    const result=await invoke<{value:Person[]}>('graph_search_users',{query:value.trim()});
    if(active && request===serial)results=(result.value??[]).filter(u=>u.id.toLowerCase()!==ownId.toLowerCase()&&!members.some(m=>m.userId?.toLowerCase()===u.id.toLowerCase()));
   }catch(e){if(active && request===serial)error=String(e);}
   finally{if(active && request===serial)searching=false;}
  },300);
 }
 function choose(user:Person){if(!canManage)return;candidate=user;results=[];history='none';removal=null;notice='';}
 async function add(){
  if(!canManage || !candidate)return;
  const recipient=candidate.id;busy=true;onBusyChange(true);error='';notice='';
  try{
   await invoke('graph_add_group_member',{chatId,recipient,history});
   if(active){candidate=null;query='';notice='Member added. Previously shared files are not automatically re-shared.';await refresh();}
   onChanged();
  }catch(e){if(active){error=String(e);uncertain=true;}}
  finally{if(active)busy=false;onBusyChange(false);}
 }
 async function remove(){
  if(!canManage || !removal?.id)return;
  const member=removal;const leaving=isMe(member);busy=true;onBusyChange(true);error='';notice='';
  try{
   await invoke('graph_remove_group_member',{chatId,membershipId:member.id});
   if(leaving){onLeft(chatId);return;}
   if(active){removal=null;notice='Member removed. Existing file access is not automatically revoked.';await refresh();}
   onChanged();
  }catch(e){if(active){error=String(e);uncertain=true;}}
  finally{if(active)busy=false;onBusyChange(false);}
 }
</script>
<section class="detail-section group-members" aria-label="Group members">
 <div class="detail-heading">MEMBERS <span>{members.length}</span></div>
 <button class="member-refresh" type="button" onclick={refresh} disabled={loading||busy||disabled}>Refresh members</button>
 {#if loading}<p role="status">Loading members…</p>{/if}
 {#if error}<p class="member-error" role="alert">{error}</p>{/if}
 {#if notice}<p role="status">{notice}</p>{/if}
 {#if uncertain}<p>Refresh members and check Teams before another change.</p>{/if}
 {#if incomplete}<p>The member list is incomplete. Use Teams to manage this group.</p>{/if}
 <ul class="member-list">{#each members as member,i (member.id??i)}<li><span><strong>{label(member)}{isMe(member)?' (You)':''}</strong><small>{member.roles?.join(', ')??''}</small></span>
  <button type="button" disabled={!canManage||!member.id} aria-label={isMe(member)?'Leave group':`Remove ${label(member)}`} onclick={()=>{removal=member;candidate=null;notice=''}}>{isMe(member)?'Leave':'Remove'}</button>
 </li>{/each}</ul>
 {#if !permitted}<p>Adding/removing members requires ChatMember.ReadWrite consent and a fresh sign-in.</p>{/if}
 {#if removal}<div class="member-confirm" role="dialog" aria-label={isMe(removal)?'Confirm leaving group':'Confirm member removal'}>
  <p>{isMe(removal)?'Leave this group? You will lose access to new messages and the conversation will be removed from this session.':`Remove ${label(removal)} from this group? Existing file access may remain.`}</p>
  <button type="button" disabled={busy} onclick={()=>removal=null}>Cancel</button>
  <button type="button" disabled={!canManage} onclick={remove}>{isMe(removal)?'Confirm leave':'Confirm removal'}</button>
 </div>{/if}
 <label class="member-search-label" for="group-add-person">Add a coworker</label>
 <input id="group-add-person" value={query} oninput={e=>search(e.currentTarget.value)} disabled={!canManage} placeholder="Search by name…" autocomplete="off"/>
 {#if searching}<p>Searching…</p>{/if}
 {#if results.length}<div class="directory-results" role="listbox" aria-label="Coworkers to add">{#each results as person (person.id)}<button role="option" aria-selected="false" type="button" onclick={()=>choose(person)}><strong>{person.displayName||person.userPrincipalName}</strong><small>{person.mail||person.userPrincipalName}</small></button>{/each}</div>{/if}
 {#if candidate}<div class="member-confirm" role="dialog" aria-label="Confirm adding member">
  <p>Add {candidate.displayName||candidate.userPrincipalName} to this group? This changes the Teams conversation.</p>
  <label for="group-history">Conversation history</label>
  <select id="group-history" bind:value={history} disabled={busy}><option value="none">No previous messages</option><option value="all">All previous messages</option></select>
  <button type="button" disabled={busy} onclick={()=>candidate=null}>Cancel</button>
  <button type="button" disabled={!canManage} onclick={add}>Confirm add member</button>
 </div>{/if}
</section>
