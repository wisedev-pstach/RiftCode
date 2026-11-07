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
  (window as any).rift={platform:'linux',terminalSessions:async()=>[{id:'01953d6c-1234-7123-9123-123456789abc',title:'Fixture session in this repository',updatedAt:42}],selectComparison:async(id:string)=>{calls.push({comparison:id});repository.comparisonId=id;return {...repository};},selectTargetBranch:async(ref:string)=>{calls.push({target:ref});repository.targetBranch=ref as any;return {...repository};},setTheme:async()=>{},checkForUpdate:async()=>({currentVersion:'0.8.0',latestVersion:null,releaseNotes:[],updateAvailable:false,installSupported:false,error:null}),openRepository:async()=>repository,refreshRepository:async()=>repository,listRepositoryFiles:async()=>['src/changed.ts','src/my file.ts'],getFilePatch:async()=>({path:'src/changed.ts',binary:false,patch:'diff --git a/src/changed.ts b/src/changed.ts\n--- a/src/changed.ts\n+++ b/src/changed.ts\n@@ -1,2 +1,2 @@\n const unchanged = 1;\n-old\n+new\n'}),listAgents:async()=>[],onRepositoryChanged:()=>()=>{},onAgentEvent:()=>()=>{},copyText:async(text:string)=>{calls.push({copy:text});},readRepositoryViewFile:async(path:string)=>{calls.push({open:path});return{path,content:Array.from({length:30},(_,i)=>'const line'+(i+1)+' = true;').join('\n'),binary:false,truncated:false};},terminalRead:async(id:string|null,cursor:number)=>({state,data:output.slice(cursor),cursor:output.length,truncated:false}),terminalStart:async(provider:string,mode:string)=>{calls.push({start:provider,mode});state={id:'fixture-session',provider,mode,cwd:repository.root,status:'running'};output='\x1b[?2004h\x1b[32mLOCAL FIXTURE — not a provider run\x1b[0m\r\nReview src/my file.ts:12:3\r\nReady > ';return state;},terminalStop:async()=>{state=null;output='';calls.push({stop:true});},terminalInput:async(id:string,data:string,paste:boolean)=>{calls.push({input:data,paste});},terminalResize:async(_id:string,cols:number)=>{(window as any).fixtureCols=cols;}};
 });
 page.on('console',msg=>{if(msg.type()==='error')console.error('BROWSER',msg.text());});
 await page.goto('/');
 page.on('pageerror',error=>console.error('PAGE ERROR',error.message));
});

test('new or resume uses provider sessions in the current repo and preserves permission intent',async({page})=>{
 await page.evaluate(()=>{
  (window as any).rift.terminalSessions=async(provider:string)=>{(window as any).fixtureCalls.push({list:provider});return [{id:provider==='opencode'?'ses_2f6b4a8c9001AbCdEfGhIjKlMn':'01953d6c-1234-7123-9123-123456789abc',title:'Existing provider session',updatedAt:42}];};
  const old=(window as any).rift.terminalStart;
  (window as any).rift.terminalStart=(provider:string,mode:string,cols:number,rows:number,id?:string)=>{(window as any).fixtureCalls.push({resume:id});return old(provider,mode,cols,rows);};
 });
 await page.getByRole('combobox',{name:'Session choice',exact:true}).selectOption('resume');
 await expect(page.getByRole('listbox',{name:'Provider session',exact:true})).toContainText('Existing provider session');
 await page.screenshot({path:'test-results/terminal-resume.png'});
 await page.getByRole('listbox',{name:'Provider session',exact:true}).selectOption('01953d6c-1234-7123-9123-123456789abc');
 await expect(page.getByRole('listbox',{name:'Provider session',exact:true})).toHaveAttribute('title','Existing provider session · 01953d6c-1234-7123-9123-123456789abc');
 await page.getByRole('combobox',{name:'Session intent'}).selectOption('edit');
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.locator('.terminal-status')).toHaveText('running');
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.resume))).toEqual([{resume:'01953d6c-1234-7123-9123-123456789abc'}]);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.find((c:any)=>c.start))).toEqual({start:'claude',mode:'edit'});
 await expect(page.getByRole('combobox',{name:'Terminal provider'})).toBeDisabled();
 await page.getByRole('button',{name:'Stop session',exact:true}).click();
 await page.getByRole('combobox',{name:'Terminal provider'}).selectOption('opencode');
 await expect(page.getByRole('listbox',{name:'Provider session'})).toHaveValue('');
 await expect(page.getByRole('listbox',{name:'Provider session'})).toContainText('Existing provider session');
});

test('Review changes prepares complete comparison context without starting or submitting',async({page})=>{
 await page.getByRole('button',{name:'Review changes',exact:true}).click();
 const pending=page.getByRole('textbox',{name:'Pending terminal context'});
 await expect(pending).toHaveValue(/Comparison: Working tree/);
 await expect(pending).toHaveValue(/Start revision: HEAD/);
 await expect(pending).toHaveValue(/End revision: working tree/);
 await expect(pending).toHaveValue(/src\/changed.ts/);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.input))).toEqual([]);
 await page.screenshot({path:'test-results/terminal-review-context.png'});
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await page.getByRole('button',{name:'Insert pending context',exact:true}).click();
 const calls=await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.input));
 expect(calls).toHaveLength(1);expect(calls[0].paste).toBe(true);expect(calls[0].input.endsWith('\r')).toBe(false);
});

test('saved explanation opens as retained terminal context, preserving local history',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('rift:review-session:/fixture/repo:feature/terminal:working-tree:origin/feature-0',JSON.stringify({version:2,reviewedFiles:[],notes:[],conversations:[{id:1,repositoryRoot:'/fixture/repo',agent:'claude',model:null,question:'Saved explanation',context:{filePath:'src/changed.ts',startLine:2,endLine:2,diff:'+new'},status:'complete',result:null,error:null,history:[]}]})));
 await page.reload();
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.getByRole('button',{name:'Open explanation: Saved explanation'}).click();
 await expect(page.getByRole('textbox',{name:'Pending terminal context'})).toHaveValue(/Saved explanation/);
 await expect(page.getByRole('button',{name:'Start session',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rift:review-session:/fixture/repo:feature/terminal:working-tree:origin/feature-0')!).conversations.length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.input))).toEqual([]);
});

for(const operation of ['Input','Resize'] as const)for(const replacement of ['repository','stop-start'] as const) {
 test(`obsolete terminal ${operation} rejection cannot disconnect ${replacement} replacement`,async({page})=>{
  await page.getByRole('button',{name:'Review changes',exact:true}).click();
  await page.getByRole('button',{name:'Start session',exact:true}).click();
  await expect(page.locator('.terminal-status')).toHaveText('running');
  await expect(page.getByRole('button',{name:'Insert pending context',exact:true})).toBeEnabled();
  await page.evaluate(operation=>{
   const f=window as any;
   f.rift['terminal'+operation]=()=>new Promise((_resolve,reject)=>{f.rejectObsolete=reject;});
   f.rift.chooseRepository=async()=>{await f.rift.terminalStop();f.fixtureRepository.root='/fixture/other';return {...f.fixtureRepository};};
  },operation);
  if(operation==='Input') {await page.locator('.xterm-helper-textarea').focus();await page.keyboard.type('x');}
  else await page.setViewportSize({width:1200,height:900});
  await expect.poll(()=>page.evaluate(()=>!!(window as any).rejectObsolete)).toBe(true);
  if(replacement==='repository')await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();
  else await page.getByRole('button',{name:'Stop session',exact:true}).click();
  await expect(page.locator('.terminal-status')).toHaveText('No active session');
  // The substitute deliberately reuses its session ID: generation must also match.
  await page.getByRole('button',{name:'Start session',exact:true}).click();
  await expect(page.getByRole('button',{name:'Insert pending context',exact:true})).toBeEnabled();
  await page.evaluate(()=>(window as any).rejectObsolete(new Error('Obsolete IPC')));
  await page.waitForTimeout(150);
  await expect(page.locator('.terminal-status')).toHaveText('running');
  await expect(page.getByRole('button',{name:'Insert pending context',exact:true})).toBeEnabled();
  await expect(page.locator('rift-ai-terminal [role="alert"]')).toHaveCount(0);
 });
}

test('late stop cannot clear a replacement start in another repository',async({page})=>{
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.locator('.terminal-status')).toHaveText('running');
 await page.evaluate(()=>{
  const f=window as any;
  f.rift.terminalStop=()=>new Promise<void>(resolve=>{f.finishStop=resolve;});
  f.rift.chooseRepository=async()=>{f.fixtureRepository.root='/fixture/other';return {...f.fixtureRepository};};
  f.rift.terminalRead=()=>new Promise(()=>{});
  f.rift.terminalStart=()=>new Promise(resolve=>{f.finishStart=()=>resolve({id:'replacement',cwd:'/fixture/other',provider:'claude',mode:'review',status:'running'});});
 });
 await page.getByRole('button',{name:'Stop session',exact:true}).click();
 await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.locator('.terminal-status')).toHaveText('Starting');
 await page.evaluate(()=>(window as any).finishStart());
 await expect(page.locator('.terminal-status')).toHaveText('running');
 await page.evaluate(()=>(window as any).finishStop());
 await expect(page.locator('.terminal-status')).toHaveText('running');
});

for(const outcome of ['resolve','reject'] as const) {
 test(`resume listing ignores stale ${outcome} after provider and repository changes`,async({page})=>{
  await page.evaluate(()=>{
   const f=window as any;f.lists=[];
   f.rift.terminalSessions=(provider:string)=>new Promise((resolve,reject)=>f.lists.push({provider,resolve,reject}));
   f.rift.chooseRepository=async()=>{f.fixtureRepository.root='/fixture/other';return {...f.fixtureRepository};};
  });
  await page.getByRole('combobox',{name:'Session choice',exact:true}).selectOption('resume');
  await expect.poll(()=>page.evaluate(()=>(window as any).lists.length)).toBe(1);
  await page.getByRole('combobox',{name:'Terminal provider'}).selectOption('codex');
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
  await expect(page.getByRole('button',{name:'Start session',exact:true})).toBeDisabled();
 });
}

test('resume listing failure is explicit, retryable and never starts a session',async({page})=>{
 await page.evaluate(()=>{(window as any).rift.terminalSessions=async()=>{throw new Error('Metadata unsupported');};});
 await page.getByRole('combobox',{name:'Session choice',exact:true}).selectOption('resume');
 await expect(page.getByRole('alert')).toHaveText('Metadata unsupported');
 await expect(page.getByRole('button',{name:'Start session',exact:true})).toBeDisabled();
 await page.evaluate(()=>{(window as any).rift.terminalSessions=async()=>[];});
 await page.getByRole('button',{name:'Refresh sessions',exact:true}).click();
 await expect(page.getByText('No sessions found in this repository.',{exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('combobox',{name:'Session choice',exact:true}).selectOption('new');
 await expect(page.getByRole('button',{name:'Start session',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start))).toEqual([]);
});

for(const width of [1024,1440])for(const theme of ['dark','light']) {
 test(`compact ${theme} workspace at ${width}px keeps notes and branch popovers usable`,async({page})=>{
  await page.setViewportSize({width,height:900});
  if(theme==='light')await page.getByRole('button',{name:'Use light theme'}).click();
  const toolbar=page.locator('.terminal-toolbar');
  expect((await toolbar.boundingBox())!.height).toBeLessThan(120);
  await expect(page.getByRole('button',{name:'Open review notes',exact:true})).toBeVisible();
  await expect(page.locator('.review-rails')).toHaveCount(0);
  await page.getByRole('button',{name:'Start session',exact:true}).click();
  await page.waitForTimeout(250);
  await page.screenshot({path:`test-results/unified-${theme}-${width}-closed.png`});
  await page.getByRole('button',{name:'Select target comparison branch',exact:true}).click();
  await expect(page.locator('.branch-popover')).toBeVisible();
  await page.screenshot({path:`test-results/unified-${theme}-${width}-branch-open.png`});
  await page.getByRole('combobox',{name:'Search target branches'}).press('Escape');
  await page.getByRole('button',{name:'Stop session',exact:true}).click();
  await page.getByRole('combobox',{name:'Session choice',exact:true}).selectOption('resume');
  await expect(page.getByRole('listbox',{name:'Provider session',exact:true})).toContainText('Fixture session');
  expect((await page.getByRole('listbox',{name:'Provider session',exact:true}).boundingBox())!.height).toBeGreaterThan(80);
  await page.screenshot({path:`test-results/unified-${theme}-${width}-resume.png`});
  await page.getByRole('button',{name:'Review changes',exact:true}).click();
  if(theme==='light')expect(await page.getByRole('textbox',{name:'Pending terminal context'}).evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.screenshot({path:`test-results/unified-${theme}-${width}-review.png`});
  await page.getByRole('button',{name:'Back to code',exact:true}).click();
  expect(await page.getByRole('button',{name:'AI terminal',exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(13);
  await page.locator('.diff-row.addition').first().click({button:'right'});
  const label=page.getByRole('menuitem',{name:'Insert selection in AI terminal'}).locator('strong');
  expect((await label.boundingBox())!.height).toBeLessThan(20);
  await page.screenshot({path:`test-results/unified-${theme}-${width}-selection.png`});
 });
}

test('retained native session shows its actual provider and intent without respawning',async({page})=>{
 await page.evaluate(()=>{(window as any).rift.terminalRead=async()=>({state:{id:'retained',provider:'codex',mode:'edit',cwd:'/fixture/repo',status:'running'},data:'',cursor:0,truncated:false});});
 await expect(page.locator('.terminal-status')).toHaveText('running');
 await expect(page.getByRole('combobox',{name:'Terminal provider'})).toHaveValue('codex');
 await expect(page.getByRole('combobox',{name:'Session intent'})).toHaveValue('edit');
 await expect(page.getByRole('button',{name:'Stop session',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start))).toEqual([]);
});

test('late context insertion cannot discard unsent context in a new repository',async({page})=>{
 await page.getByRole('button',{name:'Start session',exact:true}).click();
 await page.waitForTimeout(250);
 await page.evaluate(()=>{
  const f=window as any;f.rift.terminalInput=()=>new Promise<void>(resolve=>f.finishInput=resolve);
  f.rift.chooseRepository=async()=>{await f.rift.terminalStop();f.fixtureRepository.root='/fixture/other';return {...f.fixtureRepository};};
 });
 await page.getByRole('button',{name:'Review changes',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>!!(window as any).finishInput)).toBe(true);
 await page.getByRole('button',{name:'terminal-fixture',exact:true}).click();
 await expect(page.locator('.terminal-status')).toHaveText('No active session');
 await page.getByRole('button',{name:'Review changes',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Pending terminal context'})).toBeVisible();
 await page.evaluate(()=>(window as any).finishInput());
 await expect(page.getByRole('textbox',{name:'Pending terminal context'})).toBeVisible();
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
  await page.locator('.terminal-surface').click();
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
 await expect(page.getByRole('button',{name:'Open code review'})).toHaveCount(0);
 await page.getByRole('button',{name:'Back to code',exact:true}).click();
 await page.locator('.diff-row.addition').first().click({button:'right'});
 const action=page.getByRole('menuitem',{name:'Insert selection in AI terminal'});
 const label=action.locator('strong');
 const labelBox=(await label.boundingBox())!;
 expect(labelBox.width).toBeGreaterThan(170);
 expect(labelBox.height).toBeLessThan(35);
 await expect(page.getByRole('menuitem',{name:'Ask agent'})).toHaveCount(0);
 await page.screenshot({path:'test-results/selection-menu-dark.png'});
 await action.click();
 await expect(page.getByRole('textbox',{name:'Pending terminal context'})).toHaveValue(/Selected diff/);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.paste))).toEqual([]);
});

for(const replacement of ['repository','newer-navigation'] as const) {
 test(`obsolete source navigation rejection cannot update ${replacement} context`,async({page})=>{
  await page.getByRole('button',{name:'Start session',exact:true}).click();
  await expect(page.locator('.terminal-status')).toHaveText('running');
  await page.waitForTimeout(200);
  await page.evaluate(()=>{
   const f=window as any;const original=f.rift.readRepositoryViewFile;
   f.rift.readRepositoryViewFile=(path:string)=>{f.rift.readRepositoryViewFile=original;return new Promise((_resolve,reject)=>f.rejectNavigation=reject);};
   f.rift.chooseRepository=async()=>{await f.rift.terminalStop();f.fixtureRepository.root='/fixture/other';return {...f.fixtureRepository};};
  });
  const box=(await page.locator('.xterm-screen').boundingBox())!;
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
  if(replacement==='newer-navigation')await page.getByRole('button',{name:'AI terminal',exact:true}).click();
  await page.getByRole('button',{name:'Open review notes',exact:true}).click();
  await expect(page.getByText('Review notes',{exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).rejectNavigation(new Error('Obsolete navigation failure')));
  await page.waitForTimeout(150);
  await expect(page.getByText('Obsolete navigation failure',{exact:true})).toHaveCount(0);
 });
}

test('wrapped ANSI source links stay literal, require modifier and navigate unchanged files',async({page})=>{
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
  await expect(page.getByRole('button',{name:'Stop session',exact:true})).toHaveCount(0);
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
  await expect(page.getByRole('button',{name:'Stop session',exact:true})).toBeEnabled();
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
 await page.locator('rift-ai-terminal summary').click();
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
