import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {constants} from 'node:fs';
import {isUtf8} from 'node:buffer';
import {open,lstat,realpath,mkdtemp,writeFile,rm,opendir} from 'node:fs/promises';
import {join,sep,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import type {ChangedFile,FilePatch} from '../shared/contracts';
import type {PromptSummary} from '../shared/contracts';
export type {PromptSummary} from '../shared/contracts';
type Image=Map<string,Buffer>;
type Entry={number:number;id:string;label:string;before:Image;after?:Image;view?:{id:string;frozen:boolean;changes:{file:ChangedFile;patch:FilePatch}[]}};
const run=promisify(execFile);
function gitEnvironment():NodeJS.ProcessEnv{
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('GIT_')));
 return {...env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'};
}
const config=['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-c','core.quotePath=false'];
export class PromptCheckpoints {
 private root='';private entries:Entry[]=[];private busy=false;private generation=0;private revision=0;private refreshing=false;private finishing=false;private nextNumber=1;
 clear():void {this.generation++;this.revision++;this.root='';this.entries=[];this.nextNumber=1;}
 async begin(root:string,session:string,label:string,submit:()=>void|Promise<void>):Promise<void> {
  if(this.busy)throw new Error('Checkpoint operation in progress.');
  this.busy=true;const generation=this.generation;
  try{
    const canonical=await realpath(root);
   if(generation!==this.generation)throw new Error('Checkpoint cancelled.');
   if(this.root&&this.root!==canonical)throw new Error('Checkpoint repository changed.');
   const image=await capture(canonical);
   if(generation!==this.generation)throw new Error('Checkpoint cancelled.');
   if(this.root && this.root!==canonical)throw new Error('Checkpoint repository changed.');
   // The trusted callback rechecks native identity before paste and the separate Enter.
   await submit();
   if(generation!==this.generation)throw new Error('Checkpoint cancelled. Inspect the CLI before retrying.');
   this.revision++;this.root=canonical;
   const last=this.entries.at(-1);if(last&&!last.after)last.after=image;
   this.entries.push({number:this.nextNumber++,id:session+':'+randomUUID(),label:label.split(/[\r\n]/)[0].replace(/[\x00-\x1f\x7f]/g,'').slice(0,80),before:image});
   while(this.entries.length>3)this.entries.shift();
  }finally{this.busy=false;}
 }
 async list(root:string):Promise<PromptSummary[]> {
  if(this.refreshing)throw new Error('Checkpoint refresh in progress.');
  this.refreshing=true;const generation=this.generation,revision=this.revision,entries=[...this.entries];
  try{
   if(!this.root||await realpath(root)!==this.root)return [];
   const image=entries.some(e=>!e.after)?await capture(this.root):undefined;
   const views:NonNullable<Entry['view']>[]=[];let bytes=0;
   for(const entry of entries){
    const view=entry.view?.frozen?entry.view:{id:randomUUID(),frozen:!!entry.after,changes:await compare(entry.before,entry.after??image!)};
    bytes+=view.changes.reduce((s,c)=>s+Buffer.byteLength(c.patch.patch),0);
    if(bytes>40*1024*1024)throw new Error('Checkpoint diff limit: 40 MiB. Counts unavailable; no partial summary.');
    views.push(view);
   }
   if(generation!==this.generation||revision!==this.revision)throw new Error('Checkpoint changed during refresh. Refresh again.');
   return entries.map((entry,index)=>{
    const view=views[index];entry.view=view;const files=view.changes.map(c=>({...c.file}));
    return {number:entry.number,id:entry.id,viewId:view.id,label:entry.label,live:!entry.after,files,additions:files.reduce((s,f)=>s+f.additions,0),deletions:files.reduce((s,f)=>s+f.deletions,0)};
   });
  }finally{this.refreshing=false;}
 }
 async patch(root:string,id:string,path:string,viewId?:string):Promise<FilePatch> {
  const generation=this.generation;if(await realpath(root)!==this.root)throw new Error('Checkpoint repository changed.');
  if(generation!==this.generation)throw new Error('Checkpoint cancelled.');
  const entry=this.entries.find(e=>e.id===id);if(!entry)throw new Error('Checkpoint expired.');
  if(!viewId||entry.view?.id!==viewId)throw new Error('Checkpoint view expired. Refresh changes and reopen review.');
  const result=entry.view.changes.find(x=>x.file.path===path)?.patch;
  if(!result)throw new Error('No checkpoint change for this file.');return {...result};
 }
 async finish(root:string):Promise<void>{
  if(this.finishing)throw new Error('Checkpoint finish in progress.');
  this.finishing=true;
  try{
   const generation=this.generation,revision=this.revision;const entry=this.entries.at(-1);
   if(!entry||entry.after)return;
   const canonical=await realpath(root);if(generation!==this.generation||canonical!==this.root)throw new Error('Checkpoint cancelled.');
   const image=await capture(canonical);
   if(generation!==this.generation||revision!==this.revision)throw new Error('Checkpoint cancelled.');entry.after=image;this.revision++;
  }finally{this.finishing=false;}
 }
}
async function capture(root:string):Promise<Image>{
 const listed=await run('git',[...config,'ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,env:gitEnvironment(),maxBuffer:2*1024*1024,timeout:10000,encoding:'buffer'});
 if(!isUtf8(listed.stdout))throw new Error('Checkpoint requires UTF-8 file paths. Nothing sent.');
 const stdout=listed.stdout.toString('utf8');
 const paths=[...new Set(stdout.split('\0').filter(Boolean))];if(paths.length>5000)throw new Error('Checkpoint limit: 5000 files. Nothing sent.');
 const image:Image=new Map();let total=0;
 // Git omits untracked special objects (for example FIFOs). Detect them without opening them.
 const ignored=(await run('git',[...config,'ls-files','-z','--others','--ignored','--exclude-standard','--directory'],{cwd:root,env:gitEnvironment(),maxBuffer:2*1024*1024,timeout:10000})).stdout.split('\0').filter(Boolean);
 let scanned=0;const inspect=async(directory:string,prefix:string):Promise<void>=>{
  for await(const entry of await opendir(directory)){
   if(entry.name.toLowerCase()==='.git')continue;
   const path=prefix+entry.name;
   if(ignored.some(excluded=>path===excluded||excluded.endsWith('/')&&path.startsWith(excluded))&&!paths.some(listed=>listed===path||listed.startsWith(path+'/')))continue;
   if(++scanned>10000)throw new Error('Checkpoint directory scan limit: 10000 entries.');
   if(entry.isDirectory()){const next=join(directory,entry.name);if(await realpath(next)!==join(root,path))throw new Error('Checkpoint directory changed.');await inspect(next,path+'/');}
   else if(!entry.isFile()&&!paths.includes(path))throw new Error('Checkpoint requires regular, non-linked files: '+path);
  }
 };await inspect(root,'');
 for(const path of paths){
  const parts=path.split('/');if(isAbsolute(path)||parts.some(p=>!p||p==='..'||p==='.'||p.toLowerCase()==='.git'))throw new Error('Unsafe checkpoint path.');
  let parent=root;
  try{
   for(const part of parts.slice(0,-1)){parent=join(parent,part);const info=await lstat(parent);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Checkpoint cannot read symlink directories.');}
   const file=join(root,path);const info=await lstat(file);
   if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw new Error('Checkpoint requires regular, non-linked files: '+path);
   if(info.size>1024*1024)throw new Error('Checkpoint file limit: 1 MiB: '+path);
   const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   try{
    const opened=await fd.stat();if(!opened.isFile()||opened.nlink!==1||opened.ino!==info.ino||opened.dev!==info.dev)throw new Error('Checkpoint file changed during capture.');
    const actual=await realpath(process.platform==='linux'?`/proc/self/fd/${fd.fd}`:file);
    const rel=relative(root,actual);if(rel.startsWith('..'+sep)||isAbsolute(rel)||rel!==path.split('/').join(sep))throw new Error('Checkpoint path changed during capture.');
    const buffer=Buffer.alloc(1024*1024+1);let size=0;
    while(size<buffer.length){const read=await fd.read(buffer,size,buffer.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead;}
    if(size>1024*1024)throw new Error('Checkpoint file limit: 1 MiB: '+path);
    total+=size;if(total>20*1024*1024)throw new Error('Checkpoint total limit: 20 MiB.');image.set(path,Buffer.from(buffer.subarray(0,size)));
   }finally{await fd.close();}
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
 }
 return image;
}
async function compare(before:Image,after:Image,only?:string):Promise<{file:ChangedFile;patch:FilePatch}[]>{
 const result:{file:ChangedFile;patch:FilePatch}[]=[];
 for(const path of new Set([...before.keys(),...after.keys()])){
  if(only!==undefined&&path!==only)continue;
  const a=before.get(path),b=after.get(path);if(a&&b&&a.equals(b))continue;
  const binary=!!(a&&(a.includes(0)||!isUtf8(a))||b&&(b.includes(0)||!isUtf8(b)));let patch='';
  if(!binary){
   const scratch=await mkdtemp(join(tmpdir(),'rift-prompt-diff-'));
   try{
    await writeFile(join(scratch,'before'),a??Buffer.alloc(0),{mode:0o600});await writeFile(join(scratch,'after'),b??Buffer.alloc(0),{mode:0o600});
    try{patch=(await run('git',[...config,'diff','--no-index','--no-ext-diff','--no-textconv','--no-color','--unified=2147483647','--','before','after'],{cwd:scratch,env:gitEnvironment(),maxBuffer:5*1024*1024,timeout:10000})).stdout;}catch(error){if((error as {code?:number}).code!==1)throw error;patch=(error as {stdout:string}).stdout;}
    patch=patch.replace(/^diff --git .*$/m,()=>`diff --git ${JSON.stringify('a/'+path)} ${JSON.stringify('b/'+path)}`).replace(/^--- .*$/m,()=>`--- ${a?JSON.stringify('a/'+path):'/dev/null'}`).replace(/^\+\+\+ .*$/m,()=>`+++ ${b?JSON.stringify('b/'+path):'/dev/null'}`);
   }finally{await rm(scratch,{recursive:true,force:true});}
  }
  const hunk=patch.search(/^@@ /m);const lines=hunk<0?[]:patch.slice(hunk).split('\n');const additions=lines.filter(l=>l.startsWith('+')).length;const deletions=lines.filter(l=>l.startsWith('-')).length;
  result.push({file:{path,status:!a?'added':!b?'deleted':'modified',additions,deletions,binary},patch:{path,patch,binary}});
 }
 return result;
}
