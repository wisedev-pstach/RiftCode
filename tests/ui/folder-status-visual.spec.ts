import {test, expect} from '@playwright/test';

// A presentation fixture separate from the broad status-kind regression fixtures.
for(const theme of ['dark','light'])for(const width of [940,1024,1440])test(`minimal Explorer metadata ${theme} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(({theme})=>{
  localStorage.setItem('rift:theme',theme);
  const changed=(path:string,status:string)=>({path,status,additions:3,deletions:1});
  const repository={root:'/fixture/interface-kit',name:'Interface kit · synthetic preview',branch:'feature/components',baseBranch:'main',targetBranch:null,targetBranches:[],comparisonId:'working-tree',comparisonLabel:'Working tree',startRevision:'HEAD',endRevision:null,includeUntracked:true,comparisons:[{id:'working-tree',kind:'working-tree',label:'Working tree',detail:'Synthetic preview'}],files:[changed('src/components/Button.ts','modified'),changed('src/components/Card.ts','added'),changed('src/styles/theme.css','modified'),changed('docs/components.md','added'),changed('tests/components/Button.spec.ts','modified')],additions:15,deletions:5,updatedAt:0};
  (window as any).rift={platform:'linux',setTheme:async()=>{},checkForUpdate:async()=>({currentVersion:'0.8.3',latestVersion:null,releaseNotes:[],updateAvailable:false,installSupported:false,error:null}),openRepository:async()=>repository,refreshRepository:async()=>repository,listRepositoryFiles:async()=>repository.files.map(f=>f.path),getFilePatch:async(path:string)=>({path,binary:false,patch:'diff --git a/'+path+' b/'+path+'\n--- a/'+path+'\n+++ b/'+path+'\n@@ -1,4 +1,6 @@\n export function buttonLabel(label: string) {\n-  return label;\n+  const text = label.trim();\n+  return text || "Continue";\n }\n+\n+export const buttonSize = "medium";\n'}),readRepositoryFile:async()=>({content:'export function buttonLabel(label: string) {\n  return label;\n}\n',binary:false,truncated:false}),listAgents:async()=>[],onRepositoryChanged:()=>()=>{},onAgentEvent:()=>()=>{}};
 },{theme});
 await page.goto('/');
 await page.locator('.file-row[title="src/components/Button.ts"]').click();
 await expect(page.locator('.explorer-folder-row, .explorer-folder-toggle')).toHaveCount(0);
 await expect(page.locator('.file-row')).toHaveCount(5);
 if(theme==='dark' && width===1440 && process.env.RIFT_FOLDER_EVIDENCE)await page.screenshot({path:`${process.env.RIFT_FOLDER_EVIDENCE}/changes-flat-preview.png`});
 await page.getByRole('button',{name:'Explorer',exact:true}).click();
 const row=(path:string)=>page.locator('.explorer-folder-row').filter({has:page.locator(`[data-explorer-path="${path}"]`)});
 const src=row('src').locator('.explorer-folder-toggle');
 if(await src.getAttribute('aria-expanded')!=='true')await src.click();
 const components=row('src/components').locator('.explorer-folder-toggle');
 if(await components.getAttribute('aria-expanded')==='true')await components.click();
 await expect(components).toHaveAttribute('aria-expanded','false');
 expect(await row('src/components').locator('.explorer-entry-name').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await expect(src).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('.diff-panel')).toBeVisible();
 const iconPositions=await page.locator('.explorer-folder-icon').evaluateAll(icons=>icons.map(icon=>icon.getBoundingClientRect().x));
 const baselineIconPositions=await page.locator('.explorer-tree').evaluate(tree=>{
  const rows=[...tree.querySelectorAll<HTMLElement>('.explorer-folder-row')];
  (tree as HTMLElement).style.display='block';for(const row of rows)row.style.display='flex';
  const positions=[...tree.querySelectorAll('.explorer-folder-icon')].map(icon=>icon.getBoundingClientRect().x);
  (tree as HTMLElement).style.removeProperty('display');for(const row of rows)row.style.removeProperty('display');return positions;
 });
 expect(iconPositions).toEqual(baselineIconPositions);
 const positions:number[][]=[];
 for(const [path,label] of [['docs','A'],['src','A/M'],['src/components','A/M'],['src/styles','M'],['tests','M']]){
  const folder=row(path),badge=folder.locator('.folder-status'),count=folder.locator('.explorer-folder-count');
  await expect(badge).toHaveText(label);
  const appearance=await badge.evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderTopWidth,background:s.backgroundColor};});
  expect(appearance).toEqual({border:'0px',background:'rgba(0, 0, 0, 0)'});
  expect(await count.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  const [b,c,check,toggle]=await Promise.all([badge.boundingBox(),count.boundingBox(),folder.locator('.explorer-review').boundingBox(),folder.locator('.explorer-folder-toggle').boundingBox()]);
  expect(check!.x+check!.width).toBeLessThanOrEqual(toggle!.x);
  expect(b!.x).toBeGreaterThan(toggle!.x);expect(b!.x+b!.width).toBeLessThanOrEqual(c!.x);
  expect(c!.x+c!.width).toBeLessThan(width);
  expect(await badge.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  positions.push([b!.x,b!.width,c!.x,c!.width]);
 }
 for(const position of positions)expect(position).toEqual(positions[0]);
 if(process.env.RIFT_FOLDER_EVIDENCE){
  const name=theme==='dark'&&width===1440?'explorer-minimal-preview.png':`explorer-minimal-${theme}-${width}.png`;
  await page.screenshot({path:`${process.env.RIFT_FOLDER_EVIDENCE}/${name}`});
 }
});
