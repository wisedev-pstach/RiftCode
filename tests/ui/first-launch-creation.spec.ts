import {test,expect,type Page} from '@playwright/test';
import {installEntryFixture} from '../fixtures/factory-entry';
import {mkdtemp,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalRepository} from '../../src/main/create-repository';
import {loadRepository} from '../../src/main/git';
const gallery='/opt/data/output/riftcode/first-launch-creation';
async function welcome(page:Page,theme='dark'){
 await installEntryFixture(page);
 await page.addInitScript(theme=>{
  localStorage.setItem('rift:theme',theme);
  const w=window as any;w.createCalls=[];
  w.rift.openRepository=async()=>{throw Error('fatal: not a git repository');};
  w.rift.createRepository=async(name:string)=>{w.createCalls.push(name);w.fixtureRepository={...w.fixtureRepository,root:'/fixture/'+name,name,branch:'main',files:[]};return w.fixtureRepository;};
 },theme);
 await page.goto('/');
}
test('welcome creates directly into Creation with literal name and no automatic provider action',async({page})=>{
 await welcome(page);
 await page.getByRole('button',{name:'Create repository',exact:true}).click();
 await page.getByRole('textbox',{name:'Project name',exact:true}).fill('New project');
 await page.getByRole('button',{name:'Choose parent and create',exact:true}).click();
 await expect(page.locator('rift-factory-workbench')).toBeVisible();
 await expect(page.getByRole('button',{name:'New project',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).createCalls)).toEqual(['New project']);
 const factoryCalls=await page.evaluate(()=>(window as any).factoryCalls as string[]);
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.reviewStart||c.input))).toEqual([]);
 expect(factoryCalls.length).toBeGreaterThan(0);expect(factoryCalls.every(call=>call==='load')).toBe(true);
});

test('leaving and returning to welcome cannot resurrect a pending creation',async({page})=>{
 await welcome(page);
 await page.evaluate(()=>{const w=window as any;w.rift.createRepository=()=>new Promise(resolve=>w.finishCreate=()=>resolve({...w.fixtureRepository,root:'/fixture/obsolete',name:'obsolete',files:[]}));});
 await page.getByRole('button',{name:'Create repository',exact:true}).click();
 await page.getByRole('textbox',{name:'Project name',exact:true}).fill('obsolete');
 await page.getByRole('button',{name:'Choose parent and create',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).finishCreate)).toBe('function');
 await page.evaluate(()=>{const w=window as any,c=w.ng.getComponent(document.querySelector('rift-root'));c.selectWorkflow('review');c.selectWorkflow('home');w.finishCreate();});
 await expect.poll(()=>page.evaluate(()=>(window as any).ng.getComponent(document.querySelector('rift-root')).repositoryCreating())).toBe(false);
 await expect(page.locator('.repository-welcome')).toBeVisible();
 await expect(page.locator('rift-factory-workbench')).toHaveCount(0);
});

const errors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{const messages:string[]=[];errors.set(page,messages);page.on('pageerror',e=>messages.push(e.message));});
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));

async function createForm(page:Page,name='Kept project'){
 await page.getByRole('button',{name:'Create repository',exact:true}).click();
 await page.getByRole('textbox',{name:'Project name',exact:true}).fill(name);
}
test('validation preserves literal input and never calls native creation for an unsafe name',async({page})=>{
 await welcome(page);await createForm(page,'../unsafe');
 const input=page.getByRole('textbox',{name:'Project name',exact:true});
 for(const name of ['../unsafe','CON','trailing.',' leading','trailing ','a\\b']){
  await input.fill(name);await expect(input).toHaveValue(name);
  await expect(page.getByRole('button',{name:'Choose parent and create',exact:true})).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('project name');
 }
 expect(await page.evaluate(()=>(window as any).createCalls)).toEqual([]);
});
test('native cancel and collision keep the form and name; retry is explicit',async({page})=>{
 await welcome(page);await createForm(page);
 await page.evaluate(()=>{const w=window as any;w.rift.createRepository=async(name:string)=>{w.createCalls.push(name);return null;};});
 await page.getByRole('button',{name:'Choose parent and create',exact:true}).click();
 await expect(page.getByRole('button',{name:'Choose parent and create',exact:true})).toBeEnabled();
 await expect(page.getByRole('textbox',{name:'Project name',exact:true})).toHaveValue('Kept project');
 await expect(page.getByRole('alert')).toHaveCount(0);
 await page.evaluate(()=>{const w=window as any;w.rift.createRepository=async(name:string)=>{w.createCalls.push(name);throw Error('A file or folder already exists. Choose another name.');};});
 await page.getByRole('button',{name:'Choose parent and create',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('A file or folder already exists. Choose another name.');
 await expect(page.getByRole('textbox',{name:'Project name',exact:true})).toHaveValue('Kept project');
 expect(await page.evaluate(()=>(window as any).createCalls)).toEqual(['Kept project','Kept project']);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(page.getByRole('button',{name:'Choose repository',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create repository',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Project name',exact:true})).toHaveValue('Kept project');
});
for(const outcome of ['resolve','reject'])for(const change of ['root','view','dispose'])test(`late native ${outcome} cannot affect replacement ${change}`,async({page})=>{
 await welcome(page);await createForm(page);
 await page.evaluate(outcome=>{const w=window as any;w.rift.createRepository=()=>new Promise((resolve,reject)=>w.finishCreate=()=>outcome==='resolve'?resolve({...w.fixtureRepository,root:'/fixture/obsolete',name:'obsolete',files:[]}):reject(Error('obsolete failure')));},outcome);
 await page.getByRole('button',{name:'Choose parent and create',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).finishCreate)).toBe('function');
 await page.evaluate(change=>{const w=window as any,c=w.ng.getComponent(document.querySelector('rift-root'));w.component=c;
  if(change==='root')c.acceptRepository({...w.fixtureRepository,root:'/fixture/newer',name:'newer',files:[]});
  if(change==='view')c.selectWorkflow('review');
  if(change==='dispose')c.ngOnDestroy();
  w.finishCreate();
 },change);
 await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
 expect(await page.evaluate(()=>(window as any).component.repositoryCreationError())).toBeNull();
 expect(await page.evaluate(()=>(window as any).component.repository()?.name??null)).toBe(change==='root'?'newer':null);
 await expect(page.locator('rift-factory-workbench')).toHaveCount(0);
});
test('newer pending creation owns its spinner and error after obsolete rejection',async({page})=>{
 await welcome(page);await createForm(page);
 await page.evaluate(()=>{const w=window as any;let count=0;w.rift.createRepository=()=>new Promise((_resolve,reject)=>{if(count++===0)w.rejectOld=()=>reject(Error('obsolete error'));else w.rejectNew=()=>reject(Error('current error'));});});
 await page.getByRole('button',{name:'Choose parent and create',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).rejectOld)).toBe('function');
 await page.evaluate(()=>{const w=window as any,c=w.ng.getComponent(document.querySelector('rift-root'));c.selectWorkflow('review');c.selectWorkflow('home');});
 await page.getByRole('button',{name:'Choose parent and create',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).rejectNew)).toBe('function');
 await page.evaluate(()=>(window as any).rejectOld());
 await expect(page.getByRole('button',{name:'Creating…',exact:true})).toBeDisabled();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await page.evaluate(()=>(window as any).rejectNew());
 await expect(page.getByRole('alert')).toHaveText('current error');
});
test('startup in an existing repository never presents the Create welcome',async({page})=>{
 await installEntryFixture(page);await page.addInitScript(()=>(window as any).rift.createRepository=async()=>{throw Error('must not create');});await page.goto('/');
 await expect(page.getByRole('heading',{name:'Choose your workflow'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create repository',exact:true})).toHaveCount(0);
 await expect(page.locator('rift-factory-workbench')).toHaveCount(0);
});
test('old native bridges retain Open-only welcome',async({page})=>{
 await welcome(page);await page.addInitScript(()=>delete (window as any).rift.createRepository);await page.reload();
 await expect(page.getByRole('heading',{name:'Open a Git repository',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create repository',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Choose repository',exact:true})).toBeVisible();
});
async function screenshotLabel(page:Page){
 await page.evaluate(()=>{const el=document.createElement('div');el.textContent='Synthetic bridge · actual App · no native picker/provider';el.style.cssText='position:fixed;bottom:10px;right:12px;font:10px sans-serif;background:#252d38;color:white;padding:6px;z-index:9999';document.body.append(el);});
}
for(const width of [940,1440])for(const theme of ['dark','light'])test(`first launch screenshots ${theme} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await welcome(page,theme);
 await expect(page.getByRole('button',{name:'Create repository',exact:true})).toBeVisible();await screenshotLabel(page);
 await page.screenshot({path:`${gallery}/synthetic-${theme}-${width}-welcome.png`});
 await createForm(page,'New project');
 const action=page.getByRole('button',{name:'Choose parent and create',exact:true});
 expect(await action.evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight&&document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===el;})).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`${gallery}/synthetic-${theme}-${width}-form.png`});
 await page.evaluate(()=>{const w=window as any;w.originalCreate=w.rift.createRepository;w.rift.createRepository=()=>{w.pendingCreateCalls=(w.pendingCreateCalls??0)+1;return new Promise((_resolve,reject)=>w.finishCreateError=()=>reject(Error('A folder with this name already exists. Choose another name or parent folder.')));};});
 await action.click();
 await expect(page.getByRole('button',{name:'Creating…',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeDisabled();
 await expect(page.getByRole('textbox',{name:'Project name',exact:true})).toBeDisabled();
 await page.locator('form').evaluate(el=>el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(await page.evaluate(()=>(window as any).pendingCreateCalls)).toBe(1);
 await page.screenshot({path:`${gallery}/synthetic-${theme}-${width}-picker-pending.png`});
 await page.evaluate(()=>(window as any).finishCreateError());
 await expect(page.getByRole('alert')).toContainText('already exists');
 await page.screenshot({path:`${gallery}/synthetic-${theme}-${width}-collision.png`});
 await page.evaluate(()=>{const w=window as any;w.rift.createRepository=w.originalCreate;});
 await action.click();await expect(page.locator('rift-factory-workbench')).toBeVisible();
 await page.screenshot({path:`${gallery}/synthetic-${theme}-${width}-creation.png`});
});
test('actual App create action opens a real scratch unborn Git checkout directly in Creation',async({page})=>{
 const parent=await mkdtemp(join(tmpdir(),'rift-create-browser-'));let picks=0;
 await page.exposeFunction('nativeCreateFixture',(name:string)=>createLocalRepository(name,{chooseParent:async()=>{picks++;return parent;},assertCurrent:()=>{},openRepository:loadRepository}));
 await installEntryFixture(page);
 await page.addInitScript(()=>{const w=window as any;w.rift.openRepository=async()=>{throw Error('not a git repository');};w.rift.createRepository=async(name:string)=>{const repository=await w.nativeCreateFixture(name);w.fixtureRepository=repository;return repository;};});
 await page.goto('/');await createForm(page,'Real local fixture');
 await page.getByRole('button',{name:'Choose parent and create',exact:true}).click();
 await expect(page.locator('rift-factory-workbench')).toBeVisible();
 await expect(page.getByRole('button',{name:'Real local fixture',exact:true})).toHaveAttribute('title',join(parent,'Real local fixture'));
 expect(picks).toBe(1);expect(await readdir(join(parent,'Real local fixture'))).toEqual(['.git']);
 const snapshot=await loadRepository(join(parent,'Real local fixture'));expect(snapshot.branch).toBe('main');expect(snapshot.files).toEqual([]);
 expect(await page.evaluate(()=>(window as any).factoryCalls.every((call:string)=>call==='load'))).toBe(true);
});
test('late existing provider-list reply cannot change successful Creation entry',async({page})=>{
 await installEntryFixture(page);
 await page.addInitScript(()=>{const w=window as any;w.rift.openRepository=async()=>{throw Error('not a git repository');};w.rift.listAgents=()=>new Promise(resolve=>w.finishAgentList=()=>resolve([]));w.rift.createRepository=async()=>{w.fixtureRepository={...w.fixtureRepository,root:'/fixture/new-local',name:'new-local',files:[]};return w.fixtureRepository;};});
 await page.goto('/');await createForm(page,'new-local');
 await page.getByRole('button',{name:'Choose parent and create',exact:true}).click();await expect(page.locator('rift-factory-workbench')).toBeVisible();
 await page.evaluate(()=>(window as any).finishAgentList());
 await expect(page.locator('rift-factory-workbench')).toBeVisible();await expect(page.getByRole('button',{name:'new-local',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).fixtureCalls.filter((c:any)=>c.start||c.reviewStart||c.input))).toEqual([]);
});
test('long initialization diagnostics do not push retry and Cancel beyond a short welcome viewport',async({page})=>{
 await page.setViewportSize({width:940,height:480});await welcome(page);await createForm(page);
 await page.evaluate(()=>{(window as any).rift.createRepository=async()=>{throw Error('Git initialization failed. '+'synthetic-diagnostic '.repeat(1000));};});
 await page.getByRole('button',{name:'Choose parent and create',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Git initialization failed.');
 const action=page.getByRole('button',{name:'Choose parent and create',exact:true});
 expect(await action.evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight&&document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===el;})).toBe(true);
});
