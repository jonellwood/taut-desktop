export type Presence={id:string;availability?:string;activity?:string;seen:number};
export function describePresence(value?:Presence,now=Date.now()){
 if(!value||now-value.seen>90000)return {label:'Presence unavailable',color:'var(--presence-offline)'};
 const activity:Record<string,string>={InACall:'In a call',InAMeeting:'In a meeting',Presenting:'Presenting',OutOfOffice:'Out of office',OffWork:'Offline'};
 const states:Record<string,{label:string;color:string}>={Available:{label:'Available',color:'var(--presence-available)'},AvailableIdle:{label:'Available',color:'var(--presence-available)'},Busy:{label:'Busy',color:'var(--presence-busy)'},BusyIdle:{label:'Busy',color:'var(--presence-busy)'},DoNotDisturb:{label:'Do not disturb',color:'var(--presence-busy)'},Away:{label:'Away',color:'var(--presence-away)'},BeRightBack:{label:'Be right back',color:'var(--presence-away)'},Offline:{label:'Offline',color:'var(--presence-offline)'}};
 const result=states[value.availability??''];return result?{...result,label:activity[value.activity??'']??result.label}:{label:'Presence unavailable',color:'var(--presence-offline)'};
}
