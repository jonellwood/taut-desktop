export type EventIdentity={id?:string;displayName?:string|null;tenantId?:string;userIdentityType?:string};
export type EventDetail={
 '@odata.type'?:string;initiator?:{user?:EventIdentity|null}|null;members?:EventIdentity[]|null;
 chatDisplayName?:string|null;visibleHistoryStartDateTime?:string|null;
};
export type EventMessage={messageType?:string;eventDetail?:EventDetail|null};
export type ConversationActivity={kind:'added'|'removed'|'renamed'|'joined'|'left';summary:string;history?:string;source:EventDetail};
export type IdentityNames=Record<string,string>;
const kinds:Record<string,ConversationActivity['kind']>={
 'microsoft.graph.membersAddedEventMessageDetail':'added',
 'microsoft.graph.membersDeletedEventMessageDetail':'removed',
 'microsoft.graph.chatRenamedEventMessageDetail':'renamed',
 'microsoft.graph.membersJoinedEventMessageDetail':'joined',
 'microsoft.graph.membersLeftEventMessageDetail':'left',
};
export function identityKey(identity:EventIdentity){return `${identity.tenantId?.toLowerCase()??''}:${identity.id?.toLowerCase()??''}`;}
function eventKind(message:EventMessage){
 if(!['systemEventMessage','unknownFutureValue'].includes(message.messageType??''))return undefined;
 const type=message.eventDetail?.['@odata.type'];
 const key=typeof type==='string'?type.replace(/^#/,''):'';
 return Object.hasOwn(kinds,key)?kinds[key]:undefined;
}
export function activityIdentities(message:EventMessage):EventIdentity[]{
 if(!eventKind(message))return [];
 const detail=message.eventDetail!;
 return [detail.initiator?.user,...(Array.isArray(detail.members)?detail.members:[])].filter((p):p is EventIdentity=>!!p&&typeof p==='object');
}
function person(identity:EventIdentity|undefined|null,names:IdentityNames,ownId:string){
 if(identity?.id && identity.id.toLowerCase()===ownId.toLowerCase())return 'You';
 const direct=typeof identity?.displayName==='string'?identity.displayName.trim():'';
 return direct || (identity?.id?names[identityKey(identity)]:undefined);
}
function list(values:string[]){return values.length<3?values.join(' and '):`${values.slice(0,-1).join(', ')}, and ${values.at(-1)}`;}
export function conversationActivity(message:EventMessage,names:IdentityNames={},ownId=''):ConversationActivity|undefined{
 let kind=eventKind(message);if(!kind)return undefined;
 const source=message.eventDetail!;
 const actor=person(source.initiator?.user,names,ownId)||'Someone';
 const members=Array.isArray(source.members)?source.members.filter(p=>p&&typeof p==='object'):[];
 const memberNames=members.map(p=>{const name=person(p,names,ownId);return name==='You'?'you':name;});
 const subjects=memberNames.length && memberNames.every(n=>!n)?(members.length===1?'a participant':`${members.length} participants`):list(memberNames.map(n=>n||'a participant'));
 let summary:string;
 if(kind==='renamed'){
  const title=typeof source.chatDisplayName==='string'?source.chatDisplayName.trim():'';
  summary=title?`${actor} renamed the group to “${title}”`:`${actor} updated the group name`;
 }else if(kind==='removed' && members.length===1 && members[0].id && members[0].id.toLowerCase()===source.initiator?.user?.id?.toLowerCase()){
  kind='left';summary=`${person(members[0],names,ownId)||'A participant'} left the group`;
 }else if(kind==='joined'||kind==='left'){
  summary=`${subjects==='a participant'?'A participant':subjects.replace(/^you\b/,'You')||'Participants'} ${kind==='joined'?'joined':'left'} the group`;
 }else{
  summary=subjects?`${actor} ${kind==='added'?'added':'removed'} ${subjects}${kind==='added'?' to':' from'} the group`:`${actor} updated group membership`;
 }
 let history:string|undefined;
 const start=source.visibleHistoryStartDateTime;
 if(kind==='added' && typeof start==='string' && Number.isFinite(Date.parse(start))){
  const date=new Date(start);
  history=date.getUTCFullYear()===1?'All previous messages shared':`History available from ${date.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})}`;
 }
 return {kind,summary,history,source};
}
