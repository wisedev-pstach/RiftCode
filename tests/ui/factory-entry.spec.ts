import {test,expect} from '@playwright/test';
import {installEntryFixture} from '../fixtures/factory-entry';
import {reviewFixture} from '../fixtures/review-workspace';
const evidence='/opt/data/output/riftcode/software-factory/entry';
test('arrival chooses Creation or Review without loading factory before explicit entry',async({page})=>{
 await installEntryFixture(page);await page.goto('/');
 await expect(page.getByRole('heading',{name:'Choose your workflow'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Creation',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Review',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).factoryCalls)).toEqual([]);
 await expect(page.locator('rift-factory-workbench')).toHaveCount(0);
 await page.getByRole('button',{name:'Open Creation',exact:true}).click();
 await expect(page.locator('rift-factory-workbench')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).factoryCalls.length)).toBeGreaterThan(0);
});

test('factory exit retains exact Agent and Review xterm nodes, drafts and real scratch PTYs',async({page})=>{
 const fixture=await reviewFixture();
 try {
  await installEntryFixture(page);
  await page.exposeFunction('entryStart',(...args:any[])=>fixture.start(args[0],args[1],args[2],args[3],args[4],args[5]));
  await page.exposeFunction('entryRead',(id:string|null,cursor:number,slot:'terminal'|'review'='terminal')=>fixture.workspace.slot(slot).read(id,cursor));
  await page.exposeFunction('entryStop',(slot:'terminal'|'review'='terminal')=>fixture.workspace.slot(slot).reset());
  await page.exposeFunction('entryResize',(id:string,cols:number,rows:number,slot:'terminal'|'review'='terminal')=>fixture.workspace.slot(slot).resize(id,cols,rows));
  await page.addInitScript(()=>{const w=window as any;w.rift.terminalStart=w.entryStart;w.rift.terminalRead=w.entryRead;w.rift.terminalStop=w.entryStop;w.rift.terminalResize=w.entryResize;});
  await page.goto('/');await page.getByRole('button',{name:'Open Review',exact:true}).click();
  const agent=page.locator('rift-ai-terminal');
  await agent.getByRole('button',{name:'Start session',exact:true}).click();
  await expect(agent.locator('.terminal-surface')).toContainText('ACTUAL LOCAL PTY FIXTURE PID=');
  const agentNode=await agent.elementHandle(),agentXterm=await agent.locator('.xterm').elementHandle();
  await page.getByRole('button',{name:'Open code review',exact:true}).click();
  await page.getByRole('textbox',{name:'Review instructions'}).fill('Retain the unsent review brief');
  const review=page.locator('rift-review-terminal');
  await review.getByRole('button',{name:'Start review session',exact:true}).click();
  await expect(review.locator('.terminal-surface')).toContainText('ACTUAL LOCAL PTY FIXTURE PID=');
  const reviewNode=await review.elementHandle(),reviewXterm=await review.locator('.xterm').elementHandle();
  const before=fixture.starts.slice();
  const sessionIds=(['terminal','review'] as const).map(slot=>fixture.workspace.slot(slot).read(null,0).state?.id);
  await page.getByRole('button',{name:'Workflows',exact:true}).click();
  await expect(page.locator('.retained-review')).toHaveAttribute('inert','');
  await expect(page.getByRole('button',{name:'Stop session',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Open Creation',exact:true}).click();
  await page.getByRole('textbox',{name:'Project title',exact:true}).fill('Keep this local draft');
  const factory=await page.locator('rift-factory-workbench').elementHandle();
  await page.getByRole('button',{name:'Review mode',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Review instructions'})).toHaveValue('Retain the unsent review brief');
  expect(await page.evaluate(el=>el===document.querySelector('rift-ai-terminal'),agentNode)).toBe(true);
  expect(await page.evaluate(el=>el===document.querySelector('rift-ai-terminal .xterm'),agentXterm)).toBe(true);
  expect(await page.evaluate(el=>el===document.querySelector('rift-review-terminal'),reviewNode)).toBe(true);
  expect(await page.evaluate(el=>el===document.querySelector('rift-review-terminal .xterm'),reviewXterm)).toBe(true);
  await page.getByRole('button',{name:'Workflows',exact:true}).click();await page.getByRole('button',{name:'Open Creation',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Project title',exact:true})).toHaveValue('Keep this local draft');
  expect(await page.evaluate(el=>el===document.querySelector('rift-factory-workbench'),factory)).toBe(true);
  await page.getByRole('button',{name:'Workspace',exact:true}).click();await expect(page.getByRole('heading',{name:'Choose your workflow'})).toBeVisible();
  expect(fixture.starts).toEqual(before);expect(fixture.starts).toHaveLength(2);
  expect(await fixture.bytes()).toHaveLength(0);expect(await fixture.requests()).toEqual([]);
  expect((['terminal','review'] as const).map(slot=>fixture.workspace.slot(slot).read(null,0).state?.id)).toEqual(sessionIds);
  for(const slot of ['terminal','review'] as const){const state=await fixture.workspace.slot(slot).read(null,0);expect(state.state?.status).toBe('running');}
 } finally {await fixture.cleanup();}
});

test('repository change resets Creation draft without replacing its component',async({page})=>{
 await installEntryFixture(page);await page.goto('/');await page.getByRole('button',{name:'Open Creation',exact:true}).click();
 await page.getByRole('textbox',{name:'Project title',exact:true}).fill('Old repository only');
 const factory=await page.locator('rift-factory-workbench').elementHandle();
 await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();
 await expect(page.getByRole('button',{name:'replacement',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Project title',exact:true})).toHaveValue('');
 expect(await page.evaluate(el=>el===document.querySelector('rift-factory-workbench'),factory)).toBe(true);
});

test('running Creation remains available from Home and Review and mode switches never stop it',async({page})=>{
 await installEntryFixture(page);await page.addInitScript(()=>(window as any).factoryRunning=true);await page.goto('/');
 await page.getByRole('button',{name:'Open Creation',exact:true}).click();await expect(page.locator('rift-factory-workbench nav')).toContainText('running');
 await page.getByRole('button',{name:'Review mode',exact:true}).click();await expect(page.getByRole('button',{name:'Open running Creation',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Workflows',exact:true}).click();await page.getByRole('button',{name:'Open running Creation',exact:true}).click();
 await expect(page.locator('rift-factory-workbench')).toBeVisible();expect(await page.evaluate(()=>(window as any).factoryCalls.filter((c:string)=>c==='stop'))).toEqual([]);
});

for(const width of [940,1024,1440])for(const theme of ['dark','light'])test(`actual App entry ${theme} ${width}: drag-safe accessible controls and screenshots`,async({page})=>{
 await installEntryFixture(page);await page.setViewportSize({width,height:900});await page.addInitScript(theme=>localStorage.setItem('rift:theme',theme),theme);await page.goto('/');
 await expect(page.getByRole('heading',{name:'Choose your workflow'})).toBeVisible();
 for(const name of ['Open Creation','Open Review','Workflows','terminal-fixture',theme==='dark'?'Use light theme':'Use dark theme']){
  const button=page.getByRole('button',{name,exact:true});await expect(button).toBeVisible();
  const bounds=await button.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
  expect(await button.evaluate(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region'))).toBe('no-drag');
 }
 expect(await page.locator('.topbar').evaluate(el=>getComputedStyle(el).paddingLeft)).toBe('82px');
 await page.screenshot({path:`${evidence}/${theme}-${width}-home.png`});
 await page.getByRole('button',{name:'Open Creation',exact:true}).click();await expect(page.getByRole('textbox',{name:'Project title',exact:true})).toBeVisible();
 await page.screenshot({path:`${evidence}/${theme}-${width}-creation.png`});
 await page.getByRole('button',{name:'Review mode',exact:true}).click();await expect(page.locator('.review-rail small')).toHaveText(['Notes','Agent','Review']);
 await expect(page.locator('.review-rail small').first()).toHaveCSS('writing-mode','vertical-rl');
 await page.screenshot({path:`${evidence}/${theme}-${width}-review.png`});
});
test('notes, source selection and docked Agent retain Enter-free routing across workflows',async({page})=>{
 await installEntryFixture(page);await page.goto('/');await page.getByRole('button',{name:'Open Review',exact:true}).click();
 const agent=page.locator('rift-ai-terminal');await agent.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.locator('.diff-row.addition').first().click({button:'right'});await page.getByRole('menuitem',{name:'Add note'}).click();
 await page.getByRole('textbox',{name:'Review note',exact:true}).fill('Preserved workflow note');await page.getByRole('button',{name:'Add note',exact:true}).click();
 await page.getByRole('checkbox',{name:'Select note',exact:true}).check();await page.getByRole('button',{name:'Agent',exact:true}).click();
 await agent.getByRole('button',{name:'Start session',exact:true}).click();await agent.getByRole('button',{name:'Dock to bottom',exact:true}).click();
 const node=await agent.locator('.xterm').elementHandle();
 await page.getByRole('button',{name:'Workflows',exact:true}).click();await page.getByRole('button',{name:'Open Creation',exact:true}).click();await page.getByRole('button',{name:'Review mode',exact:true}).click();
 await expect(page.locator('.workspace')).toHaveClass(/terminal-docked/);expect(await page.evaluate(el=>el===document.querySelector('rift-ai-terminal .xterm'),node)).toBe(true);
 await expect(page.getByRole('checkbox',{name:'Select note',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'Insert 1 in Agent',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.input).length)).toBe(1);
 await page.locator('.diff-row.addition').first().click({button:'right'});await page.getByRole('menuitem',{name:'Insert selection in Agent'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.input).length)).toBe(2);
 const writes=await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.input));
 expect(writes[0].input).toContain('Preserved workflow note');expect(writes[1].input).toContain('Selected diff:');
 expect(writes.every((w:any)=>w.paste&&!w.input.includes('\r'))).toBe(true);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.stop||c.reviewSubmit))).toEqual([{start:'claude',mode:'edit'}]);
});

test('legacy bridge without factory goes straight to retained Review',async({page})=>{
 await installEntryFixture(page,false);await page.goto('/');
 await expect(page.locator('.workspace')).toBeVisible();
 await expect(page.getByRole('button',{name:'Workflows',exact:true})).toHaveCount(0);
 await expect(page.locator('rift-factory-workbench')).toHaveCount(0);
});
