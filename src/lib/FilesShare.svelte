<script lang="ts">
 import {invoke} from '@tauri-apps/api/core';
 import type {DriveItem} from './files';
 type Person={id:string;displayName?:string;mail?:string;userPrincipalName?:string};
 type Review={planId:string;files:{name:string;folder:boolean;newAccess:string[]}[];recipients:{name:string;email:string}[];channel:string;subject:string;message:string};
 let {ownId,items,chats=[],disabled=false,onBusyChange}:{ownId:string;items:DriveItem[];chats?:{id:string;name:string}[];disabled?:boolean;onBusyChange:(busy:boolean)=>void}=$props();
 let dialog:HTMLDialogElement,chosen=$state<DriveItem[]>([]),channel=$state('email'),chatId=$state(''),query=$state(''),people=$state<Person[]>([]),recipients=$state<Person[]>([]),subject=$state(''),message=$state(''),review=$state<Review|null>(null),busy=$state(false),error=$state(''),finished=$state(false),notice=$state('');let serial=0;
 function open(){serial++;chosen=[...items];channel='email';chatId='';query='';people=[];recipients=[];subject=chosen.length===1?`Shared: ${chosen[0].name}`:'Files shared with you';message='';review=null;error='';finished=false;notice='';dialog.showModal();dialog.querySelector('select')?.focus();onBusyChange(true);}
 function close(){if(busy)return;serial++;dialog.close();onBusyChange(false);}
 async function search(){if(query.trim().length<2)return;const version=++serial;busy=true;error='';try{const result=await invoke<{value:Person[]}>('graph_search_users',{query:query.trim()});if(version===serial)people=result.value.filter(p=>p.id!==ownId&&!recipients.some(r=>r.id===p.id));}catch(e){if(version===serial)error=String(e);}finally{if(version===serial)busy=false;}}
 async function prepare(){if(busy)return;busy=true;error='';try{review=await invoke<Review>('files_share_review',{ownId,input:{items:chosen.map(({id,name,folder})=>({id,name,folder})),channel,chatId:channel==='chat'?chatId:null,recipients:channel==='email'?recipients.map(p=>p.id):[],subject,message}});}catch(e){error=String(e);}finally{busy=false;}}
 async function send(){if(busy||!review||finished)return;busy=true;error='';finished=true;try{const result=await invoke<{status:string;error?:string}>('files_share_send',{ownId,planId:review.planId});if(result.status==='sent'){notice=channel==='email'?'Email submitted. The links point to the original OneDrive items.':'Links sent to the selected chat.';busy=false;close();}else error=result.error||'Sharing was not confirmed. Check OneDrive and the destination before trying again.';}catch{error='Sharing or delivery was not confirmed. Access may already be granted and the message may have arrived. Check OneDrive and the destination before starting another review. No retry was sent.';}finally{busy=false;}}
</script>
<button {disabled} onclick={open}>Share selected</button>{#if notice}<span role="status">{notice}</span>{/if}
<dialog bind:this={dialog} aria-label="Share OneDrive items" oncancel={event=>{event.preventDefault();close();}}>
 <h2>{review?'Review sharing':'Share via Email or Chat'}</h2>
 {#if review}
 <p><strong>{review.channel==='chat'?`Chat: ${chats.find(chat=>chat.id===chatId)?.name||'Selected chat'}`:'Email recipients'}</strong></p><ul>{#each review.recipients as person}<li>{person.name}<small>{person.email}</small></li>{/each}</ul>
 <p><strong>{review.subject}</strong></p>{#if review.message}<p class="message">{review.message}</p>{/if}
 <ul>{#each review.files as file}<li><strong>{file.name}</strong><small>{file.newAccess.length?`Grant view access to: ${file.newAccess.join(', ')}`:'Existing access verified; no new grant needed.'}</small></li>{/each}</ul>
 <p>Existing access is kept, including edit access. Links point to the originals. No public or organization-wide link is created.</p>
 {:else}
 <p>{chosen.map(item=>item.name).join(', ')}</p>
 <label>Share via<select aria-label="Share via" bind:value={channel} disabled={busy}><option value="email">Email</option><option value="chat">Existing chat</option></select></label>
 {#if channel==='email'}
 <label>Find coworkers<input bind:value={query} maxlength="80" disabled={busy} placeholder="Name or email" onkeydown={event=>{if(event.key==='Enter'){event.preventDefault();search();}}}/></label><button disabled={busy||query.trim().length<2} onclick={search}>Find coworkers</button>
 <div class="people">{#each people as person}<button disabled={busy||recipients.length>=25} onclick={()=>{recipients=[...recipients,person];people=people.filter(p=>p.id!==person.id);}}>{person.displayName||person.mail||person.userPrincipalName}</button>{/each}</div>
 <ul aria-label="Selected recipients">{#each recipients as person}<li>{person.displayName||person.mail}<button disabled={busy} aria-label={`Remove ${person.displayName||person.mail}`} onclick={()=>recipients=recipients.filter(p=>p.id!==person.id)}>Remove</button></li>{/each}</ul>
 {:else}<label>Existing chat<select aria-label="Existing chat" bind:value={chatId} disabled={busy}><option value="">Choose a chat</option>{#each chats as chat}<option value={chat.id}>{chat.name}</option>{/each}</select></label><p class="hint">All current participants will be listed for review. This does not create a new chat.</p>{/if}
 <label>Subject<input bind:value={subject} maxlength="200" disabled={busy}/></label><label>Message (optional)<textarea bind:value={message} maxlength="8000" rows="3" disabled={busy}></textarea></label>
 <p>Next, review recipients and view access. Nothing is shared or sent until you confirm.</p>
 {/if}
 {#if chosen.some(item=>item.folder)}<p class="warning"><strong>Sharing a folder includes its files and subfolders.</strong> Recipients may already have broader access.</p>{/if}
 {#if error}<p role="alert">{error}</p>{/if}
 <footer><button disabled={busy} onclick={close}>{finished?'Close':'Cancel'}</button>{#if review}<button class="primary" disabled={busy||finished} onclick={send}>{busy?'Sharing and sending…':'Share and send'}</button>{:else}<button class="primary" disabled={busy||!subject.trim()||(channel==='email'?!recipients.length:!chatId)} onclick={prepare}>{busy?'Checking…':'Review sharing'}</button>{/if}</footer>
</dialog>
<style>
button,input,select,textarea{font:inherit;color:var(--text-primary);border:1px solid var(--border-strong);border-radius:7px;padding:9px 12px}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:26px;background:var(--surface-panel);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:14px;box-shadow:0 20px 70px #0006}dialog::backdrop{background:#0008}h2{font-size:21px;margin:0 0 16px}p{font-size:13px;line-height:1.6;overflow-wrap:anywhere}label{display:flex;flex-direction:column;gap:6px;margin:14px 0;font-size:13px}input,select,textarea{background:var(--surface-panel);min-width:0}.hint,small{font-size:11px;color:var(--text-secondary)}small{display:block;margin-top:4px}.people{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}ul{padding:0;list-style:none;max-height:180px;overflow:auto}li{padding:8px 0;border-bottom:1px solid var(--border);overflow-wrap:anywhere;font-size:13px}li button{font-size:11px;margin-left:8px}.warning{border-left:3px solid var(--accent);padding:12px;background:var(--accent-soft)}footer{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}.primary{background:var(--accent);color:var(--text-on-accent);border-color:var(--accent)}[role=alert]{color:var(--error)}.message{white-space:pre-wrap}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
