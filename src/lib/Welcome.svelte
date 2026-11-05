<script lang="ts">
 import {Search,SquarePen,PanelLeftOpen,RefreshCw} from 'lucide-svelte';
 let {onNew,onSearch,onRefresh,onSidebar,sidebarOpen,busy=false,signedIn=true,onSignIn}:
 {onNew:()=>void;onSearch:()=>void;onRefresh:()=>void;onSidebar:()=>void;sidebarOpen:boolean;busy?:boolean;signedIn?:boolean;onSignIn?:()=>void}=$props();
</script>
<section class="welcome" aria-label="Welcome to TAUT">
 <div class="welcome-tools">
  {#if !sidebarOpen}<button onclick={onSidebar} aria-label="Expand sidebar" title="Show conversations"><PanelLeftOpen size={18}/></button>{/if}
  {#if signedIn}<button onclick={onRefresh} disabled={busy} aria-label="Refresh messages" title="Refresh conversations"><RefreshCw size={17} class={busy?'spinning':''}/></button>{/if}
 </div>
 <div class="welcome-content">
  <div class="signal-art" aria-hidden="true">
   <svg viewBox="0 0 360 300" fill="none">
    <defs><radialGradient id="signal-halo"><stop stop-color="currentColor" stop-opacity=".13"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="180" cy="150" rx="160" ry="140" fill="url(#signal-halo)"/>
    <g class="signal-guides" stroke="currentColor"><circle cx="180" cy="150" r="113" stroke-dasharray="1 13"/><path d="M20 150h24m272 0h24M180 10v24m0 232v24"/></g>
    <g class="signal-noise" stroke="currentColor" stroke-linecap="round">
     {#each [0,1,2,3,4,5,6,7] as n}<path d={`M${30+n*37} ${70+n%3*68}h${12+n%3*8}`} style={`--n:${n};--drift:${n%2?'-':'+'}24px`}/>{/each}
    </g>
    <g class="signal-mark" stroke="currentColor" stroke-width="9" stroke-linecap="square">
     <path class="mark-top" d="M107 111H195"/>
     <path class="mark-stem" d="M151 111V203"/>
     <path class="mark-slash" d="M244 103L215 203"/>
    </g>
    <path class="signal-baseline" d="M112 235h136" stroke="currentColor" stroke-opacity=".24"/>
   </svg>
  </div>
  <span class="welcome-eyebrow">TAUT / ROOM TO FOCUS</span>
  <h1>Less noise.<br/><span>More signal.</span></h1>
  <p class="welcome-copy">{signedIn?"Your conversations, at your pace.":"Your Microsoft 365 workspace. A little more room to focus."}</p>
  <div class="welcome-actions">
   {#if signedIn}<button class="welcome-primary" onclick={onNew}><SquarePen size={17}/>Start a conversation</button>
   <button class="welcome-search" onclick={onSearch}><Search size={17}/>Search conversations <kbd>⌘ K</kbd></button>{:else}<button class="welcome-primary" onclick={onSignIn} disabled={busy}>Connect Microsoft 365</button>{/if}
  </div>
  <p class="welcome-note">{#if signedIn}Choose a conversation when you’re ready.<br/>Nothing is marked read until you open it and view the latest messages.{:else}Sign in to bring your chats and channels into TAUT.<br/>Your workspace stays quiet until you choose a conversation.{/if}</p>
 </div>
 <span class="welcome-footer">A LITTLE LESS DISTRACTION. A LITTLE MORE ROOM.</span>
</section>
<style>
 .welcome{position:relative;flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;background:radial-gradient(ellipse at 50% 37%,#1b2a3040,transparent 65%);padding:48px 24px 24px}
 .welcome-tools{position:absolute;top:18px;right:20px;display:flex;gap:8px}.welcome-tools button{color:#8f9fa9;padding:9px;border-radius:8px}.welcome-tools button:hover{background:#22313a;color:var(--accent)}
 .welcome-content{text-align:center;margin:auto 0;padding:12px 0 28px;max-width:620px;width:100%}.signal-art{width:300px;max-width:65%;margin:0 auto 4px;color:var(--accent)}.signal-art svg{display:block;width:100%;overflow:visible}.signal-guides{opacity:.22}.signal-mark{filter:drop-shadow(0 0 12px #efbb7015)}
 .welcome-eyebrow{color:#9b8c73;font-size:10px;letter-spacing:3px;font-weight:700}.welcome h1{font-size:clamp(34px,4.5vw,56px);line-height:1.13;letter-spacing:-2px;font-weight:600;margin:20px 0 16px}.welcome h1 span{color:var(--accent)}.welcome-copy{color:#a7b5bf;font-size:16px;line-height:1.6;margin:0 0 30px}
 .welcome-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}.welcome-actions button{display:flex;align-items:center;justify-content:center;gap:10px;padding:13px 17px;border-radius:9px;font-size:12px}.welcome-primary{background:var(--accent);color:#172027;font-weight:700}.welcome-primary:hover{filter:brightness(1.08)}.welcome-search{border:1px solid #3d4c56;color:#c1ccd4}.welcome-search:hover{border-color:var(--accent)}kbd{font-size:10px;color:#8d9da7;margin-left:8px}.welcome-note{font-size:11px;line-height:1.8;color:#7f909b;margin:25px 0 0}.welcome-footer{font-size:8px;letter-spacing:2px;color:#61737e;text-align:center;padding-top:20px}
 .mark-top{animation:settle-top 1.7s cubic-bezier(.2,.7,.2,1) both}.mark-stem{animation:settle-stem 1.9s cubic-bezier(.2,.7,.2,1) both}.mark-slash{animation:settle-slash 2.1s cubic-bezier(.2,.7,.2,1) both}.signal-noise path{opacity:0;animation:quiet 1.4s ease-out both;animation-delay:calc(var(--n)*.045s)}
 @keyframes settle-top{from{opacity:0;transform:translate(-35px,-22px) rotate(-8deg)}to{opacity:1;transform:none}}@keyframes settle-stem{from{opacity:0;transform:translate(12px,32px)}to{opacity:1;transform:none}}@keyframes settle-slash{from{opacity:0;transform:translate(38px,-14px)}to{opacity:1;transform:none}}@keyframes quiet{0%,20%{opacity:.38}100%{opacity:0;transform:translateY(var(--drift))}}
 @media(prefers-reduced-motion:reduce){.signal-mark path,.signal-noise path{animation:none}.signal-noise{display:none}}
 @media(max-height:700px){.welcome{padding-top:42px}.signal-art{width:190px}.welcome h1{font-size:36px;margin-top:12px}.welcome-copy{margin-bottom:20px}.welcome-footer{display:none}}
</style>
