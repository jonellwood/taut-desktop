// Run before the application loads so saved appearance is applied before first paint.
(() => {
 const key = 'taut.appearance.v1';
 const defaults = {mode:'system',accent:'amber',contrast:'system'};
 function read(value) {
  return {mode:['system','light','dark'].includes(value?.mode)?value.mode:defaults.mode,
   accent:['amber','teal','violet','blue','rose'].includes(value?.accent)?value.accent:defaults.accent,
   contrast:['system','standard','increased'].includes(value?.contrast)?value.contrast:defaults.contrast};
 }
 let settings;
 try { settings=read(JSON.parse(localStorage.getItem(key)||'null')); } catch { settings=read(null); }
 const dark=matchMedia('(prefers-color-scheme: dark)'), contrast=matchMedia('(prefers-contrast: more)');
 function apply() {
  const theme=settings.mode==='system'?(dark.matches?'dark':'light'):settings.mode;
  const increased=settings.contrast==='increased'||settings.contrast==='system'&&contrast.matches;
  Object.assign(document.documentElement.dataset,{theme,accent:settings.accent,contrast:increased?'increased':'standard'});
  document.documentElement.style.colorScheme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#10151a':'#e9e9e3');
 }
 window.tautAppearance={get:()=>({...settings}),set:value=>{settings=read(value);try{localStorage.setItem(key,JSON.stringify(settings));}catch{}apply();}};
 dark.addEventListener('change',apply);contrast.addEventListener('change',apply);
 window.addEventListener('storage',event=>{if(event.key===key){try{settings=read(JSON.parse(event.newValue||'null'));}catch{settings=read(null);}apply();}});
 apply();
})();
