<script lang="ts">
 import {openUrl} from '@tauri-apps/plugin-opener';
 import {version} from '../../package.json';
 import {alphaFeedbackUrl} from './alpha-feedback';
 let error=$state('');
 async function feedback(){error='';try{await openUrl(alphaFeedbackUrl(version));}catch{error='GitHub could not be opened. Try again, or visit the TAUT repository’s Issues page.';}}
</script>
<section aria-label="Alpha feedback">
 <h3>Help shape TAUT</h3><p>Version {version}</p>
 <p>Report a bug, suggest an improvement, or tell us what felt confusing.</p>
 <p>The button opens a draft GitHub issue in your browser. Sign in to GitHub, review your report, and choose Submit new issue when ready. Only information you enter or attach there is submitted.</p>
 <p>Issues in this repository are public. Remove private message, email and account information before posting.</p>
 <button type="button" onclick={feedback}>Send feedback on GitHub ↗</button>
 {#if error}<p role="alert">{error}</p>{/if}
</section>
<style>
section{max-width:620px}h3{font-size:20px;margin:0 0 12px}p{font-size:13px;line-height:1.8;color:var(--text-secondary)}button{font:inherit;font-size:13px;color:var(--accent);padding:12px 16px;border:1px solid var(--border-strong);border-radius:8px;cursor:pointer}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}[role=alert]{color:var(--error)}
</style>
