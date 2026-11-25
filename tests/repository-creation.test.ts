import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, readFile, mkdir, writeFile, symlink, rename, lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadRepository} from '../src/main/git';
import * as creation from '../src/main/create-repository';

test('native parent capability creates only a new named local repository and opens the real unborn snapshot',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'rift-create-parent-'));
 assert.equal(typeof creation.createLocalRepository,'function');
 const calls:string[]=[];
 const result=await creation.createLocalRepository('New project',{
  chooseParent:async(name)=>{calls.push(name);return parent;},assertCurrent:()=>{},
  openRepository:loadRepository
 });
 assert.equal(result?.root,join(parent,'New project'));assert.equal(result?.branch,'main');assert.deepEqual(result?.files,[]);
 assert.deepEqual(calls,['New project']);assert.deepEqual(await readdir(join(parent,'New project')),['.git']);
 assert.equal(execFileSync('git',['remote'],{cwd:result!.root,encoding:'utf8'}),'');
});

test('real empty Git repository with unborn main opens without files or an initial commit',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rift-create-unborn-'));
 execFileSync('git',['init','--initial-branch=main','--template='],{cwd:root});
 const repository=await loadRepository(root);
 assert.equal(repository.root,root);assert.equal(repository.branch,'main');assert.deepEqual(repository.files,[]);
 assert.equal(repository.comparisonId,'working-tree');assert.deepEqual(await readdir(root),['.git']);
 assert.equal(await readFile(join(root,'.git/HEAD'),'utf8'),'ref: refs/heads/main\n');
 assert.throws(()=>execFileSync('git',['rev-parse','--verify','HEAD'],{cwd:root,stdio:'pipe'}));
});
for(const name of ['', '.', '..', '../escape', 'a/b', 'a\\b', 'a\0b', 'a\nb', 'CON', 'CONIN$', 'CONOUT$', 'CON .txt', '\ud800', 'nul.txt', 'COM1', 'LPT9.md', 'trailing.', 'trailing ', ' leading', 'a:b', 'x'.repeat(129)])test(`unsafe literal name rejected before native picker ${JSON.stringify(name)}`,async()=>{
 let pick=0;
 await assert.rejects(creation.createLocalRepository(name,{chooseParent:async()=>{pick++;return null;},assertCurrent:()=>{},openRepository:loadRepository}),/project name/i);
 assert.equal(pick,0);
});
for(const kind of ['directory','file','symlink'])test(`exclusive collision preserves existing ${kind}`,async()=>{
 const parent=await mkdtemp(join(tmpdir(),'rift-create-collision-')),target=join(parent,'project');
 if(kind==='directory')await mkdir(target);else if(kind==='file')await writeFile(target,'preserve');else await symlink(parent,target);
 await assert.rejects(creation.createLocalRepository('project',{chooseParent:async()=>parent,assertCurrent:()=>{},openRepository:loadRepository}),/exists/i);
 assert.equal((await lstat(target)).isSymbolicLink(),kind==='symlink');
 if(kind==='file')assert.equal(await readFile(target,'utf8'),'preserve');
 if(kind==='directory')assert.deepEqual(await readdir(target),[]);
});
test('cancelled native picker performs no initialization or open',async()=>{
 let opens=0;
 assert.equal(await creation.createLocalRepository('project',{chooseParent:async()=>null,assertCurrent:()=>{},openRepository:async()=>{opens++;throw Error('unexpected open');}}),null);
 assert.equal(opens,0);
});
for(const stage of ['before-picker','after-picker','during-init'])test(`obsolete creation is fenced ${stage}`,async()=>{
 const parent=await mkdtemp(join(tmpdir(),'rift-create-stale-'));let current=stage!=='before-picker',picks=0,opens=0;
 await assert.rejects(creation.createLocalRepository('project',{
  chooseParent:async()=>{picks++;if(stage==='after-picker')current=false;return parent;},
  assertCurrent:()=>{if(!current)throw Error('Obsolete creation');},
  initialize:async(root)=>{execFileSync('git',['init','--initial-branch=main','--template='],{cwd:root});current=false;},
  openRepository:async()=>{opens++;throw Error('unexpected open');}
 }),/Obsolete/);
 assert.equal(opens,0);assert.equal(picks,stage==='before-picker'?0:1);
 assert.deepEqual(await readdir(parent),stage==='during-init'?['project']:[]);
});
test('failed Git initialization keeps the new folder and explains recovery without opening',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'rift-create-fail-'));
 await assert.rejects(creation.createLocalRepository('project',{chooseParent:async()=>parent,assertCurrent:()=>{},initialize:async(root)=>{await writeFile(join(root,'keep.txt'),'keep');throw Error('fixture Git unavailable');},openRepository:loadRepository}),/folder.*kept.*fixture Git unavailable/is);
 assert.equal(await readFile(join(parent,'project/keep.txt'),'utf8'),'keep');
});
test('directory replacement during init cannot open a symlink escape',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'rift-create-replace-')),outside=await mkdtemp(join(tmpdir(),'rift-create-outside-'));let opens=0;
 await assert.rejects(creation.createLocalRepository('project',{chooseParent:async()=>parent,assertCurrent:()=>{},initialize:async(root)=>{await rename(root,root+'-original');await symlink(outside,root);},openRepository:async()=>{opens++;throw Error('unexpected open');}}),/changed|unsafe/i);
 assert.equal(opens,0);assert.deepEqual(await readdir(outside),[]);
});
test('Git initialization ignores inherited redirects, templates and injected config',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'rift-create-env-')),outside=join(parent,'outside');await mkdir(outside);
 const keys=['GIT_DIR','GIT_WORK_TREE','GIT_TEMPLATE_DIR','GIT_CONFIG_COUNT','GIT_CONFIG_KEY_0','GIT_CONFIG_VALUE_0'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  Object.assign(process.env,{GIT_DIR:outside,GIT_WORK_TREE:outside,GIT_TEMPLATE_DIR:outside,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.bare',GIT_CONFIG_VALUE_0:'true'});
  const result=await creation.createLocalRepository('project',{chooseParent:async()=>parent,assertCurrent:()=>{},openRepository:loadRepository});
  assert.equal(await readFile(join(result!.root,'.git/HEAD'),'utf8'),'ref: refs/heads/main\n');assert.deepEqual(await readdir(outside),[]);
 }finally{for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
test('missing native Git executable leaves the exclusive new directory intact',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'rift-create-no-git-')),path=process.env.PATH;
 try{process.env.PATH='';await assert.rejects(creation.createLocalRepository('project',{chooseParent:async()=>parent,assertCurrent:()=>{},openRepository:loadRepository}),/folder.*kept.*ENOENT/is);}
 finally{if(path===undefined)delete process.env.PATH;else process.env.PATH=path;}
 assert.deepEqual(await readdir(parent),['project']);assert.deepEqual(await readdir(join(parent,'project')),[]);
});
test('a changed parent during Git initialization cannot publish a different directory',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'rift-create-parent-swap-'));let opens=0;
 await assert.rejects(creation.createLocalRepository('project',{chooseParent:async()=>parent,assertCurrent:()=>{},initialize:async()=>{await rename(parent,parent+'-original');await mkdir(parent);},openRepository:async()=>{opens++;throw Error('unexpected open');}}),/changed|unsafe/i);
 assert.equal(opens,0);assert.deepEqual(await readdir(parent),[]);assert.deepEqual(await readdir(parent+'-original'),['project']);
});
test('an unborn checkout still reports new files and staged changes without fabricating a commit',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rift-create-unborn-files-'));
 execFileSync('git',['init','--initial-branch=main','--template='],{cwd:root});
 await writeFile(join(root,'new.txt'),'new\n');
 assert.equal((await loadRepository(root)).files[0].status,'untracked');
 execFileSync('git',['add','--','new.txt'],{cwd:root});
 assert.equal((await loadRepository(root)).files[0].status,'added');
 assert.throws(()=>execFileSync('git',['rev-parse','--verify','HEAD'],{cwd:root,stdio:'pipe'}));
});
