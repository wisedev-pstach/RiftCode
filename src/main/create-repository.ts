import {execFile} from 'node:child_process';
import {lstatSync, mkdirSync, realpathSync, type Stats} from 'node:fs';
import {realpath} from 'node:fs/promises';
import {isAbsolute, join} from 'node:path';
import {promisify} from 'node:util';
import type {RepositorySnapshot} from '../shared/contracts';
import {repositoryGitEnvironment} from './git-environment';
import {assertRepositoryName} from '../shared/repository-name';

export interface RepositoryCreationActions {
 chooseParent(name:string):Promise<string|null>;
 assertCurrent():void;
 openRepository(root:string):Promise<RepositorySnapshot>;
 /** Native process boundary, substituted only in filesystem/lifecycle fixtures. */
 initialize?(root:string):Promise<void>;
}
async function initializeRepository(root:string):Promise<void> {
 const env=repositoryGitEnvironment();
 await promisify(execFile)('git',['-c','core.hooksPath=','-c','core.fsmonitor=false','init','--initial-branch=main','--template='],{
  cwd:root,env,shell:false,windowsHide:true,timeout:30_000,maxBuffer:1024*1024
 });
}
function directoryIdentity(path:string,expected?:Stats):Stats {
 const info=lstatSync(path);
 if(!info.isDirectory()||info.isSymbolicLink()||realpathSync(path)!==path
  ||(expected&&(info.dev!==expected.dev||info.ino!==expected.ino)))throw Error('The selected directory changed or is unsafe.');
 return info;
}
/** Only a native picker grants a parent. Existing objects are never reused or removed. */
export async function createLocalRepository(name:unknown,actions:RepositoryCreationActions):Promise<RepositorySnapshot|null> {
 assertRepositoryName(name);actions.assertCurrent();
 const selected=await actions.chooseParent(name);actions.assertCurrent();
 if(selected===null)return null;
 if(!isAbsolute(selected))throw Error('Choose an absolute parent directory.');
 const parent=await realpath(selected);actions.assertCurrent();
 const parentIdentity=directoryIdentity(parent);
 const root=join(parent,name);
 // No await between the last authorization/identity fence and exclusive creation.
 actions.assertCurrent();directoryIdentity(parent,parentIdentity);
 try {mkdirSync(root);}catch(error){
  if((error as NodeJS.ErrnoException).code==='EEXIST')throw Error(`A file or folder named "${name}" already exists. Choose another project name or parent folder.`);
  throw error;
 }
 const identity=directoryIdentity(root);
 try {
  actions.assertCurrent();directoryIdentity(parent,parentIdentity);directoryIdentity(root,identity);
  await (actions.initialize??initializeRepository)(root);actions.assertCurrent();
  directoryIdentity(parent,parentIdentity);directoryIdentity(root,identity);
  actions.assertCurrent();
  const result=await actions.openRepository(root);actions.assertCurrent();
  return result;
 }catch(error){
  throw Error(`The new folder "${root}" was kept. ${error instanceof Error?error.message:String(error)} No files were deleted. Use Open repository to recover it, or choose a different name to retry.`);
 }
}
