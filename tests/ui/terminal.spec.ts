import { test, expect, type Page } from '@playwright/test';
import {reviewFixture} from '../fixtures/review-workspace';
import {contextPaste} from '../../src/shared/terminal';
import {promptFixture} from '../fixtures/prompt-checkpoints';
import {nativeSessionMetadata} from '../fixtures/native-session-metadata';

for(const width of [1024,1440])for(const theme of ['dark','light'])test(`tracked prompt summary ${theme} ${width} jumps to exact real-filesystem diff, not Git HEAD`,async({page})=>{
 const fixture=await promptFixture();
 await page.setViewportSize({width,height:900});if(theme==='light')await page.getByRole('button',{name:'Use light theme',exact:true}).click();
 await page.evaluate(()=>{const label=document.createElement('div');label.textContent='Synthetic browser bridge · real scratch Git checkpoints · no provider run';label.style.cssText='position:fixed;bottom:38px;right:60px;z-index:1000;font:11px sans-serif;padding:6px 10px;background:#252d38;color:#fff;border:1px solid #66717c;border-radius:4px;pointer-events:none';document.body.append(label);});
 const shot=(state:string)=>page.screenshot({path:`/opt/data/output/riftcode/prompt-changes/${theme}-${width}-${state}.png`});
 try{
  await page.exposeFunction('realCheckpointSend',(id:string,text:string)=>fixture.send(id,text));
  await page.exposeFunction('realCheckpointList',()=>fixture.service.list(fixture.root));
  await page.exposeFunction('realCheckpointPatch',(id:string,path:string,viewId:string)=>fixture.service.patch(fixture.root,id,path,viewId));
  await page.evaluate(()=>{const f=window as any;f.rift.terminalSendTracked=f.realCheckpointSend;f.rift.promptSummaries=f.realCheckpointList;f.rift.promptPatch=f.realCheckpointPatch;});
  await page.getByRole('button',{name:'Start session',exact:true}).click();
  await page.locator('rift-ai-terminal summary').click();await page.getByRole('button',{name:'Track a prompt',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Tracked prompt'})).toBeFocused();
  await page.getByRole('textbox',{name:'Tracked prompt'}).fill('Restore value and update fixtures');
  const send=page.getByRole('button',{name:'Send & track',exact:true});await expect(send).toBeEnabled();
  const button=await send.boundingBox(),pane=await page.locator('rift-ai-terminal').boundingBox();expect(button!.x+button!.width).toBeLessThanOrEqual(pane!.x+pane!.width);expect(button!.y+button!.height).toBeLessThanOrEqual(pane!.y+pane!.height);
  await shot('composer');await send.click();
  await expect(page.locator('.prompt-summary')).toContainText('3 files · +3 −2');await shot('summary');
  await page.getByRole('button',{name:'Dock to bottom',exact:true}).click();await expect(page.locator('.prompt-summary')).toContainText('3 files · +3 −2');await page.getByRole('button',{name:'Close dock',exact:true}).click();await expect(page.locator('.prompt-summary')).toContainText('3 files · +3 −2');
  expect(fixture.sends).toBe(1);
  await page.locator('.prompt-summary').getByRole('button',{name:'Review changes',exact:true}).click();
  await expect(page.getByRole('status',{name:'Prompt comparison'})).toContainText('Changes since prompt');
  await page.locator('.file-row').filter({hasText:'reverted.ts'}).click();
  await expect(page.locator('.diff-panel')).toContainText('dirty before prompt');await expect(page.locator('.diff-panel')).toContainText('HEAD');await shot('review-exact-diff');
  await page.locator('.file-row').filter({hasText:'added.ts'}).click();await expect(page.locator('.diff-panel')).toContainText('new second line');
  await page.locator('.file-row').filter({hasText:'deleted.ts'}).click();await expect(page.locator('.diff-panel')).toContainText('delete this line');
  await page.getByRole('button',{name:'Agent',exact:true}).click();await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
  await page.locator('rift-ai-terminal summary').click();await page.getByRole('button',{name:'Track a prompt',exact:true}).click();
  await page.getByRole('textbox',{name:'Tracked prompt'}).fill('Second prompt: replace added lines');await page.getByRole('button',{name:'Send & track',exact:true}).click();
  await expect(page.locator('.prompt-summary')).toHaveCount(2);await expect(page.locator('.prompt-summary').first()).toContainText('Frozen checkpoint · 3 files · +3 −2');await expect(page.locator('.prompt-summary').last()).toContainText('1 file · +1 −2');await shot('two-prompts');
  await page.locator('.prompt-summary').first().getByRole('button',{name:'Review changes',exact:true}).click();await page.locator('.file-row').filter({hasText:'added.ts'}).click();await expect(page.locator('.diff-panel')).toContainText('new second line');await expect(page.locator('.diff-panel')).not.toContainText('second prompt line');
  await page.getByRole('button',{name:'Repository comparison',exact:true}).click();await expect(page.locator('.file-row')).toHaveCount(1);await expect(page.locator('.diff-panel')).toContainText('src/changed.ts');
  expect(fixture.sends).toBe(2);
 }finally{await fixture.cleanup();}
});

test('late checkpoint patch cannot enter an empty replacement repository',async({page})=>{
 const fixture=await promptFixture();
 try{
  await page.exposeFunction('scopeSend',(id:string,text:string)=>fixture.send(id,text));await page.exposeFunction('scopeList',()=>fixture.service.list(fixture.root));
  await page.evaluate(()=>{const f=window as any;f.rift.terminalSendTracked=f.scopeSend;f.rift.promptSummaries=f.scopeList;f.rift.promptPatch=()=>new Promise(resolve=>f.finishOldPatch=resolve);f.rift.chooseRepository=async()=>{await f.rift.terminalStop();return {...f.fixtureRepository,root:'/fixture/empty',files:[]};};});
  await page.getByRole('button',{name:'Start session',exact:true}).click();await page.locator('rift-ai-terminal summary').click();await page.getByRole('button',{name:'Track a prompt',exact:true}).click();await page.getByRole('textbox',{name:'Tracked prompt'}).fill('fixture edits');await page.getByRole('button',{name:'Send & track',exact:true}).click();await expect(page.locator('.prompt-summary')).toContainText('3 files');await page.locator('.prompt-summary').getByRole('button',{name:'Review changes',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!(window as any).finishOldPatch)).toBe(true);
  const [summary]=await fixture.service.list(fixture.root);const oldPatch=await fixture.service.patch(fixture.root,summary.id,'deleted.ts',summary.viewId);
  await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();await expect(page.locator('.file-row')).toHaveCount(0);
  await page.evaluate(patch=>(window as any).finishOldPatch(patch),oldPatch);await page.waitForTimeout(150);await expect(page.locator('.diff-panel')).not.toContainText('delete this line');await expect(page.getByRole('status',{name:'Prompt comparison'})).toHaveCount(0);
 }finally{await fixture.cleanup();}
});

test('Stop remains stopped when freezing the checkpoint fails',async({page})=>{
 await page.evaluate(()=>{const f=window as any,stop=f.rift.terminalStop;f.rift.terminalStop=async()=>{await stop();return {checkpointError:'Checkpoint file limit: 1 MiB'};};});
 await page.getByRole('button',{name:'Start session',exact:true}).click();await page.getByRole('button',{name:'Stop session',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('No active session');await expect(page.getByRole('alert')).toContainText('Checkpoint file limit');await expect(page.getByRole('button',{name:'Start session',exact:true})).toBeEnabled();
});

test('tracked draft survives Stop during capture and a failed submit without writing twice',async({page})=>{
 await page.evaluate(()=>{const f=window as any;f.rift.terminalSendTracked=()=>new Promise((_resolve,reject)=>f.rejectTracked=reject);f.rift.promptSummaries=async()=>[];});
 await page.getByRole('button',{name:'Start session',exact:true}).click();await page.locator('rift-ai-terminal summary').click();await page.getByRole('button',{name:'Track a prompt',exact:true}).click();
 await page.getByRole('textbox',{name:'Tracked prompt'}).fill('retain this draft');await page.getByRole('button',{name:'Send & track',exact:true}).click();
 await expect(page.getByRole('button',{name:'Capturing…',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Stop session',exact:true}).click();await page.evaluate(()=>(window as any).rejectTracked(new Error('old capture cancelled')));
 await expect(page.getByRole('textbox',{name:'Tracked prompt'})).toHaveValue('retain this draft');
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.getByRole('button',{name:'Send & track',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Send & track',exact:true}).click();await page.evaluate(()=>(window as any).rejectTracked(new Error('Checkpoint too large. Nothing sent.')));
 await expect(page.getByRole('alert')).toContainText('Checkpoint too large');await expect(page.getByRole('textbox',{name:'Tracked prompt'})).toHaveValue('retain this draft');
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.input))).toEqual([]);
});

test('Agent label preserves the prompt icon and upright Notes Agent Review rail',async({page})=>{
 await expect(page.locator('.review-rail small')).toHaveText(['Notes','Agent','Review']);
 const agent=page.getByRole('button',{name:'Agent',exact:true});
 await expect(agent.locator('span')).toHaveText('>_');
 await expect(agent.locator('small')).toHaveCSS('writing-mode','vertical-rl');
 await expect(agent.locator('small')).toHaveCSS('text-orientation','upright');
 await expect(page.locator('rift-ai-terminal .terminal-identity strong')).toHaveText('Agent');
});

test('selection destination label follows active docked Review and Agent without submitting',async({page})=>{
 const agent=page.locator('rift-ai-terminal'),review=page.locator('rift-review-terminal');
 await agent.getByRole('button',{name:'Start session',exact:true}).click();
 await page.getByRole('button',{name:'Open code review',exact:true}).click();
 await expect(review.getByRole('region',{name:'Review context',exact:true})).toBeVisible();
 await expect(review.getByRole('combobox',{name:'Review provider',exact:true})).toBeVisible();
 await review.getByRole('button',{name:'Start review session',exact:true}).click();
 await review.getByRole('button',{name:'Dock to bottom',exact:true}).click();
 await expect(review.locator('.terminal-surface')).toContainText('Ready >');
 await page.locator('.diff-row.addition').first().click({button:'right'});
 const reviewInsert=page.getByRole('menuitem',{name:'Insert selection in Review'});
 await expect(reviewInsert).toContainText('Context only — no Enter');await reviewInsert.click();
 const text='Location: src/changed.ts:2-2\nSelected diff:\n```diff\n+new\n```';
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.reviewInput))).toEqual([{reviewInput:text,paste:true}]);
 await review.getByRole('button',{name:'Show Agent in dock',exact:true}).click();
 await page.locator('.diff-row.addition').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Insert selection in Agent'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.input))).toEqual([{input:text,paste:true}]);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.reviewStart||c.stop||c.reviewStop||c.input||c.reviewInput||c.reviewSubmit))).toEqual([{start:'claude',mode:'edit'},{reviewStart:'claude',mode:'review'},{reviewInput:text,paste:true},{input:text,paste:true}]);
});

test('notes destination label follows active docked Review and Agent without submitting',async({page})=>{
 const agent=page.locator('rift-ai-terminal'),review=page.locator('rift-review-terminal');
 await agent.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.locator('.diff-row.addition').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Add note'}).click();
 await page.getByRole('textbox',{name:'Review note',exact:true}).fill('Check destination routing.');
 await page.getByRole('button',{name:'Add note',exact:true}).click();
 await page.getByRole('checkbox',{name:'Select note',exact:true}).check();
 await expect(page.getByRole('button',{name:'Insert 1 in Agent',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Agent',exact:true}).click();
 await agent.getByRole('button',{name:'Start session',exact:true}).click();
 await page.getByRole('button',{name:'Open code review',exact:true}).click();
 await review.getByRole('button',{name:'Start review session',exact:true}).click();
 await review.getByRole('button',{name:'Dock to bottom',exact:true}).click();
 await expect(review.locator('.terminal-surface')).toContainText('Ready >');
 const reviewInsert=page.getByRole('button',{name:'Insert 1 in Review',exact:true});
 await expect(reviewInsert).toBeVisible();await reviewInsert.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.reviewInput).length)).toBe(1);
 const text=await page.evaluate(()=>(window as any).fixtureCalls.find((c:any)=>c.reviewInput).reviewInput);
 expect(text).toContain('Check destination routing.');expect(text).toContain('src/changed.ts');
 expect(text.endsWith('\r')).toBe(false);expect(text).not.toContain('\x1b');
 await review.getByRole('button',{name:'Show Agent in dock',exact:true}).click();
 await page.getByRole('button',{name:'Insert 1 in Agent',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.input))).toEqual([{input:text,paste:true}]);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.reviewStart||c.stop||c.reviewStop||c.input||c.reviewInput||c.reviewSubmit))).toEqual([{start:'claude',mode:'edit'},{reviewStart:'claude',mode:'review'},{reviewInput:text,paste:true},{input:text,paste:true}]);
});

test('Agent dock tooltip and Review switch name match their retained surfaces',async({page})=>{
 const agent=page.locator('rift-ai-terminal');
 await expect(agent.getByRole('button',{name:'Dock to bottom',exact:true})).toHaveAttribute('title','Dock agent');
 await agent.getByRole('button',{name:'Dock to bottom',exact:true}).click();
 await agent.getByRole('button',{name:'Show Review in dock',exact:true}).click();
 const review=page.locator('rift-review-terminal');
 await expect(review.getByRole('button',{name:'Show Agent in dock',exact:true})).toHaveText('Agent');
 await review.getByRole('button',{name:'Close dock',exact:true}).click();
 await expect(review.getByRole('button',{name:'Dock to bottom',exact:true})).toHaveAttribute('title','Dock review');
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.reviewStart||c.stop||c.reviewStop||c.input||c.reviewInput))).toEqual([]);
});

test('Agent selection insertion and accessible context labels retain context without Enter',async({page})=>{
 const agent=page.locator('rift-ai-terminal');
 await expect(agent.getByRole('region',{name:'Agent context',exact:true})).toBeVisible();
 await expect(agent.getByRole('combobox',{name:'Agent provider',exact:true})).toBeVisible();
 await agent.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.locator('.diff-row.addition').first().click({button:'right'});
 const insert=page.getByRole('menuitem',{name:'Insert selection in Agent'});
 await expect(insert).toContainText('Context only — no Enter');
 await insert.click();
 await expect(agent.getByRole('textbox',{name:'Pending agent context',exact:true})).toHaveValue(/Selected diff/);
 await agent.getByRole('button',{name:'Dock to bottom',exact:true}).click();
 await agent.getByRole('button',{name:'Show Review in dock',exact:true}).click();
 await page.locator('.diff-row.addition').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Insert selection in Review'}).click();
 await expect(page.locator('rift-review-terminal').getByRole('textbox',{name:'Pending review context',exact:true})).toHaveValue(/Selected diff/);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.reviewStart||c.stop||c.reviewStop||c.input||c.reviewInput||c.reviewSubmit))).toEqual([]);
});

for(const width of [1024,1440])for(const theme of ['dark','light'])test(`Agent label evidence ${theme} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 if(theme==='light')await page.getByRole('button',{name:'Use light theme',exact:true}).click();
 await page.evaluate(()=>{const banner=document.createElement('div');banner.textContent='SYNTHETIC BROWSER BRIDGE · TEST REPOSITORY · NO PROVIDER CALL';banner.style.cssText='position:fixed;bottom:4px;left:20px;z-index:99999;font:10px sans-serif;color:#8995a1;pointer-events:none';document.body.append(banner);});
 const shot=async(state:string)=>{await page.waitForTimeout(180);await page.screenshot({path:`/opt/data/output/riftcode/agent-label/${theme}-${width}-${state}.png`});};
 const agent=page.locator('rift-ai-terminal');
 await expect(page.locator('.review-rail small')).toHaveText(['Notes','Agent','Review']);
 await expect(agent.getByTitle('Dock agent',{exact:true})).toBeVisible();await shot('rail');
 await agent.getByRole('button',{name:'Start session',exact:true}).click();
 await agent.getByTitle('Dock agent',{exact:true}).click();await shot('agent-docked');
 await agent.getByRole('button',{name:'Show Review in dock',exact:true}).click();
 const review=page.locator('rift-review-terminal');
 await expect(review.getByRole('button',{name:'Show Agent in dock',exact:true})).toHaveText('Agent');
 await shot('review-docked');
});

test('bottom docking retains the live terminal and closing returns original placement',async({page})=>{
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .xterm-screen')).toBeVisible();
 await page.evaluate(()=>{const f=window as any;f.savedTerminal=document.querySelector('rift-ai-terminal');f.savedXterm=document.querySelector('rift-ai-terminal .xterm');});
 await page.getByRole('button',{name:'Dock to bottom',exact:true}).click();
 await expect(page.locator('.diff-panel')).toBeVisible();
 const file=await page.locator('.diff-panel').boundingBox(),terminal=await page.locator('rift-ai-terminal').boundingBox();
 expect(file!.height).toBeGreaterThanOrEqual(180);expect(terminal!.height).toBeGreaterThanOrEqual(240);expect(terminal!.y).toBeGreaterThanOrEqual(file!.y+file!.height);
 await page.getByRole('button',{name:'Close dock',exact:true}).click();
 await expect(page.locator('.diff-panel')).toHaveCount(0);await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 expect(await page.evaluate(()=>{const f=window as any;return f.savedTerminal===document.querySelector('rift-ai-terminal')&&f.savedXterm===document.querySelector('rift-ai-terminal .xterm');})).toBe(true);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.stop||c.input))).toEqual([{start:'claude',mode:'edit'}]);
});

test('docked Review switches independent retained surfaces while a request is pending and references open above',async({page})=>{
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await page.getByRole('button',{name:'Open code review',exact:true}).click();
 const review=page.locator('rift-review-terminal');
 await review.getByRole('textbox',{name:'Review instructions'}).fill('Keep this review draft');
 await review.getByRole('button',{name:'Start review session',exact:true}).click();
 await expect(review.getByRole('button',{name:'Run review',exact:true})).toBeEnabled();
 await page.evaluate(()=>{const f=window as any;f.reviewHost=document.querySelector('rift-review-terminal');f.reviewXterm=document.querySelector('rift-review-terminal .xterm');f.rift.terminalSubmitReview=()=>new Promise(resolve=>f.finishDockedReview=resolve);});
 await review.getByRole('button',{name:'Run review',exact:true}).click();
 await review.getByRole('button',{name:'Dock to bottom',exact:true}).click();
 await review.getByRole('button',{name:'Show Agent in dock',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 await page.locator('rift-ai-terminal').getByRole('button',{name:'Show Review in dock',exact:true}).click();
 await expect(review.getByRole('button',{name:'Sending…',exact:true})).toBeDisabled();
 await page.evaluate(()=>(window as any).finishDockedReview());
 await expect(review.getByText('Request sent',{exact:true})).toBeVisible();
 const reference=review.locator('.xterm-screen');await reference.click({position:{x:95,y:22},modifiers:['Control']});
 await expect(page.locator('.source-target')).toContainText('line12');
 await expect(review).toBeVisible();await expect(page.locator('.workspace')).toHaveClass(/terminal-docked/);await expect(page.locator('.workspace')).not.toHaveClass(/review-open/);
 await review.getByRole('button',{name:'Close dock',exact:true}).click();
 await review.getByRole('button',{name:'Edit review brief',exact:true}).click();
 await expect(review.getByRole('textbox',{name:'Review instructions'})).toHaveValue('Keep this review draft');
 expect(await page.evaluate(()=>{const f=window as any;return f.reviewHost===document.querySelector('rift-review-terminal')&&f.reviewXterm===document.querySelector('rift-review-terminal .xterm');})).toBe(true);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.reviewStart||c.stop||c.reviewStop||c.input||c.reviewInput))).toEqual([{start:'claude',mode:'edit'},{reviewStart:'claude',mode:'review'}]);
});

for(const width of [1024,1440])for(const theme of ['dark','light'])test(`docked split resizes with pointer and keyboard ${theme} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});if(theme==='light')await page.getByRole('button',{name:'Use light theme',exact:true}).click();
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await page.evaluate(()=>{const label=document.createElement('div');label.textContent='Synthetic browser bridge · harmless fixtures · no provider run';label.style.cssText='position:fixed;bottom:4px;right:65px;z-index:1000;font:11px sans-serif;padding:4px;background:#252d38;color:#fff;pointer-events:none';document.body.append(label);});
 const shot=async(state:string)=>{await page.waitForTimeout(180);await page.screenshot({path:`/opt/data/output/riftcode/terminal-docking/${theme}-${width}-${state}.png`});};
 await shot('normal');await page.getByRole('button',{name:'Dock to bottom',exact:true}).click();await shot('docked');
 const separator=page.getByRole('separator',{name:'Resize bottom terminal'});await expect(separator).toHaveAttribute('aria-orientation','horizontal');
 const terminal=page.locator('rift-ai-terminal');const before=(await terminal.boundingBox())!.height;
 await separator.focus();await separator.press('ArrowUp');await expect.poll(async()=>(await terminal.boundingBox())!.height).toBe(before+20);
 const bar=(await separator.boundingBox())!;await page.mouse.move(bar.x+bar.width/2,bar.y+3);await page.mouse.down();await page.mouse.move(bar.x+bar.width/2,bar.y-57,{steps:5});await page.mouse.up();
 await expect.poll(async()=>(await terminal.boundingBox())!.height).toBe(before+80);await shot('resized');
 await separator.press('End');await expect.poll(async()=>(await terminal.boundingBox())!.height).toBe(Number(await separator.getAttribute('aria-valuemax')));const max=(await terminal.boundingBox())!.height;expect((await page.locator('.diff-panel').boundingBox())!.height).toBeGreaterThanOrEqual(180);
 await separator.press('Home');await expect.poll(async()=>(await terminal.boundingBox())!.height).toBe(280);expect((await terminal.boundingBox())!.height).toBeLessThan(max);expect((await terminal.boundingBox())!.height).toBeGreaterThanOrEqual(240);
 await page.setViewportSize({width,height:600});await expect.poll(async()=>{const f=(await page.locator('.diff-panel').boundingBox())!,t=(await terminal.boundingBox())!;return f.height>=145&&t.height>=220&&t.y+t.height<=570;}).toBe(true);
 await page.setViewportSize({width,height:900});await expect(separator).toHaveAttribute('aria-valuenow','280');await separator.press('ArrowUp');await expect.poll(async()=>(await terminal.boundingBox())!.height).toBe(300);
 const remembered=(await terminal.boundingBox())!.height;await page.getByRole('button',{name:'Close dock',exact:true}).click();await shot('closed');await page.getByRole('button',{name:'Dock to bottom',exact:true}).click();await expect.poll(async()=>(await terminal.boundingBox())!.height).toBe(remembered);
 await page.getByRole('button',{name:'Open code review',exact:true}).click();const review=page.locator('rift-review-terminal');await review.getByRole('button',{name:'Start review session',exact:true}).click();await review.getByRole('button',{name:'Run review',exact:true}).click();await expect(review.getByText('Request sent',{exact:true})).toBeVisible();await separator.press('End');await shot('review');
 expect((await review.locator('.terminal-surface').boundingBox())!.height).toBeGreaterThanOrEqual(120);
 await page.getByRole('button',{name:'Open review notes',exact:true}).click();await shot('review-notes');
 const file=(await page.locator('.diff-panel').boundingBox())!,pane=(await review.boundingBox())!;expect(file.y+file.height).toBeLessThanOrEqual(pane.y);expect(file.height).toBeGreaterThanOrEqual(180);
});

test('docked Review launcher and expanded brief keep controls reachable inside the lower pane',async({page})=>{
 await page.setViewportSize({width:1024,height:900});await page.getByRole('button',{name:'Open code review',exact:true}).click();const review=page.locator('rift-review-terminal');await review.getByRole('button',{name:'Dock to bottom',exact:true}).click();
 const start=review.getByRole('button',{name:'Start review session',exact:true});await expect(start).toBeVisible();
 expect(await start.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
 await start.click();await expect(review.getByRole('button',{name:'Run review',exact:true})).toBeEnabled();
 const pane=(await review.boundingBox())!,surface=(await review.locator('.terminal-surface').boundingBox())!;expect(surface.height).toBeGreaterThanOrEqual(120);expect(surface.y+surface.height).toBeLessThanOrEqual(pane.y+pane.height);
});

test('docking preserves scrolled terminal output and a pending tracked draft without submitting',async({page})=>{
 await page.getByRole('button',{name:'Start session',exact:true}).click();await expect(page.locator('rift-ai-terminal .terminal-surface')).toContainText('Ready >');
 await page.evaluate(()=>(window as any).fixtureAppend(Array.from({length:300},(_,i)=>`\r\nSCROLL-LINE-${String(i).padStart(3,'0')}`).join('')));
 const screen=page.locator('rift-ai-terminal .xterm-screen');await expect(screen).toContainText('SCROLL-LINE-299');await screen.hover();await page.mouse.wheel(0,-2400);await page.waitForTimeout(200);await expect(screen).not.toContainText('SCROLL-LINE-299');const anchor=(await screen.textContent())!.match(/SCROLL-LINE-\d+/)![0];
 await page.getByRole('button',{name:'Dock to bottom',exact:true}).click();await page.waitForTimeout(150);await expect(screen).not.toContainText('SCROLL-LINE-299');expect((await screen.textContent())!.match(/SCROLL-LINE-\d+/)![0]).toBe(anchor);
 await page.evaluate(()=>(window as any).fixtureAppend('\r\nNEW-OUTPUT-WHILE-SCROLLED'));await page.waitForTimeout(200);await expect(screen).not.toContainText('NEW-OUTPUT-WHILE-SCROLLED');
 await page.getByRole('separator',{name:'Resize bottom terminal'}).press('ArrowUp');await page.waitForTimeout(100);expect((await screen.textContent())!.match(/SCROLL-LINE-\d+/)![0]).toBe(anchor);
 await page.getByRole('button',{name:'Open review notes',exact:true}).click();await page.waitForTimeout(220);await expect(screen).toContainText(anchor);await expect(screen).not.toContainText('NEW-OUTPUT-WHILE-SCROLLED');await page.getByRole('button',{name:'Open review notes',exact:true}).click();await page.waitForTimeout(220);
 await page.getByRole('button',{name:'Close dock',exact:true}).click();await page.waitForTimeout(150);expect((await screen.textContent())!.match(/SCROLL-LINE-\d+/)![0]).toBe(anchor);await page.getByRole('button',{name:'Dock to bottom',exact:true}).click();
 await page.locator('rift-ai-terminal summary').click();await page.getByRole('button',{name:'Track a prompt',exact:true}).click();await page.getByRole('textbox',{name:'Tracked prompt'}).fill('Keep draft during layout changes');
 await page.evaluate(()=>{const f=window as any;f.rift.terminalSendTracked=()=>new Promise((_resolve,reject)=>f.rejectDockedTrack=reject);});
 await page.getByRole('button',{name:'Send & track',exact:true}).click();await page.getByRole('button',{name:'Close dock',exact:true}).click();await page.getByRole('button',{name:'Dock to bottom',exact:true}).click();await expect(page.getByRole('button',{name:'Capturing…',exact:true})).toBeDisabled();
 await page.evaluate(()=>(window as any).rejectDockedTrack(new Error('Fixture checkpoint rejected; nothing sent')));await expect(page.getByRole('textbox',{name:'Tracked prompt'})).toHaveValue('Keep draft during layout changes');
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.stop||c.input))).toEqual([{start:'claude',mode:'edit'}]);
});

test('choosing changed and explorer files keeps the docked session visible',async({page})=>{
 await page.getByRole('button',{name:'Start session',exact:true}).click();await page.getByRole('button',{name:'Dock to bottom',exact:true}).click();await page.locator('.file-row').first().click();await expect(page.locator('rift-ai-terminal')).toBeVisible();
 await page.getByRole('button',{name:'Explorer',exact:true}).click();await page.locator('[data-explorer-kind="file"]').first().click();await expect(page.locator('rift-ai-terminal')).toBeVisible();await expect(page.locator('.diff-panel')).toBeVisible();
});

async function prepareContext(page:Page) {
 // Real selection flow with a temporarily non-ready CLI: insertion must retain, never submit.
 await page.evaluate(()=>(window as any).fixtureAppend('\x1b[?2004l'));
 await page.waitForTimeout(150);
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.locator('.file-row').first().click();
 await page.locator('.diff-row.addition').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Insert selection in Agent'}).click();
 await page.evaluate(()=>(window as any).fixtureAppend('\x1b[?2004h'));
}


test('original upright rail and direct context actions remain available without opening Context',async({page})=>{
 await expect(page.locator('.review-rail small').first()).toHaveCSS('writing-mode','vertical-rl');
 await expect(page.locator('.review-rail small').first()).toHaveCSS('text-orientation','upright');
 const actions=page.getByRole('region',{name:'Agent context'});
 await expect(actions).toBeVisible();
 await expect(actions.getByRole('button',{name:'Insert selected notes (0)',exact:true})).toBeDisabled();
 await expect(actions.getByRole('button',{name:'Copy notes',exact:true})).toBeDisabled();
 await expect(actions.getByRole('button',{name:'Insert selection',exact:true})).toBeDisabled();
 await expect(page.locator('rift-ai-terminal details')).not.toHaveAttribute('open','');
});

test('dedicated review workbench runs scoped review and follow-up without replacing the edit terminal',async({page})=>{
 await page.evaluate(()=>{
  const f=window as any,api=f.rift;let reviewState:any=null,reviewOutput='';
  for(const name of ['terminalStart','terminalRead','terminalStop','terminalInput','terminalResize']){
   const original=api[name];api[name]=async(...args:any[])=>{
    const slot=args[name==='terminalStart'?5:name==='terminalRead'?2:name==='terminalStop'?0:name==='terminalInput'?3:3];
    if(slot!=='review')return original(...args);
    if(name==='terminalStart'){f.fixtureCalls.push({reviewStart:args[0],mode:args[1]});reviewState={id:'review-fixture',provider:args[0],mode:args[1],cwd:'/fixture/repo',status:'running'};reviewOutput='\x1b[?2004hReview fixture ready > ';return reviewState;}
    if(name==='terminalRead')return {state:reviewState,data:reviewOutput.slice(args[1]),cursor:reviewOutput.length,truncated:false};
    if(name==='terminalStop'){reviewState=null;reviewOutput='';f.fixtureCalls.push({reviewStop:true});}
    if(name==='terminalInput')f.fixtureCalls.push({reviewInput:args[1],paste:args[2]});
   };
  }
  api.terminalSubmitReview=async(id:string,text:string)=>{f.fixtureCalls.push({reviewSubmit:id,text});};
 });
 await page.getByRole('combobox',{name:'Session intent'}).selectOption('edit');
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await page.getByRole('button',{name:'Open code review',exact:true}).click();
 const workbench=page.getByRole('region',{name:'Code review workbench'});
 await expect(workbench).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Pending agent context'})).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.reviewStart||c.reviewSubmit||c.stop))).toEqual([]);
 await workbench.getByRole('combobox',{name:'Review scope'}).selectOption('file');
 await workbench.getByRole('textbox',{name:'Review instructions'}).fill('Check error handling');
 await workbench.getByRole('button',{name:'Start review session',exact:true}).click();
 const run=workbench.getByRole('button',{name:'Run review',exact:true});await expect(run).toBeEnabled();
 await run.click();
 const sends=await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.reviewSubmit));
 expect(sends).toHaveLength(1);await expect(workbench.getByText('Last sent request', {exact:true})).toBeVisible();await workbench.getByText('Last sent request', {exact:true}).click();await expect(workbench.locator('.review-request-snapshot pre')).toContainText('Scope: current file');expect(sends[0].text).toContain('Scope: current file');expect(sends[0].text).toContain('src/changed.ts');expect(sends[0].text).toContain('Start revision: HEAD');expect(sends[0].text).toContain('Check error handling');
 await workbench.getByRole('textbox',{name:'Review follow-up'}).fill('Explain the boundary case');
 await workbench.getByRole('button',{name:'Send follow-up',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.reviewSubmit).map((c:any)=>c.text))).toEqual([sends[0].text,'Explain the boundary case']);
 await workbench.getByRole('button',{name:'Stop session',exact:true}).click();
 await page.getByRole('button',{name:'Agent',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 await expect(page.locator('rift-ai-terminal .terminal-identity')).toContainText('Edit');
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start))).toHaveLength(1);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.stop))).toEqual([]);
});

for(const width of [1024,1440])for(const theme of ['dark','light'])test(`review workbench evidence ${theme} ${width}: notes, run, follow-up and resume stay reachable`,async({page})=>{
 await page.setViewportSize({width,height:900});if(theme==='light')await page.getByRole('button',{name:'Use light theme',exact:true}).click();
 await page.evaluate(()=>{const label=document.createElement('div');label.textContent='SYNTHETIC BROWSER BRIDGE · TEST REPOSITORY · NO PROVIDER CALL';label.style.cssText='position:fixed;bottom:4px;left:20px;z-index:99999;font:10px sans-serif;color:#8995a1;pointer-events:none';document.body.append(label);});
 const shot=(name:string)=>page.screenshot({path:`/opt/data/output/riftcode/review-workbench/${theme}-${width}-${name}.png`});
 const reachable=async(button:any)=>{const result=await button.evaluate((el:HTMLElement)=>{const r=el.getBoundingClientRect(),pane=el.closest('rift-review-terminal,rift-ai-terminal')!.getBoundingClientRect();return {inViewport:r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,inPane:r.top>=pane.top&&r.bottom<=pane.bottom,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});expect(result).toEqual({inViewport:true,inPane:true,hit:true});};
 await shot('terminal-closed');
 await page.getByRole('button',{name:'Back to code',exact:true}).click();await page.locator('.diff-row.addition').first().click({button:'right'});await page.getByRole('menuitem',{name:'Add note'}).click();await page.getByRole('textbox',{name:'Review note',exact:true}).fill('Check the error boundary before merging.');await page.getByRole('button',{name:'Add note',exact:true}).click();await page.getByRole('checkbox',{name:'Select note',exact:true}).check();
 await page.getByRole('button',{name:'Agent',exact:true}).click();
 const strip=page.locator('rift-ai-terminal').getByRole('region',{name:'Agent context'});await expect(strip.getByRole('button',{name:'Insert selected notes (1)',exact:true})).toBeEnabled();await reachable(strip.getByRole('button',{name:'Insert selected notes (1)',exact:true}));await shot('terminal-notes');
 await strip.getByRole('button',{name:'Insert selected notes (1)',exact:true}).click();await expect(page.getByRole('textbox',{name:'Pending agent context'})).toHaveValue(/src\/changed.ts/);await expect(page.getByRole('textbox',{name:'Pending agent context'})).toHaveValue(/Check the error boundary/);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.input))).toEqual([]);
 await page.getByRole('button',{name:'Start session',exact:true}).click();await page.getByRole('button',{name:'Insert pending context',exact:true}).click();
 const paste=await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.input));expect(paste).toHaveLength(1);expect(paste[0].paste).toBe(true);expect(paste[0].input.endsWith('\r')).toBe(false);await shot('terminal-running-notes');
 await page.getByRole('button',{name:'Open code review',exact:true}).click();const review=page.getByRole('region',{name:'Code review workbench'});
 await review.getByRole('combobox',{name:'Review scope'}).selectOption('notes');await review.getByRole('textbox',{name:'Review instructions'}).fill('Prioritize regressions and missing tests.');await reachable(review.getByRole('button',{name:'Start review session',exact:true}));await shot('review-setup-notes');
 await review.getByRole('button',{name:'Resume existing',exact:true}).click();await review.getByRole('listbox',{name:'Provider session',exact:true}).getByRole('option').first().click();await reachable(review.getByRole('button',{name:'Resume review session',exact:true}));await shot('review-resume-notes');
 await review.getByRole('button',{name:'Resume review session',exact:true}).click();const run=review.getByRole('button',{name:'Run review',exact:true});await expect(run).toBeEnabled();await reachable(run);await shot('review-ready-notes');await run.click();
 const submits=await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.reviewSubmit));expect(submits).toHaveLength(1);expect(submits[0].text).toContain('Scope: selected notes');expect(submits[0].text).toContain('Check the error boundary');expect(submits[0].text).toContain('Prioritize regressions');
 await review.getByRole('textbox',{name:'Review follow-up'}).fill('Explain the highest priority finding.');await reachable(review.getByRole('button',{name:'Send follow-up',exact:true}));await shot('review-follow-up-notes');await review.getByRole('button',{name:'Send follow-up',exact:true}).click();
 await page.getByRole('button',{name:'Open review notes',exact:true}).click();await shot('review-notes-closed');
 expect(await page.locator('.review-rail small').first().evaluate(el=>({writing:getComputedStyle(el).writingMode,orientation:getComputedStyle(el).textOrientation}))).toEqual({writing:'vertical-rl',orientation:'upright'});
 await page.getByRole('button',{name:'Agent',exact:true}).click();await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
});

test('narrow sidebar labels and actions have separate unclipped hit targets across views',async({page})=>{
 await page.setViewportSize({width:1024,height:900});await page.getByRole('button',{name:'Open review notes',exact:true}).click();
 for(const theme of ['dark','light']){
  if(theme==='light')await page.getByRole('button',{name:'Use light theme',exact:true}).click();
  for(const view of ['terminal','review','code']){
   if(view==='code')await page.getByRole('button',{name:'Agent',exact:true}).click();
   await page.getByRole('button',{name:view==='terminal'?'Agent':view==='review'?'Open code review':'Back to code',exact:true}).click();
   const header=page.locator('.changes-panel > .panel-title');
   const geometry=await header.evaluate(el=>Array.from(el.querySelectorAll('.sidebar-view-toggle button,.changes-heading-actions > button,.count')).map(button=>{const r=button.getBoundingClientRect(),p=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(button);const text=range.getBoundingClientRect();return {label:button.textContent?.trim(),fits:text.left>=r.left&&text.right<=r.right&&r.left>=p.left&&r.right<=p.right,hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
   expect(geometry.every(g=>g.fits&&g.hit),JSON.stringify(geometry)).toBe(true);
   await header.getByRole('button',{name:'File list options',exact:true}).click();await expect(page.getByRole('button',{name:'Hide reviewed files',exact:true})).toBeVisible();await page.keyboard.press('Escape');
   await header.getByRole('button',{name:'Explorer',exact:true}).click();await expect(header.getByRole('button',{name:'Changes',exact:true})).toBeVisible();await header.getByRole('button',{name:'Changes',exact:true}).click();
  }
 }
});

test('review dispatch collapses immediately while IPC is pending and restores instructions on rejection',async({page})=>{
 await page.getByRole('button',{name:'Open code review',exact:true}).click();
 const review=page.getByRole('region',{name:'Code review workbench'});
 await review.getByRole('textbox',{name:'Review instructions'}).fill('Synthetic pending instructions');
 await review.getByRole('button',{name:'Start review session',exact:true}).click();
 await expect(review.getByRole('button',{name:'Run review',exact:true})).toBeEnabled();
 const before=(await review.locator('.terminal-surface').boundingBox())!.height;
 await page.evaluate(()=>{const f=window as any;f.rift.terminalSubmitReview=()=>new Promise((resolve,reject)=>{f.resolveReview=resolve;f.rejectReview=reject;});});
 await review.getByRole('button',{name:'Run review',exact:true}).click();
 await expect(review.getByRole('button',{name:'Sending…',exact:true})).toBeDisabled();
 await expect(review.getByRole('button',{name:'Edit review brief',exact:true})).toHaveAttribute('aria-expanded','false');
 expect((await review.locator('.terminal-surface').boundingBox())!.height-before).toBeGreaterThan(100);
 await expect(review.getByText('Sending request…',{exact:true})).toBeVisible();
 await page.screenshot({path:'/opt/data/output/riftcode/terminal-scroll-fix/review-dispatch-pending.png'});
 await expect(review.locator('.review-request-snapshot')).toHaveCount(0);
 await page.evaluate(()=>(window as any).rejectReview(new Error('Uncertain; inspect CLI before retrying')));
 await expect(review.getByRole('alert')).toContainText('Uncertain');
 await expect(review.getByRole('textbox',{name:'Review instructions'})).toHaveValue('Synthetic pending instructions');
});

for(const provider of ['claude','opencode','codex'])test(`new ${provider} ordinary session defaults Edit; dedicated review stays plan`,async({page})=>{
 await page.getByRole('combobox',{name:'Agent provider'}).selectOption(provider);
 await expect(page.getByRole('combobox',{name:'Session intent'})).toHaveValue('edit');
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-identity')).toContainText('Edit');
 await page.getByRole('button',{name:'Open code review',exact:true}).click();
 const review=page.getByRole('region',{name:'Code review workbench'});
 await review.getByRole('combobox',{name:'Review provider'}).selectOption(provider);
 await review.getByRole('button',{name:'Start review session',exact:true}).click();
 await expect(review.locator('.terminal-identity')).toContainText('Review');await expect(review.locator('.terminal-status')).toHaveText('running');
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.reviewStart))).toEqual([{start:provider,mode:'edit'},{reviewStart:provider,mode:'review'}]);
});

test('accepted review brief collapses for output and reopens without submitting or rewriting its snapshot',async({page})=>{
 await page.setViewportSize({width:1024,height:900});await page.getByRole('button',{name:'Open review notes',exact:true}).click();await page.getByRole('button',{name:'Open code review',exact:true}).click();
 const review=page.getByRole('region',{name:'Code review workbench'});
 await review.getByRole('combobox',{name:'Review scope'}).selectOption('file');await review.getByRole('combobox',{name:'Review tone'}).selectOption('honest');await review.getByRole('textbox',{name:'Review instructions'}).fill('Check the boundary');
 await review.getByRole('button',{name:'Start review session',exact:true}).click();const run=review.getByRole('button',{name:'Run review',exact:true});await expect(run).toBeEnabled();
 const before=(await review.locator('.terminal-surface').boundingBox())!.height;
 await page.evaluate(()=>{const f=window as any,submit=f.rift.terminalSubmitReview;f.restoreSubmit=()=>f.rift.terminalSubmitReview=submit;f.rift.terminalSubmitReview=async()=>{throw new Error('uncertain write');};});
 await run.click();await expect(review.getByRole('alert')).toContainText('uncertain');await expect(review.getByRole('textbox',{name:'Review instructions'})).toHaveValue('Check the boundary');
 await page.evaluate(()=>(window as any).restoreSubmit());await run.click();
 const edit=review.getByRole('button',{name:'Edit review brief',exact:true});await expect(edit).toHaveAttribute('aria-expanded','false');
 await expect.poll(async()=>(await review.locator('.terminal-surface').boundingBox())!.height).toBeGreaterThanOrEqual(280);
 expect((await review.locator('.terminal-surface').boundingBox())!.height-before).toBeGreaterThan(140);
 await expect(review.locator('.review-brief')).toContainText('Current file');await expect(review.locator('.review-brief')).toContainText('Honest');
 for(const button of [edit,review.getByRole('button',{name:'Rerun review',exact:true}),review.getByRole('button',{name:'Send follow-up',exact:true})])expect(await button.evaluate(el=>{const r=el.getBoundingClientRect();return r.bottom<=innerHeight&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
 const snapshot=await review.locator('.review-request-snapshot pre').textContent();await edit.click();await expect(edit).toHaveAttribute('aria-expanded','true');await review.getByRole('textbox',{name:'Review instructions'}).fill('Changed draft');await expect(review.locator('.review-request-snapshot pre')).toHaveText(snapshot!);
 await review.getByRole('button',{name:'Collapse review brief',exact:true}).click();expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.reviewSubmit))).toHaveLength(1);
 await review.getByText('Last sent request',{exact:true}).click();await expect(review.locator('.review-request-snapshot pre')).toBeVisible();
});

for(const provider of ['claude','opencode','codex'])test(`actual harmless PTY parses ${provider} scoped review and follow-up once while the edit PTY stays alive`,async({page})=>{
 const fixture=await reviewFixture();
 try{
  await page.exposeFunction('nativeFixtureStart',fixture.start);
  await page.exposeFunction('nativeFixtureRead',(id:string|null,cursor:number,slot:'terminal'|'review')=>fixture.workspace.slot(slot).read(id,cursor));
  await page.exposeFunction('nativeFixtureInput',(id:string,text:string,paste:boolean,slot:'terminal'|'review')=>fixture.workspace.slot(slot).input(id,text,paste));
  await page.exposeFunction('nativeFixtureResize',(id:string,cols:number,rows:number,slot:'terminal'|'review')=>fixture.workspace.slot(slot).resize(id,cols,rows));
  await page.exposeFunction('nativeFixtureStop',(slot:'terminal'|'review')=>fixture.workspace.slot(slot).reset());
  await page.exposeFunction('nativeFixtureSubmit',(id:string,text:string)=>fixture.workspace.review.submit(id,text));
  await page.evaluate(()=>{const f=window as any;Object.assign(f.rift,{terminalStart:f.nativeFixtureStart,terminalRead:f.nativeFixtureRead,terminalInput:f.nativeFixtureInput,terminalResize:f.nativeFixtureResize,terminalStop:f.nativeFixtureStop,terminalSubmitReview:f.nativeFixtureSubmit});});
  await page.getByRole('combobox',{name:'Agent provider'}).selectOption(provider);await page.getByRole('combobox',{name:'Session intent'}).selectOption('edit');await page.getByRole('button',{name:'Start session',exact:true}).click();
  await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');const edit=fixture.workspace.terminal.read(null,0).state!;
  await page.getByRole('button',{name:'Open code review',exact:true}).click();const review=page.getByRole('region',{name:'Code review workbench'});
  await review.getByRole('combobox',{name:'Review provider'}).selectOption(provider);await review.getByRole('combobox',{name:'Review scope'}).selectOption('file');await review.getByRole('textbox',{name:'Review instructions'}).fill('Check the boundary.');await review.getByRole('button',{name:'Start review session',exact:true}).click();
  const run=review.getByRole('button',{name:'Run review',exact:true});await expect(run).toBeEnabled();expect((await fixture.bytes()).length).toBe(0);
  expect(fixture.workspace.terminal.read(edit.id,0).data).toMatch(/INITIAL_SIZE=\d+x\d+/);expect(fixture.workspace.terminal.read(edit.id,0).data).not.toContain('RESIZED=');
  expect(fixture.workspace.review.read(null,0).data).toMatch(/INITIAL_SIZE=\d+x\d+/);expect(fixture.workspace.review.read(null,0).data).not.toContain('RESIZED=');
  await run.click();const request=await review.locator('.review-request-snapshot pre').textContent();expect(request).toContain('Comparison: Working tree');expect(request).toContain('src/changed.ts');expect(request).toContain('Check the boundary.');
  await expect.poll(async()=>Buffer.from(await fixture.bytes()).toString('hex')).toBe(Buffer.from(contextPaste(request!)+'\r').toString('hex'));
  const reviewer=fixture.workspace.review.read(null,0).state!;
  const editPid=Number(fixture.workspace.terminal.read(edit.id,0).data.match(/PID=(\d+)/)![1]),reviewPid=Number(fixture.workspace.review.read(reviewer.id,0).data.match(/PID=(\d+)/)![1]);expect(editPid).not.toBe(reviewPid);
  await review.getByRole('button',{name:'Dock to bottom',exact:true}).click();
  await review.getByRole('button',{name:'Show Agent in dock',exact:true}).click();
  await page.locator('rift-ai-terminal').getByRole('button',{name:'Show Review in dock',exact:true}).click();
  await review.getByRole('button',{name:'Close dock',exact:true}).click();
  expect(fixture.workspace.terminal.read(edit.id,0).state).toEqual(edit);expect(fixture.workspace.review.read(reviewer.id,0).state).toEqual(reviewer);process.kill(editPid,0);process.kill(reviewPid,0);
  expect(Buffer.from(await fixture.bytes()).toString('hex')).toBe(Buffer.from(contextPaste(request!)+'\r').toString('hex'));
  await review.getByRole('textbox',{name:'Review follow-up'}).fill('Explain src/changed.ts:2');await review.getByRole('button',{name:'Send follow-up',exact:true}).click();
  await expect.poll(async()=>Buffer.from(await fixture.bytes()).toString('hex')).toBe(Buffer.from(contextPaste(request!)+'\r'+contextPaste('Explain src/changed.ts:2')+'\r').toString('hex'));
  await expect.poll(()=>fixture.requests()).toEqual([request,'Explain src/changed.ts:2']);
  await expect(review.locator('.terminal-surface')).toContainText('REQUEST_ACCEPTED=2');
  expect(fixture.workspace.terminal.read(edit.id,0).state?.id).toBe(edit.id);expect(fixture.starts).toEqual([{slot:'terminal',mode:'edit'},{slot:'review',mode:'review'}]);
  await page.screenshot({path:'/opt/data/output/riftcode/review-workbench/actual-posix-pty-browser.png'});
  await review.getByRole('button',{name:'Stop session',exact:true}).click();expect(fixture.workspace.terminal.read(edit.id,0).state?.id).toBe(edit.id);
 }finally{await fixture.cleanup();}
});

test('review waits for explicit CLI readiness and preserves follow-up on uncertain submit without automatic retry',async({page})=>{
 await page.getByRole('button',{name:'Open code review',exact:true}).click();const review=page.getByRole('region',{name:'Code review workbench'});
 await page.evaluate(()=>{const f=window as any,read=f.rift.terminalRead;f.reviewInputReady=false;f.rift.terminalRead=async(id:string|null,cursor:number,slot?:string)=>{const result=await read(id,cursor,slot);if(slot==='review'&&result.state){const text=f.reviewInputReady?'\x1b[?2004hReady > ':'Trust this repository? > ';return {...result,data:text.slice(cursor),cursor:text.length};}return result;};});
 await review.getByRole('button',{name:'Start review session',exact:true}).click();await expect(review.locator('.terminal-status')).toHaveText('running');
 await expect(review.getByRole('button',{name:'Run review',exact:true})).toBeDisabled();expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.reviewSubmit))).toEqual([]);
 // The user resolves native trust/login themselves. Readiness only enables an explicit action.
 await page.evaluate(()=>(window as any).reviewInputReady=true);
 // A real CLI appends readiness; reset the synthetic cursor to send the complete sequence.
 await page.evaluate(()=>{const f=window as any,read=f.rift.terminalRead;let delivered=false;f.rift.terminalRead=async(id:string|null,cursor:number,slot?:string)=>{const result=await read(id,cursor,slot);if(slot==='review'&&!delivered){delivered=true;return {...result,data:'\x1b[?2004hReady > '};}return result;};});
 await expect(review.getByRole('button',{name:'Run review',exact:true})).toBeEnabled();
 await review.getByRole('textbox',{name:'Review follow-up'}).fill('Keep this draft if writing fails');
 await page.evaluate(()=>{const f=window as any;f.failedReviewSends=0;f.rift.terminalSubmitReview=async()=>{f.failedReviewSends++;throw new Error('PTY write failed; submission is uncertain. Inspect the CLI before retrying.');};});
 await review.getByRole('button',{name:'Send follow-up',exact:true}).click();await expect(review.getByRole('alert')).toContainText('uncertain');await expect(review.getByRole('textbox',{name:'Review follow-up'})).toHaveValue('Keep this draft if writing fails');
 await page.getByRole('button',{name:'Agent',exact:true}).click();await page.getByRole('button',{name:'Open code review',exact:true}).click();expect(await page.evaluate(()=>(window as any).failedReviewSends)).toBe(1);
});

test.beforeEach(async ({page}) => {
 await page.addInitScript(() => {
  // Explicit substitute bridge; no provider credentials, network or real repository data.
  localStorage.setItem('rift:theme','dark');
  let state:any=null; let output=''; const calls:any[]=[];
  const repository={root:'/fixture/repo',name:'terminal-fixture',branch:'feature/terminal',baseBranch:'main',targetBranch:null,targetBranches:[],comparisonId:'working-tree',comparisonLabel:'Working tree',startRevision:'HEAD',endRevision:null,includeUntracked:true,comparisons:[{id:'working-tree',kind:'working-tree',label:'Working tree',detail:'Fixture'}],files:[{path:'src/changed.ts',status:'modified',additions:1,deletions:1}],additions:1,deletions:1,updatedAt:0};
  repository.targetBranches=Array.from({length:60},(_,i)=>({ref:'origin/feature-'+i,label:'origin/feature-'+i})) as any;
  repository.targetBranch='origin/feature-0' as any;
  repository.comparisons.push(...Array.from({length:60},(_,i)=>({id:'commit:'+i,kind:'commit',label:'Change '+i,detail:'Comparison '+i})) as any);
  (window as any).fixtureCalls=calls;
  (window as any).fixtureRepository=repository;
  (window as any).fixtureAppend=(text:string)=>{output+=text;};
  (window as any).rift={platform:'linux',terminalSessions:async()=>[{id:'01953d6c-1234-7123-9123-123456789abc',title:'Fixture session in this repository',updatedAt:42}],selectComparison:async(id:string)=>{calls.push({comparison:id});repository.comparisonId=id;return {...repository};},selectTargetBranch:async(ref:string)=>{calls.push({target:ref});repository.targetBranch=ref as any;return {...repository};},setTheme:async()=>{},checkForUpdate:async()=>({currentVersion:'0.8.0',latestVersion:null,releaseNotes:[],updateAvailable:false,installSupported:false,error:null}),openRepository:async()=>repository,refreshRepository:async()=>repository,listRepositoryFiles:async()=>['src/changed.ts','src/my file.ts'],getFilePatch:async()=>({path:'src/changed.ts',binary:false,patch:'diff --git a/src/changed.ts b/src/changed.ts\n--- a/src/changed.ts\n+++ b/src/changed.ts\n@@ -1,2 +1,2 @@\n const unchanged = 1;\n-old\n+new\n'}),listAgents:async()=>[],onRepositoryChanged:()=>()=>{},onAgentEvent:()=>()=>{},copyText:async(text:string)=>{calls.push({copy:text});},readRepositoryViewFile:async(path:string)=>{calls.push({open:path});return{path,content:Array.from({length:30},(_,i)=>'const line'+(i+1)+' = true;').join('\n'),binary:false,truncated:false};},terminalRead:async(id:string|null,cursor:number)=>({state,data:output.slice(cursor),cursor:output.length,truncated:false}),terminalStart:async(provider:string,mode:string)=>{calls.push({start:provider,mode});state={id:'fixture-session',provider,mode,cwd:repository.root,status:'running'};output='\x1b[?2004h\x1b[32mLOCAL FIXTURE — not a provider run\x1b[0m\r\nReview src/my file.ts:12:3\r\nReady > ';return state;},terminalStop:async()=>{state=null;output='';calls.push({stop:true});},terminalInput:async(id:string,data:string,paste:boolean)=>{calls.push({input:data,paste});},terminalResize:async(_id:string,cols:number)=>{(window as any).fixtureCols=cols;}};
  const api=(window as any).rift;let reviewState:any=null,reviewOutput='';
  for(const name of ['terminalStart','terminalRead','terminalStop','terminalInput','terminalResize']){
   const original=api[name];api[name]=async(...args:any[])=>{
    const slot=args[name==='terminalStart'?5:name==='terminalRead'?2:name==='terminalStop'?0:3];
    if(slot!=='review')return original(...args);
    if(name==='terminalStart'){calls.push({reviewStart:args[0],mode:args[1]});reviewState={id:'review-fixture',provider:args[0],mode:args[1],cwd:repository.root,status:'running'};reviewOutput='\x1b[?2004hLOCAL REVIEW FIXTURE — no provider run\r\nReview src/my file.ts:12:3\r\nReady > ';return reviewState;}
    if(name==='terminalRead')return {state:reviewState,data:reviewOutput.slice(args[1]),cursor:reviewOutput.length,truncated:false};
    if(name==='terminalStop'){reviewState=null;reviewOutput='';calls.push({reviewStop:true});}
    if(name==='terminalInput')calls.push({reviewInput:args[1],paste:args[2]});
   };
  }
  api.terminalSubmitReview=async(id:string,text:string)=>{calls.push({reviewSubmit:id,text});};

 });
 page.on('console',msg=>{if(msg.type()==='error')console.error('BROWSER',msg.text());});
 await page.goto('/');
 page.on('pageerror',error=>console.error('PAGE ERROR',error.message));
});

test('compact right rail preserves Notes Agent Review and never relabels or submits an active edit session',async({page})=>{
 await expect(page.locator('.review-rails')).toBeVisible();
 await expect(page.locator('.workspace-navigation')).toHaveCount(0);
 await expect(page.locator('.review-rail small')).toHaveText(['Notes','Agent','Review']);
 await page.getByRole('combobox',{name:'Session intent'}).selectOption('edit');
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 await page.locator('.review-rail').filter({hasText:'Review'}).click();
 await expect(page.getByRole('region',{name:'Code review workbench'})).toBeVisible();
 await expect(page.locator('rift-ai-terminal .terminal-identity')).toContainText('Edit');
 await expect(page.getByRole('status',{name:'Review permission notice'})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Review instructions'}).fill('Keep my unsent review draft');
 await page.getByRole('button',{name:'Agent',exact:true}).click();
 await page.getByRole('button',{name:'Open code review',exact:true}).click();
 await expect(page.locator('.review-mode-rail')).toHaveClass(/active/);
 await expect(page.getByRole('textbox',{name:'Review instructions'})).toHaveValue('Keep my unsent review draft');
 await page.getByRole('button',{name:'Open review notes',exact:true}).click();
 await expect(page.locator('.review-rails')).toBeVisible();
 await page.getByRole('button',{name:'Agent',exact:true}).click();
 await expect(page.locator('rift-ai-terminal')).toBeVisible();
 await page.locator('rift-ai-terminal').getByRole('button',{name:'Back to code',exact:true}).click();
 await expect(page.locator('.diff-panel')).toBeVisible();
 await expect(page.getByRole('button',{name:'Open review notes',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Agent',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.stop||c.input))).toEqual([{start:'claude',mode:'edit'}]);
});

test('native resume rows show full local dates and times with exact ISO tooltips for every provider',async({page})=>{
 const stamp=Date.parse('2026-11-06T14:23:45.678Z');
 await page.evaluate(stamp=>{(window as any).rift.terminalSessions=async(provider:string)=>[{id:provider==='opencode'?'ses_2f6b4a8c9001AbCdEfGhIjKlMn':'01953d6c-1234-7123-9123-123456789abc',title:provider+' renamed conversation',updatedAt:stamp}];},stamp);
 for(const provider of ['claude','opencode','codex']) {
  await page.getByRole('combobox',{name:'Agent provider'}).selectOption(provider);
  await page.getByRole('button',{name:'Resume existing',exact:true}).click();
  const row=page.getByRole('option').filter({hasText:provider+' renamed conversation'});
  await expect(row).toBeVisible();
  await expect(row.locator('time')).toHaveText(/2026.*\d{1,2}:\d{2}/);
  await expect(row.locator('time')).toHaveAttribute('title','Updated 2026-11-06T14:23:45.678Z');
 }
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start))).toEqual([]);
});

test('command composition separates launcher from a single aligned running bar',async({page})=>{
 await expect(page.getByRole('region',{name:'Launch AI session'})).toBeVisible();
 await page.screenshot({path:'/opt/data/output/riftcode/compact-rail/after-dark-1440-launcher.png'});
 const baseline=await page.locator('rift-ai-terminal .terminal-toolbar').evaluate(el=>({height:el.getBoundingClientRect().height,buttons:el.querySelectorAll('button,select,summary').length}));
 console.log('CURRENT COMPOSITION',JSON.stringify(baseline));
 await expect(page.getByRole('region',{name:'Launch AI session'})).toBeVisible();
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 await expect(page.getByRole('combobox',{name:'Agent provider'})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Launch AI session'})).toHaveCount(0);
 const bar=page.locator('rift-ai-terminal .terminal-toolbar');
 const geometry=await bar.evaluate(el=>({height:el.getBoundingClientRect().height,controls:[...el.querySelectorAll('button,summary')].filter(c=>c.checkVisibility()).map(c=>({y:c.getBoundingClientRect().y,h:c.getBoundingClientRect().height}))}));
 expect(geometry.height).toBe(56);
 expect(geometry.controls.length).toBe(4);await expect(bar.getByRole('button',{name:'Dock to bottom',exact:true})).toBeVisible();
 expect(new Set(geometry.controls.map(c=>c.y)).size).toBe(1);
 expect(geometry.controls.every(c=>c.h===32)).toBe(true);
});

test('workspace navigation and repository chrome align without duplicate code exits',async({page})=>{
 await expect(page.getByRole('button',{name:'Back to code',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Agent',exact:true})).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Back to code',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 await expect(page.locator('.diff-panel')).toBeVisible();
 await page.getByRole('button',{name:'View',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Full file',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('checkbox',{name:'Full file',exact:true})).not.toBeVisible();
 const controls=await page.locator('.comparison-picker button').evaluateAll(els=>els.map(el=>({y:el.getBoundingClientRect().y,h:el.getBoundingClientRect().height})));
 expect(new Set(controls.map(c=>c.y)).size).toBe(1);
 expect(controls.every(c=>c.h===32)).toBe(true);
});

test('session discovery has cancellable truthful skeletons and reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{(window as any).rift.terminalSessions=()=>new Promise(resolve=>(window as any).finishList=resolve);});
 await page.getByRole('button',{name:'Resume existing',exact:true}).click();
 await expect(page.getByRole('status',{name:'Loading provider sessions'})).toBeVisible();
 await expect(page.locator('.session-skeleton')).toHaveCount(3);
 expect(await page.locator('.session-skeleton').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.getByRole('button',{name:'New session',exact:true}).click();
 await page.evaluate(()=>(window as any).finishList([]));
 await expect(page.getByRole('status',{name:'Loading provider sessions'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true})).toBeEnabled();
});

test('connecting waits for rendered CLI content, never ANSI frames or a fixed delay',async({page})=>{
 await page.evaluate(()=>{
  const f=window as any;f.connectionOutput='';f.connectionState=null;
  const stop=f.rift.terminalStop; f.rift.terminalStop=async()=>{f.connectionState=null;await stop();};
  f.rift.terminalStart=()=>new Promise(resolve=>f.finishConnection=()=>{f.connectionState={id:'silent',provider:'claude',mode:'review',cwd:'/fixture/repo',status:'running'};resolve(f.connectionState);});
  f.rift.terminalRead=async(_id:string,cursor:number)=>({state:f.connectionState,data:f.connectionOutput.slice(cursor),cursor:f.connectionOutput.length,truncated:false});
 });
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 const overlay=page.getByRole('status',{name:'Connecting terminal'});
 await expect(overlay).toContainText('Claude Code');
 await expect(page.getByRole('button',{name:'Cancel connection'})).toBeVisible();
 await page.evaluate(()=>(window as any).finishConnection());
 await page.evaluate(()=>(window as any).connectionOutput='\x1b[');
 await page.waitForTimeout(200);
 await expect(overlay).toBeVisible();
 await page.evaluate(()=>(window as any).connectionOutput+='?2004h');
 await page.waitForTimeout(200);
 await expect(overlay).toBeVisible();
 await page.evaluate(()=>(window as any).connectionOutput+='Sign in at your provider to continue > <img src=x>');
 await expect(overlay).toHaveCount(0);
 await expect(page.locator('rift-ai-terminal img')).toHaveCount(0);
 await page.getByRole('button',{name:'Stop session',exact:true}).click();
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await page.getByRole('button',{name:'Cancel connection'}).click();
 await expect(page.getByRole('region',{name:'Launch AI session'})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.stop).length)).toBe(2);
});

test('repository opening uses semantic workspace skeletons and releases immediately on real completion',async({page})=>{
 await page.addInitScript(()=>{const f=window as any;f.rift.openRepository=()=>new Promise((resolve,reject)=>{f.openRepo=()=>resolve(f.fixtureRepository);f.failRepo=reject;});});
 await page.reload();
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.getByRole('status',{name:'Opening repository'})).toBeVisible();
 await expect(page.locator('.repository-skeleton')).toBeVisible();
 expect(await page.locator('.repository-skeleton .skeleton-line').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.evaluate(()=>(window as any).openRepo());
 await expect(page.getByRole('region',{name:'Launch AI session'})).toBeVisible({timeout:800});
 await page.reload();
 await expect(page.getByRole('status',{name:'Opening repository'})).toBeVisible();
 await page.evaluate(()=>(window as any).failRepo(new Error('Fixture repository unavailable')));
 await expect(page.getByRole('alert')).toContainText('Fixture repository unavailable');
 await page.getByRole('button',{name:'Retry',exact:true}).click();
 await expect(page.getByRole('status',{name:'Opening repository'})).toBeVisible();
 await page.evaluate(()=>(window as any).openRepo());
 await expect(page.getByRole('region',{name:'Launch AI session'})).toBeVisible({timeout:800});
});

test('terminal context menu dismisses outside and with Escape returning focus',async({page})=>{
 const trigger=page.locator('rift-ai-terminal summary');
 await trigger.click();
 await expect(trigger).toHaveAttribute('aria-expanded','true');
 await page.locator('.terminal-context-actions').getByRole('button',{name:'Review changes',exact:true}).focus();
 await page.keyboard.press('Escape');
 await expect(trigger).toHaveAttribute('aria-expanded','false');
 await expect(trigger).toBeFocused();
 await trigger.click();
 await page.locator('rift-ai-terminal .session-launcher h1').click();
 await expect(trigger).toHaveAttribute('aria-expanded','false');
});

test('chrome typography and pane baselines remain readable rather than micro controls',async({page})=>{
 await expect(page.getByRole('button',{name:'Changes',exact:true})).toBeVisible();
 expect(await page.getByRole('button',{name:'Changes',exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
 const sidebar=await page.locator('.changes-panel > .panel-title').boundingBox();
 const toolbar=await page.locator('rift-ai-terminal .terminal-toolbar').boundingBox();
 expect(sidebar!.y+sidebar!.height).toBe(toolbar!.y+toolbar!.height);
 expect(await page.locator('.logo-letter').first().evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
});

test('code controls stay aligned and legible with the notes inspector at 1024px',async({page})=>{
 await page.setViewportSize({width:1024,height:900});
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.locator('.review-rails').getByRole('button',{name:'Open review notes',exact:true}).click();
 await expect.poll(()=>page.locator('.diff-panel').evaluate(el=>el.getBoundingClientRect().width)).toBe(460);
 const controls=await page.locator('.diff-options > button').evaluateAll(els=>els.map(el=>({h:el.getBoundingClientRect().height,y:el.getBoundingClientRect().y,right:el.getBoundingClientRect().right,font:parseFloat(getComputedStyle(el).fontSize)})));
 expect(controls.every(c=>c.h===32&&c.font>=12)).toBe(true);
 expect(new Set(controls.map(c=>c.y)).size).toBe(1);
 const panel=(await page.locator('.diff-panel').boundingBox())!;
 expect(controls.every(c=>c.right<=panel.x+panel.width)).toBe(true);
 const actions=await page.locator('.notes-actions button').evaluateAll(els=>els.map(el=>({h:el.getBoundingClientRect().height,w:el.getBoundingClientRect().width})));
 expect(actions.every(c=>c.h>=32&&c.w>=80)).toBe(true);
});

test('running identity keeps the selected conversation title, provider and purpose without configuration',async({page})=>{
 await page.getByRole('combobox',{name:'Agent provider'}).selectOption('opencode');
 await page.getByRole('combobox',{name:'Session intent'}).selectOption('edit');
 await page.getByRole('button',{name:'Resume existing',exact:true}).click();
 await page.getByRole('listbox',{name:'Provider session',exact:true}).getByRole('option').first().click();
 await page.getByRole('button',{name:'Resume session',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-identity strong')).toHaveText('Fixture session in this repository');
 await expect(page.locator('rift-ai-terminal .terminal-identity')).toContainText('OpenCode');
 await expect(page.locator('rift-ai-terminal .terminal-identity')).toContainText('Edit');
 await expect(page.getByRole('combobox',{name:'Session intent'})).toHaveCount(0);
});

test('failed session launch keeps prepared context and retries only on explicit action',async({page})=>{
 await prepareContext(page);
 await page.evaluate(()=>{const f=window as any;const start=f.rift.terminalStart;f.rift.terminalStart=async(...args:any[])=>{f.rift.terminalStart=start;throw new Error('Claude Code is not installed');};});
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Claude Code is not installed');
 await expect(page.getByRole('textbox',{name:'Pending agent context'})).toHaveValue(/src\/changed.ts/);
 await page.getByRole('button',{name:'Retry session',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 await expect(page.getByRole('textbox',{name:'Pending agent context'})).toHaveValue(/src\/changed.ts/);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.input))).toEqual([]);
});

for(const theme of ['dark','light'])test(`notes inspector ${theme} has readable feedback and aligned safe actions`,async({page})=>{
 if(theme==='light')await page.getByRole('button',{name:'Use light theme'}).click();
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.locator('.diff-row.addition').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Add note'}).click();
 await page.getByRole('textbox',{name:'Review note',exact:true}).fill('Readable review feedback.');
 await page.getByRole('button',{name:'Add note',exact:true}).click();
 await page.getByRole('checkbox',{name:'Select note',exact:true}).check();
 expect((await page.locator('.review-header').boundingBox())!.height).toBe(56);
 expect(await page.locator('.review-note p').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
 expect(await page.locator('.note-location strong').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
 expect((await page.getByRole('button',{name:'Mark note done'}).boundingBox())!.height).toBeGreaterThanOrEqual(32);
 const action=page.locator('.notes-actions .primary-agent-action');
 expect(await action.evaluate(el=>getComputedStyle(el).color)).toBe(theme==='light'?'rgb(37, 49, 62)':'rgb(225, 230, 237)');
});

test('narrow retained session identity keeps provider status readable instead of clipping it',async({page})=>{
 await page.setViewportSize({width:1024,height:900});
 await page.getByRole('button',{name:'Resume existing',exact:true}).click();
 await page.getByRole('listbox',{name:'Provider session',exact:true}).getByRole('option').first().click();
 await page.getByRole('button',{name:'Resume session',exact:true}).click();
 await page.getByRole('button',{name:'Open review notes',exact:true}).click();
 await expect.poll(()=>page.locator('rift-ai-terminal').evaluate(el=>el.getBoundingClientRect().width)).toBe(460);
 await expect.poll(()=>page.locator('rift-ai-terminal .terminal-identity small').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('narrow repository opening reserves the same two header regions as the ready workspace',async({page})=>{
 await page.setViewportSize({width:1024,height:900});
 await page.addInitScript(()=>{(window as any).rift.openRepository=()=>new Promise(()=>{});});
 await page.reload();
 await expect(page.getByRole('status',{name:'Opening repository'})).toBeVisible();
 expect((await page.locator('.repository-loading > header').boundingBox())!.height).toBe(112);
});

test('refresh discovery does not expose stale selectable conversations while awaiting metadata',async({page})=>{
 await page.getByRole('button',{name:'Resume existing',exact:true}).click();
 const list=page.getByRole('listbox',{name:'Provider session',exact:true});
 await expect(list.getByRole('option')).toHaveCount(1);
 await page.evaluate(()=>{(window as any).rift.terminalSessions=()=>new Promise(resolve=>(window as any).finishRefresh=resolve);});
 await page.getByRole('button',{name:'Refresh sessions',exact:true}).click();
 await expect(page.getByRole('status',{name:'Loading provider sessions'})).toBeVisible();
 await expect(list.getByRole('option')).toHaveCount(0);
 await page.evaluate(()=>(window as any).finishRefresh([]));
 await expect(page.getByText('No sessions found in this repository.',{exact:true})).toBeVisible();
});

for(const reviewSlot of [false,true])for(const notes of [false,true])test(`startup geometry already matches settled running surface before first provider output: review=${reviewSlot} notes=${notes}`,async({page})=>{
 if(notes)await page.getByRole('button',{name:'Open review notes',exact:true}).click();
 if(reviewSlot)await page.getByRole('button',{name:'Open code review',exact:true}).click();
 await page.evaluate(()=>{const f=window as any,start=f.rift.terminalStart;f.sizes=[];f.rift.terminalStart=(p:string,m:string,c:number,r:number,...rest:any[])=>{f.sizes.push({start:true,c,r});return start(p,m,c,r,...rest);};f.rift.terminalResize=async(_id:string,c:number,r:number)=>{f.sizes.push({start:false,c,r});};});
 await page.getByRole('button',{name:reviewSlot?'Start review session':'Start session',exact:true}).click();
 await expect(page.locator((reviewSlot?'rift-review-terminal':'rift-ai-terminal')+' .terminal-status')).toHaveText('running');await page.waitForTimeout(250);
 const sizes=await page.evaluate(()=>(window as any).sizes);
 expect(sizes.length).toBeGreaterThan(0);
 expect(sizes.map(({c,r}:any)=>({c,r}))).toEqual(sizes.map(()=>({c:sizes[0].c,r:sizes[0].r})));
});

for(const width of [1024,1440])for(const theme of ['dark','light'])test(`synthetic Windows redraw and scroll anchoring ${theme} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});if(theme==='light')await page.getByRole('button',{name:'Use light theme',exact:true}).click();
 await page.evaluate(()=>{const f=window as any,read=f.rift.terminalRead;f.rift.terminalRead=async(...args:any[])=>{const result=await read(...args);(f.syntheticReads??=[]).push({cursor:args[1],data:result.data});if(result.state)result.state={...result.state,windowsPty:{backend:'conpty',buildNumber:26200}};return result;};const label=document.createElement('div');label.textContent='SYNTHETIC WINDOWS METADATA + VT STREAM · CHROMIUM ON LINUX · NO PROVIDER CALL';label.style.cssText='position:fixed;bottom:2px;left:12px;z-index:99999;font:10px sans-serif;color:#8995a1;pointer-events:none';document.body.append(label);});
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 const rows=page.locator('rift-ai-terminal .xterm-rows');
 const frame='SYNTHETIC CLI HEADER\r\n  [o_o]\r\n  /|_|\\\r\nReady > ';
 await page.evaluate(text=>(window as any).fixtureAppend('\x1b[2J\x1b[H'+text),frame);
 await expect(rows).toContainText('SYNTHETIC CLI HEADER');
 // Split cursor-up/erase frames across separate production poll cycles.
 for(const text of ['\x1b[','3A\r\x1b[J'+frame]){await page.evaluate(text=>(window as any).fixtureAppend(text),text);await page.waitForTimeout(150);}
 expect((await rows.textContent())!.match(/SYNTHETIC CLI HEADER/g)).toHaveLength(1);
 await page.screenshot({path:`/opt/data/output/riftcode/terminal-scroll-fix/${theme}-${width}-redraw.png`});
 await page.evaluate(()=>(window as any).fixtureAppend('\r\n'+Array.from({length:100},(_,i)=>'Synthetic history '+String(i).padStart(3,'0')).join('\r\n')+'\r\nBOTTOM_MARKER'));
 await expect(rows).toContainText('BOTTOM_MARKER');
 const box=(await rows.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-500);await page.waitForTimeout(200);
 await expect(rows).not.toContainText('BOTTOM_MARKER');const anchor=await rows.textContent();
 await page.evaluate(()=>(window as any).fixtureAppend('\r\nNEW_OUTPUT_WHILE_SCROLLED'));await expect.poll(()=>page.evaluate(()=>(window as any).syntheticReads.some((r:any)=>r.data.includes('NEW_OUTPUT_WHILE_SCROLLED')))).toBe(true);await page.waitForTimeout(200);
 expect(await rows.textContent()).toBe(anchor);
 await page.screenshot({path:`/opt/data/output/riftcode/terminal-scroll-fix/${theme}-${width}-scrolled.png`});
 await expect.poll(async()=>{await page.mouse.wheel(0,100000);return (await rows.textContent())!.includes('NEW_OUTPUT_WHILE_SCROLLED');}).toBe(true);
 await page.setViewportSize({width:width===1024?1440:1024,height:900});await page.waitForTimeout(150);await page.setViewportSize({width,height:900});await page.waitForTimeout(150);
 await page.evaluate(text=>(window as any).fixtureAppend('\x1b[2J\x1b[H'+text),frame);await expect(rows).toContainText('Ready >');
 expect((await rows.textContent())!.match(/SYNTHETIC CLI HEADER/g)).toHaveLength(1);
 await page.screenshot({path:`/opt/data/output/riftcode/terminal-scroll-fix/${theme}-${width}-resized.png`});
 // A hidden retained terminal never sends a one-column/zero-area resize.
 await page.evaluate(()=>{const f=window as any;f.hiddenResizes=[];f.rift.terminalResize=async(...args:any[])=>f.hiddenResizes.push(args);});
 await page.getByRole('button',{name:'Back to code',exact:true}).click();await page.waitForTimeout(150);await page.setViewportSize({width:width===1024?1440:1024,height:850});await page.waitForTimeout(150);
 expect(await page.evaluate(()=>(window as any).hiddenResizes)).toEqual([]);
});

test('launcher starts the real terminal with usable pane geometry, never a hidden one-pixel PTY',async({page})=>{
 await page.evaluate(()=>{const f=window as any;const start=f.rift.terminalStart;f.rift.terminalStart=(provider:string,mode:string,cols:number,rows:number,...rest:any[])=>{f.startDimensions={cols,rows};return start(provider,mode,cols,rows,...rest);};});
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 const dimensions=await page.evaluate(()=>(window as any).startDimensions);
 expect(dimensions.cols).toBeGreaterThan(80);expect(dimensions.rows).toBeGreaterThan(20);
});

test('resume launcher presents readable titled rows with dates and keyboard selection',async({page})=>{
 await page.getByRole('button',{name:'Resume existing',exact:true}).click();
 const list=page.getByRole('listbox',{name:'Provider session',exact:true});
 const option=list.getByRole('option').first();
 await expect(option).toContainText('Fixture session in this repository');
 await expect(option.locator('time')).toHaveAttribute('datetime',/1970/);
 await expect(option).not.toContainText('01953d6c');
 await option.focus();
 await page.keyboard.press('Enter');
 await expect(option).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('button',{name:'Resume session',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start))).toEqual([]);
});

test('new or resume uses provider sessions in the current repo and preserves permission intent',async({page})=>{
 await page.evaluate(()=>{
  (window as any).rift.terminalSessions=async(provider:string)=>{(window as any).fixtureCalls.push({list:provider});return [{id:provider==='opencode'?'ses_2f6b4a8c9001AbCdEfGhIjKlMn':'01953d6c-1234-7123-9123-123456789abc',title:'Existing provider session',updatedAt:42}];};
  const old=(window as any).rift.terminalStart;
  (window as any).rift.terminalStart=(provider:string,mode:string,cols:number,rows:number,id?:string)=>{(window as any).fixtureCalls.push({resume:id});return old(provider,mode,cols,rows);};
 });
 await page.getByRole('button',{name:'Resume existing',exact:true}).click();
 await expect(page.getByRole('listbox',{name:'Provider session',exact:true})).toContainText('Existing provider session');
 await page.screenshot({path:'test-results/terminal-resume.png'});
 await page.getByRole('listbox',{name:'Provider session',exact:true}).getByRole('option').first().click();
 await expect(page.getByRole('listbox',{name:'Provider session',exact:true}).getByRole('option').first()).toHaveAttribute('aria-selected','true');
 await page.getByRole('combobox',{name:'Session intent'}).selectOption('edit');
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.resume))).toEqual([{resume:'01953d6c-1234-7123-9123-123456789abc'}]);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.find((c:any)=>c.start))).toEqual({start:'claude',mode:'edit'});
 await expect(page.getByRole('combobox',{name:'Agent provider'})).toHaveCount(0);
 await page.getByRole('button',{name:'Stop session',exact:true}).click();
 await page.getByRole('combobox',{name:'Agent provider'}).selectOption('opencode');
 await expect(page.getByRole('listbox',{name:'Provider session'}).locator('[aria-selected="true"]')).toHaveCount(0);
 await expect(page.getByRole('listbox',{name:'Provider session'})).toContainText('Existing provider session');
});

test('Review changes prepares complete comparison context without starting or submitting',async({page})=>{
 await page.getByRole('button',{name:'Open code review',exact:true}).click();
 const review=page.getByRole('region',{name:'Code review workbench'});
 await expect(review.locator('.review-brief')).toContainText('Working tree');
 await expect(review.locator('.review-scope-preview')).toContainText('HEAD → working tree');
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.input||c.reviewStart||c.reviewSubmit))).toEqual([]);
 await page.screenshot({path:'test-results/terminal-review-context.png'});
 await review.getByRole('button',{name:'Start review session',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.reviewSubmit))).toEqual([]);
 await review.getByRole('button',{name:'Run review',exact:true}).click();
 const calls=await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.reviewSubmit));
 expect(calls).toHaveLength(1);expect(calls[0].text).toContain('Comparison: Working tree');expect(calls[0].text).toContain('Start revision: HEAD');expect(calls[0].text).toContain('src/changed.ts');
});

test('saved explanation opens as retained terminal context, preserving local history',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('rift:review-session:/fixture/repo:feature/terminal:working-tree:origin/feature-0',JSON.stringify({version:2,reviewedFiles:[],notes:[],conversations:[{id:1,repositoryRoot:'/fixture/repo',agent:'claude',model:null,question:'Saved explanation',context:{filePath:'src/changed.ts',startLine:2,endLine:2,diff:'+new'},status:'complete',result:null,error:null,history:[]}]})));
 await page.reload();
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.getByRole('button',{name:'Open explanation: Saved explanation'}).click();
 await expect(page.getByRole('textbox',{name:'Pending agent context'})).toHaveValue(/Saved explanation/);
 await expect(page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rift:review-session:/fixture/repo:feature/terminal:working-tree:origin/feature-0')!).conversations.length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.input))).toEqual([]);
});

for(const operation of ['Input','Resize'] as const)for(const replacement of ['repository','stop-start'] as const) {
 test(`obsolete terminal ${operation} rejection cannot disconnect ${replacement} replacement`,async({page})=>{
  await prepareContext(page);
  await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
  await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
  await expect(page.getByRole('button',{name:'Insert pending context',exact:true})).toBeEnabled();
  await page.evaluate(operation=>{
   const f=window as any;
   const original=f.rift['terminal'+operation];
   f.rift['terminal'+operation]=()=>{f.rift['terminal'+operation]=original;return new Promise((_resolve,reject)=>{f.rejectObsolete=reject;});};
   f.rift.chooseRepository=async()=>{await f.rift.terminalStop();f.fixtureRepository.root='/fixture/other';return {...f.fixtureRepository};};
  },operation);
  if(operation==='Input') {await page.locator('rift-ai-terminal .xterm-helper-textarea').focus();await page.keyboard.type('x');}
  else await page.setViewportSize({width:1200,height:900});
  await expect.poll(()=>page.evaluate(()=>!!(window as any).rejectObsolete)).toBe(true);
  if(replacement==='repository')await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();
  else await page.getByRole('button',{name:'Stop session',exact:true}).click();
  await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('No active session');
  // The substitute deliberately reuses its session ID: generation must also match.
  await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
  await expect(page.getByRole('button',{name:'Insert pending context',exact:true})).toBeEnabled();
  await page.evaluate(()=>(window as any).rejectObsolete(new Error('Obsolete IPC')));
  await page.waitForTimeout(150);
  await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
  await expect(page.getByRole('button',{name:'Insert pending context',exact:true})).toBeEnabled();
  await expect(page.locator('rift-ai-terminal [role="alert"]')).toHaveCount(0);
 });
}

test('late stop cannot clear a replacement start in another repository',async({page})=>{
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 await page.evaluate(()=>{
  const f=window as any;
  f.rift.terminalStop=()=>new Promise<void>(resolve=>{f.finishStop=resolve;});
  f.rift.chooseRepository=async()=>{f.fixtureRepository.root='/fixture/other';return {...f.fixtureRepository};};
  f.rift.terminalRead=()=>new Promise(()=>{});
  f.rift.terminalStart=()=>new Promise(resolve=>{f.finishStart=()=>resolve({id:'replacement',cwd:'/fixture/other',provider:'claude',mode:'review',status:'running'});});
 });
 await page.getByRole('button',{name:'Stop session',exact:true}).click();
 await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('Starting');
 await page.evaluate(()=>(window as any).finishStart());
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 await page.evaluate(()=>(window as any).finishStop());
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
});

for(const outcome of ['resolve','reject'] as const) {
 test(`resume listing ignores stale ${outcome} after provider and repository changes`,async({page})=>{
  await page.evaluate(()=>{
   const f=window as any;f.lists=[];
   f.rift.terminalSessions=(provider:string)=>new Promise((resolve,reject)=>f.lists.push({provider,resolve,reject}));
   f.rift.chooseRepository=async()=>{f.fixtureRepository.root='/fixture/other';return {...f.fixtureRepository};};
  });
  await page.getByRole('button',{name:'Resume existing',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).lists.length)).toBe(1);
  await page.getByRole('combobox',{name:'Agent provider'}).selectOption('codex');
  await expect.poll(()=>page.evaluate(()=>(window as any).lists.length)).toBe(2);
  await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).lists.length)).toBe(3);
  await page.evaluate(outcome=>{
   const f=window as any;
   for(const entry of f.lists.slice(0,2)){if(outcome==='resolve')entry.resolve([{id:'obsolete',title:'Obsolete session',updatedAt:0}]);else entry.reject(new Error('Obsolete error'));}
   f.lists[2].resolve([{id:'01953d6c-1234-7123-9123-123456789abc',title:'Current repository session',updatedAt:1}]);
  },outcome);
  await expect(page.getByRole('listbox',{name:'Provider session',exact:true})).toContainText('Current repository session');
  await expect(page.getByRole('listbox',{name:'Provider session',exact:true})).not.toContainText('Obsolete');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true})).toBeDisabled();
 });
}

test('resume listing failure is explicit, retryable and never starts a session',async({page})=>{
 await page.evaluate(()=>{(window as any).rift.terminalSessions=async()=>{throw new Error('Metadata unsupported');};});
 await page.getByRole('button',{name:'Resume existing',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('Metadata unsupported');
 await expect(page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true})).toBeDisabled();
 await page.evaluate(()=>{(window as any).rift.terminalSessions=async()=>[];});
 await page.getByRole('button',{name:'Refresh sessions',exact:true}).click();
 await expect(page.getByText('No sessions found in this repository.',{exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'New session',exact:true}).click();
 await expect(page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start))).toEqual([]);
});

for(const width of [1024,1440])for(const theme of ['dark','light']) {
 test(`compact ${theme} workspace at ${width}px keeps notes and branch popovers usable`,async({page})=>{
  await page.setViewportSize({width,height:900});
  if(theme==='light')await page.getByRole('button',{name:'Use light theme'}).click();
  const toolbar=page.locator('rift-ai-terminal .terminal-toolbar');
  expect((await toolbar.boundingBox())!.height).toBeLessThan(120);
  await expect(page.getByRole('button',{name:'Open review notes',exact:true})).toBeVisible();
  await expect(page.locator('.review-rails')).toBeVisible();
  await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
  await page.waitForTimeout(250);
  await page.screenshot({path:`test-results/unified-${theme}-${width}-closed.png`});
  await page.getByRole('button',{name:'Select target comparison branch',exact:true}).click();
  await expect(page.locator('.branch-popover')).toBeVisible();
  await page.screenshot({path:`test-results/unified-${theme}-${width}-branch-open.png`});
  await page.getByRole('combobox',{name:'Search target branches'}).press('Escape');
  await page.getByRole('button',{name:'Stop session',exact:true}).click();
  await page.getByRole('button',{name:'Resume existing',exact:true}).click();
  await expect(page.getByRole('listbox',{name:'Provider session',exact:true})).toContainText('Fixture session');
  expect((await page.getByRole('listbox',{name:'Provider session',exact:true}).boundingBox())!.height).toBeGreaterThan(80);
  await page.screenshot({path:`test-results/unified-${theme}-${width}-resume.png`});
  await prepareContext(page);
  if(theme==='light')expect(await page.getByRole('textbox',{name:'Pending agent context'}).evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.screenshot({path:`test-results/unified-${theme}-${width}-review.png`});
  await page.getByRole('button',{name:'Back to code',exact:true}).click();
  expect(await page.locator('.review-rail small').first().evaluate(el=>getComputedStyle(el).writingMode)).toBe('vertical-rl');
  await page.locator('.diff-row.addition').first().click({button:'right'});
  const label=page.getByRole('menuitem',{name:'Insert selection in Agent'}).locator('strong');
  expect((await label.boundingBox())!.height).toBeLessThan(20);
  await page.screenshot({path:`test-results/unified-${theme}-${width}-selection.png`});
 });
}

test('retained native session shows its actual provider and intent without respawning',async({page})=>{
 await page.evaluate(()=>{(window as any).rift.terminalRead=async()=>({state:{id:'retained',provider:'codex',mode:'edit',cwd:'/fixture/repo',status:'running'},data:'',cursor:0,truncated:false});});
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
 await expect(page.locator('rift-ai-terminal .terminal-identity')).toContainText('Codex');
 await expect(page.getByRole('combobox',{name:'Session intent'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Stop session',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start))).toEqual([]);
});

test('late context insertion cannot discard unsent context in a new repository',async({page})=>{
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await page.waitForTimeout(250);
 await page.evaluate(()=>{
  const f=window as any;f.rift.terminalInput=()=>new Promise<void>(resolve=>f.finishInput=resolve);
  f.rift.chooseRepository=async()=>{await f.rift.terminalStop();f.fixtureRepository.root='/fixture/other';return {...f.fixtureRepository};};
 });
 await prepareContext(page);
 await page.getByRole('button',{name:'Insert pending context',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>!!(window as any).finishInput)).toBe(true);
 await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('No active session');
 await page.getByRole('textbox',{name:'Pending agent context'}).fill('New repository unsent context');
 await page.evaluate(()=>(window as any).finishInput());
 await expect(page.getByRole('textbox',{name:'Pending agent context'})).toHaveValue('New repository unsent context');
});

test('branch search is inside each opened selection surface only',async({page})=>{
 const target=page.getByRole('button',{name:'Select target comparison branch',exact:true});
 const comparison=page.getByRole('button',{name:'Select comparison',exact:true});
 await expect(page.getByRole('combobox',{name:'Search target branches'})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Search target branches'})).toHaveCount(0);
 await expect(target).toContainText('origin/feature-0');
 await expect(comparison).toContainText('Working tree');
 await page.screenshot({path:'test-results/branch-controls-closed-dark.png'});
 await target.click();
 const query=page.getByRole('combobox',{name:'Search target branches'});
 await expect(query).toBeFocused();
 await expect(target).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('.branch-popover').getByRole('combobox')).toBeVisible();
 await comparison.click();
 await expect(query).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:'Search comparisons'})).toBeFocused();
});

for (const kind of ['target','comparison'] as const) {
 test(`${kind} dropdown filters without changing selection and clears in place`,async({page})=>{
  const isTarget=kind==='target';
  const trigger=page.getByRole('button',{name:isTarget?'Select target comparison branch':'Select comparison',exact:true});
  await trigger.click();
  const query=page.getByRole('combobox',{name:isTarget?'Search target branches':'Search comparisons'});
  await query.fill(isTarget?'FEATURE-51':'CHANGE 52');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
  await expect(page.getByRole('option',{name:isTarget?'origin/feature-51':'Change 52 Comparison 52',exact:true})).toBeVisible();
  await expect(trigger).toContainText(isTarget?'origin/feature-0':'Working tree');
  expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.target||c.comparison))).toEqual([]);
  await page.screenshot({path:`test-results/branch-${kind}-filtered-dark.png`});
  await query.fill('not-a-real-branch');
  await expect(page.getByRole('status').filter({hasText:'No matching'})).toBeVisible();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  if(!isTarget) await expect(page.getByRole('option',{name:'Working tree Fixture'})).toBeVisible();
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await expect(query).toHaveValue('');
  await expect(query).toBeFocused();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(isTarget?60:61);
 });
}

for (const kind of ['target','comparison'] as const) {
 test(`${kind} dropdown keyboard and pointer choices dispatch once, dismiss and reset`,async({page})=>{
  const target=kind==='target';
  const trigger=page.getByRole('button',{name:target?'Select target comparison branch':'Select comparison',exact:true});
  await trigger.click();
  const query=page.getByRole('combobox',{name:target?'Search target branches':'Search comparisons'});
  await query.fill(target?'FEATURE-51':'CHANGE 52');
  await query.press('End');
  await expect(query).toHaveAttribute('aria-activedescendant',target?'target-option-1':'comparison-option-1');
  const active=await query.getAttribute('aria-activedescendant');
  expect(active).toBeTruthy();
  await expect(page.locator(`[id="${active}"]`)).toContainText(target?'origin/feature-51':'Change 52');
  expect(await page.locator(`[id="${active}"]`).evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await query.press('Enter');
  await expect(trigger).toBeFocused();
  await expect(query).toHaveCount(0);
  await expect(trigger).toContainText(target?'origin/feature-51':'Change 52');
  expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.target||c.comparison))).toEqual([target?{target:'origin/feature-51'}:{comparison:'commit:52'}]);
  await trigger.click();
  await expect(query).toHaveValue('');
  await query.fill('missing');
  await query.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(query).toHaveCount(0);
  await trigger.click();
  await expect(query).toHaveValue('');
  await query.fill(target?'FEATURE-50':'CHANGE 50');
  await expect(page.getByRole('option',{name:target?'origin/feature-51':'Change 52 Comparison 52',exact:true})).toBeVisible();
  await page.getByRole('option',{name:target?'origin/feature-50':'Change 50 Comparison 50',exact:true}).click();
  await expect(trigger).toContainText(target?'origin/feature-50':'Change 50');
  expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.target||c.comparison))).toEqual(target?[{target:'origin/feature-51'},{target:'origin/feature-50'}]:[{comparison:'commit:52'},{comparison:'commit:50'}]);
  await trigger.click();
  await page.getByRole('button',{name:'Agent',exact:true}).click();
  await expect(query).toHaveCount(0);
  await trigger.focus();
  await trigger.press('ArrowDown');
  await expect(query).toBeFocused();
  await query.press('Tab');
  await expect(query).toHaveCount(0);
  await expect(trigger).not.toBeFocused();
 });
}

test('AI workspace replaces legacy navigation and selection action stays horizontal',async({page})=>{
 await expect(page.getByRole('button',{name:'Legacy chats'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Open chats'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Open code review'})).toHaveCount(1);
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.locator('.diff-row.addition').first().click({button:'right'});
 const action=page.getByRole('menuitem',{name:'Insert selection in Agent'});
 const label=action.locator('strong');
 const labelBox=(await label.boundingBox())!;
 expect(labelBox.width).toBeGreaterThan(170);
 expect(labelBox.height).toBeLessThan(35);
 await expect(page.getByRole('menuitem',{name:'Ask agent'})).toHaveCount(0);
 await page.screenshot({path:'test-results/selection-menu-dark.png'});
 await action.click();
 await expect(page.getByRole('textbox',{name:'Pending agent context'})).toHaveValue(/Selected diff/);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.paste))).toEqual([]);
});

for(const replacement of ['repository','newer-navigation'] as const) {
 test(`obsolete source navigation rejection cannot update ${replacement} context`,async({page})=>{
  await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
  await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
  await page.waitForTimeout(200);
  await page.evaluate(()=>{
   const f=window as any;const original=f.rift.readRepositoryViewFile;
   f.rift.readRepositoryViewFile=(path:string)=>{f.rift.readRepositoryViewFile=original;return new Promise((_resolve,reject)=>f.rejectNavigation=reject);};
   f.rift.chooseRepository=async()=>{await f.rift.terminalStop();f.fixtureRepository.root='/fixture/other';return {...f.fixtureRepository};};
  });
  const box=(await page.locator('rift-ai-terminal .xterm-screen').boundingBox())!;
  const dims=await page.locator('.xterm-char-measure-element').first().evaluate(el=>({w:el.getBoundingClientRect().width/(el.textContent?.length||1),h:el.getBoundingClientRect().height}));
  const navigate=async()=>{
   await page.mouse.move(box.x+dims.w*15,box.y+dims.h*1.5);
   await page.keyboard.down('Control');
   await page.mouse.click(box.x+dims.w*15,box.y+dims.h*1.5);
   await page.keyboard.up('Control');
  };
  await navigate();
  await expect.poll(()=>page.evaluate(()=>!!(window as any).rejectNavigation)).toBe(true);
  if(replacement==='repository')await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();
  else {await navigate();await expect(page.locator('.source-target')).toContainText('line12');}
  if(replacement==='newer-navigation')await page.getByRole('button',{name:'Agent',exact:true}).click();
  await page.getByRole('button',{name:'Open review notes',exact:true}).click();
  await expect(page.getByText('Review notes',{exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).rejectNavigation(new Error('Obsolete navigation failure')));
  await page.waitForTimeout(150);
  await expect(page.getByText('Obsolete navigation failure',{exact:true})).toHaveCount(0);
 });
}

test('wrapped ANSI source links stay literal, require modifier and navigate unchanged files',async({page})=>{
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await expect(page.getByText('running',{exact:true})).toBeVisible();
 const screen=page.locator('rift-ai-terminal .xterm-screen');
 const box=(await screen.boundingBox())!;
 const dims=await page.locator('.xterm-char-measure-element').first().evaluate(el=>({w:el.getBoundingClientRect().width/(el.textContent?.length||1),h:el.getBoundingClientRect().height}));
 const cols=Math.floor(box.width/dims.w);
 await page.evaluate(cols=>(window as any).fixtureAppend('\r\n'+' '.repeat(cols-6)+'src/\x1b[31mmy file.ts:14:2\x1b[0m\r\n'),cols);
 await page.waitForTimeout(300);
 await page.mouse.move(box.x+dims.w*4,box.y+dims.h*4.5);
 await page.waitForTimeout(100);
 await page.mouse.click(box.x+dims.w*4,box.y+dims.h*4.5);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.open).length)).toBe(0);
 await page.keyboard.down('Control');
 await page.mouse.click(box.x+dims.w*4,box.y+dims.h*4.5);
 await page.keyboard.up('Control');
 await expect(page.locator('.source-target')).toContainText('line14');
 await page.screenshot({path:'test-results/source-jump.png'});
});

for (const outcome of ['resolve', 'reject'] as const) {
 test(`repository switch clears pending start and ignores late ${outcome}`,async({page})=>{
   await page.evaluate(()=>{
   const fixture=window as any;
   const original=fixture.rift.terminalStart;
   fixture.pendingStarts=[];
   fixture.rift.terminalStart=(...args:any[])=>new Promise((resolve,reject)=>{
    fixture.fixtureCalls.push({pendingStart:true});
    fixture.pendingStarts.push({resolve,reject,finish:async()=>resolve(await original(...args))});
   });
   fixture.rift.chooseRepository=async()=>{
    fixture.fixtureRepository.root='/fixture/other';
    return {...fixture.fixtureRepository};
   };
  });
  await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
  await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('Starting');
  await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();
  await expect(page.locator('rift-ai-terminal .terminal-cwd')).toContainText('/fixture/other');
  await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('No active session');
  await expect(page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Stop session',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.pendingStart).length)).toBe(1);
  await page.screenshot({path:`test-results/terminal-repository-switch-${outcome}.png`});
  await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
  await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('Starting');
  await page.evaluate(outcome=>{
   const old=(window as any).pendingStarts[0];
   if(outcome==='reject')old.reject(new Error('Terminal start cancelled.'));
   else old.resolve({id:'obsolete-session',provider:'claude',mode:'review',cwd:'/fixture/repo',status:'running'});
  },outcome);
  await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('Starting');
  await expect(page.getByRole('button',{name:'Stop session',exact:true})).toBeEnabled();
  await expect(page.locator('rift-ai-terminal [role="alert"]')).toHaveCount(0);
  await page.evaluate(()=>(window as any).pendingStarts[1].finish());
  await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('running');
  await expect(page.locator('rift-ai-terminal .terminal-cwd')).toContainText('/fixture/other');
  await expect(page.locator('rift-ai-terminal [role="alert"]')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.pendingStart).length)).toBe(2);
 });
}

test('read rejection stops polling and requires explicit Stop and Start recovery',async({page})=>{
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await expect(page.getByText('running',{exact:true})).toBeVisible();
 await page.evaluate(()=>{
  const original=(window as any).rift.terminalRead;
  (window as any).restoreFixtureRead=()=>{(window as any).rift.terminalRead=original;};
  (window as any).fixtureFailedReads=0;
  (window as any).rift.terminalRead=async()=>{(window as any).fixtureFailedReads++;throw new Error('Synthetic connection loss');};
 });
 await expect(page.getByRole('alert')).toContainText('Terminal connection unavailable');
 await expect(page.locator('rift-ai-terminal .terminal-status')).toHaveText('Connection unavailable');
 await page.waitForTimeout(350);
 expect(await page.evaluate(()=>(window as any).fixtureFailedReads)).toBe(1);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start).length)).toBe(1);
 await page.locator('rift-ai-terminal summary').click();
 await expect(page.getByRole('button',{name:'Insert selection',exact:true})).toBeDisabled();
 await page.screenshot({path:'test-results/terminal-disconnected.png'});
 await page.evaluate(()=>(window as any).restoreFixtureRead());
 await page.getByRole('button',{name:'Stop session',exact:true}).click();
 await expect(page.getByText('No active session',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await expect(page.getByText('running',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start).length)).toBe(2);
});

test('context is retained when no session is available',async({page})=>{
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.locator('.diff-row.addition').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Insert selection in Agent'}).click();
 await expect(page.getByRole('textbox',{name:'Pending agent context'})).toHaveValue(/\+new/);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.paste).length)).toBe(0);
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await page.getByRole('button',{name:'Insert pending context'}).click();
 await expect(page.getByRole('textbox',{name:'Pending agent context'})).not.toBeVisible();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.paste).length)).toBe(1);
});

test('notes and selected diff insert as context only and CLI shortcuts are not stolen',async({page})=>{
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await expect(page.getByText('running',{exact:true})).toBeVisible();
 await page.locator('rift-ai-terminal .xterm-helper-textarea').focus();
 await page.keyboard.press('Control+f');
 await expect(page.getByRole('dialog',{name:'Search repository'})).not.toBeVisible();
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 const line=page.locator('.diff-row.addition').first();
 await line.click({button:'right'});
 await page.getByRole('menuitem',{name:'Insert selection in Agent'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.paste).length)).toBe(1);
 let calls=await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.paste));
 expect(calls[0].input).toContain('Location: src/changed.ts:2-2');
 expect(calls[0].input).toContain('+new');
 expect(calls[0].input.endsWith('\r')).toBe(false);
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 await line.click({button:'right'});
 await page.getByRole('menuitem',{name:'Add note'}).click();
 await page.getByRole('textbox',{name:'Review note',exact:true}).fill('Synthetic fixture note only');
 await page.getByRole('button',{name:'Add note',exact:true}).click();
 await page.getByRole('checkbox',{name:'Select note',exact:true}).check();
 await page.getByRole('button',{name:'Agent',exact:true}).click();
 await page.locator('rift-ai-terminal summary').click();
 await page.locator('rift-ai-terminal').getByRole('button',{name:'Copy notes',exact:true}).click();
 await page.getByRole('button',{name:'Insert selected notes (1)'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.paste).length)).toBe(2);
 calls=await page.evaluate(()=>(window as any).fixtureCalls);
 expect(calls.find((c:any)=>c.copy).copy).toContain('Synthetic fixture note only');
 expect(calls.filter((c:any)=>c.paste)[1].input).toContain('src/changed.ts:2-2');
 expect(calls.filter((c:any)=>c.paste)[1].input).toContain('Synthetic fixture note only');
 await page.screenshot({path:'test-results/terminal-notes.png'});
});

test('terminal-first workspace retains session, inserts selection without Enter and navigates source links', async ({page}) => {
 await expect(page.getByRole('combobox',{name:'Agent provider'})).toBeVisible();
 await page.getByRole('combobox',{name:'Agent provider'}).selectOption('codex');
 await page.getByRole('button',{name:/^(Start|Resume) session$/,exact:true}).click();
 await expect(page.getByText('running', {exact:true})).toBeVisible();
 await expect(page.locator('rift-ai-terminal .xterm-screen')).toBeVisible();
 await page.screenshot({path:'test-results/terminal-dark.png'});
 // Wrapped/rendered text link provider is exercised with real mouse hover + Ctrl click.
 const screen=page.locator('rift-ai-terminal .xterm-screen');
 const box=(await screen.boundingBox())!;
 const dims=await page.locator('.xterm-char-measure-element').first().evaluate(el=>({w:el.getBoundingClientRect().width/(el.textContent?.length||1),h:el.getBoundingClientRect().height}));
 await page.mouse.move(box.x+dims.w*15,box.y+dims.h*1.5);
 await page.keyboard.down('Control');
 await page.mouse.click(box.x+dims.w*15,box.y+dims.h*1.5);
 await page.keyboard.up('Control');
 await expect(page.locator('.source-target')).toContainText('line12');
 await expect(page.locator('.source-location')).toContainText('src/my file.ts:12:3');
 await page.getByRole('button',{name:'Agent',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start).length)).toBe(1);
 await page.getByRole('button',{name:'Stop session',exact:true}).click();
 await expect(page.getByText('No active session',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Use light theme'}).click();
 await page.screenshot({path:'test-results/terminal-light.png'});
});

for(const width of [1024,1440])for(const theme of ['dark','light'])test(`native metadata fixture parity ${theme} ${width} across all providers`,async({page})=>{
 test.setTimeout(60000);
 const sessions=await nativeSessionMetadata();
 await page.setViewportSize({width,height:900});
 await page.emulateMedia({reducedMotion:'reduce'});
 if(theme==='light')await page.getByRole('button',{name:'Use light theme'}).click();
 await page.evaluate(sessions=>{
  const f=window as any;
  f.rift.terminalSessions=async(provider:keyof typeof sessions)=>sessions[provider];
  const start=f.rift.terminalStart;
  f.rift.terminalStart=(provider:string,mode:string,cols:number,rows:number,resume?:string,slot?:string)=>{f.fixtureCalls.push({nativeResume:provider,resume});return start(provider,mode,cols,rows,resume,slot);};
  const label=document.createElement('div');label.textContent='BROWSER · SYNTHETIC BRIDGE / NATIVE-SCHEMA SCRATCH FIXTURES';label.style.cssText='position:fixed;bottom:7px;left:300px;z-index:99999;font:10px sans-serif;color:#919da9;pointer-events:none';document.body.append(label);
 },sessions);
 for(const provider of ['claude','opencode','codex'] as const){
  const general=page.locator('rift-ai-terminal');
  await general.getByRole('combobox',{name:'Agent provider'}).selectOption(provider);
  await general.getByRole('button',{name:'New session',exact:true}).click();
  await page.screenshot({path:`/opt/data/output/riftcode/compact-rail/native-${provider}-${theme}-${width}-new.png`});
  await general.getByRole('button',{name:'Resume existing',exact:true}).click();
  const row=general.getByRole('option').filter({hasText:sessions[provider][0].title});
  await expect(row).toBeVisible();await expect(row.locator('time')).toContainText('2026');
  await row.click();await expect(row).toHaveAttribute('aria-selected','true');
  await page.screenshot({path:`/opt/data/output/riftcode/compact-rail/native-${provider}-${theme}-${width}-resume.png`});
  await page.getByRole('button',{name:'Open code review',exact:true}).click();
  const review=page.getByRole('region',{name:'Code review workbench'});
  await expect(review.locator('.review-brief')).toContainText('Working tree');
  await review.getByRole('combobox',{name:'Review provider'}).selectOption(provider);
  await review.getByRole('button',{name:'Resume existing',exact:true}).click();
  const reviewRow=review.getByRole('option').filter({hasText:sessions[provider][0].title});await reviewRow.click();
  // CSS visibility and Playwright click() auto-scroll do not prove the action is reachable.
  const expectLaunchInView=async()=>{
   const geometry=await review.locator('.session-launcher .primary-button').evaluate(el=>{
    const r=el.getBoundingClientRect(), clip=el.closest('.launcher-space')!.getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,clipTop:clip.top,clipBottom:clip.bottom,
     fullyInViewport:r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth,
     fullyInLauncher:r.top>=clip.top&&r.bottom<=clip.bottom,
     unobstructed:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
   });
   expect(geometry,`${provider} ${theme} ${width}: primary launch action without scrolling`).toMatchObject({fullyInViewport:true,fullyInLauncher:true,unobstructed:true});

  };
  await expectLaunchInView();
  await review.getByRole('button',{name:'New session',exact:true}).click();
  await expectLaunchInView();
  await review.getByRole('button',{name:'Resume existing',exact:true}).click();
  await expect(reviewRow).toBeVisible();await reviewRow.click();
  await expectLaunchInView();
  await page.screenshot({path:`/opt/data/output/riftcode/compact-rail/native-${provider}-${theme}-${width}-review.png`});
  await review.getByRole('button',{name:'Resume review session',exact:true}).click();
  await expect(review.locator('.terminal-identity strong')).toHaveText(sessions[provider][0].title);
  expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.input||c.reviewInput||c.reviewSubmit))).toEqual([]);
  await page.getByRole('button',{name:'Back to code',exact:true}).click();
  await page.getByRole('button',{name:'Open code review',exact:true}).click();
  await expect(review.locator('.terminal-status')).toHaveText('running');
  await review.getByRole('button',{name:'Stop session',exact:true}).click();
  await page.getByRole('button',{name:'Agent',exact:true}).click();
 }
 const calls=await page.evaluate(()=>(window as any).fixtureCalls);
 expect(calls.filter((c:any)=>c.reviewStart)).toEqual(['claude','opencode','codex'].map(reviewStart=>({reviewStart,mode:'review'})));
 expect(calls.filter((c:any)=>c.start)).toEqual([]);
 expect(calls.filter((c:any)=>c.nativeResume)).toEqual(['claude','opencode','codex'].map(provider=>({nativeResume:provider,resume:sessions[provider as keyof typeof sessions][0].id})));
});

for(const width of [1024,1280,1440])for(const theme of ['dark','light']) {
 test(`visual evidence ${theme} ${width}: launcher loading running inspector`,async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width,height:900});
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.getByRole('region',{name:'Launch AI session'})).toBeVisible();
  if(theme==='light')await page.getByRole('button',{name:'Use light theme'}).click();
  const capture=async(name:string)=>{
   await page.evaluate(()=>{
    if(document.getElementById('browser-fixture-label'))return;
    const label=document.createElement('div');label.id='browser-fixture-label';label.textContent='BROWSER PREVIEW · SYNTHETIC BRIDGE / DATA';
    label.style.cssText='position:fixed;bottom:7px;left:380px;z-index:99999;font:10px sans-serif;letter-spacing:.04em;color:#919da9;pointer-events:none';document.body.append(label);
   });
   await page.screenshot({path:`/opt/data/output/riftcode/compact-rail/${theme}-${width}-${name}.png`});
  };
  await capture('launcher');
  await page.evaluate(()=>{(window as any).rift.terminalSessions=()=>new Promise(resolve=>(window as any).finishMatrixList=resolve);});
  await page.getByRole('button',{name:'Resume existing',exact:true}).click();
  await expect(page.getByRole('status',{name:'Loading provider sessions'})).toBeVisible();
  await capture('list-loading');
  await page.evaluate(()=>(window as any).finishMatrixList([
   {id:'01953d6c-1234-7123-9123-123456789abc',title:'Terminal workspace · cancellation review',updatedAt:1793966400000},
   {id:'01953d6c-1234-7123-9123-123456789abd',title:'Source links and repository navigation',updatedAt:1793880000000},
   {id:'01953d6c-1234-7123-9123-123456789abe',title:'Review notes and selection context',updatedAt:1793793600000}
  ]));
  await page.getByRole('listbox',{name:'Provider session',exact:true}).getByRole('option').first().click();
  await capture('resume');
  await page.evaluate(()=>{const f=window as any;const start=f.rift.terminalStart;f.rift.terminalStart=(...args:any[])=>new Promise(resolve=>f.finishMatrixStart=async()=>resolve(await start(...args)));});
  await page.getByRole('button',{name:'Resume session',exact:true}).click();
  await expect(page.getByRole('status',{name:'Connecting terminal'})).toBeVisible();
  await capture('connecting');
  await page.evaluate(()=>(window as any).finishMatrixStart());
  await expect(page.getByRole('status',{name:'Connecting terminal'})).toHaveCount(0);
  await capture('running');
  await page.getByRole('button',{name:'Select target comparison branch',exact:true}).click();
  await page.getByRole('combobox',{name:'Search target branches'}).fill('feature-5');
  await capture('branch');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Back to code',exact:true}).click();
  await page.locator('.diff-row.addition').first().click({button:'right'});
  await page.getByRole('menuitem',{name:'Add note'}).click();
  await page.getByRole('textbox',{name:'Review note',exact:true}).fill('Check cancellation when switching repositories. Preserve unsent context.');
  await page.getByRole('button',{name:'Add note',exact:true}).click();
  await page.getByRole('checkbox',{name:'Select note',exact:true}).check();
  await expect(page.locator('.review-panel')).toContainText('Check cancellation');
  await capture('code-notes');
  await page.locator('.diff-row.addition').first().click({button:'right'});
  await capture('selection-notes');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Agent',exact:true}).click();
  const geometry=await page.locator('rift-ai-terminal .terminal-toolbar').evaluate(el=>{
   const r=el.getBoundingClientRect();const controls=[...el.querySelectorAll('button,summary')].filter(c=>c.checkVisibility()).map(c=>{const b=c.getBoundingClientRect();return {y:b.y,h:b.height,right:b.right};});return {width:r.width,height:r.height,right:r.right,controls};
  });
  expect(geometry.height).toBe(56);expect(geometry.controls).toHaveLength(4);await expect(page.getByRole('button',{name:'Dock to bottom',exact:true})).toBeVisible();
  expect(new Set(geometry.controls.map(c=>c.y)).size).toBe(1);
  expect(geometry.controls.every(c=>c.h===32&&c.right<=geometry.right)).toBe(true);
  console.log('VERIFIED GEOMETRY',theme,width,JSON.stringify(geometry));
  await capture('running-notes');
  await page.getByRole('button',{name:'Stop session',exact:true}).click();
  await page.getByRole('button',{name:'Collapse sidebar'}).click();
  await prepareContext(page);
  await expect(page.getByRole('textbox',{name:'Pending agent context'})).toBeVisible();
  await capture('review-context');
  await page.addInitScript(theme=>{localStorage.setItem('rift:theme',theme);(window as any).rift.openRepository=()=>new Promise(()=>{});},theme);
  await page.reload();
  await expect(page.getByRole('status',{name:'Opening repository'})).toBeVisible();
  await capture('repository-opening');
 });
}
