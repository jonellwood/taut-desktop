// Toolbar visibility is a local app preference, separate from each draft's format.
const key='taut.formatting.visible.v1';
function initial(){try{return localStorage.getItem(key)!=='false';}catch{return true;}}
export const formattingPreference=$state({visible:initial()});
export function toggleFormatting(){formattingPreference.visible=!formattingPreference.visible;try{localStorage.setItem(key,String(formattingPreference.visible));}catch{/* Keep the current session usable when storage is unavailable. */}}
