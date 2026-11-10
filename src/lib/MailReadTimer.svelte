<script lang="ts">
 import {onMount} from 'svelte';
 let {delay,enabled,onRead}:{delay:number;enabled:boolean;onRead:()=>void}=$props();
 let marker:HTMLSpanElement;
 onMount(()=>{let visible=false,since=0,attempted=false;
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;},{threshold:0});observer.observe(marker);
 const timer=setInterval(()=>{const blocked=Array.from(document.querySelectorAll('dialog[open],.settings-overlay,.overlay,.mail-preview-backdrop,.discovery-overlay,.read-menu')).find(el=>el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0);if(!enabled||!delay||!visible||document.visibilityState!=='visible'||!document.hasFocus()||blocked){since=0;return;}if(!since)since=Date.now();if(!attempted&&Date.now()-since>=delay*1000){attempted=true;onRead();}},200);
 return ()=>{clearInterval(timer);observer.disconnect();};});
</script>
<span class="mail-read-marker" bind:this={marker} aria-hidden="true"></span>

<style>span{display:block;width:100%;height:1px}</style>
