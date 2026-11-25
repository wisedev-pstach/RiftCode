import {constants} from 'node:fs';
import {lstat,mkdir,open,realpath,rename,unlink,link,readdir} from 'node:fs/promises';
import {isAbsolute,join,relative,sep,parse} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {FactoryScope,FactoryManifest,FactoryTask,FactoryRunState} from '../../shared/factory';
export interface FactoryLimits {maxWorkspaceBytes:number;maxWorkspaceFiles:number;maxObjectBytes:number;maxSnapshotBytes:number;maxSnapshotFiles:number;maxFileBytes:number;maxScanEntries:number}
export const DEFAULT_FACTORY_LIMITS:Readonly<FactoryLimits>=Object.freeze({maxWorkspaceBytes:128*1024*1024,maxWorkspaceFiles:20000,maxObjectBytes:24*1024*1024,maxSnapshotBytes:20*1024*1024,maxSnapshotFiles:5000,maxFileBytes:1024*1024,maxScanEntries:10000});
export interface FactoryStore {readonly directory:string;readonly scope:Readonly<FactoryScope>;readonly limits:Readonly<FactoryLimits>}
const stores=new WeakSet<object>();
export const sha256=(bytes:Buffer|string):string=>createHash('sha256').update(bytes).digest('hex');
export function assertId(id:string):void {if(typeof id!=='string'||!/^[a-z]+-[a-f0-9-]{36}$/.test(id))throw new Error('Invalid factory ID.');}
export const newId=(kind:string):string=>`${kind}-${randomUUID()}`;
const inside=(base:string,target:string):boolean=>{const r=relative(base,target);return !r||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep));};
export async function safeDirectory(directory:string,create=false):Promise<void>{
 if(!isAbsolute(directory))throw new Error('Factory directory must be absolute.');
 const parts=relative(parse(directory).root,directory).split(sep).filter(Boolean);let cursor=parse(directory).root;
 for(const part of parts){cursor=join(cursor,part);try{const s=await lstat(cursor);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Unsafe linked/special factory directory.');}catch(error){if(!create||(error as NodeJS.ErrnoException).code!=='ENOENT')throw error;try{await mkdir(cursor,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}const s=await lstat(cursor);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Unsafe factory directory.');}}
}
export async function openFactoryStore(options:{root:string;userData:string;limits?:Partial<FactoryLimits>}):Promise<FactoryStore>{
 await safeDirectory(options.root);const root=await realpath(options.root);
 if(!isAbsolute(options.userData)||inside(root,options.userData))throw new Error('Factory userData must be outside checkout, including preview overrides.');
 await safeDirectory(options.userData,true);const data=await realpath(options.userData);
 const workspaceId=sha256(root);const directory=join(data,'factory-v1',workspaceId);
 if(inside(root,directory))throw new Error('Factory storage must be outside checkout.');
 await safeDirectory(directory,true);
 const limits={...DEFAULT_FACTORY_LIMITS,...options.limits};for(const [key,value] of Object.entries(limits))if(!Number.isSafeInteger(value)||value<=0||value>DEFAULT_FACTORY_LIMITS[key as keyof FactoryLimits])throw new Error('Factory limits may only be lowered.');
 const store=Object.freeze({directory,scope:Object.freeze({workspaceId,canonicalRoot:root}),limits:Object.freeze(limits)});stores.add(store);
 const binding=join(directory,'binding.json');
 try{const existing=JSON.parse((await safeRead(store,binding,4096)).toString());if(existing.version!==1||existing.canonicalRoot!==root||existing.workspaceId!==workspaceId)throw new Error('Factory root binding mismatch.');}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await publishBytes(store,'binding.json',Buffer.from(JSON.stringify({version:1,...store.scope})),false);}
 return store;
}
export async function assertStore(store:FactoryStore):Promise<void>{if(!stores.has(store))throw new Error('Factory requires native-created store.');await safeDirectory(store.directory);if(await realpath(store.scope.canonicalRoot)!==store.scope.canonicalRoot)throw new Error('Factory root changed.');}
export async function safeRead(store:FactoryStore,file:string,max=store.limits.maxObjectBytes):Promise<Buffer>{
 if(!inside(store.directory,file)||relative(store.directory,file).includes(sep))throw new Error('Unsafe factory object path.');
 await assertStore(store);const info=await lstat(file);if(!info.isFile()||info.nlink!==1||info.isSymbolicLink())throw new Error('Factory requires regular non-linked file.');if(info.size>max)throw new Error('Factory read limit exceeded; blocked.');
 const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const s=await fd.stat();if(!s.isFile()||s.nlink!==1||s.ino!==info.ino||s.dev!==info.dev)throw new Error('Factory file changed.');const actual=await realpath(process.platform==='linux'?`/proc/self/fd/${fd.fd}`:file);if(actual!==file)throw new Error('Factory path escaped.');const buffer=Buffer.alloc(Math.min(max,s.size)+1);let n=0;while(n<buffer.length){const r=await fd.read(buffer,n,buffer.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}const end=await fd.stat();if(end.size!==s.size||end.mtimeMs!==s.mtimeMs||end.ctimeMs!==s.ctimeMs||end.nlink!==1||n!==s.size)throw new Error('Factory object changed during read.');if(n>max)throw new Error('Factory read limit exceeded; blocked.');return buffer.subarray(0,n);}finally{await fd.close();}
}
export async function withStoreLock<T>(store:FactoryStore,work:()=>Promise<T>):Promise<T>{
 await assertStore(store);const lock=join(store.directory,'write.lock');let fd;
 try{fd=await open(lock,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new Error('Factory busy or interrupted write; inspect/recover lock explicitly.');throw error;}
 try{return await work();}finally{await fd.close();await unlink(lock);}
}
async function budget(store:FactoryStore,extra:number):Promise<void>{let bytes=0,count=0;for(const name of await readdir(store.directory)){const s=await lstat(join(store.directory,name));if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw new Error('Unsafe factory storage entry; blocked.');bytes+=s.size;if(++count>=store.limits.maxWorkspaceFiles)throw new Error('Factory workspace file limit exceeded; blocked.');}if(bytes+extra>store.limits.maxWorkspaceBytes)throw new Error('Factory workspace byte limit exceeded; blocked.');}
/** Internal native-only primitive. Caller holds write lock for batches. No overwrite for immutable files. */
export async function publishBytes(store:FactoryStore,name:string,bytes:Buffer,replace=false):Promise<void>{
 if(!/^[a-zA-Z0-9.-]+$/.test(name)||name.startsWith('.'))throw new Error('Unsafe factory storage name.');await assertStore(store);
 if(bytes.length>store.limits.maxObjectBytes)throw new Error('Factory object byte limit exceeded; blocked.');await budget(store,bytes.length);
 const temp=join(store.directory,`partial-${randomUUID()}`);const target=join(store.directory,name);const fd=await open(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);
 try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
 try{if(replace){try{await safeRead(store,target);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}await rename(temp,target);}else{await link(temp,target);await unlink(temp);}const dir=await open(store.directory,constants.O_RDONLY);try{await dir.sync();}finally{await dir.close();}}
 finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
export async function publishRecord(store:FactoryStore,record:{version:1;id:string;scope:FactoryScope}):Promise<void>{assertId(record.id);assertScope(store,record);await publishBytes(store,record.id+'.json',Buffer.from(JSON.stringify(record)));}
export function assertScope(store:FactoryStore,record:{version:number;scope:FactoryScope}):void{if(record.version!==1||record.scope?.canonicalRoot!==store.scope.canonicalRoot||record.scope?.workspaceId!==store.scope.workspaceId)throw new Error('Factory record version/root binding mismatch.');}
export async function readRecord<T extends {version:1;id:string;scope:FactoryScope}>(store:FactoryStore,id:string):Promise<T>{assertId(id);const record=JSON.parse((await safeRead(store,join(store.directory,id+'.json'))).toString()) as T;assertScope(store,record);if(record.id!==id)throw new Error('Factory record ID mismatch.');return record;}
const states:FactoryRunState[]=['pending','implementing','verifying','repairing','readyforreview','blocked','failed','stopped','interrupted'];
function validateManifest(store:FactoryStore,m:FactoryManifest):void{
 assertScope(store,m);assertId(m.id);if(!states.includes(m.state)||typeof m.title!=='string'||!Array.isArray(m.requirements)||!m.requirements.every(r=>typeof r==='string')||!Array.isArray(m.tasks)||m.tasks.length>500)throw new Error('Invalid factory manifest.');
 const ids=new Set<string>();for(const task of m.tasks){if(!/^[\w-]{1,100}$/.test(task.id)||ids.has(task.id)||typeof task.title!=='string')throw new Error('Invalid/duplicate task.');ids.add(task.id);if(!Array.isArray(task.dependencies)||!task.dependencies.every(id=>ids.has(id)&&id!==task.id)||!Array.isArray(task.testCommandIds)||!task.testCommandIds.every(id=>/^[\w-]{1,100}$/.test(id))||!Array.isArray(task.pathScope)||!task.pathScope.length||!task.pathScope.every(p=>typeof p==='string'&&p.length<=4096&&!isAbsolute(p)&&!p.includes('\\')&&!p.split('/').some(s=>s==='..'||s==='.'||s.toLowerCase()==='.git')&&p.length>0))throw new Error('Invalid dependencies/test command IDs/path scope.');}
 for(const list of [m.revisionIds,m.artifactIds]){if(!Array.isArray(list))throw new Error('Invalid manifest references.');list.forEach(assertId);}
}
async function validateManifestReferences(store:FactoryStore,m:FactoryManifest):Promise<void>{
 const {readArtifact}=await import('./artifacts');const {readTaskRevision}=await import('./snapshot');
 for(const id of m.artifactIds)await readArtifact(store,id);
 for(const id of m.revisionIds){const revision=await readTaskRevision(store,id);if(!m.tasks.some(t=>t.id===revision.taskId))throw new Error('Queued revision task mismatch.');}
}
export async function createManifest(store:FactoryStore,input:{title:string;requirements:string[];tasks:FactoryTask[]}):Promise<FactoryManifest>{const m:FactoryManifest={version:1,id:newId('manifest'),scope:store.scope,...input,state:'pending',revisionIds:[],artifactIds:[],createdAt:new Date().toISOString()};await withStoreLock(store,async()=>{validateManifest(store,m);await publishBytes(store,'manifest.json',Buffer.from(JSON.stringify(m)));});return m;}
export async function writeManifest(store:FactoryStore,m:FactoryManifest):Promise<void>{await withStoreLock(store,async()=>{validateManifest(store,m);const old=await readManifest(store);if(!old||old.id!==m.id)throw new Error('Manifest identity mismatch.');if(JSON.stringify([old.title,old.requirements,old.tasks,old.createdAt])!==JSON.stringify([m.title,m.requirements,m.tasks,m.createdAt]))throw new Error('Approved plan is immutable.');await validateManifestReferences(store,m);if(old.artifactIds.some(id=>!m.artifactIds.includes(id)))throw new Error('Artifact references are append-only.');if(old.revisionIds.some(id=>!m.revisionIds.includes(id)))throw new Error('Queued revisions are append-only.');await publishBytes(store,'manifest.json',Buffer.from(JSON.stringify(m)),true);});}
export async function readManifest(store:FactoryStore):Promise<FactoryManifest|null>{try{const m=JSON.parse((await safeRead(store,join(store.directory,'manifest.json'))).toString()) as FactoryManifest;validateManifest(store,m);await validateManifestReferences(store,m);if(['implementing','verifying','repairing'].includes(m.state))return {...m,state:'interrupted'};return m;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){// Only a genuinely absent manifest is empty, never dangling evidence.
 try{await lstat(join(store.directory,'manifest.json'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;}throw new Error('Factory manifest evidence is incomplete; interrupted.');}throw error;}}
