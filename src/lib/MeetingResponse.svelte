<script lang="ts">
 import {onMount,onDestroy,untrack} from 'svelte';
 import {invoke} from '@tauri-apps/api/core';
 import MailConfirm from './MailConfirm.svelte';
 import {TriangleAlert} from 'lucide-svelte';
 import {responseLabel,eventWhen,eventDay,eventDate,meetingResponseState,meetingMessageLabel,type CalendarEvent,type MeetingStatus} from './calendar';
 let {ownId,eventId,messageId,refreshKey=0,onOpenCalendar,onUpdated=()=>{}}:{ownId:string;eventId?:string;messageId?:string;refreshKey?:number;onOpenCalendar?:(event:CalendarEvent)=>void;onUpdated?:(event:CalendarEvent)=>void}=$props();
 let event=$state<CalendarEvent|null>(null),mail=$state<MeetingStatus|undefined>(),busy=$state(false),writing=$state(false),verified=$state(false),error=$state(''),notice=$state(''),permitted=$state(false),editing=$state(false),review=$state(false),action=$state('accept'),comment=$state(''),sendResponse=$state(true),locked=$state(false);
 let alive=true,serial=0,expected='',confirmed=false,checkTimer:ReturnType<typeof setTimeout>|undefined;
 const key=(e:CalendarEvent)=>JSON.stringify(['taut-meeting-response',ownId,e.id,e.changeKey]);
 const responseState=$derived(meetingResponseState(event,mail));
 const label=$derived(action==='accept'?'Accept':action==='decline'?'Decline':'Tentative');
 function cancelCheck(){clearTimeout(checkTimer);checkTimer=undefined;}
 onDestroy(()=>{alive=false;serial++;cancelCheck();});
 $effect(()=>{refreshKey;untrack(()=>{void refresh();});});
 onMount(()=>{if(!messageId)void invoke<boolean>('calendar_response_permission').then(value=>{if(alive)permitted=value;}).catch(()=>{});});
 async function refresh(){
  if(writing)return;
  const request=++serial;busy=true;verified=false;editing=false;review=false;error='';if(confirmed){notice='';confirmed=false;}
  try{
   const result=await invoke<MeetingStatus>('calendar_event',{eventId:eventId??null,messageId:messageId??null});
   if(!alive||request!==serial)return;
   event=result.event;mail=messageId?result:undefined;
   locked=event?localStorage.getItem(key(event))!==null:false;
   verified=!!event;
   if(event){onUpdated(event);if(expected&&event.responseStatus?.response===expected){notice=`Calendar records your response: ${responseLabel(event)}.`;confirmed=true;expected='';cancelCheck();}}
  }catch(e){if(alive&&request===serial)error=String(e);}finally{if(alive&&request===serial)busy=false;}
 }
 function checkLater(attempt=0){
  cancelCheck();
  if(!alive||!expected)return;
  if(attempt>=3){notice='Response submitted; the calendar has not yet confirmed the requested response. Refresh status or check Outlook.';expected='';return;}
  checkTimer=setTimeout(()=>{if(!alive)return;if(document.visibilityState!=='visible'){notice='Response submitted. Refresh meeting status when you return.';return;}void refresh().then(()=>checkLater(attempt+1));},[2000,5000,10000][attempt]);
 }
 function refreshOnReturn(){if(document.visibilityState==='visible'&&!busy&&!writing&&!editing&&!review)void refresh();}
 async function send(){
  if(busy||writing||!verified||!responseState.eligible||!event||locked)return;
  const selected=event,selectedAction=action,note=comment,email=sendResponse;
  review=false;editing=false;writing=true;error='';cancelCheck();
  // Persist before IPC. Neither refresh nor reconciliation ever repeats a write.
  try{localStorage.setItem(key(selected),selectedAction);locked=true;}catch{error='Response could not be saved safely. Nothing was sent.';writing=false;return;}
  try{
   const result=await invoke<{status:string;error?:string}>('calendar_response',{ownId,eventId:selected.id,version:selected.changeKey,action:selectedAction,comment:note,sendResponse:email});
   if(!alive)return;
   expected=result.status==='accepted'?({accept:'accepted',tentativelyAccept:'tentativelyAccepted',decline:'declined'} as Record<string,string>)[selectedAction]:'';
   notice=result.status==='accepted'?'Microsoft 365 accepted your response. Checking the recorded calendar status…':result.error??'Response unconfirmed. Check Outlook before trying again.';
  }catch(e){if(alive)notice=`Response unconfirmed. Check Outlook before trying again. ${String(e)}`;}finally{if(alive)writing=false;}
  if(alive){await refresh();checkLater();}
 }
</script>
<svelte:window onfocus={refreshOnReturn}/>
<svelte:document onvisibilitychange={refreshOnReturn}/>
<section class="meeting" aria-label="Meeting response" aria-busy={busy||writing}>
 {#if messageId}<h3 class="message-kind" class:declined={mail?.meetingMessageType==='meetingDeclined'}>{#if mail?.meetingMessageType==='meetingDeclined'}<TriangleAlert size={22} aria-hidden="true"/>{/if}{meetingMessageLabel(mail?.meetingMessageType)}</h3>{/if}
 {#if event}<div class="eyebrow">CALENDAR STATUS</div><strong>{responseLabel(event)}</strong><p>{eventDay(event)} · {eventWhen(event)}</p>{/if}
 {#if mail?.isOutOfDate}<p class="update">This email was superseded by a newer invitation. Use the current calendar event for responses.</p>{/if}
 {#if mail?.previousStartDateTime?.dateTime}<p class="update">Meeting time updated · previously {eventDate(mail.previousStartDateTime)?.toLocaleString()??mail.previousStartDateTime.dateTime}</p>{/if}
 {#if mail?.previousEndDateTime?.dateTime}<p class="update">Previous end: {eventDate(mail.previousEndDateTime)?.toLocaleString()??mail.previousEndDateTime.dateTime}</p>{/if}
 {#if mail?.previousLocation?.displayName}<p class="update">Previous location: {mail.previousLocation.displayName}</p>{/if}
 {#if event?.responseRequested===false||mail?.responseRequested===false}<p class="update">The organizer has not requested a response.</p>{/if}
 {#if mail?.calendarUnavailable}<p class="update">Current calendar status unavailable. Refresh or check Outlook.</p>{/if}
 {#if event}<small>{verified?'Current calendar status.':'Status has not been refreshed.'} Reading this email or event does not send a response.</small>{/if}
 {#if error}<p role="alert">{error}</p>{/if}{#if notice}<p role="status">{notice}</p>{/if}
 <div class="actions"><button disabled={busy||writing} onclick={()=>void refresh()}>{busy?'Checking…':'Refresh meeting status'}</button>{#if messageId&&event&&onOpenCalendar}<button disabled={busy||writing||!verified} onclick={()=>{if(event)onOpenCalendar?.(event);}}>{responseState.needsResponse&&!locked?'Respond in Calendar':'View in Calendar'}</button>{:else if !messageId&&verified&&responseState.eligible&&permitted&&!editing&&!locked}<button disabled={busy||writing} onclick={()=>{action=event?.responseStatus?.response==='tentativelyAccepted'?'tentativelyAccept':event?.responseStatus?.response==='declined'?'decline':'accept';editing=true;}}>{responseState.answered?'Change response':responseState.needsResponse?'Respond to invitation':'Set response'}</button>{/if}</div>
 {#if !messageId&&event&&!permitted}<small>Reconnect for Calendars.ReadWrite to answer in TAUT.</small>{/if}{#if !messageId&&locked}<p class="update">A response was already attempted for this event version. Check its status or Outlook; TAUT will not repeat it.</p>{/if}
 {#if editing}<fieldset><legend>Your response</legend>{#each [['accept','Accept'],['tentativelyAccept','Tentative'],['decline','Decline']] as [value,text]}<label><input type="radio" name={'rsvp-'+event?.id} bind:group={action} {value}/>{text}</label>{/each}</fieldset><label class="comment">Optional note<textarea maxlength="4000" bind:value={comment}></textarea></label><label><input type="checkbox" bind:checked={sendResponse}/>Email the organizer my response</label><div class="actions"><button onclick={()=>editing=false}>Cancel</button><button onclick={()=>review=true}>Review response</button></div>{/if}
</section>
{#if review&&event}<MailConfirm title="Review meeting response" confirmLabel="Send response" onClose={()=>review=false} onConfirm={send}><p><strong>{event.subject||'Untitled event'}</strong></p><p>{eventDay(event)} · {eventWhen(event)}</p><p>Response: <strong>{label}</strong></p><p>{sendResponse?'The organizer will receive an email response.':'Your calendar response changes without emailing the organizer.'}</p>{#if event.type==='occurrence'||event.type==='exception'}<p>Applies to this occurrence only.</p>{/if}{#if comment}<blockquote>{comment}</blockquote>{/if}</MailConfirm>{/if}
<style>
.message-kind{display:flex;align-items:center;gap:10px;font-size:20px;line-height:1.35;font-weight:750;letter-spacing:0;margin:0 0 18px;color:var(--text-primary)}.message-kind :global(svg){flex:none}.message-kind.declined{padding:12px 14px;border:1px solid var(--error-border);border-radius:8px;background:var(--error-surface);color:var(--error)}

.meeting{padding:18px;margin:16px 0;border:1px solid var(--accent-border);border-left:3px solid var(--accent);border-radius:10px;background:var(--accent-soft);font-size:13px;line-height:1.7}.eyebrow{color:var(--accent);font-size:10px;letter-spacing:1.5px;margin-bottom:8px}.meeting strong{display:block}.meeting p{margin:8px 0}.meeting small{display:block;color:var(--text-secondary)}.actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}button,textarea{font:inherit;color:var(--text-primary);background:var(--surface-panel);border:1px solid var(--border-strong);border-radius:7px;padding:8px 12px}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}fieldset{border:0;padding:0;margin:16px 0;display:flex;flex-wrap:wrap;gap:12px}label{display:flex;align-items:center;gap:6px}.comment{display:block}textarea{display:block;box-sizing:border-box;width:100%;min-height:80px;margin:6px 0 12px}.update{color:var(--text-secondary)}[role=alert]{color:var(--danger-text,#e88d7d)}button:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
