<script lang="ts">
 import type {ReactionGroup} from './reactions';
 let {groups,disabled=false,onRemove}:{groups:ReactionGroup[];disabled?:boolean;onRemove?:(emoji:string,trigger:HTMLElement)=>void}=$props();
</script>
<div class="message-reactions" role="group" aria-label="Message reactions">
 {#each groups as group (group.key)}
  <details class="reaction-chip" class:includes-me={group.mine}>
   <summary aria-label={`${group.label}: ${group.count} ${group.count===1?'reaction':'reactions'}${group.mine?', including you':''}`} title={group.people.join(', ')}><span aria-hidden="true">{group.emoji}</span><span>{group.count}</span></summary>
   <div class="reaction-people"><strong>{group.label}</strong><ul>{#each group.people as name}<li>{name}</li>{/each}</ul>{#if onRemove&&group.mine}{#each group.ownTypes??[] as emoji}<button type="button" class="remove-reaction" aria-label={`Remove my ${group.label} reaction${(group.ownTypes?.length??0)>1?` ${emoji}`:''}`} disabled={disabled} onclick={event=>onRemove?.(emoji,event.currentTarget)}>Remove mine{(group.ownTypes?.length??0)>1?` ${emoji}`:''}</button>{/each}{/if}</div>
  </details>
 {/each}
</div>
