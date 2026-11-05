export type Presence={id:string;availability?:string;activity?:string;seen:number};
export function describePresence(value?:Presence,now=Date.now()){
 if(!value||now-value.seen>90000)return {label:'Presence unavailable',color:'#7b8891'};
 const activity:Record<string,string>={InACall:'In a call',InAMeeting:'In a meeting',Presenting:'Presenting',OutOfOffice:'Out of office',OffWork:'Offline'};
 const states:Record<string,{label:string;color:string}>={Available:{label:'Available',color:'#63d5a8'},AvailableIdle:{label:'Available',color:'#63d5a8'},Busy:{label:'Busy',color:'#ef867e'},BusyIdle:{label:'Busy',color:'#ef867e'},DoNotDisturb:{label:'Do not disturb',color:'#ef867e'},Away:{label:'Away',color:'#efbb70'},BeRightBack:{label:'Be right back',color:'#efbb70'},Offline:{label:'Offline',color:'#7b8891'}};
 const result=states[value.availability??''];return result?{...result,label:activity[value.activity??'']??result.label}:{label:'Presence unavailable',color:'#7b8891'};
}
