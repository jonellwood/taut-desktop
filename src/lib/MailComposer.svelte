<script lang="ts">
 import MailConfirm from './MailConfirm.svelte';
 import MailRecipient from './MailRecipient.svelte';
 import MessageBody from './MessageBody.svelte';
 import {formatDraft} from './compose-format';
 import {readSignature} from './mail-signature';
 import {tick,onDestroy} from 'svelte';
 import {invoke} from '@tauri-apps/api/core';
 import {clipboardImages,droppedFiles,transferHasFiles,fileSize} from './attachments';
 import {saveMailFile,loadMailFiles,removeMailFile,validateMailFiles,inlineImageType,imageMarker,type MailDraftAttachment} from './mail-attachments';
 import FormattingToolbar from './FormattingToolbar.svelte';
 import {continueList} from './continue-list';
 import {draftError,recipients,mailContent,mailIsHtml,type MailDraft} from './mail-drafts';
 let {draft,ownId,ownMailAddresses=[],permitted,onChange,onClose,onAccepted,onDiscard}:{draft:MailDraft;ownId:string;ownMailAddresses?:string[];permitted:boolean;onChange:(d:MailDraft)=>boolean;onClose:()=>void;onAccepted:(id:string)=>void;onDiscard:(id:string)=>void}=$props();
 let picker=$state<HTMLInputElement>(),imagePicker=$state<HTMLInputElement>(),staging=$state(false),dragging=$state(false),previews=$state<Record<string,string>>({});
 let input=$state<HTMLTextAreaElement>(),busy=$state(false),review=$state(false),error=$state(''),confirmDiscard=$state(false),alive=true;
 let lookup=$state(''),target=$state<'to'|'cc'|'bcc'>('to'),people=$state<{id:string;displayName:string;mail?:string;userPrincipalName?:string}[]>([]),searching=$state(false);let serial=0;

 let confirmSelf=$state(false),muteSelf=$state(false);
 const selfWarningKey=()=>`taut.mail.self-warning-muted.v1.${ownId.toLowerCase()}`;
 function selfWarningMuted(){try{return localStorage.getItem(selfWarningKey())==='true';}catch{return false;}}
 function approveSelf(){if(muteSelf){try{localStorage.setItem(selfWarningKey(),'true');}catch{/* The current confirmation still applies if storage is unavailable. */}}confirmSelf=false;void send(true);}
 const invalid=$derived(draftError(draft));
 $effect(()=>{const id=draft.id,items=draft.attachments??[];void loadMailFiles(ownId,id,items).then(files=>{if(alive&&draft.id===id)previews=Object.fromEntries(files.filter(f=>inlineImageType(f.contentType)).map(f=>[f.id,`data:${f.contentType};base64,${f.contentBytes}`]));}).catch(e=>{if(alive&&draft.id===id)error=String(e);});});
 async function stage(files:File[],inline=false){if(busy||staging||draft.uncertain)return;error='';const id=draft.id;const saved:MailDraftAttachment[]=[];const caret=input?.selectionStart??draft.text.length;staging=true;
  try{validateMailFiles(draft.attachments??[],files);if(inline&&files.some(f=>!inlineImageType(f.type)))throw Error('Choose PNG, JPEG, GIF or WebP images.');
   for(const file of files)saved.push(await saveMailFile(ownId,id,file,inline));
   if(!alive)throw Error('Composer closed before files were attached.');
   const markers=saved.filter(f=>f.inline).map(f=>imageMarker(f.id)).join('\n');const text=markers?draft.text.slice(0,caret)+'\n'+markers+'\n'+draft.text.slice(caret):draft.text;
   const persisted=onChange({...draft,attachments:[...draft.attachments??[],...saved],text,updated:Date.now()});if(!persisted)error='Draft could not be saved. Keep your original files and keep this window open.';review=false;
   await tick();input?.focus();if(markers)input?.setSelectionRange(caret+markers.length+2,caret+markers.length+2);
  }catch(e){for(const file of saved)await removeMailFile(ownId,id,file.id).catch(()=>{});if(alive)error=String(e);}finally{if(alive)staging=false;}
 }
 function removeFile(file:MailDraftAttachment){const next={...draft,attachments:draft.attachments?.filter(f=>f.id!==file.id),text:file.inline?draft.text.split('\n').filter(line=>line!==imageMarker(file.id)).join('\n'):draft.text,updated:Date.now()};if(onChange(next)){review=false;void removeMailFile(ownId,draft.id,file.id).catch(()=>{});}}
 function pasteImage(e:ClipboardEvent){if(!e.clipboardData)return;try{const files=clipboardImages(e.clipboardData);if(files.length){e.preventDefault();e.stopPropagation();void stage(files,true);}}catch(err){e.preventDefault();e.stopPropagation();error=String(err);}}
 function dragFiles(e:DragEvent){if(!transferHasFiles(e.dataTransfer))return;e.preventDefault();e.stopPropagation();dragging=!busy&&!staging&&!draft.uncertain;if(e.dataTransfer)e.dataTransfer.dropEffect=dragging?'copy':'none';}
 function dropFiles(e:DragEvent){if(!transferHasFiles(e.dataTransfer))return;e.preventDefault();e.stopPropagation();dragging=false;try{void stage(droppedFiles(e.dataTransfer!));}catch(err){error=String(err);}}

 function edit(patch:Partial<MailDraft>){review=false;error='';onChange({...draft,...patch,updated:Date.now()});}
 async function find(){const query=lookup.trim();if(query.length<2)return;const n=++serial;searching=true;try{const result=await invoke<{value:typeof people}>('graph_search_users',{query});if(alive&&n===serial)people=result.value??[];}catch{if(alive&&n===serial)error='Coworker search unavailable. You can enter a full email address.';}finally{if(alive&&n===serial)searching=false;}}
 async function send(selfApproved=false){if(busy||staging||draft.uncertain||invalid||!permitted)return;if(!selfApproved&&!selfWarningMuted()&&recipients(draft.to).some(address=>ownMailAddresses.some(own=>own.toLowerCase()===address.toLowerCase()))){muteSelf=false;confirmSelf=true;return;}busy=true;error='';review=false;const id=draft.id,attemptId=crypto.randomUUID();
  let attachments;try{attachments=await loadMailFiles(ownId,id,draft.attachments??[]);}catch(e){busy=false;error=String(e);return;}if(!alive)return;
  // Persist the uncertain marker before IPC: a crash or navigation must never enable a blind retry.
  if(!onChange({...draft,attemptId,uncertain:true,updated:Date.now()})){busy=false;error='Draft could not be saved. Sending was stopped.';return;}
  try{const result=await invoke<{status:string;error?:string}>('mail_send_new',{ownId,draft:{to:recipients(draft.to),cc:recipients(draft.cc),bcc:recipients(draft.bcc),subject:draft.subject,content:mailContent(draft),action:draft.action,sourceId:draft.sourceId,contentType:mailIsHtml(draft)?'HTML':'Text',attachments,attemptId}});if(result.status==='accepted'){onAccepted(id);}else if(alive)error=result.error??'Sending was not confirmed. Check Sent in Outlook.';}catch{if(alive)error='Sending was not confirmed. Check Sent in Outlook before trying again.';}finally{if(alive)busy=false;}
 }
 onDestroy(()=>{alive=false;++serial;});
</script>
<section class="mail-compose" class:dragging aria-label="New email composer" ondragenter={dragFiles} ondragover={dragFiles} ondragleave={()=>dragging=false} ondrop={dropFiles}>
 <header><div><span class="eyebrow">{draft.action==='replyAll'?'REPLY ALL':draft.action==='reply'?'REPLY':draft.action==='forward'?'FORWARD':'NEW EMAIL'}</span><h2>A little more signal.</h2></div><button disabled={busy} onclick={onClose}>Save & close</button></header>
 <p class="note">Draft saved on this Mac · Enter adds a line · only Send sends email</p>
 {#if !permitted}<p role="status">Sending needs Mail.Send consent and a fresh sign-in. You can still save a draft.</p>{/if}
 {#if !draft.referenceFirst&&draft.context}<details><summary>Original message included</summary><pre style="white-space:pre-wrap;max-height:220px;overflow:auto;font-size:12px">{draft.context}</pre></details>{/if}
 {#if draft.action==='forward'}<p class="note">Forward includes the original message and its attachments. Review recipients carefully.</p>{/if}
 <fieldset disabled={busy||staging||draft.uncertain}>
 {#each ['to','cc','bcc'] as field}<MailRecipient label={field==='to'?'To':field==='cc'?'Cc':'Bcc'} value={draft[field as 'to'|'cc'|'bcc']} {ownId} onFocus={()=>target=field as 'to'|'cc'|'bcc'} onChange={value=>edit({[field]:value})}/>{/each}
 <details><summary>Find a coworker</summary><div class="lookup"><select aria-label="Add coworker to" bind:value={target}><option value="to">To</option><option value="cc">Cc</option><option value="bcc">Bcc</option></select><input aria-label="Find email recipient" bind:value={lookup} placeholder="Search by name" onkeydown={e=>{if(e.key==='Enter'){e.preventDefault();void find();}}}/><button disabled={searching||lookup.trim().length<2} onclick={find}>Search people</button></div>{#each people as person(person.id)}{@const email=person.mail||person.userPrincipalName}{#if email}<button class="person" onclick={()=>{edit({[target]:[draft[target],email].filter(Boolean).join('; ')});people=[];lookup='';}}>{person.displayName} · {email}</button>{/if}{/each}</details>
 <label>Subject<input aria-label="Email subject" value={draft.subject} maxlength="1000" oninput={e=>edit({subject:e.currentTarget.value})}/></label>
 <FormattingToolbar showSizeWarning={false} text={draft.text} formatted={draft.formatted} {input} onText={text=>edit({text})} onFormat={formatted=>edit({formatted})}/>
 {#if draft.referenceFirst&&draft.context}<aside class="reference"><h3>In reference to</h3><p class="note">Included at the top of the email body sent to your recipients.</p><blockquote>{draft.context}</blockquote></aside>{/if}
 <textarea bind:this={input} use:continueList={{formatted:draft.formatted,onText:text=>edit({text})}} aria-label="Email message" value={draft.text} onpaste={pasteImage} oninput={e=>edit({text:e.currentTarget.value})} placeholder="Write your message…" rows="12"></textarea>
 <details class="signature-settings"><summary>Signature</summary>
 <label><input type="checkbox" checked={!!draft.signature} onchange={e=>edit({signature:e.currentTarget.checked?readSignature(ownId).text:''})}/> Include signature in this draft</label>
 {#if draft.signature}<div class="signature-preview" aria-label="Signature preview"><MessageBody body={{contentType:'html',content:formatDraft(draft.signature).html}}/></div>{/if}
 <p class="note">Manage your signature and defaults in Settings → Mail.</p></details>
 <div class="file-actions"><button onclick={()=>picker?.click()}>Attach files</button><button onclick={()=>imagePicker?.click()}>Insert image</button><span>{staging?'Saving local files…':dragging?'Drop files to attach':'Drop files here · paste an image into the message · 2 MB total'}</span></div>
 <input class="file-picker" bind:this={picker} type="file" multiple aria-label="Choose email attachments" onchange={e=>{void stage(Array.from(e.currentTarget.files??[]));e.currentTarget.value='';}}/>
 <input class="file-picker" bind:this={imagePicker} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" aria-label="Choose inline email images" onchange={e=>{void stage(Array.from(e.currentTarget.files??[]),true);e.currentTarget.value='';}}/>
 {#if draft.attachments?.length}<ul class="draft-files" aria-label="Draft attachments">{#each draft.attachments as file(file.id)}<li>{#if previews[file.id]}<img src={previews[file.id]} alt={file.name}/>{/if}<div><strong>{file.name}</strong><small>{fileSize(file.size)} · {file.inline?'Inline image':'Attachment'} · saved on this Mac</small></div><button aria-label={`Remove ${file.name}`} onclick={()=>removeFile(file)}>Remove</button></li>{/each}</ul>{/if}
 </fieldset>
 {#if error}<p role="alert" class="error">{error}</p>{/if}
 {#if draft.uncertain}<div class="uncertain" role="status">This draft has a send attempt with an unconfirmed result. Check Sent in Outlook. TAUT will not resend automatically.<button disabled={busy} onclick={()=>{if(onChange({...draft,uncertain:false,attemptId:undefined,updated:Date.now()}))error='';}}>I checked Outlook — unlock draft</button></div>{/if}
 {#if review}<MailConfirm title="Review email before sending" confirmLabel="Send email" cancelLabel="Keep editing" onConfirm={()=>send()} onClose={()=>review=false}><div class="review" role="group" aria-label="Review email before sending"><strong>Ready to send?</strong><p>To: {recipients(draft.to).join(', ')}</p>{#if draft.cc}<p>Cc: {recipients(draft.cc).join(', ')}</p>{/if}{#if draft.bcc}<p>Bcc: {recipients(draft.bcc).join(', ')}</p>{/if}<p>Subject: {draft.subject}</p><p aria-label="Signature to send">{draft.signature?'Signature included':'Signature not included'}</p>{#if draft.attachments?.length}<p>Files to send:</p><ul>{#each draft.attachments as file}<li>{file.name} · {fileSize(file.size)} · {file.inline?'Inline image':'Attachment'}</li>{/each}</ul>{/if}{#if draft.action}<p>{draft.action==='forward'?'Forward':draft.action==='replyAll'?'Reply all':'Reply'} to the selected original email. Original context is included.{draft.action==='forward'?' Original attachments are forwarded too.':' Original attachments are not reattached.'}</p>{/if}</div></MailConfirm>{:else}<footer><button class="primary" disabled={busy||staging||draft.uncertain||!!invalid||!permitted} onclick={()=>review=true}>{busy?'Sending…':'Review & send'}</button>{#if invalid&&!draft.uncertain}<span class="send-guidance" role="status"><strong>Before sending</strong>{invalid}</span>{/if}<button disabled={busy} onclick={()=>confirmDiscard=true}>Discard draft</button></footer>{/if}
 {#if confirmDiscard}<MailConfirm title="Discard email draft" confirmLabel="Discard permanently" onConfirm={()=>onDiscard(draft.id)} onClose={()=>confirmDiscard=false}><p>Permanently discard this local draft and its local attachment copies?</p></MailConfirm>{/if}
 {#if confirmSelf}<MailConfirm title="Send an email to yourself?" confirmLabel="Send to myself" onConfirm={approveSelf} onClose={()=>confirmSelf=false}><p>Your own email address is in To. Are you sure you want to send this email to yourself?</p><label class="mute-warning"><input type="checkbox" bind:checked={muteSelf}/> Don’t ask again on this Mac</label></MailConfirm>{/if}
</section>
<style>
.mute-warning{display:flex;align-items:center;gap:8px}.mute-warning input[type="checkbox"]{width:auto;margin:0}
.reference{margin:18px 0;padding:16px 20px;background:var(--surface-raised);border-radius:10px}.reference h3{margin:0 0 10px;font-size:16px}.reference blockquote{margin:0;padding-left:16px;border-left:3px solid var(--accent);white-space:pre-wrap;max-height:260px;overflow:auto;font-size:13px}
.signature-settings{margin-top:16px}.signature-preview{padding:12px;border-left:2px solid var(--accent);font-size:13px}.signature-settings input[type="checkbox"]{margin-right:8px}
.dragging{outline:2px dashed var(--accent);outline-offset:-8px}.file-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:12px}.file-actions span{font-size:11px;color:var(--text-secondary)}.file-picker{display:none}.draft-files{list-style:none;padding:0;display:grid;gap:8px}.draft-files li{display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--border-strong);border-radius:8px}.draft-files img{max-width:80px;max-height:64px;object-fit:contain}.draft-files div{flex:1;min-width:0;overflow-wrap:anywhere}.draft-files strong{font-size:12px}.draft-files small{display:block;font-size:11px;color:var(--text-secondary);margin-top:5px}

.mail-compose{padding:24px clamp(20px,4vw,60px);overflow:auto;flex:1;min-height:0;color:var(--text-primary)}header{display:flex;align-items:center;justify-content:space-between;gap:20px}h2{font-size:25px;margin:10px 0}label{display:block;font-size:12px;color:var(--text-secondary);margin:12px 0}input,textarea,select{box-sizing:border-box;background:var(--surface-base);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:7px;padding:10px;font:inherit}label>input:not(.address input){display:block;width:100%;margin-top:8px}textarea{width:100%;min-height:240px;resize:vertical;font-size:14px;line-height:1.7}fieldset{border:0;padding:0;margin:0;min-width:0}fieldset:disabled{opacity:.7}button{padding:9px 12px;border:1px solid var(--border-strong);border-radius:7px;color:var(--accent);font-size:12px}button:disabled{opacity:.45;cursor:default}.primary{background:var(--accent);color:var(--text-on-accent)}footer{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-top:18px}.send-guidance{display:flex;flex-direction:column;gap:3px;border-left:3px solid var(--accent);background:var(--surface-panel);padding:9px 12px;font-size:13px;color:var(--text-primary);line-height:1.5}.send-guidance strong{color:var(--accent);font-size:11px}.note{font-size:11px;color:var(--text-secondary);line-height:1.7}.error{color:var(--error);font-size:13px}.uncertain,.review{border:1px solid var(--accent-border);padding:16px;border-radius:9px;margin:16px 0;line-height:1.7;font-size:13px;overflow-wrap:anywhere}.uncertain button{display:block;margin-top:12px}.lookup{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.person{display:block;margin:6px 0}summary{font-size:12px;color:var(--accent);cursor:pointer}
</style>
