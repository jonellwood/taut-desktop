import type { Conversation } from './types';
export const conversations:Conversation[]=[
{id:'hannah',name:'Hannah',initials:'HM',status:'online',preview:'That actually looks fantastic.',time:'9:41 AM',unread:2,favorite:true,messages:[
{id:'m1',sender:'them',text:'I saw the new workspace concept. This is so much cleaner.',time:'9:14 AM'},
{id:'m2',sender:'me',text:'Less noise. More signal. That’s the whole point.',time:'9:16 AM',reactions:['🔥']},
{id:'m3',sender:'them',text:'The amber accent is a great touch. Does the sidebar collapse?',time:'9:20 AM'},
{id:'m4',sender:'me',text:'Completely. And the editor gets every pixel back.',time:'9:23 AM'},
{id:'m5',sender:'them',text:'That actually looks fantastic.',time:'9:41 AM'}]},
{id:'patrick',name:'Patrick',initials:'PS',status:'online',preview:'I pushed the changes.',time:'8:58 AM',unread:0,favorite:true,messages:[{id:'p1',sender:'them',text:'I pushed the changes.',time:'8:58 AM'}]},
{id:'jerri',name:'Jerri',initials:'JC',status:'away',preview:'Can we go over the new ticket type?',time:'Yesterday',unread:0,messages:[{id:'j1',sender:'them',text:'Can we go over the new ticket type?',time:'Yesterday'}]},
{id:'shannon',name:'Shannon',initials:'SB',status:'online',preview:'Sounds good!',time:'Yesterday',unread:1,messages:[{id:'s1',sender:'them',text:'Sounds good!',time:'Yesterday'}]},
{id:'james',name:'James',initials:'JT',status:'offline',preview:'Thanks for the update.',time:'Wed',unread:0,messages:[{id:'t1',sender:'them',text:'Thanks for the update.',time:'Wed'}]},
{id:'alex',name:'Alex',initials:'AR',status:'online',preview:'Will do.',time:'Tue',unread:0,messages:[{id:'a1',sender:'them',text:'Will do.',time:'Tue'}]}
];
