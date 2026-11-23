<script lang="ts">
 import {onMount} from 'svelte';
 import {invoke} from '@tauri-apps/api/core';
 import {Bell,Clock,ExternalLink,X,Video} from 'lucide-svelte';
 type Card={key:string;title:string;start:number;allDay:boolean;room:string;canJoin:boolean};
 let cards=$state<Card[]>([]),now=$state(Date.now()),busy=$state(''),error=$state('');let alive=true,loading=false;
 async function refresh(){if(loading)return;loading=true;try{const value=await invoke<Card[]>('calendar_reminder_cards');if(alive)cards=value;}catch{if(alive)error='Reminders could not be refreshed.';}finally{loading=false;}}
 onMount(()=>{void refresh();const timer=window.setInterval(()=>{now=Date.now();void refresh();},1000);return ()=>{alive=false;window.clearInterval(timer);};});
 function countdown(card:Card){if(card.allDay)return 'All-day meeting';const minutes=Math.ceil((card.start-now)/60000);return minutes>1?`Starts in ${minutes} minutes`:minutes===1?'Starts in 1 minute':minutes===0?'Starting now':`Started ${Math.abs(minutes)} ${minutes===-1?'minute':'minutes'} ago`;}
 async function act(key:string,action:string){if(busy)return;busy=key;error='';try{await invoke('calendar_reminder_card_action',{key,action});await refresh();}catch(e){error=String(e);}finally{busy='';}}
</script>
<svelte:head><title>TAUT · Meeting reminders</title></svelte:head>
<main class="reminder-cards" aria-label="Meeting reminders">
 <header><span class="brand">T/</span><span>YOUR NEXT MOMENT</span><span class="count">{cards.length}</span></header>
 {#if error}<p class="error" role="alert">{error}</p>{/if}
 <div class="stack">{#each cards as card(card.key)}<article aria-label={card.title||'Untitled meeting'}>
  <div class="top"><strong class="countdown"><Bell size={16}/>{countdown(card)}</strong><button class="dismiss" type="button" aria-label={`Dismiss ${card.title}`} disabled={!!busy} onclick={()=>act(card.key,'dismiss')}><X size={14}/>Dismiss</button></div>
  <h1>{card.title||'Untitled meeting'}</h1>
  <p class="time"><Clock size={15}/>{card.allDay?'All day':new Date(card.start).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}<span>{new Date(card.start).toLocaleDateString([],{month:'short',day:'numeric'})}</span></p>
  {#if card.room}<p class="room">{card.room}</p>{/if}
  <div class="actions">{#if card.canJoin}<button class="join" disabled={!!busy} onclick={()=>act(card.key,'join')}><Video size={16}/>Join Teams</button>{/if}<button disabled={!!busy} onclick={()=>act(card.key,'open')}><ExternalLink size={15}/>Open meeting</button><button disabled={!!busy} onclick={()=>act(card.key,'snooze')}>Snooze 5 min</button></div>
 </article>{/each}{#if !cards.length}<p class="empty">No reminders waiting.</p>{/if}</div>
 <footer>Stay in your flow. We’ll keep the time.</footer>
</main>
<style>
 :global(body.reminder-surface),:global(body.reminder-surface #app){width:100%;height:100%;margin:0;min-width:0!important;overflow:hidden!important;background:var(--surface-base);color:var(--text-primary)}
 .reminder-cards{box-sizing:border-box;height:100%;display:flex;flex-direction:column;border:1px solid var(--accent-border);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--surface-panel)}header{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border);font-size:10px;letter-spacing:2px;color:var(--text-secondary);font-weight:700}.brand{width:auto;height:auto;margin:0;border:0;background:none;display:inline;border-radius:0;color:var(--accent);font-size:24px;letter-spacing:-2px}.count{margin-left:auto;color:var(--accent)}.stack{flex:1;min-height:0;overflow-y:auto;padding:14px}article{background:var(--surface-raised);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:10px;padding:16px;margin-bottom:12px}.top,.countdown,.time,.actions,button{display:flex;align-items:center;gap:8px}.top{justify-content:space-between}.countdown{color:var(--accent);font-size:13px}.dismiss{flex:none;padding:6px 8px;font-size:11px}.countdown{min-width:0}h1{font-size:20px;line-height:1.35;overflow-wrap:anywhere;margin:14px 0}.time{font-size:14px;color:var(--text-primary)}.time span{margin-left:auto;color:var(--text-secondary);font-size:12px}.room{font-size:13px;color:var(--text-secondary);overflow-wrap:anywhere}.actions{flex-wrap:wrap;margin-top:18px;gap:8px}button{font:inherit;font-size:12px;cursor:pointer;color:var(--accent);background:transparent;border:1px solid var(--accent-border);border-radius:7px;padding:9px 10px}.join{background:var(--accent);color:var(--text-on-accent);font-weight:650}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}footer{font-size:11px;padding:12px 18px;color:var(--text-secondary);border-top:1px solid var(--border)}.error{color:var(--error);padding:0 16px;font-size:12px;overflow-wrap:anywhere}.empty{color:var(--text-secondary);font-size:13px;padding:10px}
</style>
