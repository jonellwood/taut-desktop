import {identityKey,type EventIdentity,type IdentityNames} from './activity.ts';
export type ApiReaction={reactionType?:string;displayName?:string|null;reactionContentUrl?:string|null;createdDateTime?:string;user?:{user?:EventIdentity|null}|null};
export type ReactionGroup={key:string;emoji:string;label:string;count:number;people:string[];mine:boolean;ownTypes?:string[]};
const known:Record<string,[string,string]>={like:['👍','Like'],heart:['❤','Heart'],laugh:['😆','Laugh'],surprised:['😮','Surprised'],sad:['😢','Sad'],angry:['😠','Angry']};
const emojiLabels:Record<string,string>={...Object.fromEntries(Object.values(known).map(([emoji,label])=>[emoji,label])),'🔥':'Fire','👏':'Applause','🎉':'Celebrate','😂':'Laugh','😀':'Smile','😊':'Smile'};
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
function who(value:unknown):EventIdentity|undefined {
 const raw=obj(obj(obj(value).user).user);
 if(!Object.keys(raw).length)return;
 return {id:text(raw.id)||undefined,displayName:text(raw.displayName)||undefined,tenantId:text(raw.tenantId)||undefined,userIdentityType:text(raw.userIdentityType)||undefined};
}
export function reactionUnicode(kind:string):string|undefined {
 if(Object.hasOwn(known,kind))return kind==='heart'?'❤️':known[kind][0];
 return kind!=='custom'&&kind.length<=40&&!/[<>\r\n]/u.test(kind)&&/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(kind)?kind:undefined;
}
export function reactionIdentities(value:unknown):EventIdentity[]{
 return Array.isArray(value)?value.flatMap(raw=>{if(!text(obj(raw).reactionType))return [];const person=who(raw);return person?[person]:[];}):[];
}
export function groupReactions(value:unknown,names:IdentityNames={},ownId=''):ReactionGroup[]{
 if(!Array.isArray(value))return [];
 const groups=new Map<string,ReactionGroup&{seen:Set<string>}>();
 for(const item of value){
  const raw=obj(item);const type=text(raw.reactionType);if(!type)continue;
  const legacy=Object.hasOwn(known,type)?known[type]:undefined;
  // Group standard emoji presentation and skin-tone variants without altering ZWJ sequences.
  const normalized=(legacy?.[0]??type).replace(/[\uFE0E\uFE0F]|\p{Emoji_Modifier}/gu,'');
  const unicode=/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(type)&&!/[<>\r\n]/u.test(type)&&type.length<=40;
  const custom=type==='custom';
  const key=custom?JSON.stringify(['custom',text(raw.reactionContentUrl)||text(raw.displayName)||'unknown']):normalized;
  const emoji=normalized==='❤'?'❤️':legacy?.[0]??(unicode?normalized:custom?'✦':'◇');
  const label=legacy?.[1]??(Object.hasOwn(emojiLabels,normalized)?emojiLabels[normalized]:undefined)??(text(raw.displayName).slice(0,100)||(custom?'Custom reaction':'Reaction'));
  let group=groups.get(key);
  if(!group){group={key,emoji,label,count:0,people:[],mine:false,ownTypes:[],seen:new Set()};groups.set(key,group);}
  const person=who(raw);
  const mine=Boolean(person?.id&&ownId&&person.id.toLowerCase()===ownId.toLowerCase());
  if(mine){const kind=reactionUnicode(type);if(kind&&!group.ownTypes!.includes(kind))group.ownTypes!.push(kind);group.mine=true;}
  if(person?.id){const id=identityKey(person);if(group.seen.has(id))continue;group.seen.add(id);}
  const name=mine?'You':text(person?.displayName)||(person?.id?names[identityKey(person)]:undefined)||'Participant unavailable';
  group.count++;group.people.push(name);group.mine||=mine;
 }
 return [...groups.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(({seen:_,...group})=>({...group,people:group.people.sort((a,b)=>a==='You'?-1:b==='You'?1:a.localeCompare(b))}));
}
