<script lang="ts">
 import {invoke} from '@tauri-apps/api/core';import {onMount,onDestroy} from 'svelte';
 let {ownId,onStatus}:{ownId:string;onStatus:(enabled:boolean)=>void}=$props();
 type Config={enabled:boolean;message:string;groups:boolean;channels:boolean;mail?:boolean;start:number;end:number|null;period:string};
 type Status={config:Config;notice:string;reserved:number;sent:number};
 let config=$state<Config>({enabled:false,message:'',groups:false,channels:false,mail:false,start:0,end:null,period:''}),saved=$state(false),busy=$state(false),error=$state(''),notice=$state(''),sent=$state(0),reserved=$state(0),start=$state(''),end=$state('');let alive=true;
 function local(ms:number|null){if(!ms)return '';const date=new Date(ms);return new Date(ms-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
 function accept(r:Status){onStatus(r.config.enabled);config=r.config;saved=r.config.enabled;notice=r.notice;sent=r.sent;reserved=r.reserved;start=local(config.start);end=local(config.end);}
 async function load(){busy=true;error='';try{const r=await invoke<Status>('away_settings',{ownId});if(alive)accept(r);}catch(e){if(alive)error=String(e);}finally{if(alive)busy=false;}}
 async function save(enabled:boolean){busy=true;error='';try{const r=await invoke<Status>('away_configure',{ownId,config:{...config,enabled,start:start?new Date(start).getTime():Date.now(),end:end?new Date(end).getTime():null}});if(alive)accept(r);}catch(e){if(alive)error=String(e);}finally{if(alive)busy=false;}}
 onMount(()=>{void load();});onDestroy(()=>alive=false);
</script>
<section class="away-settings" aria-label="Away replies">
 <h3>Away replies <span>{saved?'Enabled':'Off'}</span></h3>
 <p>TAUT replies once per internal coworker during this away period, across your enabled destinations. Works while TAUT is running and connected. This does not change Outlook automatic replies or your Out of Office badge.</p>
 <label>Away message<textarea aria-label="Away message" rows="3" maxlength="3000" bind:value={config.message} disabled={busy}></textarea></label>
 <p>Direct chats are included. Hidden chats, bots, edits, historical catch-up and reaction changes are excluded.</p>
 <label><input type="checkbox" bind:checked={config.groups} disabled={busy}/> Also reply in group chats</label>
 <label><input type="checkbox" bind:checked={config.channels} disabled={busy}/> Also reply in channels opened in this TAUT session</label>
 <p>Channel replies go in the triggering post’s thread. Up to 20 visited channels are monitored; only newly observed posts/replies in fetched history qualify. No message is sent when you open a channel.</p>
 <label><input type="checkbox" bind:checked={config.mail} disabled={busy}/> Also reply to direct internal email</label>
 <p>Mail requires Mail.Send consent and a fresh sign-in. Only new Inbox mail addressed directly to you from a verified internal coworker qualifies. Automatic replies, lists and notifications are excluded. Mail uses the same once-per-coworker ledger as chats and channels, so a coworker receives one away reply across all enabled destinations.</p>
 <label>Start <input aria-label="Away start" type="datetime-local" bind:value={start} disabled={busy||saved}/></label><label>End (optional) <input aria-label="Away end" type="datetime-local" bind:value={end} disabled={busy}/></label>
 <p>Editing an enabled period keeps its sent ledger. Disable and enable again to start a new period. TAUT never repeats an uncertain reply automatically.</p>
 <div><button class="outline-button" disabled={busy||!config.message.trim()} onclick={()=>save(true)}>{saved?'Save away replies':'Enable away replies'}</button>{#if saved}<button class="outline-button" disabled={busy} onclick={()=>save(false)}>Disable away replies</button>{/if}<button class="outline-button" disabled={busy} onclick={load}>Refresh away status</button></div>
 <p aria-live="polite">{sent} accepted · {reserved} reserved or uncertain{notice?` · ${notice}`:''}</p>{#if error}<p role="alert">{error}</p>{/if}
</section>
<style>.away-settings{padding:18px 0;border-top:1px solid var(--border)}.away-settings h3{font-size:14px}.away-settings h3 span{color:var(--accent);font-size:11px;margin-left:8px}.away-settings p{font-size:11px;line-height:1.6;color:var(--text-secondary)}.away-settings label{display:block;font-size:12px;margin:12px 0;color:var(--text-primary)}.away-settings textarea{display:block;box-sizing:border-box;width:100%;background:var(--surface-panel);color:var(--text-primary);border:1px solid var(--border-strong);padding:9px;border-radius:6px;margin-top:8px}.away-settings input{accent-color:var(--accent)}.away-settings input[type=datetime-local]{background:var(--surface-panel);color:var(--text-primary);border:1px solid var(--border-strong);padding:6px;margin-left:8px}.away-settings button{font-size:11px;margin-right:8px}.away-settings [role=alert]{color:var(--error)}</style>
