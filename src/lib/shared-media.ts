import type { Message } from './types';
import { parseMessageBody, safeMessageLink, type BodyNode } from './message-body';
export type SharedItem={key:string;messageId:string;name:string;url?:string;imageId?:string;time:string};
export function collectSharedMedia(messages:Message[]){
 const images:SharedItem[]=[],files:SharedItem[]=[],links:SharedItem[]=[];
 const fileUrls=new Set<string>(),linkUrls=new Set<string>(),imageIds=new Set<string>();
 for(const message of [...messages].reverse()){
  if(message.deleted||message.activity)continue;
  const base={messageId:message.id,time:message.createdDateTime?new Date(message.createdDateTime).toLocaleString():message.time};
  for(const image of message.images??[]){const key=JSON.stringify([message.id,image.id]);if(imageIds.has(key))continue;imageIds.add(key);images.push({...base,key,name:`Image · ${message.senderName??(message.sender==='me'?'You':'Participant')}`,imageId:image.id});}
  for(const file of message.attachments??[]){const url=safeMessageLink(file.url);if(!url||fileUrls.has(url))continue;fileUrls.add(url);files.push({...base,key:url,name:file.name,url});}
  function add(raw:string,name?:string){const url=safeMessageLink(raw);if(!url||linkUrls.has(url))return;linkUrls.add(url);links.push({...base,key:url,url,name:name?.trim()||new URL(url).hostname});}
  function text(nodes:BodyNode[]):string{return nodes.map(n=>n.kind==='text'?n.text:'children' in n?text(n.children):'').join('');}
  function walk(nodes:BodyNode[]){for(const node of nodes){if(node.kind==='code'||node.kind==='element'&&node.tag==='code')continue;if(node.kind==='link')add(node.url,text(node.children));else if(node.kind==='text'){for(const match of node.text.matchAll(/https?:\/\/[^\s<>"']+/g))add(match[0].replace(/[.,;!?]+$/,''));}else if('children' in node)walk(node.children);}}
  walk(parseMessageBody(message.body,message.text));
 }
 return {images,files,links:links.filter(link=>!fileUrls.has(link.url!))};
}
