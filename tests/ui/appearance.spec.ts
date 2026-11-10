import {test,expect,row,alex} from './fixtures';
for(const theme of ['light','dark']) for(const contrast of ['standard','increased']) {
 test(`${theme} ${contrast} appearance and accents persist without changing drafts`,async({page,graph},info)=>{
  graph.restoredSession=true;await page.goto('/');await row(page,alex.displayName).click();
  const message=page.getByRole('textbox',{name:'Message',exact:true});await message.fill('Appearance keeps this draft');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('group',{name:'Appearance',exact:true}).getByRole('radio',{name:theme[0].toUpperCase()+theme.slice(1),exact:true}).check();
  await page.getByRole('group',{name:'Increase contrast',exact:true}).getByRole('radio',{name:contrast[0].toUpperCase()+contrast.slice(1),exact:true}).check();
  for(const accent of ['amber','teal','violet','blue','rose']) {
   await page.getByRole('button',{name:`${accent} accent`,exact:true}).click();
   await expect(page.locator('html')).toHaveAttribute('data-accent',accent);
   const colors=await page.evaluate(()=>{
    const style=getComputedStyle(document.documentElement);
    return [style.getPropertyValue('--text-primary'),style.getPropertyValue('--surface-base')];
   });expect(colors[0]).not.toEqual(colors[1]);
   const ratio=(a:string,b:string)=>{
    const luminance=(hex:string)=>{const values=hex.trim().slice(1).match(/../g)!.map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
    const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
   };
   expect(ratio(colors[0],colors[1])).toBeGreaterThanOrEqual(7);
   const palette=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return ['--text-secondary','--surface-raised','--accent','--text-on-accent'].map(name=>s.getPropertyValue(name));});
   expect(ratio(palette[0],palette[1])).toBeGreaterThanOrEqual(4.5);
   expect(ratio(palette[2],palette[3])).toBeGreaterThanOrEqual(4.5);
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect(page.locator('html')).toHaveAttribute('data-contrast',contrast);
  await page.screenshot({path:info.outputPath(`${theme}-${contrast}.png`)});
  await page.getByRole('button',{name:'Close settings'}).click();await expect(message).toHaveValue('Appearance keeps this draft');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect(page.locator('html')).toHaveAttribute('data-accent','rose');
  await expect(page.locator('html')).toHaveAttribute('data-contrast',contrast);expect(graph.writes).toEqual([]);
 });
}
test('system appearance follows live changes and invalid saved preferences recover',async({page,graph})=>{
 graph.restoredSession=true;await page.addInitScript(()=>localStorage.setItem('taut.appearance.v1','invalid'));
 await page.emulateMedia({colorScheme:'light',contrast:'no-preference'});await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.emulateMedia({colorScheme:'dark',contrast:'more'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('html')).toHaveAttribute('data-contrast','increased');
 expect(graph.writes).toEqual([]);
});
