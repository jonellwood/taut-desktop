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
