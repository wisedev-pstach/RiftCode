import { test, expect, type Page } from '@playwright/test';

const notGit = "Error invoking remote method 'repository:open': Error: fatal: not a git repository (or any of the parent directories): .git";
const gallery = '/opt/data/output/riftcode/welcome-refresh';
const browserErrors = new WeakMap<Page,string[]>();
test.afterEach(async ({page}) => { expect(browserErrors.get(page) ?? []).toEqual([]); });
async function welcome(page: Page, failure: string | null = notGit, theme = 'dark') {
  await page.addInitScript(({failure, theme}) => {
    localStorage.setItem('rift:theme', theme);
    const f = window as any;
    f.welcomeCalls = [];
    f.rift = {
      platform: 'linux', setTheme: async () => {}, listAgents: async () => [],
      checkForUpdate: async () => ({updateAvailable:false,releaseNotes:[],error:null}),
      onRepositoryChanged: () => () => {}, onAgentEvent: () => () => {},
      openRepository: async () => { f.welcomeCalls.push('open'); throw new Error(failure ?? ''); },
      chooseRepository: async () => { f.welcomeCalls.push('choose'); return null; },
    };
  }, {failure,theme});
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type()==='error') errors.push(m.text()); });
  await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
  browserErrors.set(page,errors);
  await page.goto('/');
  await expect(page.getByRole('heading', {name:'Open a Git repository',exact:true})).toBeVisible();
}
async function label(page: Page) {
  await page.evaluate(() => {
    const label = document.createElement('div');
    label.textContent = 'Synthetic browser bridge · welcome states only · no native picker or private data';
    label.style.cssText = 'position:fixed;bottom:10px;right:12px;z-index:1000;font:10px sans-serif;padding:5px 8px;background:#252d38;color:#fff;border:1px solid #66717c;border-radius:4px;pointer-events:none';
    document.body.append(label);
  });
}

for (const width of [1024, 1440]) for (const theme of ['dark', 'light']) test(`welcome hierarchy and reachable actions ${theme} ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:600});
  await welcome(page,notGit,theme);
  const primary = page.getByRole('button',{name:'Choose repository',exact:true});
  const retry = page.getByRole('button',{name:'Retry',exact:true});
  await expect(page.locator('.repository-welcome .primary-button')).toHaveCount(1);
  const p = (await primary.boundingBox())!, r = (await retry.boundingBox())!;
  expect(p.height).toBeGreaterThanOrEqual(36); expect(p.height).toBeLessThanOrEqual(40);
  expect(r.y).toBe(p.y); expect(r.x-p.x-p.width).toBeGreaterThanOrEqual(10);
  expect(await primary.evaluate(el => {const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;})).toBe(true);
  const group = (await page.locator('.repository-welcome').boundingBox())!;
  expect(group.width).toBeLessThanOrEqual(460); expect(group.y).toBeGreaterThanOrEqual(24);
  expect(group.y+group.height).toBeLessThanOrEqual(576);
  await label(page);
  await page.screenshot({path:`${gallery}/synthetic-${theme}-${width}-error.png`});
  await page.getByText('Technical details',{exact:true}).click();
  await expect(page.locator('.repository-error-details pre')).toBeVisible();
  await page.screenshot({path:`${gallery}/synthetic-${theme}-${width}-details.png`});
});

test('picker busy state prevents duplicate calls; cancel preserves error; Retry uses the open bridge', async ({page}) => {
  await welcome(page);
  await page.evaluate(() => {
    const f=window as any;
    f.rift.chooseRepository=()=>{f.welcomeCalls.push('choose');return new Promise(resolve=>f.cancelPicker=()=>resolve(null));};
    f.rift.openRepository=()=>{f.welcomeCalls.push('open');return new Promise((_resolve,reject)=>f.failRetry=()=>reject(new Error('EACCES: permission denied /synthetic/checkout')));};
  });
  await page.getByRole('button',{name:'Choose repository',exact:true}).click();
  const choosing=page.getByRole('button',{name:'Choosing…',exact:true});
  await expect(choosing).toBeDisabled();
  await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeDisabled();
  await choosing.evaluate(el=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
  expect(await page.evaluate(()=>(window as any).welcomeCalls)).toEqual(['open','choose']);
  await page.evaluate(()=>(window as any).cancelPicker());
  await expect(page.getByRole('button',{name:'Choose repository',exact:true})).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveText('This folder is not a Git repository. Choose an existing checkout.');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.getByRole('status',{name:'Opening repository',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Choose repository',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).welcomeCalls)).toEqual(['open','choose','open']);
  await page.evaluate(()=>(window as any).failRetry());
  await expect(page.getByRole('alert')).toHaveText('Could not open the repository. Try again or choose another checkout.');
  await page.getByText('Technical details',{exact:true}).click();
  await expect(page.locator('.repository-error-details pre')).toHaveText('EACCES: permission denied /synthetic/checkout');
});

for (const width of [1024,1440]) for (const theme of ['dark','light']) test(`neutral welcome and deferred loading ${theme} ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:600});
  // Empty synthetic rejection selects the existing no-error presentation; not a native startup claim.
  await welcome(page,'',theme);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Retry',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Choose repository',exact:true})).toBeVisible();
  await label(page);
  await page.screenshot({path:`${gallery}/synthetic-${theme}-${width}-welcome.png`});
  await page.evaluate(() => {const f=window as any;f.rift.chooseRepository=async()=>{throw new Error('fatal: not a git repository');};f.rift.openRepository=()=>{f.welcomeCalls.push('open');return new Promise((_resolve,reject)=>f.finishLoading=()=>reject(new Error('fatal: not a git repository')));};});
  await page.getByRole('button',{name:'Choose repository',exact:true}).click();
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  const status=page.getByRole('status',{name:'Opening repository',exact:true});
  await expect(status).toContainText('Opening your workspace');
  const bounds=(await status.boundingBox())!; expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThan(600);
  await page.screenshot({path:`${gallery}/synthetic-${theme}-${width}-loading.png`});
  await page.evaluate(()=>(window as any).finishLoading());
  await expect(page.getByRole('alert')).toContainText('This folder is not a Git repository.');
});

test('picker failure retains detail and another explicit choice opens the returned repository', async ({page}) => {
  await welcome(page);
  await page.evaluate(() => {const f=window as any;f.rift.chooseRepository=async()=>{f.welcomeCalls.push('choose');throw new Error('Synthetic picker unavailable');};});
  await page.getByRole('button',{name:'Choose repository',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Could not open the repository.');
  await page.getByText('Technical details',{exact:true}).click();
  await expect(page.locator('.repository-error-details pre')).toHaveText('Synthetic picker unavailable');
  await page.evaluate(() => {
    const f=window as any;
    f.rift.chooseRepository=async()=>{f.welcomeCalls.push('choose');return {root:'/synthetic/checkout',name:'synthetic-checkout',branch:'main',baseBranch:'main',targetBranch:null,targetBranches:[],comparisonId:'working-tree',comparisonLabel:'Working tree',startRevision:'HEAD',endRevision:null,includeUntracked:true,comparisons:[{id:'working-tree',kind:'working-tree',label:'Working tree',detail:'Synthetic'}],files:[],additions:0,deletions:0,updatedAt:0};};
    f.rift.listRepositoryFiles=async()=>[];f.rift.promptSummaries=async()=>[];
  });
  await page.getByRole('button',{name:'Choose repository',exact:true}).click();
  await expect(page.getByRole('button',{name:'synthetic-checkout',exact:true})).toBeVisible();
  await expect(page.locator('.repository-welcome')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).welcomeCalls)).toEqual(['open','choose','choose']);
});

test('short-height long technical detail stays bounded without obstructing the primary action', async ({page}) => {
  await page.setViewportSize({width:1024,height:360});
  await welcome(page,'Synthetic failure\n'+'very-long-diagnostic-path/'.repeat(200));
  await page.getByText('Technical details',{exact:true}).click();
  const choose=page.getByRole('button',{name:'Choose repository',exact:true});
  expect(await choose.evaluate(el=>{const b=el.getBoundingClientRect();return b.y>=0&&b.bottom<=innerHeight&&document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===el;})).toBe(true);
  const pre=page.locator('.repository-error-details pre');
  const group=(await page.locator('.repository-welcome').boundingBox())!;
  expect(group.y+group.height).toBeLessThanOrEqual(336);
  expect((await pre.boundingBox())!.height).toBeLessThanOrEqual(132);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await label(page);await page.screenshot({path:`${gallery}/synthetic-dark-1024-short-details.png`});
});

test('not-Git failure is friendly with escaped opt-in original technical details', async ({page}) => {
  const original = notGit + '\n<img src=x onerror="window.unsafeWelcome=true">';
  await welcome(page, original);
  await expect(page.getByRole('alert')).toHaveText('This folder is not a Git repository. Choose an existing checkout.');
  await expect(page.locator('.repository-error-details pre')).not.toBeVisible();
  await page.getByText('Technical details', {exact:true}).click();
  await expect(page.locator('.repository-error-details pre')).toHaveText(original);
  expect(await page.evaluate(() => (window as any).unsafeWelcome)).toBeUndefined();
  await expect(page.locator('.repository-error-details img')).toHaveCount(0);
});
