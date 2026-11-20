export type CardAttachment={id?:string;name?:string;contentType?:string;content?:unknown;contentUrl?:string};
export type CardNode={kind:'text';text:string;heading:boolean;attention:boolean;separator?:boolean}|{kind:'group'|'columns';children:CardNode[];separator?:boolean}|{kind:'facts';facts:{title:string;value:string}[];separator?:boolean};
export type CardPreview={name:string;status:'ready'|'invalid'|'unsupported';nodes:CardNode[];limited:boolean};
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const adaptive='application/vnd.microsoft.card.adaptive';
const legacy=new Set(['application/vnd.microsoft.teams.card.o365connector','application/vnd.microsoft.card.message']);
export function cardPreview(attachment:CardAttachment):CardPreview{
 attachment=object(attachment) as CardAttachment;
 const mime=typeof attachment.contentType==='string'?attachment.contentType.split(';')[0].trim().toLowerCase():'';
 const result:CardPreview={name:attachment.name||(mime===adaptive||legacy.has(mime)?'Shared card':'Attachment'),status:'unsupported',nodes:[],limited:false};
 if(mime!==adaptive&&!legacy.has(mime))return result;
 result.status='invalid';if(typeof attachment.content==='string'&&attachment.content.length>131072)return result;
 let raw:Record<string,unknown>;try{raw=object(typeof attachment.content==='string'?JSON.parse(attachment.content):attachment.content);}catch{return result;}
 if(mime===adaptive&&raw.type!=='AdaptiveCard')return result;
 let count=0,characters=0;
 function text(v:unknown){if(typeof v!=='string')return '';const room=Math.max(0,32000-characters),n=Math.min(v.length,8000,room);characters+=n;if(n<v.length)result.limited=true;return v.slice(0,n);}
 function list(v:unknown,depth:number):CardNode[]{if(!Array.isArray(v))return [];const out:CardNode[]=[];for(const item of v){if(count>=200){result.limited=true;break;}out.push(...walk(item,depth));}return out;}
 function walk(v:unknown,depth:number):CardNode[]{
  const e=object(v);if(depth>16||++count>200){result.limited=true;return [];}if(e.isVisible===false)return [];
  const separator=e.separator===true;if(e.selectAction)result.limited=true;
  switch(e.type){
   case 'TextBlock':{const value=text(e.text);return value?[{kind:'text',text:value,heading:String(e.weight).toLowerCase()==='bolder'||['large','extralarge'].includes(String(e.size).toLowerCase()),attention:String(e.color).toLowerCase()==='attention',separator}]:[];}
   case 'RichTextBlock':{const value=(Array.isArray(e.inlines)?e.inlines:[]).slice(0,200).map(i=>text(typeof i==='string'?i:object(i).text)).join('');return value?[{kind:'text',text:value,heading:false,attention:false,separator}]:[];}
   case 'Container':case 'Column':case 'TableCell':return [{kind:'group',children:list(e.items,depth+1),separator}];
   case 'ColumnSet':return [{kind:'columns',children:list(e.columns,depth+1),separator}];
   case 'FactSet':{const rawFacts=Array.isArray(e.facts)?e.facts:[],limit=Math.min(100,200-count);const facts=rawFacts.slice(0,limit).map(f=>({title:text(object(f).title??object(f).name),value:text(object(f).value)}));count+=facts.length;if(rawFacts.length>limit)result.limited=true;return [{kind:'facts',facts,separator}];}
   case 'Table':return [{kind:'group',children:(Array.isArray(e.rows)?e.rows:[]).slice(0,100).map(row=>({kind:'columns',children:list(object(row).cells,depth+1)})),separator}];
   default:result.limited=true;return typeof e.fallback==='object'?walk(e.fallback,depth+1):[];
  }
 }
 if(mime===adaptive){result.nodes=list(raw.body,0);if(Array.isArray(raw.actions)&&raw.actions.length)result.limited=true;}
 else{
  const add=(value:unknown,heading=false)=>{const t=text(value);if(t)result.nodes.push({kind:'text',text:t,heading,attention:false});};
  add(raw.title,true);add(raw.text);
  for(const section of (Array.isArray(raw.sections)?raw.sections:[]).slice(0,50)){const e=object(section);add(e.title,true);add(e.activityTitle,true);add(e.activitySubtitle);add(e.text);result.nodes.push(...walk({type:'FactSet',facts:e.facts},0));if(e.images||e.potentialAction)result.limited=true;}
  if(raw.potentialAction||raw.images)result.limited=true;
 }
 const readable=(nodes:CardNode[]):boolean=>nodes.some(n=>n.kind==='text'?!!n.text:n.kind==='facts'?n.facts.some(f=>f.title||f.value):readable(n.children));
 if(!readable(result.nodes)){const fallback=text(raw.fallbackText);if(fallback)result.nodes=[{kind:'text',text:fallback,heading:false,attention:false}];else return result;}
 result.status='ready';return result;
}
export function cardPreviews(attachments:CardAttachment[]|undefined){return (Array.isArray(attachments)?attachments:[]).slice(0,8).map(cardPreview);}
