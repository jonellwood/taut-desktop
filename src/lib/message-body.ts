export type ReceivedBody={content?:string;contentType?:string};
export type BodyNode={kind:'text';text:string}|{kind:'br'}|{kind:'code';text:string;language:string}|{kind:'element';tag:string;children:BodyNode[];start?:number}|{kind:'link';url:string;children:BodyNode[]};
const tags=new Set(['p','div','strong','b','em','i','u','s','del','ul','ol','li','blockquote','code','h1','h2','h3','h4','h5','h6']);
const drop=new Set(['script','style','iframe','object','embed','svg','math','form','input','button','textarea','select','video','audio','canvas','link','meta','base','template','noscript']);
export function safeMessageLink(value:string):string|null{
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function codeLanguage(value:string):string{
 const raw=value.trim().split(/\s+/).find(v=>/^(?:language-|lang-)/i.test(v))??value.trim().split(/\s+/)[0]??'';
 const name=raw.replace(/^(?:language-|lang-)/i,'').toLowerCase();
 const aliases:Record<string,string>={ps:'powershell',ps1:'powershell',pwsh:'powershell',js:'javascript',ts:'typescript',sh:'bash',text:'plaintext',plain:'plaintext'};
 const result=aliases[name]??name;
 return /^[a-z][a-z0-9+#.-]{0,30}$/.test(result)?result:'plaintext';
}
export function languageLabel(value:string){const labels:Record<string,string>={powershell:'PowerShell',php:'PHP',plaintext:'Plain text',javascript:'JavaScript',typescript:'TypeScript',json:'JSON',html:'HTML',css:'CSS',sql:'SQL'};return labels[value]??value;}
function codeText(node:Node,depth=0):string{
 if(depth>100)return '[Nested content omitted]';
 if(node.nodeType===3)return node.textContent??'';
 if(node.nodeType!==1)return '';
 const el=node as Element;const tag=el.localName.toLowerCase();
 if(drop.has(tag))return '';
 if(tag==='br')return '\n';
 const text=Array.from(el.childNodes).map(child=>codeText(child,depth+1)).join('');
 return text+(['p','div'].includes(tag)&&el.nextSibling?'\n':'');
}
export function parseMessageBody(body:ReceivedBody|undefined,fallback=''):BodyNode[]{
 const content=body?.content??fallback;
 if(body?.contentType?.toLowerCase()==='text'||!body)return [{kind:'text',text:content}];
 // A template is inert: never insert untrusted HTML, attributes or resource URLs into the live DOM.
 const template=document.createElement('template');template.innerHTML=content;
 let count=0;
 function walk(parent:ParentNode,depth=0):BodyNode[]{
   if(depth>40)return [{kind:'text',text:'[Nested content omitted]'}];
   const result:BodyNode[]=[];
   for(const node of Array.from(parent.childNodes)){
     if(++count>10000){result.push({kind:'text',text:'[Additional content omitted]'});break;}
     if(node.nodeType===3){result.push({kind:'text',text:node.textContent??''});continue;}
     if(node.nodeType!==1)continue;
     const el=node as Element,tag=el.localName.toLowerCase();if(drop.has(tag))continue;
     if(tag==='br'){result.push({kind:'br'});continue;}
     if(tag==='pre'||tag==='codeblock'){
       const code=el.querySelector('code')??el;
       result.push({kind:'code',text:codeText(code),language:codeLanguage(el.getAttribute('data-language')??el.getAttribute('class')??code.getAttribute('class')??'')});continue;
     }
     if(tag==='img'||tag==='attachment'||tag==='file')continue; // Existing media controls handle these explicitly.
     const children=tag==='a'?[{kind:'text' as const,text:el.textContent??''}]:walk(el,depth+1);
     if(tag==='a'){const url=safeMessageLink(el.getAttribute('href')??'');result.push(...(url?[{kind:'link' as const,url,children}]:children));}
     else if(tags.has(tag)){const start=tag==='ol'?Number(el.getAttribute('start')):undefined;result.push({kind:'element',tag,children,start:start&&Number.isSafeInteger(start)&&Math.abs(start)<100000?start:undefined});}
     else result.push(...children);
   }
   return result;
 }
 return walk(template.content);
}
export function receivedText(body:ReceivedBody|undefined,fallback=''):string{
 function flatten(nodes:BodyNode[]):string{return nodes.map(node=>node.kind==='text'||node.kind==='code'?node.text:node.kind==='br'?'\n':flatten(node.children)+(node.kind==='element'&&['p','div','li','blockquote','h1','h2','h3','h4','h5','h6'].includes(node.tag)?'\n':'')).join('');}
 return flatten(parseMessageBody(body,fallback)).trim();
}
export type CodeToken={text:string;style?:'comment'|'string'|'variable'|'keyword'|'number'|'command'};
export function codeTokens(text:string,language:string):CodeToken[]{
 // Single-pass display lexer: unterminated/escaped strings never trigger regex backtracking.
 if(text.length>100000)return [{text}];
 if(language==='php'||language==='javascript')return webCodeTokens(text,language);
 if(language!=='powershell')return [{text}];
 const keywords=new Set(['function','param','if','else','elseif','foreach','for','while','return','try','catch','finally','throw','switch','in','begin','process','end']);
 const tokens:CodeToken[]=[];let i=0,plain=0;
 function emit(end:number,style:CodeToken['style']){
   if(i>plain)tokens.push({text:text.slice(plain,i)});
   tokens.push({text:text.slice(i,end),style});i=end;plain=end;
 }
 while(i<text.length){
   const c=text[i];let end=i+1;
   if(c==='<'&&text[i+1]==='#'){const close=text.indexOf('#>',i+2);emit(close<0?text.length:close+2,'comment');continue;}
   if(c==='#'){const close=text.indexOf('\n',i);emit(close<0?text.length:close,'comment');continue;}
   if(c==="'"||c==='"'){
     while(end<text.length){
       if(c==='"'&&text.charCodeAt(end)===96){end=Math.min(text.length,end+2);continue;}
       if(text[end]===c){if(c==="'"&&text[end+1]==="'"){end+=2;continue;}end++;break;}end++;
     }
     emit(end,'string');continue;
   }
   if(c==='$'){
     if(text[end]==='{'){end++;while(end<text.length&&!['}','\n','\r'].includes(text[end]))end++;if(text[end]==='}')end++;}
     else while(end<text.length&&/[\w:?]/.test(text[end]))end++;
     if(end>i+1){emit(end,'variable');continue;}
   }
   if(/[A-Za-z_]/.test(c)){
     while(end<text.length&&/[\w-]/.test(text[end]))end++;
     const word=text.slice(i,end);const style=keywords.has(word.toLowerCase())?'keyword':/^[A-Za-z]+-[A-Za-z][\w-]*$/.test(word)?'command':undefined;
     if(style){emit(end,style);continue;}i=end;continue;
   }
   if(/[0-9]/.test(c)){while(end<text.length&&/[0-9.]/.test(text[end]))end++;emit(end,'number');continue;}
   i++;
 }
 if(plain<text.length)tokens.push({text:text.slice(plain)});
 return tokens;
}

// Small display-only lexer, not a language parser. No source is evaluated.
const javascriptKeywords=new Set('async await break case catch class const continue debugger default delete do else export extends false finally for from function get if import in instanceof let new null of return set static super switch this throw true try typeof undefined var void while with yield'.split(' '));
const phpKeywords=new Set('abstract and array as bool break callable case catch class clone const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum eval exit extends false final finally float fn for foreach function global if implements include include_once instanceof insteadof int interface isset iterable list match mixed namespace new null object or parent print private protected public readonly require require_once return self static string super switch throw trait true try unset use var void while xor yield'.split(' '));
function webCodeTokens(text:string,language:'php'|'javascript'):CodeToken[]{
 const tokens:CodeToken[]=[];let i=0,plain=0;const php=language==='php';
 const keywords=php?phpKeywords:javascriptKeywords;
 const number=/(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9][0-9_]*)(?:[eE][+-]?[0-9_]+)?)(?:n)?/y;
 function emit(end:number,style:CodeToken['style']){if(i>plain)tokens.push({text:text.slice(plain,i)});tokens.push({text:text.slice(i,end),style});i=end;plain=end;}
 while(i<text.length){
  const c=text[i];let end=i+1;
  if(text.startsWith('/*',i)){const close=text.indexOf('*/',i+2);emit(close<0?text.length:close+2,'comment');continue;}
  if(text.startsWith('//',i)||(php&&c==='#'&&text[i+1]!=='[')){const close=text.indexOf('\n',i);emit(close<0?text.length:close,'comment');continue;}
  if(c==="'"||c==='"'||(!php&&c==='`')){
   while(end<text.length){if(text[end]==='\\'){end=Math.min(text.length,end+2);continue;}if(text[end++]===c)break;}
   emit(end,'string');continue;
  }
  if(php&&(text.startsWith('<?php',i)||text.startsWith('?>',i))){emit(i+(text.startsWith('<?php',i)?5:2),'keyword');continue;}
  if(php&&c==='$'&&/[A-Za-z_\u0080-\uffff]/.test(text[end]??'')){while(end<text.length&&/[\w\u0080-\uffff]/.test(text[end]))end++;emit(end,'variable');continue;}
  if(/[A-Za-z_$\u0080-\uffff]/.test(c)){
   while(end<text.length&&/[\w$\u0080-\uffff]/.test(text[end]))end++;
   const word=text.slice(i,end);let next=end;while(next<text.length&&/\s/.test(text[next]))next++;
   const style=keywords.has(php?word.toLowerCase():word)?'keyword':text[next]==='('?'command':undefined;
   if(style){emit(end,style);continue;}i=end;continue;
  }
  if(/[0-9]/.test(c)||(c==='.'&&/[0-9]/.test(text[end]??''))){number.lastIndex=i;const match=number.exec(text);if(match){emit(number.lastIndex,'number');continue;}}
  i++;
 }
 if(plain<text.length)tokens.push({text:text.slice(plain)});
 return tokens;
}
