import { test, expect } from '@playwright/test';

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
  (window as any).rift={platform:'linux',selectComparison:async(id:string)=>{calls.push({comparison:id});repository.comparisonId=id;return {...repository};},selectTargetBranch:async(ref:string)=>{calls.push({target:ref});repository.targetBranch=ref as any;return {...repository};},setTheme:async()=>{},checkForUpdate:async()=>({currentVersion:'0.8.0',latestVersion:null,releaseNotes:[],updateAvailable:false,installSupported:false,error:null}),openRepository:async()=>repository,refreshRepository:async()=>repository,listRepositoryFiles:async()=>['src/changed.ts','src/my file.ts'],getFilePatch:async()=>({path:'src/changed.ts',binary:false,patch:'diff --git a/src/changed.ts b/src/changed.ts\n--- a/src/changed.ts\n+++ b/src/changed.ts\n@@ -1,2 +1,2 @@\n const unchanged = 1;\n-old\n+new\n'}),listAgents:async()=>[],onRepositoryChanged:()=>()=>{},onAgentEvent:()=>()=>{},copyText:async(text:string)=>{calls.push({copy:text});},readRepositoryViewFile:async(path:string)=>{calls.push({open:path});return{path,content:Array.from({length:30},(_,i)=>'const line'+(i+1)+' = true;').join('\n'),binary:false,truncated:false};},terminalRead:async(id:string|null,cursor:number)=>({state,data:output.slice(cursor),cursor:output.length,truncated:false}),terminalStart:async(provider:string,mode:string)=>{calls.push({start:provider,mode});state={id:'fixture-session',provider,mode,cwd:repository.root,status:'running'};output='\x1b[?2004h\x1b[32mLOCAL FIXTURE — not a provider run\x1b[0m\r\nReview src/my file.ts:12:3\r\nReady > ';return state;},terminalStop:async()=>{state=null;output='';calls.push({stop:true});},terminalInput:async(id:string,data:string,paste:boolean)=>{calls.push({input:data,paste});},terminalResize:async(_id:string,cols:number)=>{(window as any).fixtureCols=cols;}};
 });
 page.on('console',msg=>{if(msg.type()==='error')console.error('BROWSER',msg.text());});
 await page.goto('/');
 page.on('pageerror',error=>console.error('PAGE ERROR',error.message));
});

test('branch searches filter case-insensitive substrings without changing selection',async({page})=>{
 const target=page.getByRole('combobox',{name:'Select target comparison branch'});
 const comparison=page.getByRole('combobox',{name:'Select comparison',exact:true});
 await expect(target).toHaveValue('origin/feature-0');
 await page.getByRole('textbox',{name:'Search target branches'}).fill('FEATURE-51');
 await expect(target.locator('option')).toHaveCount(2);
 await expect(target).toHaveValue('origin/feature-0');
 await page.getByRole('textbox',{name:'Search comparisons'}).fill('CHANGE 52');
 await expect(comparison.locator('option')).toHaveCount(2);
 await expect(comparison).toHaveValue('working-tree');
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.target||c.comparison))).toEqual([]);
 await target.selectOption('origin/feature-51');
 await comparison.selectOption('commit:52');
 await expect(target).toHaveValue('origin/feature-51');
 await expect(comparison).toHaveValue('commit:52');
 await page.getByRole('textbox',{name:'Search target branches'}).fill('missing');
 await page.getByRole('textbox',{name:'Search comparisons'}).fill('missing');
 await expect(page.getByText('No matching target branches')).toBeVisible();
 await expect(page.getByText('No matching comparisons')).toBeVisible();
 await expect(target).toHaveValue('origin/feature-51');
 await expect(comparison).toHaveValue('commit:52');
 await page.screenshot({path:'test-results/branch-search-no-results.png'});
 await page.getByRole('button',{name:'Clear target branch search'}).click();
 await page.getByRole('button',{name:'Clear comparison search'}).click();
 await expect(target.locator('option')).toHaveCount(60);
 await expect(comparison.locator('option')).toHaveCount(61);
 await page.screenshot({path:'test-results/branch-search.png'});
});

test('comparison search preserves default options and supports keyboard selection and Escape',async({page})=>{
 const comparison=page.getByRole('combobox',{name:'Select comparison',exact:true});
 await page.evaluate(()=>(window as any).fixtureRepository.comparisons.push({id:'current-branch',kind:'branch',label:'Current branch changes',detail:'Default branch comparison'}));
 await comparison.selectOption('commit:52');
 const query=page.getByRole('textbox',{name:'Search comparisons'});
 await query.fill('CHANGE 51');
 await expect(comparison.locator('option[value="working-tree"]')).toHaveCount(1);
 await expect(comparison.locator('option[value="current-branch"]')).toHaveCount(1);
 await expect(comparison).toHaveValue('commit:52');
 await page.screenshot({path:'test-results/branch-search-filtered.png'});
 await query.press('Escape');
 await expect(query).toHaveValue('');
 await expect(comparison.locator('option')).toHaveCount(62);
 await comparison.focus();
 await comparison.press('Home');
 await comparison.press('Enter');
 await expect(comparison).toHaveValue('working-tree');
 const target=page.getByRole('combobox',{name:'Select target comparison branch'});
 await page.getByRole('textbox',{name:'Search target branches'}).fill('FEATURE-51');
 await target.focus();
 await target.press('End');
 await target.press('Enter');
 await expect(target).toHaveValue('origin/feature-51');
});

test('wrapped ANSI source links stay literal, require modifier and navigate unchanged files',async({page})=>{
 await page.getByRole('button',{name:'AI terminal',exact:true}).click();
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.getByText('running',{exact:true})).toBeVisible();
 const screen=page.locator('.xterm-screen');
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
  await page.getByRole('button',{name:'AI terminal',exact:true}).click();
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
  await page.getByRole('button',{name:'Start session',exact:true}).click();
  await expect(page.locator('.terminal-status')).toHaveText('Starting');
  await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();
  await expect(page.locator('.terminal-cwd')).toContainText('/fixture/other');
  await expect(page.locator('.terminal-status')).toHaveText('No active session');
  await expect(page.getByRole('button',{name:'Start session',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Stop session',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.pendingStart).length)).toBe(1);
  await page.screenshot({path:`test-results/terminal-repository-switch-${outcome}.png`});
  await page.getByRole('button',{name:'Start session',exact:true}).click();
  await expect(page.locator('.terminal-status')).toHaveText('Starting');
  await page.evaluate(outcome=>{
   const old=(window as any).pendingStarts[0];
   if(outcome==='reject')old.reject(new Error('Terminal start cancelled.'));
   else old.resolve({id:'obsolete-session',provider:'claude',mode:'review',cwd:'/fixture/repo',status:'running'});
  },outcome);
  await expect(page.locator('.terminal-status')).toHaveText('Starting');
  await expect(page.getByRole('button',{name:'Starting…',exact:true})).toBeDisabled();
  await expect(page.locator('rift-ai-terminal [role="alert"]')).toHaveCount(0);
  await page.evaluate(()=>(window as any).pendingStarts[1].finish());
  await expect(page.locator('.terminal-status')).toHaveText('running');
  await expect(page.locator('.terminal-cwd')).toContainText('/fixture/other');
  await expect(page.locator('rift-ai-terminal [role="alert"]')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.pendingStart).length)).toBe(2);
 });
}

test('read rejection stops polling and requires explicit Stop and Start recovery',async({page})=>{
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.getByText('running',{exact:true})).toBeVisible();
 await page.evaluate(()=>{
  const original=(window as any).rift.terminalRead;
  (window as any).restoreFixtureRead=()=>{(window as any).rift.terminalRead=original;};
  (window as any).fixtureFailedReads=0;
  (window as any).rift.terminalRead=async()=>{(window as any).fixtureFailedReads++;throw new Error('Synthetic connection loss');};
 });
 await expect(page.getByRole('alert')).toContainText('Terminal connection unavailable');
 await expect(page.locator('.terminal-status')).toHaveText('Connection unavailable');
 await page.waitForTimeout(350);
 expect(await page.evaluate(()=>(window as any).fixtureFailedReads)).toBe(1);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start).length)).toBe(1);
 await expect(page.getByRole('button',{name:'Insert selection',exact:true})).toBeDisabled();
 await page.screenshot({path:'test-results/terminal-disconnected.png'});
 await page.evaluate(()=>(window as any).restoreFixtureRead());
 await page.getByRole('button',{name:'Stop session',exact:true}).click();
 await expect(page.getByText('No active session',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.getByText('running',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start).length)).toBe(2);
});

test('context is retained when no session is available',async({page})=>{
 await page.getByRole('button',{name:'AI terminal',exact:true}).click();
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.locator('.diff-row.addition').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Insert selection in AI terminal'}).click();
 await expect(page.getByRole('textbox',{name:'Pending terminal context'})).toHaveValue(/\+new/);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.paste).length)).toBe(0);
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await page.getByRole('button',{name:'Insert pending context'}).click();
 await expect(page.getByRole('textbox',{name:'Pending terminal context'})).not.toBeVisible();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.paste).length)).toBe(1);
});

test('notes and selected diff insert as context only and CLI shortcuts are not stolen',async({page})=>{
 await page.getByRole('button',{name:'AI terminal',exact:true}).click();
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.getByText('running',{exact:true})).toBeVisible();
 await page.locator('.xterm-helper-textarea').focus();
 await page.keyboard.press('Control+f');
 await expect(page.getByRole('dialog',{name:'Search repository'})).not.toBeVisible();
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 const line=page.locator('.diff-row.addition').first();
 await line.click({button:'right'});
 await page.getByRole('menuitem',{name:'Insert selection in AI terminal'}).click();
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
 await page.getByRole('button',{name:'AI terminal',exact:true}).click();
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
 await page.getByRole('button',{name:'AI terminal',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Terminal provider'})).toBeVisible();
 await page.getByRole('combobox',{name:'Terminal provider'}).selectOption('codex');
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.getByText('running', {exact:true})).toBeVisible();
 await expect(page.locator('.xterm-screen')).toBeVisible();
 await page.screenshot({path:'test-results/terminal-dark.png'});
 // Wrapped/rendered text link provider is exercised with real mouse hover + Ctrl click.
 const screen=page.locator('.xterm-screen');
 const box=(await screen.boundingBox())!;
 const dims=await page.locator('.xterm-char-measure-element').first().evaluate(el=>({w:el.getBoundingClientRect().width/(el.textContent?.length||1),h:el.getBoundingClientRect().height}));
 await page.mouse.move(box.x+dims.w*15,box.y+dims.h*1.5);
 await page.keyboard.down('Control');
 await page.mouse.click(box.x+dims.w*15,box.y+dims.h*1.5);
 await page.keyboard.up('Control');
 await expect(page.locator('.source-target')).toContainText('line12');
 await expect(page.locator('.source-location')).toContainText('src/my file.ts:12:3');
 await page.getByRole('button',{name:'AI terminal',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start).length)).toBe(1);
 await page.getByRole('button',{name:'Stop session',exact:true}).click();
 await expect(page.getByText('No active session',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Use light theme'}).click();
 await page.screenshot({path:'test-results/terminal-light.png'});
});
