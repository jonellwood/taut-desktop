// Preserve a visible item's position when new summaries arrive above it.
export function scrollAnchor(container:HTMLElement|undefined,selector:string){
 if(!container)return ()=>{};
 const top=container.getBoundingClientRect().top;
 const anchor=Array.from(container.querySelectorAll<HTMLElement>(selector)).find(el=>el.getBoundingClientRect().bottom>top);
 const offset=anchor?.getBoundingClientRect().top,scroll=container.scrollTop;
 return ()=>{if(anchor?.isConnected&&offset!==undefined)container.scrollTop+=anchor.getBoundingClientRect().top-offset;else container.scrollTop=scroll;};
}
