import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,symlink,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('scope invalidation fences pending captures, summaries and patch reads',async()=>{
 const {PromptCheckpoints}=await import('../src/main/prompt-checkpoints');const root=await mkdtemp(join(tmpdir(),'rift-scope-fence-'));
 try{execFileSync('git',['init','-q'],{cwd:root});const service=new PromptCheckpoints();let writes=0;const pending=service.begin(root,'s','old',()=>{writes++;});service.clear();await assert.rejects(pending,/cancelled/);assert.equal(writes,0);
 await service.begin(root,'s2','p',()=>{});await writeFile(join(root,'a'),'after\n');const [summary]=await service.list(root);const patch=service.patch(root,summary.id,'a',summary.viewId);service.clear();await assert.rejects(patch,/changed|cancelled/);
 await service.begin(root,'s3','p',()=>{});const refreshing=service.list(root);service.clear();assert.deepEqual(await refreshing.catch(()=>[]),[]);assert.deepEqual(await service.list(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('inherited Git redirection cannot replace the checkpoint repository',async()=>{
 const {PromptCheckpoints}=await import('../src/main/prompt-checkpoints');const root=await mkdtemp(join(tmpdir(),'rift-git-env-')),foreign=await mkdtemp(join(tmpdir(),'rift-git-foreign-'));const previous=process.env.GIT_DIR;
 try{execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['init','-q'],{cwd:foreign});await writeFile(join(root,'.gitignore'),'a\n');await writeFile(join(root,'a'),'before\n');execFileSync('git',['add','-f','a'],{cwd:root});process.env.GIT_DIR=join(foreign,'.git');const service=new PromptCheckpoints();await service.begin(root,'s','p',()=>{});await writeFile(join(root,'a'),'after\n');assert.equal((await service.list(root))[0].files.length,1);}
 finally{if(previous===undefined)delete process.env.GIT_DIR;else process.env.GIT_DIR=previous;await rm(root,{recursive:true,force:true});await rm(foreign,{recursive:true,force:true});}
});

test('history numbers individual successful prompts and retains only the last three',async()=>{
 const {PromptCheckpoints}=await import('../src/main/prompt-checkpoints');const root=await mkdtemp(join(tmpdir(),'rift-history-bound-'));
 try{execFileSync('git',['init','-q'],{cwd:root});const service=new PromptCheckpoints();for(let i=0;i<5;i++)await service.begin(root,'s','same prompt',()=>{});const history=await service.list(root);assert.deepEqual(history.map(x=>x.number),[3,4,5]);await service.finish(root);assert.equal((await service.list(root)).at(-1)!.live,false);service.clear();await service.begin(root,'s2','again',()=>{});assert.equal((await service.list(root))[0].number,1);}
 finally{await rm(root,{recursive:true,force:true});}
});

test('non-UTF-8 Git paths fail capture explicitly instead of silently disappearing',async()=>{
 const {PromptCheckpoints}=await import('../src/main/prompt-checkpoints');const root=await mkdtemp(join(tmpdir(),'rift-path-bytes-'));
 try{execFileSync('git',['init','-q'],{cwd:root});await writeFile(Buffer.concat([Buffer.from(root+'/'),Buffer.from([255])]),'bytes');const service=new PromptCheckpoints();await assert.rejects(service.begin(root,'s','p',()=>assert.fail('must not submit')),/UTF-8/);}
 finally{await rm(root,{recursive:true,force:true});}
});

test('newlines in file names cannot become diff headers or change line counts',async()=>{
 const {PromptCheckpoints}=await import('../src/main/prompt-checkpoints');const root=await mkdtemp(join(tmpdir(),'rift-path-newline-'));
 try{execFileSync('git',['init','-q'],{cwd:root});const service=new PromptCheckpoints();await service.begin(root,'s','p',()=>{});const path='odd\n@@\n+not-a-line.ts';await writeFile(join(root,path),'one\n');const [summary]=await service.list(root);assert.equal(summary.additions,1);assert.equal(summary.files[0].path,path);}
 finally{await rm(root,{recursive:true,force:true});}
});

test('checkpoint commands never execute repository fsmonitor, filters or external diff drivers',async()=>{
 const {PromptCheckpoints}=await import('../src/main/prompt-checkpoints');const root=await mkdtemp(join(tmpdir(),'rift-git-drivers-'));
 const git=(...args:string[])=>execFileSync('git',args,{cwd:root});
 try{git('init','-q');await writeFile(join(root,'driver'),'#!/bin/sh\ntouch executed\n',{mode:0o755});git('config','core.fsmonitor',join(root,'driver'));git('config','diff.external',join(root,'driver'));git('config','filter.fixture.clean',join(root,'driver'));await writeFile(join(root,'.gitattributes'),'a filter=fixture diff=fixture\n');await writeFile(join(root,'a'),'before\n');
 const service=new PromptCheckpoints();await service.begin(root,'s','p',()=>{});await writeFile(join(root,'a'),'after\n');await service.list(root);await assert.rejects(readFile(join(root,'executed')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('an expired review token rejects rather than showing newer bytes under old counts',async()=>{
 const {PromptCheckpoints}=await import('../src/main/prompt-checkpoints');const root=await mkdtemp(join(tmpdir(),'rift-view-token-'));
 try{execFileSync('git',['init','-q'],{cwd:root});const service=new PromptCheckpoints();await service.begin(root,'s','p',()=>{});await writeFile(join(root,'a'),'first\n');const [old]=await service.list(root);await writeFile(join(root,'a'),'second\n');await service.list(root);
 await assert.rejects(service.patch(root,old.id,'a',old.viewId),/expired|refresh/i);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('invalid UTF-8 is reviewed as binary rather than inventing replacement text',async()=>{
 const {PromptCheckpoints}=await import('../src/main/prompt-checkpoints');const root=await mkdtemp(join(tmpdir(),'rift-invalid-utf8-'));
 try{execFileSync('git',['init','-q'],{cwd:root});const service=new PromptCheckpoints();await service.begin(root,'s','p',()=>{});await writeFile(join(root,'bytes'),Buffer.from([255,254,253]));const [summary]=await service.list(root);assert.equal((await service.patch(root,summary.id,'bytes',summary.viewId)).binary,true);}
 finally{await rm(root,{recursive:true,force:true});}
});

test('failed captures and failed submits leave prior history intact; unsafe files never submit',async()=>{
 const {PromptCheckpoints}=await import('../src/main/prompt-checkpoints');const root=await mkdtemp(join(tmpdir(),'rift-reject-'));const outside=await mkdtemp(join(tmpdir(),'rift-outside-'));
 try{execFileSync('git',['init','-q'],{cwd:root});await writeFile(join(root,'a'),'before\n');const service=new PromptCheckpoints();await service.begin(root,'s','p',()=>{});let writes=0;
 await writeFile(join(root,'a'),'after\n');await assert.rejects(service.begin(root,'s','failed',()=>{throw new Error('not ready');}),/not ready/);assert.equal((await service.list(root))[0].live,true);
 await writeFile(join(root,'large'),Buffer.alloc(1024*1024+1));await assert.rejects(service.begin(root,'s','oversize',()=>{writes++;}),/limit/);await rm(join(root,'large'));
 await writeFile(join(outside,'secret'),'private');
 for(const kind of ['symlink','hardlink','fifo'] as const){
  if(kind==='symlink')await symlink(join(outside,'secret'),join(root,'unsafe'));else if(kind==='hardlink')await link(join(outside,'secret'),join(root,'unsafe'));else execFileSync('mkfifo',[join(root,'unsafe')]);
  await assert.rejects(service.begin(root,'s',kind,()=>{writes++;}),/regular|linked|symlink/);await rm(join(root,'unsafe'));
 }
 assert.equal(writes,0);assert.equal((await service.list(root)).length,1);
 service.clear();await assert.rejects(service.patch(root,'s:foreign','a'),/repository|expired/);
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});

test('summary and review use the same captured afterimage, even when live files change',async()=>{
 const {PromptCheckpoints}=await import('../src/main/prompt-checkpoints');const root=await mkdtemp(join(tmpdir(),'rift-review-image-'));
 try{execFileSync('git',['init','-q'],{cwd:root});await writeFile(join(root,'a'),'old\n');const service=new PromptCheckpoints();await service.begin(root,'s','p',()=>{});
 await writeFile(join(root,'a'),'++plus\n--minus\n');const [summary]=await service.list(root);assert.equal(summary.additions,2);
 await writeFile(join(root,'a'),'later\n');const patch=await service.patch(root,summary.id,'a',summary.viewId);assert.match(patch.patch,/\+\+\+plus/);assert.doesNotMatch(patch.patch,/later/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('checkpoints compare actual dirty and untracked bytes and freeze each previous prompt',async()=>{
 const {PromptCheckpoints}=await import('../src/main/prompt-checkpoints');
 const root=await mkdtemp(join(tmpdir(),'rift-checkpoint-'));
 const git=(...args:string[])=>execFileSync('git',args,{cwd:root});
 try{
  git('init');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  await writeFile(join(root,'a.txt'),'head\n');git('add','.');git('commit','-m','fixture');
  await writeFile(join(root,'a.txt'),'dirty before\n');await writeFile(join(root,'new.txt'),'untracked before\n');
  const index=await readFile(join(root,'.git/index'));const head=git('rev-parse','HEAD').toString();
  const service=new PromptCheckpoints();
  await service.begin(root,'session','first',()=>{});
  await writeFile(join(root,'a.txt'),'head\n');await writeFile(join(root,'new.txt'),'untracked after\n');
  const first=(await service.list(root))[0];
  assert.equal(first.files.length,2);assert.equal(first.additions,2);assert.equal(first.deletions,2);
  const patch=await service.patch(root,first.id,'a.txt',first.viewId);assert.match(patch.patch,/-dirty before\n\+head/);
  await service.begin(root,'session','second',()=>{});
  await writeFile(join(root,'a.txt'),'second\n');await rm(join(root,'new.txt'));await writeFile(join(root,'binary'),Buffer.from([0,1]));
  const history=await service.list(root);assert.deepEqual(history[0].files,first.files);assert.equal(history[0].live,false);
  assert.equal((await service.patch(root,history[0].id,'a.txt',history[0].viewId)).patch,patch.patch);
  assert.equal(history[1].files.length,3);assert.equal(history[1].additions,1);assert.equal(history[1].deletions,2);
  assert.equal((await service.patch(root,history[1].id,'binary',history[1].viewId)).binary,true);
  assert.deepEqual(await readFile(join(root,'.git/index')),index);assert.equal(git('rev-parse','HEAD').toString(),head);
 }finally{await rm(root,{recursive:true,force:true});}
});
