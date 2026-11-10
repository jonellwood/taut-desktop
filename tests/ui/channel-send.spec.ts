import {test,expect,signIn,me} from './fixtures';
import type {Page} from '@playwright/test';
async function channel(page:Page){
 await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();
 await page.getByRole('button',{name:'Browse team IT Development'}).click();
 await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 await expect(page.getByRole('region',{name:'Channel posts',exact:true})).toContainText('Today’s project updates.');
}
test('new channel post and thread reply send only explicitly with separate drafts',async({page,graph},info)=>{
 graph.allowWrites=true;await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Normal chat draft');
 await channel(page);const post=page.getByRole('form',{name:'New channel post'});
 await expect(post.getByRole('button',{name:'Post to channel',exact:true})).toBeDisabled();
 await post.getByRole('textbox').fill('New root post');
 await page.getByRole('button',{name:'View replies',exact:true}).click();
 const reply=page.getByRole('form',{name:'Channel reply'});await reply.getByRole('textbox').fill('A real thread reply');
 expect(graph.writes).toEqual([]);
 await reply.getByRole('button',{name:'Send channel reply',exact:true}).click();
 await expect(reply.getByRole('textbox')).toHaveValue('');
 await expect(page.getByRole('complementary',{name:'Channel thread',exact:true})).toContainText('A real thread reply');
 await expect(post.getByRole('textbox')).toHaveValue('New root post');
 expect(graph.writes[0].args.target).toEqual({teamId:'team-dev',channelId:'general',messageId:'post-1',ownId:me.id,text:'A real thread reply'});
 await post.getByRole('button',{name:'Post to channel',exact:true}).click();
 await expect(post.getByRole('textbox')).toHaveValue('');
 await expect(page.getByRole('region',{name:'Channel posts',exact:true})).toContainText('New root post');
 expect(graph.writes).toHaveLength(2);expect(graph.writes[1].args.target.messageId).toBeNull();
 await page.screenshot({path:info.outputPath('channel-send.png')});
 await page.getByRole('button',{name:'Chats',exact:true}).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Normal chat draft');
});
test('channel and thread drafts survive switching to Chats and returning',async({page,graph})=>{
 await signIn(page);await channel(page);
 await page.getByRole('textbox',{name:'New channel post',exact:true}).fill('Saved post draft');
 await page.getByRole('button',{name:'View replies',exact:true}).click();
 await page.getByRole('textbox',{name:'Channel reply',exact:true}).fill('Saved reply draft');
 await page.getByRole('button',{name:'Chats',exact:true}).click();await channel(page);
 await expect(page.getByRole('textbox',{name:'New channel post',exact:true})).toHaveValue('Saved post draft');
 await page.getByRole('button',{name:'View replies',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Channel reply',exact:true})).toHaveValue('Saved reply draft');
 expect(graph.writes).toEqual([]);
});
test('missing send scope and archived channel stay read only',async({page,graph})=>{
 graph.teamsPermissions.send=false;await signIn(page);await channel(page);
 await expect(page.getByRole('textbox',{name:'New channel post',exact:true})).toBeDisabled();
 await expect(page.getByRole('region',{name:'Channel posts',exact:true})).toContainText('ChannelMessage.Send');
 await page.getByRole('button',{name:'View replies',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Channel reply',exact:true})).toBeDisabled();
 expect(graph.writes).toEqual([]);
});
test('known archived channel disables posting and deleted root disables replies',async({page,graph})=>{
 graph.teamData.channels[0].isArchived=true;graph.teamData.posts[0].deletedDateTime='2026-11-04';
 await signIn(page);await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'New channel post',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'View replies',exact:true}).click();await expect(page.getByRole('textbox',{name:'Channel reply',exact:true})).toBeDisabled();expect(graph.writes).toEqual([]);
});
test('uncertain send retains draft and blocks retry across navigation until checked',async({page,graph})=>{
 graph.allowWrites=true;graph.channelSendStatus='uncertain';await signIn(page);await channel(page);
 const box=page.getByRole('textbox',{name:'New channel post',exact:true});
 await box.fill('Do not duplicate');await page.getByRole('button',{name:'Post to channel',exact:true}).click();
 await expect(page.getByRole('form',{name:'New channel post'}).getByRole('alert')).toContainText('Draft saved');
 await expect(page.getByRole('button',{name:'Post to channel',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Chats',exact:true}).click();await channel(page);
 await expect(box).toHaveValue('Do not duplicate');await expect(page.getByRole('button',{name:'Post to channel',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Refresh messages',exact:true}).click();expect(graph.writes).toHaveLength(1);
 await page.getByRole('button',{name:'I checked Teams — enable retry'}).click();expect(graph.writes).toHaveLength(1);
 graph.channelSendStatus='sent';await page.getByRole('button',{name:'Post to channel',exact:true}).click();await expect(box).toHaveValue('');expect(graph.writes).toHaveLength(2);
});
test('in-flight send captures host and channel and cannot be duplicated after navigating away',async({page,graph})=>{
 graph.allowWrites=true;let release!:()=>void;graph.channelSendGate=new Promise<void>(resolve=>release=resolve);
 graph.teamData.shared=[{id:'shared-channel',displayName:'Shared project',membershipType:'shared',hostTeamId:'actual-host'}];
 await signIn(page);await channel(page);await page.getByRole('button',{name:'Open channel Shared project',exact:true}).click();
 await page.getByRole('textbox',{name:'New channel post',exact:true}).fill('For shared host');
 await page.getByRole('button',{name:'Post to channel',exact:true}).click();
 await expect(page.getByRole('button',{name:'Post to channel',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Chats',exact:true}).click();await channel(page);
 await expect(page.getByRole('button',{name:'Post to channel',exact:true})).toBeDisabled();
 release();await expect(page.getByRole('button',{name:'Post to channel',exact:true})).toBeDisabled(); // empty new channel draft
 await expect(page.getByRole('textbox',{name:'New channel post',exact:true})).toBeEnabled();
 expect(graph.writes).toHaveLength(1);expect(graph.writes[0].args.target.teamId).toBe('actual-host');expect(graph.writes[0].args.target.channelId).toBe('shared-channel');
 await page.getByRole('button',{name:'Open channel Shared project',exact:true}).click();await expect(page.getByRole('textbox',{name:'New channel post',exact:true})).toHaveValue('');
});
test('definite rejection saves draft and permits another explicit send',async({page,graph})=>{
 graph.allowWrites=true;graph.channelSendStatus='rejected';await signIn(page);await channel(page);
 await page.getByRole('textbox',{name:'New channel post',exact:true}).fill('Keep after rejection');
 await page.getByRole('button',{name:'Post to channel',exact:true}).click();
 await expect(page.getByRole('form',{name:'New channel post'}).getByRole('alert')).toContainText('Draft saved');
 await expect(page.getByRole('button',{name:'Post to channel',exact:true})).toBeEnabled();
 expect(graph.writes).toHaveLength(1);
});
