import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const evidence='/opt/data/output/riftcode/software-factory/angular-ui';
let pageErrors:string[]=[];let externalRequests:string[]=[];
test.beforeEach(async({page})=>{pageErrors=[];externalRequests=[];page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!=='http://127.0.0.1:4189')externalRequests.push(r.url());});});
test.afterEach(async({},info)=>{await info.attach('browser-safety',{body:JSON.stringify({pageErrors,externalRequests}),contentType:'application/json'});expect(pageErrors).toEqual([]);expect(externalRequests).toEqual([]);});
test('approval requires fresh explicit consents and run is separate',async({page})=>{
 await page.goto('http://127.0.0.1:4189');
 await expect(page.getByLabel('Project title')).toBeVisible();await page.evaluate(()=>{const f=(window as any).factoryFixture;f.state.providers[0].available=false;f.state.providers[0].supported=false;f.state.providers[0].reason='Not probed until explicit consent'});await page.getByRole('button',{name:'Refresh factory state'}).click();
 await page.getByRole('button',{name:'Plan',exact:true}).click();
 const approve=page.getByRole('button',{name:'Approve plan',exact:true});
 await expect(approve).toBeDisabled();
 for(const label of ['Provider execution','Provider configuration execution','Workspace writes','Execution context and exact commands'])await page.getByLabel(label,{exact:true}).check();
 await expect(approve).toBeEnabled();await approve.click();
 expect(await page.evaluate(()=>(window as any).factoryFixture.calls)).not.toContain('start');
 await page.getByRole('button',{name:'Run',exact:true}).click();
 await page.getByRole('button',{name:'Start run',exact:true}).click();
 await expect(page.getByText('Run state: running',{exact:true})).toBeVisible();
 await page.evaluate(()=>{(window as any).factoryFixture.deferStop=true});
 await page.getByRole('button',{name:'Stop run',exact:true}).click();
 await expect(page.getByText('Run state: running',{exact:true})).toBeVisible();
 await expect(page.getByRole('status')).toBeVisible();
 await page.evaluate(()=>(window as any).factoryFixture.resolveStop());
 await expect(page.getByText('Run state: stopped',{exact:true})).toBeVisible();
});
test('two immutable queued revisions retain patch, prior source, receipts and local documents without acceptance',async({page})=>{
 await page.goto('http://127.0.0.1:4189');await expect(page.getByLabel('Project title')).toBeVisible();
 await page.evaluate(()=>(window as any).factoryFixture.seedReviews());await page.getByRole('button',{name:'Refresh factory state'}).click();
 await page.getByRole('button',{name:'Review queue',exact:true}).click();
 await expect(page.getByText('Unreviewed (2)',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Synthetic task 1/}).click();
 await page.getByRole('button',{name:'src/task-1.ts',exact:true}).click();
 await expect(page.locator('.patch')).toContainText('const saved = "<img');
 expect(await page.locator('main img').count()).toBe(0);
 await page.getByRole('button',{name:'Before source',exact:true}).click();await expect(page.locator('main pre')).toContainText('const previous = 1;');
 await page.getByRole('button',{name:'Checks',exact:true}).click();await expect(page.getByText('SYNTHETIC receipt output — not an executed command',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Documents',exact:true}).click();await page.getByRole('button',{name:/requirements-1.md/}).click();
 await expect(page.locator('main pre')).toContainText('<script>alert(1)</script>');expect(await page.locator('main script').count()).toBe(0);
 await page.getByRole('button',{name:'Diagrams',exact:true}).click();await page.getByRole('button',{name:/architecture-1.mmd/}).click();
 await expect(page.getByRole('img',{name:'Safe flowchart preview'})).toBeVisible();
 expect((await page.evaluate(()=>(window as any).factoryFixture.calls)).filter((v:string)=>v==='review')).toHaveLength(0);
 await page.getByRole('button',{name:'Accept revision',exact:true}).click();await expect(page.getByText('Accepted (1)',{exact:true})).toBeVisible();
 await page.getByLabel('Review comment').fill('Please clarify scope');await page.getByRole('button',{name:'Request changes',exact:true}).click();await expect(page.getByText('Changes requested (1)',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Queue rework',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Native rework blocked');
});
test('context changes discard old load results, selected evidence and permission grants',async({page})=>{
 await page.goto('http://127.0.0.1:4189');await expect(page.getByLabel('Project title')).toBeVisible();
 await page.getByLabel('Provider execution',{exact:true}).check();
 await page.evaluate(()=>{const f=(window as any).factoryFixture;f.seedReviews()});await page.getByRole('button',{name:'Refresh factory state'}).click();await page.getByRole('button',{name:'Review queue',exact:true}).click();await page.getByRole('button',{name:/Synthetic task 1/}).click();await expect(page.getByRole('button',{name:'Accept revision',exact:true})).toBeVisible();
 await page.evaluate(()=>{const f=(window as any).factoryFixture;const old=f.clone(f.state);f.switchApi({...f.api,load:()=>new Promise(resolve=>f.late=()=>resolve(old))})});
 await page.evaluate(()=>{const f=(window as any).factoryFixture;const next=f.clone(f.state);next.repositoryRoot='/synthetic/next';next.workspaceId='synthetic-next';next.draft.title='New repository';next.reviews=[];f.switchRoot('/synthetic/next');f.switchApi({...f.api,load:async()=>next});});
 await expect(page.getByRole('button',{name:'Accept revision',exact:true})).toHaveCount(0);
 await page.evaluate(()=>(window as any).factoryFixture.late());
 await page.getByRole('button',{name:'Requirements',exact:true}).click();await expect(page.getByLabel('Project title')).toHaveValue('New repository');await expect(page.getByLabel('Provider execution',{exact:true})).not.toBeChecked();
});
test('invalid argument JSON stays editable and prevents saving a different command',async({page})=>{
 await page.goto('http://127.0.0.1:4189');await page.getByRole('button',{name:'Plan',exact:true}).click();await page.getByRole('button',{name:'Add command',exact:true}).click();
 await page.getByLabel('Absolute executable',{exact:true}).fill('/usr/bin/node');
 const args=page.getByLabel('Arguments · one JSON string per line',{exact:true});await args.fill('"--test"\nnot JSON');await args.blur();
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'Save draft',exact:true})).toBeDisabled();await expect(args).toHaveValue('"--test"\nnot JSON');
 await args.fill('"--test"\n""');await args.blur();await page.getByRole('button',{name:'Save draft',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).factoryFixture.state.draft.commands[0].args)).toEqual(['--test','']);
});
test('generated command IDs stay unique after deletion and skip renamed gaps without changing task references',async({page})=>{
 await page.goto('http://127.0.0.1:4189');await expect(page.getByLabel('Project title')).toBeVisible();await page.getByRole('button',{name:'Plan',exact:true}).click();
 await page.getByRole('button',{name:'Add command',exact:true}).click();await page.getByRole('button',{name:'Add command',exact:true}).click();
 await page.getByLabel('Absolute executable',{exact:true}).nth(0).fill('/synthetic/removed');await page.getByLabel('Absolute executable',{exact:true}).nth(1).fill('/synthetic/remaining');
 await page.getByRole('button',{name:'Add task',exact:true}).click();await page.getByText('Dependencies, path scope & check IDs',{exact:true}).click();
 const refs=page.getByLabel('Verification command IDs · one per line',{exact:true});await refs.fill('check2');
 await page.getByRole('button',{name:'Remove command',exact:true}).nth(0).click();await page.getByRole('button',{name:'Add command',exact:true}).click();
 const ids=page.getByLabel('Command ID',{exact:true});await expect(ids.nth(0)).toHaveValue('check2');await expect(ids.nth(1)).toHaveValue('check3');await expect(refs).toHaveValue('check2');
 // Reserve the next length-based candidate manually, then prove allocation skips both occupied IDs.
 await ids.nth(1).fill('check4');await page.getByRole('button',{name:'Add command',exact:true}).click();await expect(ids.nth(2)).toHaveValue('check3');
 await page.getByRole('button',{name:'Add command',exact:true}).click();await expect(ids.nth(3)).toHaveValue('check5');await expect(refs).toHaveValue('check2');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const draft=await page.evaluate(()=>(window as any).factoryFixture.state.draft);
 expect(draft.commands.map((c:any)=>c.commandId)).toEqual(['check2','check4','check3','check5']);expect(new Set(draft.commands.map((c:any)=>c.commandId)).size).toBe(draft.commands.length);
 expect(draft.commands[0].executable).toBe('/synthetic/remaining');expect(draft.tasks[0].testCommandIds).toEqual(['check2']);
});
test('manual task edits persist scope and exact command IDs; missing providers do not fabricate generation',async({page})=>{
 await page.goto('http://127.0.0.1:4189');await page.getByRole('button',{name:'Plan',exact:true}).click();await page.getByRole('button',{name:'Add task',exact:true}).click();
 await page.getByLabel('Task title',{exact:true}).fill('Scoped validation');await page.getByLabel('Description',{exact:true}).fill('Validate at input');await page.getByLabel('Acceptance criteria · one per line',{exact:true}).fill('Trims whitespace\nRejects empty titles');
 await page.getByText('Dependencies, path scope & check IDs',{exact:true}).click();await page.getByLabel('Dependency task IDs · one per line',{exact:true}).fill('T0');await page.getByLabel('Allowed paths · one per line',{exact:true}).fill('src/validate.ts\ntests/validate.test.ts');await page.getByLabel('Verification command IDs · one per line',{exact:true}).fill('unit');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).factoryFixture.state.draft.tasks[0])).toMatchObject({title:'Scoped validation',dependencies:['T0'],pathScope:['src/validate.ts','tests/validate.test.ts'],testCommandIds:['unit'],acceptanceCriteria:['Trims whitespace','Rejects empty titles']});
 await page.getByLabel('Planning / execution provider').selectOption('claude');await expect(page.getByText(/Provider blocked or unavailable/)).toBeVisible();await expect(page.getByRole('button',{name:'Generate plan',exact:true})).toBeDisabled();
 await page.getByLabel('Planning / execution provider').selectOption('codex');await page.evaluate(()=>{const f=(window as any).factoryFixture;f.state.providers[0].supported=false;f.state.providers[0].reason='Capabilities checked on consented generate / approve';});await page.getByRole('button',{name:'Refresh factory state'}).click();
 for(const label of ['Provider execution','Provider configuration execution','Workspace writes','Execution context and exact commands'])await page.getByLabel(label,{exact:true}).check();
 await page.getByLabel('Generation instruction',{exact:true}).fill('Improve this plan');await page.getByRole('button',{name:'Generate plan',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Provider blocked: native trust required');
 await expect(page.getByLabel('Task title',{exact:true})).toHaveValue('Scoped validation');
});
test('a late artifact cannot overwrite a different revision and unsupported diagram syntax stays source-only',async({page})=>{
 await page.goto('http://127.0.0.1:4189');await expect(page.getByLabel('Project title')).toBeVisible();
 await page.evaluate(()=>{const f=(window as any).factoryFixture;f.seedReviews();const original=f.api.readArtifact;f.api.readArtifact=(id:string)=>id==='patch-1'?new Promise(resolve=>f.lateArtifact=()=>resolve(f.clone(f.artifacts[id]))):original(id)});
 await page.getByRole('button',{name:'Refresh factory state'}).click();await page.getByRole('button',{name:'Review queue',exact:true}).click();await page.getByRole('button',{name:/Synthetic task 1/}).click();await page.getByRole('button',{name:'src/task-1.ts',exact:true}).click();await page.getByRole('button',{name:/Synthetic task 2/}).click();await page.getByRole('button',{name:'src/task-2.ts',exact:true}).click();await page.evaluate(()=>(window as any).factoryFixture.lateArtifact());await expect(page.locator('.patch')).toContainText('a/src/task-2.ts');await expect(page.locator('.patch')).not.toContainText('a/src/task-1.ts');
 await page.getByRole('button',{name:'Architecture',exact:true}).click();await page.getByLabel('Diagram source',{exact:true}).fill('flowchart LR\nclick A "https://example.com"');await expect(page.getByText(/Unsupported diagram syntax/)).toBeVisible();await expect(page.getByRole('img',{name:'Safe flowchart preview'})).toHaveCount(0);expect(await page.locator('main a').count()).toBe(0);
});
test('revision switches clear obsolete artifact spinners without clearing a newer pending artifact',async({page})=>{
 await page.goto('http://127.0.0.1:4189');await expect(page.getByLabel('Project title')).toBeVisible();
 await page.evaluate(()=>{const f=(window as any).factoryFixture;f.seedReviews();f.api.readArtifact=(id:string)=>new Promise(resolve=>{(f.artifactResolvers??={})[id]=()=>resolve(f.clone(f.artifacts[id]))})});
 await page.getByRole('button',{name:'Refresh factory state'}).click();await page.getByRole('button',{name:'Review queue',exact:true}).click();
 const spinner=page.getByRole('status').filter({hasText:'Loading saved artifact…'});
 await page.getByRole('button',{name:/Synthetic task 1/}).click();await page.getByRole('button',{name:'src/task-1.ts',exact:true}).click();await expect(spinner).toBeVisible();
 await page.getByRole('button',{name:/Synthetic task 2/}).click();await expect(page.getByRole('heading',{name:'Synthetic task 2',exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).factoryFixture.artifactResolvers['patch-1']());
 await expect(spinner).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'Loading immutable revision…'})).toHaveCount(0);await expect(page.locator('.patch')).toHaveCount(0);
 await page.getByRole('button',{name:/Synthetic task 1/}).click();await page.getByRole('button',{name:'src/task-1.ts',exact:true}).click();await expect(spinner).toBeVisible();
 await page.getByRole('button',{name:/Synthetic task 2/}).click();await page.getByRole('button',{name:'src/task-2.ts',exact:true}).click();await expect(spinner).toBeVisible();
 await page.evaluate(()=>(window as any).factoryFixture.artifactResolvers['patch-1']());await expect(spinner).toBeVisible();await expect(page.locator('.patch')).toHaveCount(0);
 await page.evaluate(()=>(window as any).factoryFixture.artifactResolvers['patch-2']());await expect(spinner).toHaveCount(0);await expect(page.locator('.patch')).toContainText('a/src/task-2.ts');await expect(page.locator('.patch')).not.toContainText('a/src/task-1.ts');
});
test('native stop failure keeps the run live, loaded runs poll without restart, and late saves cannot change repositories',async({page})=>{
 await page.goto('http://127.0.0.1:4189');await expect(page.getByLabel('Project title')).toBeVisible();
 await page.evaluate(()=>{const f=(window as any).factoryFixture;f.state.runState='running';f.api.stop=async()=>{f.calls.push('stop');throw Error('Native stop cleanup failed; process still running')}});await page.getByRole('button',{name:'Refresh factory state'}).click();await page.getByRole('button',{name:'Run',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).factoryFixture.calls.filter((s:string)=>s==='load').length)).toBeGreaterThanOrEqual(3);
 expect(await page.evaluate(()=>(window as any).factoryFixture.calls)).not.toContain('start');await page.getByRole('button',{name:'Stop run',exact:true}).click();await expect(page.getByRole('alert')).toContainText('cleanup failed');await expect(page.getByText('Run state: running',{exact:true})).toBeVisible();
 await page.evaluate(()=>{const f=(window as any).factoryFixture;f.state.runState='stopped'});await page.getByRole('button',{name:'Refresh factory state'}).click();await page.getByRole('button',{name:'Requirements',exact:true}).click();await page.getByLabel('Project title').fill('Old unsaved draft');
 await page.evaluate(()=>{const f=(window as any).factoryFixture;const old=f.clone(f.state);f.api.saveDraft=()=>new Promise(resolve=>f.lateSave=()=>resolve(old))});await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await page.evaluate(()=>{const f=(window as any).factoryFixture;const next=f.clone(f.state);next.repositoryRoot='/synthetic/new-root';next.workspaceId='new-root';next.draft.title='New root draft';f.switchRoot(next.repositoryRoot);f.switchApi({...f.api,load:async()=>next})});await expect(page.getByLabel('Project title')).toHaveValue('New root draft');await page.evaluate(()=>(window as any).factoryFixture.lateSave());await expect(page.getByLabel('Project title')).toHaveValue('New root draft');
});
for(const [width,height] of [[1440,900],[1024,768]])for(const theme of ['dark','light']){
 test(`actual Angular visual gates ${width}x${height} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4189');await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await expect(page.getByLabel('Project title')).toBeVisible();
  await mkdir(evidence,{recursive:true});const gates:any[]=[];
  const capture=async(name:string)=>{
   const result=await page.evaluate(()=>{const footer=document.querySelector('rift-factory-workbench footer')!;const box=footer.getBoundingClientRect();return {footerVisible:box.top>=0&&box.bottom<=innerHeight,pageFits:document.documentElement.scrollWidth<=innerWidth,buttons:[...footer.querySelectorAll('button')].map(button=>{const r=button.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {label:button.textContent,visible:r.x>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,centerHit:hit===button||button.contains(hit)};})}});
   expect(result.footerVisible).toBe(true);expect(result.pageFits).toBe(true);for(const b of result.buttons){expect(b.visible).toBe(true);expect(b.centerHit).toBe(true);}gates.push({name,...result});await page.screenshot({path:`${evidence}/${width}-${theme}-${name}.png`});
  };
  await capture('01-requirements');await page.getByRole('button',{name:'Architecture',exact:true}).click();await capture('02-architecture');
  await page.getByRole('button',{name:'Plan',exact:true}).click();await page.getByRole('button',{name:'Add task',exact:true}).click();await page.getByLabel('Task title',{exact:true}).fill('Synthetic scoped implementation');await capture('03-plan');await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await page.evaluate(()=>{const f=(window as any).factoryFixture;f.seedReviews();f.state.runState='completed';f.state.tasks=[{id:'T1',title:'Synthetic task 1',status:'readyforreview',attempts:1,message:'Synthetic saved revision available'},{id:'T2',title:'Synthetic task 2',status:'readyforreview',attempts:1,message:'Synthetic saved revision available'}]});await page.getByRole('button',{name:'Refresh factory state'}).click();await page.getByRole('button',{name:'Run',exact:true}).click();await capture('04-queued-run');
  await page.getByRole('button',{name:'Review queue',exact:true}).click();await page.getByRole('button',{name:/Synthetic task 1/}).click();await page.getByRole('button',{name:'src/task-1.ts',exact:true}).click();await expect(page.locator('.patch')).toBeVisible();await capture('05-immutable-patch');
  await page.getByRole('button',{name:'Checks',exact:true}).click();await capture('06-check-receipts');await page.getByRole('button',{name:'Documents',exact:true}).click();await page.getByRole('button',{name:/requirements-1.md/}).click();await capture('07-local-documents');await page.getByRole('button',{name:'Diagrams',exact:true}).click();await page.getByRole('button',{name:/architecture-1.mmd/}).click();await expect(page.getByRole('img',{name:'Safe flowchart preview'})).toBeVisible();await capture('08-safe-diagram');
  await writeFile(`${evidence}/${width}-${theme}-gates.json`,JSON.stringify({syntheticApi:true,actualAngular:true,width,height,theme,pageErrors,externalRequests,gates},null,2));
 });
}
test('workspace artifacts remain inspectable without a review and mode exits emit exact routing values',async({page})=>{
 await page.goto('http://127.0.0.1:4189');await expect(page.getByLabel('Project title')).toBeVisible();await page.evaluate(()=>{const f=(window as any).factoryFixture;f.seedReviews();f.state.artifacts=[f.artifacts['doc-1'].record]});await page.getByRole('button',{name:'Refresh factory state'}).click();await page.getByRole('button',{name:/requirements-1.md/}).click();await expect(page.locator('aside pre')).toContainText('# Synthetic local document');
 await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('button',{name:'Review mode',exact:true}).click();expect(await page.evaluate(()=>(window as any).factoryFixture.exits)).toEqual(['home','review']);
});
test('vertical flow direction uses bounded owned arrowheads and oversize artifacts are rejected',async({page})=>{
 await page.goto('http://127.0.0.1:4189');await page.getByRole('button',{name:'Architecture',exact:true}).click();await page.getByLabel('Diagram source',{exact:true}).fill('flowchart TD\nA[Input] --> B[Output]');await expect(page.locator('main svg polygon')).toHaveCount(1);
 await page.evaluate(()=>{const f=(window as any).factoryFixture;f.seedReviews();f.artifacts['patch-1'].content='x'.repeat(1048577)});await page.getByRole('button',{name:'Refresh factory state'}).click();await page.getByRole('button',{name:'Review queue',exact:true}).click();await page.getByRole('button',{name:/Synthetic task 1/}).click();await page.getByRole('button',{name:'src/task-1.ts',exact:true}).click();await expect(page.getByRole('alert')).toContainText('1 MiB');await expect(page.locator('.patch')).toHaveCount(0);
});
test('manual planning preserves drafts on a native save failure',async({page})=>{
 await page.goto('http://127.0.0.1:4189');
 await expect(page.getByRole('heading',{name:'Requirements',exact:true})).toBeVisible();
 await page.getByLabel('Project title').fill('My unsaved idea');
 await page.evaluate(()=>{(window as any).factoryFixture.failSave=true});
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Native permission denied');
 await expect(page.getByLabel('Project title')).toHaveValue('My unsaved idea');
});
