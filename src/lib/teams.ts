export type Team={id:string;displayName?:string;description?:string;isArchived?:boolean;tenantId?:string};
export type Channel={id:string;displayName?:string;description?:string;membershipType?:string;isArchived?:boolean;hostTeamId?:string|null;tenantId?:string};
export type ChannelPost={id:string;subject?:string;messageType?:string;eventDetail?:{'@odata.type'?:string}|null;createdDateTime?:string;lastModifiedDateTime?:string;deletedDateTime?:string|null;from?:{user?:{displayName?:string};application?:{displayName?:string}};body?:{contentType?:string;content?:string};attachments?:{id?:string;name?:string}[]};
export type TeamQuery={collection:'joined'|'associated'|'channels'|'shared'|'posts'|'replies'|'members';teamId?:string;channelId?:string;messageId?:string;next?:string|null};
export type TeamPage<T>={value:T[];next:string|null};
export function channelText(post:ChannelPost):string{
 if(post.deletedDateTime)return 'Message deleted';
 if(isChannelActivity(post))return activityLabel(post);
 if(post.body?.contentType==='text')return post.body.content??'';
 // Detached DOM parsing preserves text without inserting untrusted Graph HTML into the UI.
 const template=document.createElement('template');template.innerHTML=post.body?.content??'';const content=template.content;
 content.querySelectorAll('script,style,iframe,object,svg').forEach(node=>node.remove());
 content.querySelectorAll('br').forEach(node=>node.replaceWith('\n'));
 content.querySelectorAll('p,div,li,pre,blockquote,h1,h2,h3').forEach(node=>node.append('\n'));
 const text=(content.textContent??'').replace(/\n{3,}/g,'\n\n').trim();
 return text||((post.attachments?.length||content.querySelector('img,attachment'))?'Shared content · preview unavailable':'No text content');
}
export function postAuthor(post:ChannelPost){return post.from?.user?.displayName||post.from?.application?.displayName||'Participant unavailable';}
export function postTime(post:ChannelPost){const date=new Date(post.createdDateTime??'');return Number.isNaN(date.getTime())?'Time unavailable':date.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
export function mergeTeams(groups:Team[][]):Team[]{const map=new Map<string,Team>();for(const rows of groups)for(const row of rows)if(row?.id)map.set(row.id,{...map.get(row.id),...row});return [...map.values()].sort((a,b)=>(a.displayName??'').localeCompare(b.displayName??''));}
export function mergeChannels(groups:Channel[][]):Channel[]{const map=new Map<string,Channel>();for(const rows of groups)for(const row of rows)if(row?.id){const old=map.get(row.id);map.set(row.id,{...old,...row,hostTeamId:row.hostTeamId||old?.hostTeamId||null});}return [...map.values()].sort((a,b)=>(a.displayName??'').localeCompare(b.displayName??''));}

export function isChannelActivity(post:ChannelPost):boolean{
 if(post.deletedDateTime||post.messageType==='message')return false;
 if(['systemEventMessage','chatEvent','typing'].includes(post.messageType??''))return true;
 // Legacy/unknown enum values can carry typed events. Preserve unknown user text.
 return Boolean(post.eventDetail)||/^\s*<systemEventMessage\s*\/?>\s*(?:<\/systemEventMessage>)?\s*$/i.test(post.body?.content??'');
}
export function activityLabel(post:ChannelPost):string{
 const type=post.eventDetail?.['@odata.type']?.replace(/^#?microsoft\.graph\./,'')??'';
 const names:Record<string,string>={membersAddedEventMessageDetail:'Members added',membersDeletedEventMessageDetail:'Members removed',membersJoinedEventMessageDetail:'Members joined',membersLeftEventMessageDetail:'Members left',channelAddedEventMessageDetail:'Channel created',channelRenamedEventMessageDetail:'Channel renamed',channelDeletedEventMessageDetail:'Channel removed',teamRenamedEventMessageDetail:'Team renamed'};
 return Object.hasOwn(names,type)?names[type]:'Channel activity';
}

export type ChannelDraft={formatted?:boolean;text:string;error:string;uncertain:boolean};
export type ChannelDrafts=Record<string,ChannelDraft>;
export function channelDraftKey(team:string,channel:string,root:string|null){return JSON.stringify([team,channel,root]);}

export type ChannelMember={id:string;displayName?:string;roles?:string[];userId?:string;tenantId?:string;'@microsoft.graph.originalSourceMembershipUrl'?:string};
export function memberRoles(member:ChannelMember){const roles=(member.roles??[]).filter(role=>typeof role==='string').map(role=>role.toLowerCase());return roles.includes('owner')?'Owner':roles.includes('guest')?'Guest':'Member';}
