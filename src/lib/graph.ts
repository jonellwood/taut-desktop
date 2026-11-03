/** Typed, read-only Graph boundary for the future auth integration.
 * No credentials, token storage, or permissions are implemented in this starter.
 */
export interface GraphChat {id:string; topic?:string;chatType:string;lastUpdatedDateTime?:string}
export interface GraphChatMessage {id:string;createdDateTime:string;body:{contentType:string;content:string};from?:{user?:{id:string;displayName:string}}}
export async function graphGet<T>(token:string,path:string):Promise<T>{
 const response=await fetch(`https://graph.microsoft.com/v1.0${path}`,{headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok) throw new Error(`Microsoft Graph request failed (${response.status})`);
 return response.json() as Promise<T>;
}
export async function listMyChats(token:string){return graphGet<{value:GraphChat[]; '@odata.nextLink'?:string}>(token,'/me/chats?$top=30');}
export async function listChatMessages(token:string,chatId:string){return graphGet<{value:GraphChatMessage[]}>(token,`/chats/${encodeURIComponent(chatId)}/messages?$top=30`);}
