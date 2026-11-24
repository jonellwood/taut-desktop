<script lang="ts">
 import {Folder,File,FileText,FileSpreadsheet,Presentation,FileImage,FileVideo,FileAudio,FileArchive,FileCode} from 'lucide-svelte';
 import {fileKind,type DriveItem} from './files';
 let {item,size=22}:{item:DriveItem;size?:number}=$props();
 const icons={folder:Folder,file:File,pdf:FileText,document:FileText,sheet:FileSpreadsheet,slides:Presentation,image:FileImage,video:FileVideo,audio:FileAudio,archive:FileArchive,code:FileCode};
 const kind=$derived(fileKind(item));const Icon=$derived(icons[kind.icon as keyof typeof icons]??File);
</script>
<span class="file-icon" data-kind={kind.icon} aria-hidden="true"><Icon {size} strokeWidth={1.6}/>{#if kind.icon==='pdf'}<b>PDF</b>{/if}</span>
<style>.file-icon{position:relative;display:inline-flex;flex:none;align-items:center;justify-content:center;color:var(--accent)}b{position:absolute;bottom:-4px;font-size:7px;letter-spacing:.4px;background:var(--surface-raised);border-radius:2px;line-height:1.2;padding:0 1px;color:var(--text-primary)}</style>
