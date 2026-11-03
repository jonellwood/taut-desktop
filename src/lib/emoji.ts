export function insertEmoji(text:string,emoji:string,start:number,end=start){
 const from=Number.isFinite(start)?Math.max(0,Math.min(text.length,start)):text.length;
 const to=Number.isFinite(end)?Math.max(from,Math.min(text.length,end)):from;
 return {text:text.slice(0,from)+emoji+text.slice(to),caret:from+emoji.length};
}
