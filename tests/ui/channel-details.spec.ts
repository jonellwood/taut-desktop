import {test,expect,signIn,alex,me} from './fixtures';
import type {Page} from '@playwright/test';
async function general(page:Page){
 await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();
 await page.getByRole('button',{name:'Browse team IT Development'}).click();
 await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 await expect(page.getByRole('region',{name:'Channel posts',exact:true})).toContainText('Today’s project updates.');
}
test('details show members and activity, become a thread, then return without losing drafts',async({page,graph},info)=>{
 graph.teamData.posts.push({id:'history',messageType:'systemEventMessage',createdDateTime:'2026-11-04T12:00:00Z',eventDetail:{'@odata.type':'#microsoft.graph.channelRenamedEventMessageDetail'}});
 await signIn(page);await general(page);
 const details=page.getByRole('complementary',{name:'Channel details',exact:true});
 await expect(details).toContainText(alex.displayName);await expect(details).toContainText('Owner');await expect(details).toContainText('(You)');
 await expect(details.getByRole('region',{name:'Channel history'})).toContainText('Channel renamed');
 await expect(page.getByRole('region',{name:'Channel posts',exact:true}).getByText('Channel renamed',{exact:true})).toHaveCount(0);
 await page.getByRole('textbox',{name:'New channel post',exact:true}).fill('Keep post draft');
 await page.screenshot({path:info.outputPath('channel-details.png')});
 await page.getByRole('button',{name:'View replies',exact:true}).click();
 await expect(details).toHaveCount(0);await expect(page.getByRole('complementary',{name:'Channel thread',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Channel reply',exact:true}).fill('Keep reply draft');
 await page.getByRole('button',{name:'Close thread',exact:true}).click();await expect(details).toBeVisible();
 await expect(page.getByRole('textbox',{name:'New channel post',exact:true})).toHaveValue('Keep post draft');
 await page.getByRole('button',{name:'View replies',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Channel reply',exact:true})).toHaveValue('Keep reply draft');
 expect(graph.writes).toEqual([]);
});
test('toolbar and close button agree with actual panel visibility',async({page,graph})=>{
 await signIn(page);await general(page);const toggle=page.getByRole('button',{name:'Toggle details panel',exact:true});const details=page.getByRole('complementary',{name:'Channel details',exact:true});
 await expect(toggle).toHaveAttribute('aria-pressed','true');await expect(details).toBeVisible();
 await page.getByRole('button',{name:'Close channel details',exact:true}).click();await expect(toggle).toHaveAttribute('aria-pressed','false');await expect(details).toHaveCount(0);
 await toggle.click();await expect(details).toBeVisible();await expect(toggle).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Focus mode',exact:true}).click();await expect(details).toHaveCount(0);await expect(toggle).toHaveAttribute('aria-pressed','false');
 await page.getByRole('button',{name:'Focus mode',exact:true}).click();await expect(details).toBeVisible();expect(graph.writes).toEqual([]);
});
test('missing member consent keeps metadata and history and never fetches roster',async({page,graph})=>{
 graph.teamsPermissions.members=false;await signIn(page);await general(page);
 const details=page.getByRole('complementary',{name:'Channel details',exact:true});
 await expect(details).toContainText('ChannelMember.Read.All');await expect(details).toContainText('General');await expect(details).toContainText('HISTORY');
 expect(graph.calls.filter(c=>c.command==='graph_teams_page'&&c.args.query.collection==='members')).toHaveLength(0);
 expect(graph.writes).toEqual([]);
});
test('roster pagination and inherited access render safely without following source URLs',async({page,graph})=>{
 graph.teamData.shared=[{id:'shared',displayName:'Shared project',membershipType:'shared',hostTeamId:'actual-host'}];
 graph.teamData.members=[{id:'opaque=/one',displayName:'<img src="https://untrusted.invalid/image">',roles:['Owner'],'@microsoft.graph.originalSourceMembershipUrl':'https://untrusted.invalid/source'}];
 graph.teamPages['members:actual-host:shared:']={value:graph.teamData.members,next:'page-two'};
 graph.teamPages['page-two']={value:[...graph.teamData.members,{id:'opaque=/two',displayName:'Blair Example',roles:[]}],next:null};
 await signIn(page);await general(page);await page.getByRole('button',{name:'Open channel Shared project',exact:true}).click();
 const details=page.getByRole('complementary',{name:'Channel details',exact:true});await expect(details).toContainText('Inherited access');await expect(details).toContainText('<img src=');await expect(details.locator('img')).toHaveCount(0);
 await details.getByRole('button',{name:'Load more members'}).click();await expect(details).toContainText('2 loaded membership records');await expect(details).toContainText('Blair Example');
 const calls=graph.calls.filter(c=>c.command==='graph_teams_page'&&c.args.query.collection==='members');expect(calls.at(-1)?.args.query).toEqual({collection:'members',teamId:'actual-host',channelId:'shared',next:'page-two'});expect(graph.writes).toEqual([]);
});
test('late roster cannot populate a different channel and denial stays explicit',async({page,graph})=>{
 let release!:()=>void;graph.teamMemberGate=new Promise<void>(resolve=>release=resolve);
 graph.teamData.channels.push({id:'other',displayName:'Other',membershipType:'private',hostTeamId:'team-dev'});
 await signIn(page);await general(page);await page.getByRole('button',{name:'Open channel Other',exact:true}).click();
 graph.teamData.members=[{id:'other-person',displayName:'Only Other Person',roles:[]}];release();
 const details=page.getByRole('complementary',{name:'Channel details',exact:true});
 await expect(details).toContainText('Only Other Person');await expect(details).not.toContainText(alex.displayName);
 graph.teamErrors.members='Access denied (HTTP 403).';
 await details.getByRole('button',{name:'Refresh members'}).click();await expect(details.getByRole('alert')).toContainText('403');await expect(details).not.toContainText('No membership records were returned');expect(graph.writes).toEqual([]);
});
test('channel history pagination loads older activity while preserving composer text',async({page,graph})=>{
 graph.teamPages['posts:team-dev:general:']={value:graph.teamData.posts,next:'older'};
 graph.teamPages['older']={value:[{id:'old-event',messageType:'systemEventMessage',createdDateTime:'2022-01-01T12:00:00Z',eventDetail:{'@odata.type':'#microsoft.graph.channelAddedEventMessageDetail'}}],next:null};
 await signIn(page);await general(page);await page.getByRole('textbox',{name:'New channel post',exact:true}).fill('Still writing');
 const details=page.getByRole('complementary',{name:'Channel details',exact:true});await details.getByRole('button',{name:'Load more channel history'}).click();
 await expect(details).toContainText('Channel created');await expect(details).toContainText('2022');
 await expect(page.getByRole('textbox',{name:'New channel post',exact:true})).toHaveValue('Still writing');expect(graph.writes).toEqual([]);
});
