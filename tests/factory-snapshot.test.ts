import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,rename,chmod,symlink,link} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openFactoryStore,createManifest,readRecord,readManifest,writeManifest} from '../src/main/factory/store';
import {writeArtifact,readArtifact} from '../src/main/factory/artifacts';
import {captureSnapshot,readSnapshot,createTaskRevision,readTaskRevision,appendReviewDecision,listReviewDecisions} from '../src/main/factory/snapshot';
async function fixture(){const dir=await mkdtemp(join(process.env.TMPDIR??tmpdir(),'factory-snapshot-'));const root=join(dir,'repo');await mkdir(root);const git=(...args:string[])=>execFileSync('git',args,{cwd:root,env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}}).toString();git('init','-q');await writeFile(join(root,'a.txt'),'HEAD\n');git('add','a.txt');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');const store=await openFactoryStore({root,userData:join(dir,'data')});return {dir,root,store,git};}

test('dirty/untracked snapshots preserve HEAD/index and task A review after task B edits same file',async()=>{
 const f=await fixture();try{
 await createManifest(f.store,{title:'plan',requirements:['R1'],tasks:[{id:'a',title:'A',dependencies:[],testCommandIds:['unit'],pathScope:['a.txt','odd\nname.txt']},{id:'b',title:'B',dependencies:['a'],testCommandIds:['unit'],pathScope:['a.txt']}]});
 await writeFile(join(f.root,'a.txt'),'dirty baseline\n');f.git('add','a.txt');const index=await readFile(join(f.root,'.git/index')),head=f.git('rev-parse','HEAD');
 const before=await captureSnapshot(f.store);await writeFile(join(f.root,'a.txt'),'task A\n');await chmod(join(f.root,'a.txt'),0o755);await writeFile(join(f.root,'odd\nname.txt'),'new\n');
 const after=await captureSnapshot(f.store);const receipt=await writeArtifact(f.store,{kind:'receipt',content:JSON.stringify({taskId:'a',after:{fingerprint:after.fingerprint},before:{fingerprint:after.fingerprint},stale:false,checksPassed:true,process:{commandId:'unit',reason:'success',exitCode:0}})});
 const revision=await createTaskRevision(f.store,{taskId:'a',beforeSnapshotId:before.id,afterSnapshotId:after.id,receiptIds:[receipt.id],artifactIds:[]});
 const manifest=(await readManifest(f.store))!;await writeManifest(f.store,{...manifest,revisionIds:[revision.id],state:'readyforreview'});assert.equal((await readManifest(f.store))?.revisionIds[0],revision.id);
 await assert.rejects(writeManifest(f.store,manifest),/append-only/);
 await writeFile(join(f.root,'a.txt'),'task B\n');const bAfter=await captureSnapshot(f.store);
 const bReceipt=await writeArtifact(f.store,{kind:'receipt',content:JSON.stringify({taskId:'b',after:{fingerprint:bAfter.fingerprint},before:{fingerprint:bAfter.fingerprint},stale:false,checksPassed:true,process:{commandId:'unit',reason:'success',exitCode:0}})});
 const bRevision=await createTaskRevision(f.store,{taskId:'b',beforeSnapshotId:after.id,afterSnapshotId:bAfter.id,receiptIds:[bReceipt.id],artifactIds:[]});
 await writeManifest(f.store,{...(await readManifest(f.store))!,revisionIds:[revision.id,bRevision.id]});
 const reopened=await openFactoryStore({root:f.root,userData:join(f.dir,'data')});assert.notEqual(reopened,f.store);
 assert.deepEqual((await readManifest(reopened))?.revisionIds,[revision.id,bRevision.id]);
 const saved=await readTaskRevision(reopened,revision.id);const change=saved.changes.find(c=>c.path==='a.txt')!;
 const patch=(await readArtifact(reopened,change.patchArtifactId)).content.toString();assert.match(patch,/-dirty baseline/);assert.match(patch,/\+task A/);assert.doesNotMatch(patch,/task B|HEAD/);assert.equal(change.afterMode,0o100755);
 assert.equal((await readArtifact(f.store,change.afterSourceId!)).content.toString(),'task A\n');assert.equal((await readSnapshot(f.store,before.id)).fingerprint,before.fingerprint);
 const odd=saved.changes.find(c=>c.path==='odd\nname.txt')!;assert.ok((await readArtifact(f.store,odd.patchArtifactId)).content.toString().includes('"b/odd\\nname.txt"'));
 const decision=await appendReviewDecision(f.store,{revisionId:revision.id,decision:'changesrequested',comment:'fix it'});assert.equal((await readRecord(f.store,decision.id)).id,decision.id);
 const rework=await createTaskRevision(f.store,{taskId:'a',previousRevisionId:revision.id,beforeSnapshotId:before.id,afterSnapshotId:after.id,receiptIds:[receipt.id],artifactIds:[]});assert.notEqual(rework.id,revision.id);assert.equal(rework.previousRevisionId,revision.id);
 await appendReviewDecision(f.store,{revisionId:revision.id,decision:'accepted',comment:'reviewed again'});assert.equal((await listReviewDecisions(f.store,revision.id)).length,2);
 assert.equal(f.git('rev-parse','HEAD'),head);assert.deepEqual(await readFile(join(f.root,'.git/index')),index);
 await assert.rejects(createTaskRevision(f.store,{taskId:'a',beforeSnapshotId:before.id,afterSnapshotId:after.id,receiptIds:[],artifactIds:[]}),/evidence/);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});

test('dependencies require queued successful revision, while binary/deletion/mode-only patches are immutable',async()=>{
 const f=await fixture();try{
 const m=await createManifest(f.store,{title:'plan',requirements:[],tasks:[{id:'a',title:'A',dependencies:[],testCommandIds:['unit'],pathScope:['a.txt']},{id:'b',title:'B',dependencies:['a'],testCommandIds:['unit'],pathScope:['a.txt','binary']}]});
 const before=await captureSnapshot(f.store);await rm(join(f.root,'a.txt'));await writeFile(join(f.root,'binary'),Buffer.from([0,1,2]));const after=await captureSnapshot(f.store);
 const evidence=await writeArtifact(f.store,{kind:'receipt',content:JSON.stringify({taskId:'b',before:{fingerprint:after.fingerprint},after:{fingerprint:after.fingerprint},stale:false,checksPassed:true,process:{commandId:'unit',reason:'success',exitCode:0}})});
 await assert.rejects(createTaskRevision(f.store,{taskId:'b',beforeSnapshotId:before.id,afterSnapshotId:after.id,receiptIds:[evidence.id],artifactIds:[]}),/dependenc/);
 const aEvidence=await writeArtifact(f.store,{kind:'receipt',content:JSON.stringify({taskId:'a',before:{fingerprint:before.fingerprint},after:{fingerprint:before.fingerprint},stale:false,checksPassed:true,process:{commandId:'unit',reason:'success',exitCode:0}})});
 const a=await createTaskRevision(f.store,{taskId:'a',beforeSnapshotId:before.id,afterSnapshotId:before.id,receiptIds:[aEvidence.id],artifactIds:[]});await writeManifest(f.store,{...m,revisionIds:[a.id]});
 const b=await createTaskRevision(f.store,{taskId:'b',beforeSnapshotId:before.id,afterSnapshotId:after.id,receiptIds:[evidence.id],artifactIds:[]});assert.equal(b.changes.find(c=>c.path==='a.txt')?.status,'deleted');assert.equal(b.changes.find(c=>c.path==='binary')?.binary,true);
 const stale=await writeArtifact(f.store,{kind:'receipt',content:JSON.stringify({taskId:'b',before:{fingerprint:before.fingerprint},after:{fingerprint:after.fingerprint},stale:true,checksPassed:true,process:{commandId:'unit',reason:'success',exitCode:0}})});await assert.rejects(createTaskRevision(f.store,{taskId:'b',beforeSnapshotId:before.id,afterSnapshotId:after.id,receiptIds:[stale.id],artifactIds:[]}),/stale/);
 await rm(join(f.store.directory,b.changes[0].patchArtifactId+'.patch'));await assert.rejects(writeManifest(f.store,{...m,revisionIds:[a.id,b.id],state:'readyforreview'}),/ENOENT/);assert.deepEqual((await readManifest(f.store))?.revisionIds,[a.id]);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});

test('snapshot rejects symlinks, hardlinks, FIFOs, submodules and overflows without publishing partial image',async()=>{
 const f=await fixture();try{
 await symlink('a.txt',join(f.root,'linked'));await assert.rejects(captureSnapshot(f.store),/regular|linked|symlink/);await rm(join(f.root,'linked'));
 await link(join(f.root,'a.txt'),join(f.root,'hard'));await assert.rejects(captureSnapshot(f.store),/regular|linked/);await rm(join(f.root,'hard'));
 execFileSync('mkfifo',[join(f.root,'pipe')]);await assert.rejects(captureSnapshot(f.store),/regular|special/);await rm(join(f.root,'pipe'));
 f.git('update-index','--add','--cacheinfo',`160000,${f.git('rev-parse','HEAD').trim()},nested`);await assert.rejects(captureSnapshot(f.store),/submodule/);f.git('update-index','--force-remove','nested');
 const small=await openFactoryStore({root:f.root,userData:join(f.dir,'small'),limits:{maxSnapshotBytes:3}});await assert.rejects(captureSnapshot(small),/limit/);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});

for(const operation of ['delete','rename'] as const)test(`whole-directory ${operation} captures deleted tracked paths without changing Git`,async()=>{
 const f=await fixture();try{
 const old='dir "quoted"',next='moved\nfolder';await mkdir(join(f.root,old));await writeFile(join(f.root,old,'a.txt'),'nested baseline\n');f.git('add','--',old);
 const index=await readFile(join(f.root,'.git/index')),head=f.git('rev-parse','HEAD');
 await createManifest(f.store,{title:'directory change',requirements:[],tasks:[{id:'a',title:'A',dependencies:[],testCommandIds:['unit'],pathScope:[old+'/',next+'/']}]});
 const before=await captureSnapshot(f.store);
 if(operation==='delete')await rm(join(f.root,old),{recursive:true});else await rename(join(f.root,old),join(f.root,next));
 const after=await captureSnapshot(f.store);assert.ok(!after.files.some(file=>file.path.startsWith(old+'/')));
 const receipt=await writeArtifact(f.store,{kind:'receipt',content:JSON.stringify({taskId:'a',before:{fingerprint:after.fingerprint},after:{fingerprint:after.fingerprint},stale:false,checksPassed:true,process:{commandId:'unit',reason:'success',exitCode:0}})});
 const revision=await createTaskRevision(f.store,{taskId:'a',beforeSnapshotId:before.id,afterSnapshotId:after.id,receiptIds:[receipt.id],artifactIds:[]});
 const deleted=revision.changes.find(c=>c.path===old+'/a.txt')!;assert.equal(deleted.status,'deleted');
 const patch=(await readArtifact(f.store,deleted.patchArtifactId)).content.toString();assert.ok(patch.includes(JSON.stringify('a/'+old+'/a.txt')));assert.match(patch,/-nested baseline/);
 if(operation==='rename'){assert.equal(revision.changes.find(c=>c.path===next+'/a.txt')?.status,'added');assert.equal((await readArtifact(f.store,after.files.find(file=>file.path===next+'/a.txt')!.objectId)).content.toString(),'nested baseline\n');}
 assert.equal(f.git('rev-parse','HEAD'),head);assert.deepEqual(await readFile(join(f.root,'.git/index')),index);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});

for(const kind of ['symlink','dangling-symlink','regular','fifo'] as const)test(`deleted tracked parent replaced by ${kind} still blocks`,async()=>{
 const f=await fixture();try{
 await mkdir(join(f.root,'parent'));await writeFile(join(f.root,'parent','a.txt'),'baseline');f.git('add','parent/a.txt');await captureSnapshot(f.store);await rm(join(f.root,'parent'),{recursive:true});
 if(kind==='symlink')await symlink('.',join(f.root,'parent'));
 else if(kind==='dangling-symlink')await symlink('missing',join(f.root,'parent'));
 else if(kind==='regular')await writeFile(join(f.root,'parent'),'not a directory');
 else execFileSync('mkfifo',[join(f.root,'parent')]);
 await assert.rejects(captureSnapshot(f.store),/regular|linked|special|symlink/);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
