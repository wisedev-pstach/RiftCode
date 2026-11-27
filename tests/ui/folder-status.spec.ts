import {test, expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('rift:theme','dark');
  const f=window as any;
  const changed=(path:string,status:string)=>({path,status,additions:1,deletions:0});
  f.folderRepository={root:'/fixture/folder-status',name:'Folder status fixture',branch:'feature/status',baseBranch:'main',targetBranch:null,targetBranches:[],comparisonId:'working-tree',comparisonLabel:'Working tree',startRevision:'HEAD',endRevision:null,includeUntracked:true,comparisons:[{id:'working-tree',kind:'working-tree',label:'Working tree',detail:'Synthetic fixture'}],files:[changed('mixed/new.ts','added'),changed('mixed/nested/edit.ts','modified'),changed('added/new.ts','added'),changed('modified/edit.ts','modified'),changed('deleted/old.ts','deleted'),changed('renamed/new.ts','renamed'),changed('untracked/new.ts','untracked')],additions:7,deletions:0,updatedAt:0};
  f.rift={platform:'linux',setTheme:async()=>{},checkForUpdate:async()=>({currentVersion:'0.8.3',latestVersion:null,releaseNotes:[],updateAvailable:false,installSupported:false,error:null}),openRepository:async()=>f.folderRepository,refreshRepository:async()=>({...f.folderRepository}),listRepositoryFiles:async()=>[...f.folderRepository.files.map((x:any)=>x.path),'unchanged/readme.md'],getFilePatch:async(path:string)=>({path,binary:false,patch:'@@ -1 +1 @@\n-old\n+new\n'}),listAgents:async()=>[],onRepositoryChanged:(callback:any)=>{f.folderChanged=callback;return()=>{};},onAgentEvent:()=>()=>{}};
 });
 await page.goto('/');
});
const folder=(page:any,path:string)=>page.locator('.explorer-folder-row').filter({has:page.locator(`[data-explorer-path="${path}"]`)});

test('Changes remains a flat ordered file list with nested paths filters and reviewed behavior',async({page})=>{
 const paths=['mixed/new.ts','mixed/nested/edit.ts','added/new.ts','modified/edit.ts','deleted/old.ts','renamed/new.ts','untracked/new.ts'];
 const visiblePaths=()=>page.locator('.file-row').evaluateAll(rows=>rows.map(row=>row.getAttribute('title')));
 await expect(page.locator('.explorer-folder-row')).toHaveCount(0);
 await expect(page.locator('.explorer-folder-toggle, .folder-status')).toHaveCount(0);
 await expect.poll(visiblePaths).toEqual(paths);
 await expect(page.locator('.file-row[title="mixed/new.ts"] .status')).toHaveText('A');
 await expect(page.locator('.file-row[title="mixed/nested/edit.ts"] .status')).toHaveText('M');
 await page.getByRole('textbox',{name:'Exclude files by wildcard'}).fill('*edit.ts');
 await expect(page.locator('.file-row')).toHaveCount(5);
 expect(await visiblePaths()).toEqual(paths.filter(path=>!path.endsWith('edit.ts')));
 await page.getByRole('button',{name:'Clear file filters'}).click();
 await expect.poll(visiblePaths).toEqual(paths);
 const nested=page.locator('.file-row[title="mixed/nested/edit.ts"]');
 await nested.focus();await page.keyboard.press('Enter');await expect(nested).toHaveClass(/selected/);
 await nested.click({button:'right'});
 await page.getByRole('menuitem').filter({hasText:'Mark reviewed'}).click();
 await expect(nested).toHaveClass(/reviewed/);
 await page.getByRole('button',{name:'File list options',exact:true}).click();
 await page.getByRole('button',{name:'Hide reviewed files',exact:true}).click();
 await expect(nested).toHaveCount(0);
 expect(await visiblePaths()).toEqual(paths.filter(path=>path!=='mixed/nested/edit.ts'));
 await expect(page.locator('.explorer-folder-row, .explorer-folder-toggle')).toHaveCount(0);
});

test('Explorer preserves status kinds unchanged folders left checkboxes keyboard and live comparison updates',async({page})=>{
 await page.getByRole('button',{name:'Explorer',exact:true}).click();
 for(const [path,label] of [['mixed','A/M'],['added','A'],['modified','M'],['deleted','D'],['renamed','R'],['untracked','U']])await expect(folder(page,path).locator('.folder-status')).toHaveText(label);
 await page.getByRole('button',{name:'Full',exact:true}).click();
 await expect(folder(page,'unchanged')).toBeVisible();await expect(folder(page,'unchanged').locator('.folder-status')).toHaveCount(0);
 const row=folder(page,'mixed'),toggle=row.locator('.explorer-folder-toggle');
 const before=await toggle.getAttribute('aria-expanded');
 const checkbox=row.getByRole('button',{name:'Mark folder reviewed',exact:true});
 const [a,b]=await Promise.all([checkbox.boundingBox(),toggle.boundingBox()]);expect(a!.x+a!.width).toBeLessThanOrEqual(b!.x);
 await checkbox.click();await expect(toggle).toHaveAttribute('aria-expanded',before!);
 await toggle.focus();await page.keyboard.press('ArrowRight');await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect(folder(page,'mixed/nested').locator('.folder-status')).toHaveText('M');
 await toggle.focus();await page.keyboard.press('ArrowLeft');await expect(toggle).toHaveAttribute('aria-expanded','false');
 await page.getByRole('textbox',{name:'Filter files by name'}).fill('*new.ts');await expect(row.locator('.folder-status')).toHaveText('A');
 await page.getByRole('button',{name:'Clear filter',exact:true}).click();
 await page.evaluate(()=>{const f=window as any;f.folderRepository={...f.folderRepository,files:[{path:'mixed/nested/edit.ts',status:'modified',additions:2,deletions:1}]};f.folderChanged([]);});
 await expect(row.locator('.folder-status')).toHaveText('M');
});

for(const theme of ['dark','light'])for(const width of [940,1024,1440])test(`folder badges ${theme} ${width} collapsed and expanded`,async({page})=>{
 await page.setViewportSize({width,height:900});
 if(theme==='light'){await page.evaluate(()=>localStorage.setItem('rift:theme','light'));await page.reload();await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));}
 const view='explorer';
 await page.getByRole('button',{name:'Explorer',exact:true}).click();
  const row=folder(page,'mixed'),toggle=row.locator('.explorer-folder-toggle');
  if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
  for(const state of ['collapsed','expanded']){
   if(state==='expanded')await toggle.click();
   const badge=row.locator('.folder-status');await expect(badge).toHaveText('A/M');
   const box=await badge.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThan(width);
   expect(await badge.evaluate((el: HTMLElement)=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
   if(process.env.RIFT_FOLDER_EVIDENCE)await page.screenshot({path:`${process.env.RIFT_FOLDER_EVIDENCE}/${view}-${theme}-${width}-${state}.png`});
  }
});
