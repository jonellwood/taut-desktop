// Deliberately small formatting vocabulary; raw HTML is always text.
export const composeLanguages=['text','powershell','php','javascript','typescript','json','bash','python','sql','html','css','rust','csharp'];
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function inline(s:string):string{
 let out='';
 while(s){
  const mark=s.startsWith('**')?'**':s.startsWith('`')?'`':'';
  const end=mark?s.indexOf(mark,mark.length):-1;
  if(mark&&end>mark.length){const value=escape(s.slice(mark.length,end));out+=mark==='**'?`<strong>${value}</strong>`:`<code>${value}</code>`;s=s.slice(end+mark.length);continue;}
  if(s[0]==='['){const close=s.indexOf(']('),stop=close>1?s.indexOf(')',close+2):-1;if(stop>close+2){const href=s.slice(close+2,stop);try{const u=new URL(href);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password){out+=`<a href="${escape(href)}">${escape(s.slice(1,close))}</a>`;s=s.slice(stop+1);continue;}}catch{ /* literal fallback */ }}}
  out+=escape(s[0]);s=s.slice(1);
 }
 return out;
}
export function formatDraft(source:string):{html:string;visible:string}{
 const lines=source.replaceAll('\r\n','\n').replaceAll('\r','\n').split('\n');let html='',visible='';
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(line.startsWith('```')){const language=line.slice(3).trim().toLowerCase();const code:string[]=[];while(++i<lines.length&&lines[i]!=='```')code.push(lines[i]);const value=code.join('\n');html+=`<codeblock class="${composeLanguages.includes(language)&&language!=='text'?language:'plaintext'}"><code>${escape(value)}</code></codeblock>`;visible+=value;continue;}
  const list=line.startsWith('- ')?'ul':/^\d+\. /.test(line)?'ol':'';
  if(list){html+=`<${list}>`;do{const value=lines[i].replace(list==='ul'?/^- /:/^\d+\. /,'');html+=`<li>${inline(value)}</li>`;visible+=value;i++;}while(i<lines.length&&(list==='ul'?lines[i].startsWith('- '):/^\d+\. /.test(lines[i])));i--;html+=`</${list}>`;continue;}
  html+=line?`<p>${inline(line)}</p>`:'<p><br></p>';visible+=line;
 }
 return {html,visible:visible.trim()};
}

// Continue only a collapsed caret at the end of a bullet, outside fenced code.
export function bulletEnter(text:string,start:number,end:number):{text:string;caret:number}|null{
 if(start!==end)return null;
 const lineStart=text.lastIndexOf('\n',start-1)+1;
 const nextBreak=text.indexOf('\n',start);
 if(start!==(nextBreak===-1?text.length:nextBreak))return null;
 let fenced=false;
 for(const line of text.slice(0,lineStart).split('\n')){
  if(!fenced&&line.startsWith('```'))fenced=true;
  else if(fenced&&line==='```')fenced=false;
 }
 if(fenced)return null;
 const line=text.slice(lineStart,start);
 if(!line.startsWith('- '))return null;
 if(!line.slice(2).trim()){
  const value=text.slice(0,lineStart)+'\n'+text.slice(end);
  return {text:value,caret:lineStart+1};
 }
 return {text:text.slice(0,start)+'\n- '+text.slice(end),caret:start+3};
}

export const messageByteLimit=64*1024;
export function messageBytes(value:string){return Math.max(new TextEncoder().encode(value).length,value.length*2);}
export function messageSizeError(text:string,formatted=false):string{
 const source=text.trim();let bytes=messageBytes(source);
 if(bytes<=messageByteLimit&&formatted)bytes=Math.max(bytes,messageBytes(formatDraft(source).html));
 return bytes>messageByteLimit?`Message is too large (${(bytes/1024).toFixed(1)} KiB including formatting). TAUT supports up to 64 KiB. Shorten it or send the code as a file. Your draft is saved.`:'';
}
// Change a fence at the caret (or the only block), without wrapping/nesting it.
function codeFenceAt(text:string,start:number,end:number){
 const blocks:{start:number;headerEnd:number;end:number}[]=[];let open:{start:number;headerEnd:number;end:number}|null=null,offset=0;
 for(const line of text.split('\n')){
  if(!open&&line.startsWith('```'))open={start:offset,headerEnd:offset+line.length-(line.endsWith('\r')?1:0),end:text.length};
  else if(open&&(line==='```'||line==='```\r')){open.end=offset+line.length;blocks.push(open);open=null;}
  offset+=line.length+1;
 }
 if(open)blocks.push(open);
 return blocks.find(b=>start>=b.start&&end<=b.end)??(blocks.length===1?blocks[0]:null);
}
export function currentCodeLanguage(text:string,start:number,end:number):string|null{
 const block=codeFenceAt(text,start,end);if(!block)return null;
 const language=text.slice(block.start+3,block.headerEnd).trim().toLowerCase();
 return composeLanguages.includes(language)?language:null;
}
export function changeCodeLanguage(text:string,start:number,end:number,language:string):{text:string;start:number;end:number}|null{
 if(!composeLanguages.includes(language))return null;
 const block=codeFenceAt(text,start,end);if(!block)return null;
 const header='```'+language,delta=header.length-(block.headerEnd-block.start);
 const move=(position:number)=>position<=block.start?position:position<block.headerEnd?Math.min(position,block.start+header.length):position+delta;
 return {text:text.slice(0,block.start)+header+text.slice(block.headerEnd),start:move(start),end:move(end)};
}
