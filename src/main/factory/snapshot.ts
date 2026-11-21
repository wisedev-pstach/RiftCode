import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {constants} from 'node:fs';
import {isUtf8} from 'node:buffer';
import {lstat,open,opendir,realpath,mkdtemp,writeFile,rm,readdir} from 'node:fs/promises';
import {join,relative,isAbsolute,sep} from 'node:path';
import type {FactorySnapshot,FactorySnapshotFile,FactoryTaskRevision,FactoryChangedFile,FactoryReviewDecision} from '../../shared/factory';
import {type FactoryStore,newId,sha256,safeDirectory,assertStore,withStoreLock,publishRecord,readRecord,readManifest} from './store';
import {readArtifact,writeArtifactUnlocked} from './artifacts';
const exec=promisify(execFile);
const config=['-c','core.fsmonitor=false','-c',`core.hooksPath=${process.platform==='win32'?'NUL':'/dev/null'}`,'-c','core.quotePath=false'];
function gitEnv():NodeJS.ProcessEnv{const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.toUpperCase().startsWith('GIT_')));return {...env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'};}
async function git(root:string,args:string[]):Promise<Buffer>{return (await exec('git',[...config,...args],{cwd:root,env:gitEnv(),maxBuffer:2*1024*1024,timeout:10000,encoding:'buffer'})).stdout;}
/** Native read-only Git helper; strips inherited Git redirections and disables hooks/fsmonitor. */
export {git as readOnlyGit};
function pathOK(p:string):void{if(!p||p.length>4096||isAbsolute(p)||p.includes('\\')||p.includes('\0')||p.split('/').some(v=>!v||v==='.'||v==='..'||v.toLowerCase()==='.git'))throw new Error('Unsafe snapshot path.');}
function fingerprint(files:FactorySnapshotFile[]):string{return sha256(JSON.stringify(files.map(f=>[f.path,f.mode,f.sha256,f.bytes])));}
/** Captures actual working bytes, never HEAD; unsupported objects block the whole capture. */
export async function captureSnapshot(store:FactoryStore):Promise<FactorySnapshot>{
 await assertStore(store);const root=store.scope.canonicalRoot;await safeDirectory(root);
 if((await git(root,['rev-parse','--show-toplevel'])).toString().trim()!==root)throw new Error('Snapshot requires canonical repository root.');
 const listed=await git(root,['ls-files','-z','--cached','--others','--exclude-standard']);if(!isUtf8(listed))throw new Error('Snapshot requires UTF-8 paths.');
 const paths=[...new Set(listed.toString().split('\0').filter(Boolean))].sort();if(paths.length>store.limits.maxSnapshotFiles)throw new Error('Snapshot file count limit exceeded; blocked.');paths.forEach(pathOK);
 const staged=await git(root,['ls-files','--stage','-z']);if(staged.toString().split('\0').some(row=>row.startsWith('160000 ')))throw new Error('Snapshot submodules are unsupported; blocked.');
 const ignored=(await git(root,['ls-files','-z','--others','--ignored','--exclude-standard','--directory'])).toString().split('\0').filter(Boolean);
 let scanned=0;
 const inspect=async(directory:string,prefix:string):Promise<void>=>{await safeDirectory(directory);for await(const entry of await opendir(directory)){
  if(entry.name.toLowerCase()==='.git')continue;const path=prefix+entry.name;
  if(ignored.some(i=>path===i||i.endsWith('/')&&path.startsWith(i))&&!paths.some(p=>p===path||p.startsWith(path+'/')))continue;
  if(++scanned>store.limits.maxScanEntries)throw new Error('Snapshot scan entry limit exceeded; blocked.');
  if(entry.isDirectory())await inspect(join(directory,entry.name),path+'/');else if(!entry.isFile())throw new Error('Snapshot requires regular files, no symlink/special objects.');
 }};await inspect(root,'');
 const images:{path:string;mode:number;content:Buffer}[]=[];let total=0;
 for(const path of paths){const file=join(root,path);let info;
  // Cached Git paths survive directory deletion/rename. Only a genuinely absent
  // parent/file is deletion; linked/special parents and other errors still block.
  try{await safeDirectory(join(file,'..'));info=await lstat(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw new Error('Snapshot requires regular non-linked files.');if(info.size>store.limits.maxFileBytes)throw new Error('Snapshot file byte limit exceeded; blocked.');
  const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const start=await fd.stat();if(!start.isFile()||start.nlink!==1||start.ino!==info.ino||start.dev!==info.dev)throw new Error('Snapshot file changed during capture.');
   const actual=await realpath(process.platform==='linux'?`/proc/self/fd/${fd.fd}`:file);if(relative(root,actual)!==path.split('/').join(sep))throw new Error('Snapshot path escaped.');
   const buffer=Buffer.alloc(store.limits.maxFileBytes+1);let n=0;while(n<buffer.length){const r=await fd.read(buffer,n,buffer.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}
   const end=await fd.stat();if(end.size!==start.size||end.mtimeMs!==start.mtimeMs||end.ctimeMs!==start.ctimeMs||end.nlink!==1)throw new Error('Snapshot file changed during capture.');
   if(n>store.limits.maxFileBytes)throw new Error('Snapshot file byte limit exceeded; blocked.');total+=n;if(total>store.limits.maxSnapshotBytes)throw new Error('Snapshot total byte limit exceeded; blocked.');
   images.push({path,mode:start.mode&0o111?0o100755:0o100644,content:Buffer.from(buffer.subarray(0,n))});
  }finally{await fd.close();}
 }
 if(!(await git(root,['ls-files','-z','--cached','--others','--exclude-standard'])).equals(listed))throw new Error('Snapshot file set changed during capture.');
 return withStoreLock(store,async()=>{const files:FactorySnapshotFile[]=[];for(const image of images){const object=await writeArtifactUnlocked(store,{kind:'source',content:image.content});files.push({path:image.path,mode:image.mode,sha256:object.sha256,bytes:object.bytes,objectId:object.id,binary:image.content.includes(0)||!isUtf8(image.content)});}const snapshot:FactorySnapshot={version:1,id:newId('snapshot'),scope:store.scope,files,fingerprint:fingerprint(files),createdAt:new Date().toISOString()};await publishRecord(store,snapshot);return snapshot;});
}
export async function readSnapshot(store:FactoryStore,id:string):Promise<FactorySnapshot>{
 const snapshot=await readRecord<FactorySnapshot>(store,id);if(!id.startsWith('snapshot-')||!Array.isArray(snapshot.files)||snapshot.files.length>store.limits.maxSnapshotFiles)throw new Error('Invalid snapshot.');let bytes=0;const paths=new Set<string>();
 for(const f of snapshot.files){pathOK(f.path);if(paths.has(f.path)||![0o100644,0o100755].includes(f.mode))throw new Error('Invalid snapshot file metadata.');paths.add(f.path);const a=await readArtifact(store,f.objectId);if(a.record.kind!=='source'||a.record.sha256!==f.sha256||a.record.bytes!==f.bytes||f.bytes>store.limits.maxFileBytes||f.binary!==(a.content.includes(0)||!isUtf8(a.content)))throw new Error('Snapshot source integrity mismatch.');bytes+=f.bytes;}
 if(bytes>store.limits.maxSnapshotBytes||fingerprint(snapshot.files)!==snapshot.fingerprint)throw new Error('Snapshot integrity/limit mismatch.');return snapshot;
}
async function patchText(store:FactoryStore,path:string,a:Buffer|undefined,b:Buffer|undefined):Promise<string>{
 // Scratch is inside private external storage; never in checkout or global home.
 const scratch=await mkdtemp(join(store.directory,'diff-'));
 try{await writeFile(join(scratch,'before'),a??Buffer.alloc(0),{mode:0o600});await writeFile(join(scratch,'after'),b??Buffer.alloc(0),{mode:0o600});let patch:string;
  try{patch=(await exec('git',[...config,'diff','--no-index','--no-ext-diff','--no-textconv','--no-color','--unified=3','--','before','after'],{cwd:scratch,env:gitEnv(),maxBuffer:store.limits.maxObjectBytes,timeout:10000})).stdout;}catch(e){if((e as {code?:number}).code!==1)throw e;patch=(e as {stdout:string}).stdout;}
  return patch.replace(/^diff --git .*$/m,()=>`diff --git ${JSON.stringify('a/'+path)} ${JSON.stringify('b/'+path)}`).replace(/^--- .*$/m,()=>`--- ${a?JSON.stringify('a/'+path):'/dev/null'}`).replace(/^\+\+\+ .*$/m,()=>`+++ ${b?JSON.stringify('b/'+path):'/dev/null'}`);
 }finally{await rm(scratch,{recursive:true,force:true});}
}
export interface TaskRevisionInput {taskId:string;previousRevisionId?:string;beforeSnapshotId:string;afterSnapshotId:string;receiptIds:string[];artifactIds:string[]}
async function validateEvidence(store:FactoryStore,taskId:string,after:FactorySnapshot,receiptIds:string[],commandIds:string[]):Promise<void>{
 if(!receiptIds.length)throw new Error('Task revision requires trusted verification evidence.');const commands=new Set<string>();
 for(const id of receiptIds){const a=await readArtifact(store,id);if(a.record.kind!=='receipt')throw new Error('Not a verification receipt.');const receipt=JSON.parse(a.content.toString());if(receipt.taskId!==taskId||receipt.after?.fingerprint!==after.fingerprint||receipt.before?.fingerprint!==after.fingerprint||receipt.stale!==false||receipt.checksPassed!==true||receipt.process?.reason!=='success'||receipt.process?.exitCode!==0)throw new Error('Verification evidence stale/failed or wrong source.');commands.add(receipt.process.commandId);}
 if(commandIds.some(id=>!commands.has(id)))throw new Error('Required test command evidence missing.');
}
export async function createTaskRevision(store:FactoryStore,input:TaskRevisionInput):Promise<FactoryTaskRevision>{return withStoreLock(store,async()=>{
 const manifest=await readManifest(store),task=manifest?.tasks.find(t=>t.id===input.taskId);if(!task)throw new Error('Task is outside approved manifest.');
 const queued:FactoryTaskRevision[]=[];for(const id of manifest!.revisionIds)queued.push(await readTaskRevision(store,id));if(task.dependencies.some(id=>!queued.some(revision=>revision.taskId===id)))throw new Error('Task dependencies lack queued verified revisions.');
 const before=await readSnapshot(store,input.beforeSnapshotId),after=await readSnapshot(store,input.afterSnapshotId);await validateEvidence(store,input.taskId,after,input.receiptIds,task.testCommandIds);
 for(const id of input.artifactIds)await readArtifact(store,id);
 if(input.previousRevisionId){const previous=await readTaskRevision(store,input.previousRevisionId);if(previous.taskId!==input.taskId)throw new Error('Rework task mismatch.');}
 const a=new Map(before.files.map(f=>[f.path,f])),b=new Map(after.files.map(f=>[f.path,f]));const changes:FactoryChangedFile[]=[];
 for(const path of [...new Set([...a.keys(),...b.keys()])].sort()){
  const old=a.get(path),next=b.get(path);if(old?.sha256===next?.sha256&&old?.mode===next?.mode)continue;
  if(!task.pathScope.some(scope=>scope.endsWith('/')?path.startsWith(scope):path===scope))throw new Error('Task change exceeds approved path scope: '+JSON.stringify(path));
  const binary=!!(old?.binary||next?.binary);let patch=binary?`Binary files ${JSON.stringify('a/'+path)} and ${JSON.stringify('b/'+path)} differ\n`:await patchText(store,path,old?(await readArtifact(store,old.objectId)).content:undefined,next?(await readArtifact(store,next.objectId)).content:undefined);
  const modeHeader=old&&next&&old.mode!==next.mode?`old mode ${old.mode.toString(8)}\nnew mode ${next.mode.toString(8)}\n`:!old?`new file mode ${next!.mode.toString(8)}\n`:!next?`deleted file mode ${old.mode.toString(8)}\n`:'';patch=modeHeader+patch;
  const artifact=await writeArtifactUnlocked(store,{kind:'patch',content:patch});changes.push({path,status:!old?'added':!next?'deleted':'modified',binary,beforeMode:old?.mode??null,afterMode:next?.mode??null,patchArtifactId:artifact.id,beforeSourceId:old?.objectId??null,afterSourceId:next?.objectId??null});
 }
 const revision:FactoryTaskRevision={version:1,id:newId('revision'),scope:store.scope,taskId:input.taskId,previousRevisionId:input.previousRevisionId??null,beforeSnapshotId:before.id,afterSnapshotId:after.id,sourceFingerprint:after.fingerprint,changes,artifactIds:[...input.artifactIds],receiptIds:[...input.receiptIds],createdAt:new Date().toISOString()};
 await publishRecord(store,revision);return revision;
 });}
export async function readTaskRevision(store:FactoryStore,id:string):Promise<FactoryTaskRevision>{
 const revision=await readRecord<FactoryTaskRevision>(store,id);if(!id.startsWith('revision-')||!Array.isArray(revision.changes))throw new Error('Invalid task revision.');await readSnapshot(store,revision.beforeSnapshotId);const after=await readSnapshot(store,revision.afterSnapshotId);if(after.fingerprint!==revision.sourceFingerprint)throw new Error('Revision source fingerprint mismatch.');
 for(const c of revision.changes){pathOK(c.path);const patch=await readArtifact(store,c.patchArtifactId);if(patch.record.kind!=='patch')throw new Error('Invalid patch artifact.');for(const source of [c.beforeSourceId,c.afterSourceId])if(source)await readArtifact(store,source);}
 for(const a of revision.artifactIds)await readArtifact(store,a);await validateEvidence(store,revision.taskId,after,revision.receiptIds,[]);return revision;
}
export async function listReviewDecisions(store:FactoryStore,revisionId:string):Promise<FactoryReviewDecision[]>{
 await readTaskRevision(store,revisionId);const entries=await readdir(store.directory);if(entries.length>store.limits.maxWorkspaceFiles)throw new Error('Factory workspace file limit exceeded; blocked.');const decisions:FactoryReviewDecision[]=[];
 for(const name of entries.filter(n=>n.startsWith('decision-')&&n.endsWith('.json')).sort()){const record=await readRecord<FactoryReviewDecision>(store,name.slice(0,-5));if(!['accepted','changesrequested'].includes(record.decision)||typeof record.comment!=='string')throw new Error('Invalid saved review decision.');if(record.revisionId===revisionId)decisions.push(record);}
 return decisions.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
}
export async function appendReviewDecision(store:FactoryStore,input:{revisionId:string;decision:'accepted'|'changesrequested';comment:string}):Promise<FactoryReviewDecision>{return withStoreLock(store,async()=>{await readTaskRevision(store,input.revisionId);if(!['accepted','changesrequested'].includes(input.decision)||typeof input.comment!=='string'||Buffer.byteLength(input.comment)>16384)throw new Error('Invalid review decision.');const record:FactoryReviewDecision={version:1,id:newId('decision'),scope:store.scope,...input,createdAt:new Date().toISOString()};await publishRecord(store,record);return record;});}
