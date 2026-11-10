import {test,expect,signIn,row,alex,blair,me} from './fixtures';
import type {Page} from '@playwright/test';
async function openTeams(page:Page){await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();await expect(page.getByRole('button',{name:'Browse team IT Development',exact:true})).toBeVisible();}
async function general(page:Page){await openTeams(page);await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();await expect(page.getByRole('region',{name:'Channel posts',exact:true})).toContainText('Today’s project updates.');}

test('team, channel and reply browsing preserves chat draft and attachment without writes',async({page,graph},info)=>{
 await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep the chat draft');
 await page.getByLabel('Choose attachment files',{exact:true}).setInputFiles({name:'draft.txt',mimeType:'text/plain',buffer:Buffer.from('Keep this local file')});
 await general(page);
 await page.getByRole('button',{name:'View replies',exact:true}).click();
 await expect(page.getByRole('complementary',{name:'Channel thread',exact:true})).toContainText('Ready for the next step.');
 await page.screenshot({path:info.outputPath('teams-thread.png')});
 expect(graph.calls.filter(c=>c.command==='graph_teams_page').map(c=>c.args.query.collection)).toEqual(expect.arrayContaining(['joined','associated','channels','shared','posts','replies']));
 await page.getByRole('button',{name:'Chats',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep the chat draft');await expect(page.locator('.attachment-drafts')).toContainText('draft.txt');expect(graph.writes).toEqual([]);
});

test('missing read scopes are actionable without making Graph discovery calls',async({page,graph})=>{
 graph.restoredSession=true;graph.teamsPermissions={teams:false,channels:false,messages:false};await page.goto('/');
 await page.getByRole('button',{name:'Teams and Channels',exact:true}).click();
 await expect(page.getByRole('complementary',{name:'Teams and channels browser'})).toContainText('Team.ReadBasic.All');
 expect(graph.calls.filter(c=>c.command==='graph_teams_page')).toHaveLength(0);expect(graph.writes).toEqual([]);
});

test('channel read scope is independent of discovery scopes',async({page,graph})=>{
 graph.restoredSession=true;graph.teamsPermissions.messages=false;await page.goto('/');await openTeams(page);await page.getByRole('button',{name:'Browse team IT Development'}).click();
 await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 await expect(page.getByRole('region',{name:'Channel conversations'})).toContainText('ChannelMessage.Read.All');expect(graph.calls.some(c=>c.command==='graph_teams_page'&&c.args.query.collection==='posts')).toBe(false);expect(graph.writes).toEqual([]);
});

test('discovery merges duplicate teams and shared channels route to their host',async({page,graph})=>{
 graph.restoredSession=true;graph.teamData.associated.push({id:'team-shared',displayName:'Shared host team'});
 graph.teamData.shared=[{id:'cross',displayName:'Shared roadmap',membershipType:'shared',hostTeamId:'host-team'},{id:'missing-host',displayName:'Unavailable shared channel',membershipType:'shared',hostTeamId:null}];
 await page.goto('/');await openTeams(page);await expect(page.getByRole('button',{name:'Browse team IT Development'})).toHaveCount(1);await expect(page.getByRole('button',{name:'Browse team Shared host team'})).toBeVisible();
 await page.getByRole('button',{name:'Browse team IT Development'}).click();await expect(page.getByRole('button',{name:'Open channel Unavailable shared channel'})).toBeDisabled();
 await page.getByRole('button',{name:'Open channel Shared roadmap'}).click();
 await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_teams_page'&&c.args.query.collection==='posts').at(-1)?.args.query.teamId).toBe('host-team');expect(graph.writes).toEqual([]);
});

test('team, channel, post and reply pages load independently without dropping earlier rows',async({page,graph})=>{
 graph.restoredSession=true;
 graph.teamPages['joined:::']={value:graph.teamData.joined,next:'teams-2'};graph.teamPages['teams-2']={value:[{id:'team-next',displayName:'Another team'}],next:null};
 graph.teamPages['channels:team-dev::']={value:graph.teamData.channels,next:'channels-2'};graph.teamPages['channels-2']={value:[{id:'planning',displayName:'Planning',membershipType:'private',hostTeamId:'team-dev'}],next:null};
 graph.teamPages['posts:team-dev:general:']={value:graph.teamData.posts,next:'posts-2'};graph.teamPages['posts-2']={value:[{id:'post-2',subject:'More updates',body:{contentType:'text',content:'Second page post'}}],next:null};
 graph.teamPages['replies:team-dev:general:post-1']={value:graph.teamData.replies,next:'replies-2'};graph.teamPages['replies-2']={value:[{id:'reply-2',body:{contentType:'text',content:'Second page reply'}}],next:null};
 await page.goto('/');await openTeams(page);await page.getByRole('button',{name:'More joined teams'}).click();await expect(page.getByRole('button',{name:'Browse team Another team'})).toBeVisible();
 await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'More team channels'}).click();await expect(page.getByRole('button',{name:'Open channel Planning'})).toBeVisible();
 await page.getByRole('button',{name:'Open channel General',exact:true}).click();await page.getByRole('button',{name:'Load more posts'}).click();await expect(page.getByRole('region',{name:'Channel posts'})).toContainText('Second page post');
 await page.getByRole('article',{name:'Welcome to the channel',exact:true}).getByRole('button',{name:'View replies'}).click();await page.getByRole('button',{name:'Load more replies'}).click();
 await expect(page.getByRole('complementary',{name:'Channel thread'})).toContainText('Second page reply');await expect(page.getByRole('complementary',{name:'Channel thread'})).toContainText('Ready for the next step.');expect(graph.writes).toEqual([]);
});

test('partial discovery failure and channel denial are not presented as empty success',async({page,graph})=>{
 graph.restoredSession=true;graph.teamErrors.associated='Access denied (HTTP 403)';await page.goto('/');await openTeams(page);await expect(page.getByRole('alert')).toContainText('Shared-team discovery');
 graph.teamErrors.posts='Access denied (HTTP 403). Check channel membership.';await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 await expect(page.getByRole('region',{name:'Channel posts'}).getByRole('alert')).toContainText('403');await expect(page.getByText('No posts in this channel.',{exact:true})).toHaveCount(0);expect(graph.writes).toEqual([]);
});

test('late post response cannot replace a newly selected channel',async({page,graph})=>{
 graph.restoredSession=true;graph.teamData.channels.push({id:'planning',displayName:'Planning',membershipType:'private',hostTeamId:'team-dev'});let release!:()=>void;graph.teamGate=new Promise<void>(resolve=>release=resolve);
 graph.teamPages['posts:team-dev:general:']={value:[{id:'old',body:{contentType:'text',content:'STALE GENERAL POST'}}],next:null};
 graph.teamPages['posts:team-dev:planning:']={value:[{id:'new',body:{contentType:'text',content:'Current planning post'}}],next:null};
 await page.goto('/');await openTeams(page);await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_teams_page'&&c.args.query.collection==='posts').length).toBe(1);graph.teamGate=undefined;
 await page.getByRole('button',{name:'Open channel Planning'}).click();await expect(page.getByRole('region',{name:'Channel posts'})).toContainText('Current planning post');release();
 await expect(page.getByRole('region',{name:'Channel posts'})).not.toContainText('STALE GENERAL POST');expect(graph.writes).toEqual([]);
});

test('post rendering is inert, preserves paragraphs, and masks deleted content',async({page,graph})=>{
 graph.restoredSession=true;graph.teamData.posts=[{id:'unsafe',subject:'Safe rendering',body:{contentType:'html',content:'<p>First paragraph</p><p>Second paragraph</p><script>window.pwned=true</script><img src="https://evil.example/track.png" onerror="window.pwned=true"><iframe src="https://evil.example"></iframe>'}},{id:'deleted',subject:'Hidden subject',deletedDateTime:'2026-11-03T12:00:00Z',body:{contentType:'text',content:'DELETED SECRET'}}];
 await page.goto('/');await openTeams(page);await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 const content=page.getByRole('region',{name:'Channel posts'});await expect(content).toContainText('First paragraph');await expect(content).toContainText('Second paragraph');await expect(content.locator('img,iframe,script')).toHaveCount(0);
 await expect(content).toContainText('Message deleted');await expect(content).not.toContainText('DELETED SECRET');await expect(content).not.toContainText('Hidden subject');expect(await page.evaluate(()=>(window as any).pwned)).toBeUndefined();
 await page.getByRole('article',{name:'Deleted channel post',exact:true}).getByRole('button',{name:'View replies'}).click();
 await expect(page.getByRole('complementary',{name:'Channel thread'})).not.toContainText('Hidden subject');await expect(page.getByRole('complementary',{name:'Channel thread'})).not.toContainText('DELETED SECRET');expect(graph.writes).toEqual([]);
});

test('signing out while a channel read is pending cannot expose its content to another account',async({page,graph})=>{
 graph.restoredSession=true;let release!:()=>void;graph.teamGate=new Promise<void>(resolve=>release=resolve);graph.teamPages['posts:team-dev:general:']={value:[{id:'private',body:{contentType:'text',content:'OLD ACCOUNT CHANNEL CONTENT'}}],next:null};
 await page.goto('/');await openTeams(page);await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();graph.profileId=blair.id;graph.teamData.joined=[];graph.teamData.associated=[];
 await page.getByRole('button',{name:'Sign in to Microsoft 365',exact:true}).first().click();release();await expect(page.getByRole('complementary',{name:'Teams and channels browser'})).toContainText('No teams found');await expect(page.getByRole('region',{name:'Channel conversations'})).not.toContainText('OLD ACCOUNT CHANNEL CONTENT');expect(graph.writes).toEqual([]);
});


test('late replies cannot populate a different selected thread',async({page,graph})=>{
 graph.restoredSession=true;graph.teamData.posts.push({id:'post-2',subject:'Second thread',body:{contentType:'text',content:'Another root post'}});
 let release!:()=>void;graph.teamReplyGate=new Promise<void>(resolve=>release=resolve);
 graph.teamPages['replies:team-dev:general:post-1']={value:[{id:'old-reply',body:{contentType:'text',content:'STALE REPLY'}}],next:null};
 graph.teamPages['replies:team-dev:general:post-2']={value:[{id:'new-reply',body:{contentType:'text',content:'Current thread reply'}}],next:null};
 await page.goto('/');await general(page);await page.getByRole('article',{name:'Welcome to the channel',exact:true}).getByRole('button',{name:'View replies'}).click();
 await expect.poll(()=>graph.calls.filter(c=>c.command==='graph_teams_page'&&c.args.query.collection==='replies').length).toBe(1);graph.teamReplyGate=undefined;
 await page.getByRole('article',{name:'Second thread',exact:true}).getByRole('button',{name:'View replies'}).click();
 await expect(page.getByRole('complementary',{name:'Channel thread'})).toContainText('Current thread reply');release();await expect(page.getByRole('complementary',{name:'Channel thread'})).not.toContainText('STALE REPLY');expect(graph.writes).toEqual([]);
});

test('repeated pagination stops with a clear error and no automatic loop',async({page,graph})=>{
 graph.restoredSession=true;graph.teamPages['posts:team-dev:general:']={value:graph.teamData.posts,next:'repeat'};graph.teamPages.repeat={value:[],next:'repeat'};
 await page.goto('/');await general(page);await page.getByRole('button',{name:'Load more posts'}).click();await expect(page.getByRole('region',{name:'Channel posts'}).getByRole('alert')).toContainText('repeated page');
 await expect(page.getByRole('button',{name:'Load more posts'})).toHaveCount(0);expect(graph.calls.filter(c=>c.command==='graph_teams_page'&&c.args.query.collection==='posts')).toHaveLength(2);expect(graph.writes).toEqual([]);
});

test('focus mode hides channel browser and thread, then restores them',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');await general(page);await page.getByRole('button',{name:'View replies',exact:true}).click();await expect(page.getByRole('complementary',{name:'Channel thread'})).toBeVisible();
 await page.getByRole('button',{name:'Focus mode',exact:true}).click();await expect(page.getByRole('complementary',{name:'Teams and channels browser'})).toHaveCount(0);await expect(page.getByRole('complementary',{name:'Channel thread'})).toHaveCount(0);
 await page.getByRole('button',{name:'Focus mode',exact:true}).click();await expect(page.getByRole('complementary',{name:'Channel thread'})).toBeVisible();expect(graph.writes).toEqual([]);
});

test('system activity is compact and normal roots keep their own replies and full dates',async({page,graph},info)=>{
 graph.restoredSession=true;
 graph.teamData.posts=[{id:'event-1',messageType:'systemEventMessage',createdDateTime:'2026-06-22T13:09:00Z',eventDetail:{'@odata.type':'#microsoft.graph.membersAddedEventMessageDetail'},body:{contentType:'html',content:'<systemEventMessage/>'}},{id:'event-2',messageType:'unknownFutureValue',createdDateTime:'2026-02-06T17:38:00Z',eventDetail:{'@odata.type':'#microsoft.graph.channelRenamedEventMessageDetail'}},{id:'actual-post',messageType:'message',createdDateTime:'2022-12-07T18:29:00Z',subject:'Employee number lookup',from:{user:{displayName:'Pete Example'}},body:{contentType:'text',content:'SELECT * FROM example_table;'}}];
 graph.teamData.replies=[{id:'actual-reply',messageType:'message',createdDateTime:'2022-12-07T18:45:00Z',from:{user:{displayName:'Test User'}},body:{contentType:'text',content:'Works like a charm!'}}];
 await page.goto('/');await openTeams(page);await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 const posts=page.getByRole('region',{name:'Channel posts'});await expect(posts.getByRole('article')).toHaveCount(1);await expect(posts.getByRole('button',{name:'View replies',exact:true})).toHaveCount(1);
 await expect(posts).not.toContainText('Participant unavailable');await expect(page.getByRole('navigation',{name:'Channel location'})).toHaveText('IT DevelopmentGeneral');
 await expect(posts.getByRole('article')).toContainText('2022');await expect(posts.getByText('Channel activity · 2 events',{exact:true})).toHaveCount(0);await expect(page.getByRole('complementary',{name:'Channel details',exact:true}).getByText('Members added',{exact:true})).toBeVisible();
 await posts.getByRole('button',{name:'View replies',exact:true}).click();await expect(page.getByRole('complementary',{name:'Channel thread'})).toContainText('Works like a charm!');
 await expect(posts.getByRole('article')).not.toContainText('Works like a charm!');await page.screenshot({path:info.outputPath('channel-post-and-activity.png')});expect(graph.writes).toEqual([]);
});

test('activity-only pages keep pagination reachable without claiming the channel is empty',async({page,graph})=>{
 graph.restoredSession=true;graph.teamPages['posts:team-dev:general:']={value:[{id:'event-only',messageType:'systemEventMessage'}],next:'older-posts'};graph.teamPages['older-posts']={value:graph.teamData.posts,next:null};
 await page.goto('/');await openTeams(page);await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 const posts=page.getByRole('region',{name:'Channel posts'});await expect(posts).toContainText('Only channel activity is loaded so far');await expect(posts.getByRole('article')).toHaveCount(0);await expect(posts).not.toContainText('No posts in this channel.');
 await page.getByRole('button',{name:'Load more posts'}).click();await expect(posts.getByRole('article')).toContainText('Today’s project updates.');expect(graph.writes).toEqual([]);
});

test('unknown message types preserve readable content rather than becoming generic activity',async({page,graph})=>{
 graph.restoredSession=true;graph.teamData.posts=[{id:'future-message',messageType:'unknownFutureValue',createdDateTime:'2022-12-08T14:12:00Z',from:{user:{displayName:'Pete Example'}},body:{contentType:'text',content:'A readable post with a future type'}}];
 await page.goto('/');await openTeams(page);await page.getByRole('button',{name:'Browse team IT Development'}).click();await page.getByRole('button',{name:'Open channel General',exact:true}).click();
 await expect(page.getByRole('region',{name:'Channel posts'}).getByRole('article')).toContainText('A readable post with a future type');expect(graph.writes).toEqual([]);
});
