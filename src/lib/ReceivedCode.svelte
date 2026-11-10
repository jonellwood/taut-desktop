<script lang="ts">
 import {codeTokens,languageLabel} from './message-body';
 let {text,language}:{text:string;language:string}=$props();
 let tokens=$derived(codeTokens(text,language));
 let status=$state('');
 $effect(()=>{text;language;status='';});
 async function copy(){
   status='';const copied=text;
   try{await navigator.clipboard.writeText(copied);if(text===copied)status='Copied';}
   catch{status='Copy unavailable. Select the code to copy manually.';}
 }
</script>
<section class="received-code" aria-label={`${languageLabel(language)} code block`}>
 <header><span>{languageLabel(language)}</span><button type="button" aria-label="Copy code" onclick={copy}>Copy code</button></header>
 <div class="code-scroll" role="textbox" aria-readonly="true" aria-multiline="true" tabindex="0" aria-label={`${languageLabel(language)} code`}><pre><code>{#each tokens as token}<span class={token.style??''}>{token.text}</span>{/each}</code></pre></div>
 {#if status}<small role="status">{status}</small>{/if}
</section>
<style>
 .received-code{display:block;min-width:0;max-width:100%;margin:10px 0;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface-base);color:var(--text-primary);overflow:hidden;white-space:normal}.received-code header{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:8px 12px;border-bottom:1px solid var(--border);color:var(--text-secondary);font-size:11px;line-height:1.5}.received-code button{color:var(--accent);border:1px solid var(--accent-border);border-radius:5px;padding:4px 8px;font-size:10px;flex:none}.code-scroll{overflow:auto;max-height:440px;min-width:0}.received-code pre{margin:0;padding:13px 15px;min-width:max-content;white-space:pre;tab-size:4;line-height:1.65;font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;cursor:text}.received-code code{font:inherit}.received-code small{display:block;padding:6px 12px;color:var(--text-secondary);font-size:10px}.comment{color:var(--syntax-comment)}.string{color:var(--syntax-string)}.variable{color:var(--syntax-variable)}.keyword{color:var(--syntax-keyword)}.command{color:var(--syntax-command)}.number{color:var(--syntax-number)}
</style>
