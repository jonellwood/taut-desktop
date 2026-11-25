export type DriveItem={id:string;name:string;size:number;created?:string|null;modified?:string|null;folder:boolean;shortcut:boolean;mime?:string|null;parentId?:string|null;location?:string|null;owner:string};
export type FilesPage={value:DriveItem[];next:string|null;driveName?:string};
export function fileSize(size:number){if(!Number.isFinite(size)||size<0)return 'Size unavailable';if(size<1024)return `${size} B`;if(size<1048576)return `${(size/1024).toFixed(1)} KB`;return `${(size/1048576).toFixed(1)} MB`;}
export function fileDate(value?:string|null){const date=new Date(value??'');return Number.isNaN(date.getTime())?'Date unavailable':date.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});}
export function fileLocation(item:DriveItem){const path=item.location?.split('root:')[1];try{return path?decodeURIComponent(path):'My OneDrive';}catch{return path||'My OneDrive';}}
export function mergeFiles(current:DriveItem[],incoming:DriveItem[]){return [...new Map([...current,...incoming].map(item=>[item.id,item])).values()];}

export const fileFilters=[['all','All types'],['folders','Folders'],['documents','Documents'],['pdf','PDFs'],['images','Images'],['video','Video'],['audio','Audio'],['archives','Archives']] as const;
export type FileCategory='folders'|'documents'|'pdf'|'images'|'video'|'audio'|'archives'|'other';
export function fileKind(item:Pick<DriveItem,'folder'|'name'|'mime'>):{category:FileCategory;label:string;icon:string}{
 if(item.folder)return {category:'folders',label:'Folder',icon:'folder'};
 const ext=item.name.split('.').at(-1)?.toLowerCase()??'',mime=item.mime?.toLowerCase()??'';
 if(mime==='application/pdf'||ext==='pdf')return {category:'pdf',label:'PDF',icon:'pdf'};
 if(mime.startsWith('image/')||['png','jpg','jpeg','gif','webp','svg','heic','tif','tiff','bmp','avif'].includes(ext))return {category:'images',label:'Image',icon:'image'};
 if(mime.startsWith('video/')||['mp4','mov','m4v','avi','mkv','webm','wmv'].includes(ext))return {category:'video',label:'Video',icon:'video'};
 if(mime.startsWith('audio/')||['mp3','wav','m4a','aac','ogg','flac','aiff'].includes(ext))return {category:'audio',label:'Audio',icon:'audio'};
 if(['zip','7z','rar','tar','gz','bz2','xz'].includes(ext)||['application/zip','application/x-7z-compressed','application/x-rar-compressed','application/gzip'].includes(mime))return {category:'archives',label:'Archive',icon:'archive'};
 if(['xls','xlsx','xlsm','ods','csv'].includes(ext)||mime.includes('spreadsheet')||mime==='application/vnd.ms-excel')return {category:'documents',label:'Spreadsheet',icon:'sheet'};
 if(['ppt','pptx','pps','odp'].includes(ext)||mime.includes('presentation')||mime==='application/vnd.ms-powerpoint')return {category:'documents',label:'Presentation',icon:'slides'};
 if(['doc','docx','docm','odt','rtf'].includes(ext)||mime.includes('wordprocessing')||mime==='application/msword')return {category:'documents',label:'Word document',icon:'document'};
 if(['js','ts','jsx','tsx','py','rs','html','css','json','xml','sql','sh','ps1','php','java','c','cpp','h','yaml','yml'].includes(ext))return {category:'documents',label:'Code',icon:'code'};
 if(mime.startsWith('text/')||['txt','md','log'].includes(ext))return {category:'documents',label:'Text document',icon:'document'};
 return {category:'other',label:ext&&item.name.includes('.')?`${ext.toUpperCase()} file`:'File',icon:'file'};
}
export function filterFiles(items:DriveItem[],category:string){return category==='all'?items:items.filter(item=>fileKind(item).category===category);}

export function sortFiles(items:DriveItem[],sort:string){const timestamp=(value?:string|null)=>{const n=Date.parse(value??'');return Number.isFinite(n)?n:-Infinity;};return [...items].sort((a,b)=>Number(!!b.folder)-Number(!!a.folder)||(sort==='modified'?timestamp(b.modified)-timestamp(a.modified):sort==='created'?timestamp(b.created)-timestamp(a.created):0)||a.name.localeCompare(b.name));}
