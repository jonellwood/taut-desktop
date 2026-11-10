import {tick} from 'svelte';
import {bulletEnter} from './compose-format';
type Options={formatted:boolean;onText:(text:string)=>void};
export function continueList(input:HTMLTextAreaElement,options:Options){
 function keydown(event:KeyboardEvent){
  if(!options.formatted||input.disabled||event.defaultPrevented||event.key!=='Enter'||event.isComposing||event.shiftKey||event.metaKey||event.ctrlKey||event.altKey)return;
  const edit=bulletEnter(input.value,input.selectionStart,input.selectionEnd);
  if(!edit)return;
  event.preventDefault();
  if(input.maxLength>=0&&edit.text.length>input.maxLength)return;
  options.onText(edit.text);
  void tick().then(()=>{if(input.isConnected)input.setSelectionRange(edit.caret,edit.caret);});
 }
 input.addEventListener('keydown',keydown);
 return {update(next:Options){options=next;},destroy(){input.removeEventListener('keydown',keydown);}};
}
