import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,resolve} from 'node:path';
import {readOnlyGit} from './snapshot';
import {safeDirectory,sha256} from './store';

const MAX_INDEX_BYTES=16*1024*1024;
async function optionalGit(root:string,args:string[]):Promise<string|null>{
 try{return (await readOnlyGit(root,args)).toString('utf8').trim();}
 catch(error){if((error as {code?:number}).code===1)return null;throw error;}
}
async function identity(root:string):Promise<readonly [string|null,string|null,string]>{
 const ref=await optionalGit(root,['symbolic-ref','--quiet','--no-recurse','HEAD']);
 const head=await optionalGit(root,['rev-parse','--verify','--quiet','HEAD']);
 if(ref!==null&&(!ref.startsWith('refs/')||ref.length>4096)||head!==null&&!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head))throw new Error('Invalid Git HEAD identity; reconciliation required.');
 const path=(await readOnlyGit(root,['rev-parse','--git-path','index'])).toString('utf8').trim();
 if(!path||path.includes('\0')||path.length>4096)throw new Error('Invalid Git index path; reconciliation required.');
 return [ref,head,isAbsolute(path)?path:resolve(root,path)];
}
async function indexDigest(file:string):Promise<string|null>{
 // Git resolves linked-worktree indexes outside the checkout. Inspect only that
 // exact regular file, never recursively read .git or follow linked parents.
 await safeDirectory(dirname(file));
 let info;try{info=await lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
 if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>MAX_INDEX_BYTES)throw new Error('Git index must be a bounded regular non-linked file; reconciliation required.');
 const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const start=await fd.stat();
  if(!start.isFile()||start.nlink!==1||start.dev!==info.dev||start.ino!==info.ino||start.size!==info.size||start.size>MAX_INDEX_BYTES)throw new Error('Git index changed during capture; reconciliation required.');
  if(await realpath(process.platform==='linux'?`/proc/self/fd/${fd.fd}`:file)!==file)throw new Error('Git index path changed; reconciliation required.');
  const bytes=Buffer.alloc(start.size+1);let n=0;
  while(n<bytes.length){const read=await fd.read(bytes,n,bytes.length-n,null);if(!read.bytesRead)break;n+=read.bytesRead;}
  const end=await fd.stat();const path=await lstat(file);
  if(n!==start.size||end.size!==start.size||end.mtimeMs!==start.mtimeMs||end.ctimeMs!==start.ctimeMs||end.nlink!==1||path.dev!==start.dev||path.ino!==start.ino||path.ctimeMs!==start.ctimeMs)throw new Error('Git index changed during capture; reconciliation required.');
  return sha256(bytes.subarray(0,n));
 }finally{await fd.close();}
}
/** Native-only digest: symbolic/detached/unborn HEAD identity and exact index presence/bytes/location. */
export async function captureGitState(root:string):Promise<string>{
 const before=await identity(root);const index=await indexDigest(before[2]);
 const after=await identity(root);const again=await indexDigest(after[2]);
 if(JSON.stringify(before)!==JSON.stringify(after)||index!==again)throw new Error('Git HEAD/index metadata changed during capture; manual reconciliation required.');
 return sha256(JSON.stringify([before,index]));
}
export async function assertGitState(root:string,baseline:string|null):Promise<void>{
 if(!baseline||await captureGitState(root)!==baseline)throw new Error('Git HEAD/index metadata changed or approved baseline missing; manual reconciliation required. No rollback performed.');
}
