import {clipboardImages,droppedFiles,transferHasFiles} from './attachments';
type Options={enabled:boolean;onFiles:(files:File[])=>void;onError:(message:string)=>void;onDrag:(active:boolean)=>void};
// Global file-drop prevention keeps Finder drops from navigating the webview.
// Only the main chat composer accepts files; other composers remain text-only.
export function attachmentInput(root:HTMLElement,options:Options){
 function inComposer(target:EventTarget|null){return target instanceof Node&&!!root.querySelector('form.composer')?.contains(target);}
 function drag(event:DragEvent){
  if(!transferHasFiles(event.dataTransfer))return;
  event.preventDefault();const active=options.enabled&&inComposer(event.target);
  options.onDrag(active);if(event.dataTransfer)event.dataTransfer.dropEffect=active?'copy':'none';
 }
 function leave(event:DragEvent){if(!inComposer(event.relatedTarget))options.onDrag(false);}
 function clear(){options.onDrag(false);}
 function drop(event:DragEvent){
  if(!transferHasFiles(event.dataTransfer))return;
  event.preventDefault();clear();
  if(!options.enabled||!inComposer(event.target)){options.onError('Drop files onto the main chat composer in an available conversation.');return;}
  try{options.onFiles(droppedFiles(event.dataTransfer!));}catch(error){options.onError(String(error));}
 }
 function paste(event:ClipboardEvent){
  if(!(event.target instanceof HTMLTextAreaElement)||!inComposer(event.target)||!event.clipboardData)return;
  let files:File[];
  try{files=clipboardImages(event.clipboardData);}catch(error){event.preventDefault();options.onError(String(error));return;}
  if(!files.length)return; // Preserve normal text/code paste, including HTML clipboard text.
  event.preventDefault();
  if(!options.enabled){options.onError('Image paste is unavailable while this conversation is busy or signed out.');return;}
  options.onFiles(files);
 }
 function key(event:KeyboardEvent){if(event.key==='Escape')clear();}
 window.addEventListener('dragenter',drag);window.addEventListener('dragover',drag);window.addEventListener('dragleave',leave);window.addEventListener('dragend',clear);window.addEventListener('drop',drop);window.addEventListener('paste',paste);window.addEventListener('keydown',key);window.addEventListener('blur',clear);
 return {update(next:Options){options=next;if(!next.enabled)clear();},destroy(){window.removeEventListener('dragenter',drag);window.removeEventListener('dragover',drag);window.removeEventListener('dragleave',leave);window.removeEventListener('dragend',clear);window.removeEventListener('drop',drop);window.removeEventListener('paste',paste);window.removeEventListener('keydown',key);window.removeEventListener('blur',clear);}};
}
