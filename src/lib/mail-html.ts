import {safeMessageLink} from './message-body.ts';
const allowed=new Set('p div span font br hr strong b em i u s del small sub sup h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code table thead tbody tfoot tr th td caption colgroup col'.split(' '));
const drop=new Set('script style iframe frame frameset object embed svg math form input button textarea select option video audio canvas link meta base template noscript head title'.split(' '));
export type RenderedMail={html:string;links:string[];images:number;shortened:boolean;hasContent:boolean};
// Preserve only bounded literal dimensions, never arbitrary email CSS.
function imageSize(el:Element,img:HTMLImageElement){
 const style=(el as HTMLElement).style;
 function pixels(value:string){
  const match=/^(\d+(?:\.\d+)?)(px|pt|in|cm|mm)?$/i.exec(value.trim());
  if(!match)return undefined;
  const scale:Record<string,number>={px:1,pt:96/72,in:96,cm:96/2.54,mm:96/25.4};
  const n=Number(match[1])*scale[(match[2]||'px').toLowerCase()];
  return n>0&&n<=4096?n:undefined;
 }
 const width=pixels(style.width)||pixels(el.getAttribute('width')||'');
 const height=pixels(style.height)||pixels(el.getAttribute('height')||'');
 if(width)img.style.width=`${width}px`;
 if(width&&height)img.style.aspectRatio=`${width} / ${height}`;
 else if(height)img.style.height=`${height}px`;
}
export function renderMailHtml(source:string,approved:Record<string,string>={}):RenderedMail{
 const template=document.createElement('template');template.innerHTML=source.slice(0,300000);
 const output=document.createElement('div'),links:string[]=[];let images=0,count=0,shortened=source.length>300000;
 function walk(parent:ParentNode,target:Node,depth:number){
  if(depth>40){shortened=true;return;}
  for(const node of Array.from(parent.childNodes)){
   if(++count>10000){shortened=true;return;}
   if(node.nodeType===3){target.appendChild(document.createTextNode(node.textContent??''));continue;}
   if(node.nodeType!==1)continue;
   const el=node as Element,tag=el.localName.toLowerCase();
   if(drop.has(tag))continue;
   if(tag==='img'){const src=el.getAttribute('src')??'';const data=src.startsWith('cid:')?approved[src.slice(4)]:undefined;if(data&&/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(data)){const img=document.createElement('img');img.src=data;img.alt=(el.getAttribute('alt')??'Inline image').slice(0,150);imageSize(el,img);target.appendChild(img);continue;}images++;const placeholder=document.createElement('span');placeholder.className='blocked-image';placeholder.textContent=`[Image blocked${el.getAttribute('alt')?`: ${el.getAttribute('alt')!.slice(0,150)}`:''}]`;target.appendChild(placeholder);continue;}
   if(tag==='a'){
    const url=safeMessageLink(el.getAttribute('href')??'');
    const label=document.createElement('span');if(url)label.className='mail-link';
    // Signatures often wrap CID images in links. Sanitize their children too,
    // so image approval works without making the original link navigable.
    walk(el,label,depth+1);
    if(url&&links.length<100){let index=links.indexOf(url);if(index<0){links.push(url);index=links.length-1;}if(!label.querySelector('img')||label.textContent?.trim())label.appendChild(document.createTextNode(` [${index+1}]`));}
    target.appendChild(label);continue;
   }
   if(!allowed.has(tag)){walk(el,target,depth+1);continue;}
   const clean=document.createElement(tag);
   // Reconstruct bounded semantic values and validated resource-free colors only.
   if(['td','th'].includes(tag))for(const attr of ['colspan','rowspan']){const value=el.getAttribute(attr)??'';if(/^[1-9]\d?$/.test(value))clean.setAttribute(attr,value);}
   if(tag==='ol'){const value=el.getAttribute('start')??'';if(/^-?\d{1,4}$/.test(value))clean.setAttribute('start',value);}
   const dir=el.getAttribute('dir');if(dir==='rtl'||dir==='ltr')clean.setAttribute('dir',dir);
   const style=(el as HTMLElement).style;
   if(style){for(const property of ['text-align','font-weight','font-style','text-decoration-line','white-space']){
    const value=style.getPropertyValue(property).trim();
    const values:Record<string,RegExp>={'text-align':/^(left|right|center|justify)$/,'font-weight':/^(normal|bold|[1-9]00)$/,'font-style':/^(normal|italic|oblique)$/,'text-decoration-line':/^(underline|line-through)$/,'white-space':/^(pre|pre-wrap|normal)$/};
    if(values[property].test(value))clean.style.setProperty(property,value);
   }}
   // CSSOM parses shorthand colors, but only literal color values survive.
   const literalColor=(value:string)=>{
    value=value.trim();
    if(/^(inherit|initial|unset|revert|currentcolor)$/i.test(value))return '';
    if(!/^(#[a-f\d]{3,8}|[a-z]{1,30}|(?:rgb|hsl)a?\([\d.,%+\-\s/deg]+\))$/i.test(value))return '';
    const probe=document.createElement('span');probe.style.color=value;return probe.style.color;
   };
   for(const [property,value] of [
    ['color',style?.color||el.getAttribute('color')||''],
    ['background-color',style?.backgroundColor||el.getAttribute('bgcolor')||''],
    ['border-color',style?.borderColor||'']
   ]){const color=literalColor(value);if(color)clean.style.setProperty(property,color);}
   target.appendChild(clean);walk(el,clean,depth+1);
  }
 }
 walk(template.content,output,0);
 return {html:output.innerHTML,links,images,shortened,hasContent:!!output.querySelector('img')||!!output.textContent?.replace(/[\s\u200b\ufeff]/g,'')};
}
// Resolve each element against its effective background. Keep readable sender colors,
// and supply a black/white fallback for WebKit versions without contrast-color().
function readableColors(body:string,theme:{text:string;background:string;accent:string}){
 const root=document.createElement('div');root.innerHTML=body;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
 const context=canvas.getContext('2d')!;
 type RGB=[number,number,number,number];
 const cache=new Map<string,RGB>();
 function rgba(value:string):RGB{const cached=cache.get(value);if(cached)return cached;context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);const d=context.getImageData(0,0,1,1).data;const result:RGB=[d[0],d[1],d[2],d[3]/255];cache.set(value,result);return result;}
 const composite=(a:RGB,b:RGB):RGB=>[a[0]*a[3]+b[0]*(1-a[3]),a[1]*a[3]+b[1]*(1-a[3]),a[2]*a[3]+b[2]*(1-a[3]),1];
 const luminance=(c:RGB)=>c.slice(0,3).reduce((sum,n,i)=>{const v=n/255;return sum+[.2126,.7152,.0722][i]*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4);},0);
 const ratio=(a:RGB,b:RGB)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 function visit(parent:HTMLElement,background:RGB,foreground:string){for(const el of Array.from(parent.children) as HTMLElement[]){
  const bg=el.style.backgroundColor?composite(rgba(el.style.backgroundColor),background):background;
  const fg=el.style.color|| (el.classList.contains('mail-link')?theme.accent:foreground);
  const effective=composite(rgba(fg),bg);
  // Set every element explicitly so a repaired ancestor cannot obscure a child
  // that introduces a different background while inheriting the original ink.
  el.style.color=fg;
  if(ratio(effective,bg)<4.5){const ink=luminance(bg)>.179?'#000000':'#ffffff';el.style.color=ink;el.classList.add('mail-contrast-repair');el.style.setProperty('--mail-background',`rgb(${bg.slice(0,3).map(Math.round).join(',')})`);}
  visit(el,bg,fg);
 }}
 visit(root,rgba(theme.background),theme.text);return root.innerHTML;
}
export function mailHtmlDocument(body:string,colors:{text:string;background:string;border:string;accent:string}){
 // Colors come from TAUT's own computed theme, not from email content.
 const color=(value:string,fallback:string)=>/^(#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/i.test(value)?value:fallback;
 body=readableColors(body,{text:color(colors.text,'#ddd'),background:color(colors.background,'#17232b'),accent:color(colors.accent,'#efbd70')});
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>
 html{color:${color(colors.text,'#ddd')};background:${color(colors.background,'#17232b')};font:14px/1.7 system-ui,sans-serif;overflow-wrap:anywhere}body{margin:16px}img{max-width:100%;height:auto}p{margin:.7em 0}table{border-collapse:collapse;max-width:100%}td,th{padding:0;text-align:left;vertical-align:top}blockquote{margin:12px 0;padding-left:14px;border-left:3px solid ${color(colors.border,'#66717b')}}pre{white-space:pre-wrap}code{font-family:ui-monospace,monospace}.mail-link{color:${color(colors.accent,'#efbd70')};text-decoration:underline}.blocked-image{margin:2px 4px 2px 0;display:inline-block;padding:4px 8px;border:1px dashed ${color(colors.border,'#66717b')};font-size:12px}hr{border:0;border-top:1px solid ${color(colors.border,'#66717b')}}
 @supports(color:contrast-color(white)){.mail-contrast-repair{color:contrast-color(var(--mail-background))!important}}
 </style></head><body>${body}</body></html>`;
}
