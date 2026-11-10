import {test,expect,signIn,row,alex,blair,me} from './fixtures';

test('startup restores a saved session without launching interactive sign-in or mutating Graph',async({page,graph})=>{
 graph.restoredSession=true;
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeEnabled();
 await expect(page.getByRole('region',{name:'Welcome to TAUT'})).toBeVisible();
 expect(graph.calls.some(c=>c.command==='graph_messages')).toBe(false);
 await row(page,alex.displayName).click();
 await expect(page.locator('.messages')).toContainText('Hello from Alex');
 expect(graph.calls.filter(c=>c.command==='restore_session')).toHaveLength(1);
 expect(graph.calls.some(c=>c.command==='sign_in')).toBe(false);expect(graph.writes).toEqual([]);
});

test('no saved credential leaves manual sign-in available without fetching private data',async({page,graph})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 expect(graph.calls.filter(c=>c.command==='restore_session')).toHaveLength(1);
 expect(graph.calls.some(c=>c.command.startsWith('graph_'))).toBe(false);expect(graph.writes).toEqual([]);
});

test('startup restore disables duplicate sign-in until it completes',async({page,graph})=>{
 let release!:()=>void;graph.restoreGate=new Promise<void>(resolve=>release=resolve);
 await page.goto('/');await expect(page.getByRole('button',{name:'Restoring sign-in…',exact:true})).toBeDisabled();
 expect(graph.calls.filter(c=>c.command==='restore_session')).toHaveLength(1);
 release();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 expect(graph.calls.some(c=>c.command==='sign_in')).toBe(false);
});

test('revoked or inaccessible saved credential explains manual sign-in without opening browser automatically',async({page,graph})=>{
 graph.persistenceNotice='Microsoft requires a fresh sign-in. Please sign in again.';
 await page.goto('/');await expect(page.getByRole('status')).toContainText('fresh sign-in');
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 expect(graph.calls.some(c=>c.command==='sign_in')).toBe(false);expect(graph.writes).toEqual([]);
});

test('Keychain save failure allows a temporary session and shows an actionable notice',async({page,graph})=>{
 graph.sessionSaved=false;graph.persistenceNotice='Connected for this session, but Keychain could not save your sign-in.';
 await signIn(page);await expect(page.getByRole('status')).toContainText('Keychain could not save');
 await expect(page.locator('.messages')).toContainText('Hello from Alex');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Account',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'TAUT preferences'})).toContainText('Temporary sign-in');expect(graph.writes).toEqual([]);
});

test('retrying saved sign-in after a transient failure restores without interactive auth',async({page,graph})=>{
 graph.persistenceNotice='Microsoft sign-in is unavailable. Your saved sign-in has been kept.';
 await page.goto('/');await expect(page.getByRole('status')).toContainText('kept');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Account',exact:true}).click();
 graph.restoredSession=true;graph.persistenceNotice=null;
 await page.getByRole('button',{name:'Retry saved sign-in',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Sign-in saved in macOS Keychain');
 expect(graph.calls.filter(c=>c.command==='restore_session')).toHaveLength(2);
 expect(graph.calls.some(c=>c.command==='sign_in')).toBe(false);expect(graph.writes).toEqual([]);
});

test('sign-out clears saved session and prevents restoration on reload',async({page,graph})=>{
 graph.restoredSession=true;await page.goto('/');
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeEnabled();
 await row(page,alex.displayName).click();
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Session draft');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 await page.reload();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 expect(graph.calls.filter(c=>c.command==='sign_out')).toHaveLength(1);
 expect(graph.calls.some(c=>c.command==='sign_in')).toBe(false);expect(graph.writes).toEqual([]);
});

test('Keychain deletion failure still signs out locally and allows explicit cleanup retry',async({page,graph})=>{
 await signIn(page);graph.signOutError='Signed out of this session, but the saved sign-in could not be removed from Keychain. It may restore on next launch.';
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();await expect(page.getByRole('alert')).toContainText('may restore');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Preferences categories'}).getByRole('button',{name:'Account',exact:true}).click();graph.signOutError='';
 await page.getByRole('button',{name:'Clear saved sign-in',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveCount(0);expect(graph.calls.filter(c=>c.command==='sign_out')).toHaveLength(2);expect(graph.writes).toEqual([]);
});

test('session expiry offers reconnect while retaining selected chat, text and attachment drafts',async({page,graph})=>{
 await signIn(page);await row(page,blair.displayName).click();
 await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep my work');
 await page.locator('input[type=file]').setInputFiles({name:'pending.txt',mimeType:'text/plain',buffer:Buffer.from('local')});
 graph.messagesError='Microsoft requires a fresh sign-in. Please sign in again.';
 await page.clock.runFor(5_000);
 await expect(page.getByRole('button',{name:'Reconnect',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();
 graph.messagesError='';
 await page.getByRole('button',{name:'Reconnect',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reconnect',exact:true})).toHaveCount(0);
 await expect(page.locator('.conversation-header')).toContainText(blair.displayName);
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep my work');
 await expect(page.getByRole('region',{name:'Draft attachments'})).toContainText('pending.txt');
 expect(graph.calls.filter(c=>c.command==='sign_in')).toHaveLength(2);expect(graph.writes).toEqual([]);
});

test('reconnecting as a different account clears prior account drafts and media',async({page,graph})=>{
 await signIn(page);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Account-private draft');
 graph.messagesError='Not signed in';await page.clock.runFor(5_000);
 await expect(page.getByRole('button',{name:'Reconnect',exact:true})).toBeVisible();
 graph.profileId=blair.id;graph.messagesError='';
 await page.getByRole('button',{name:'Reconnect',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reconnect',exact:true})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Welcome to TAUT'})).toBeVisible();
 await row(page,alex.displayName).click();
 await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('');expect(graph.writes).toEqual([]);
});
