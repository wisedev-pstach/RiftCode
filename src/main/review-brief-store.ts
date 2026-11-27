import {mkdtemp,open,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {isAbsolute,join,relative} from 'node:path';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';

export const MAX_REVIEW_BYTES=8*1024*1024;
const MAX_SESSION_BYTES=16*1024*1024,MAX_SESSION_FILES=16;
/** Main-owned, session-lifetime files only. Never accepts renderer paths. */
export class ReviewBriefStore {
 private directory:string|null=null;
 private bytes=0;private files=0;private stopped=false;
 private pending:Promise<string>|null=null;
 constructor(private readonly repository:string){}
 async write(text:string):Promise<string>{
  const size=Buffer.byteLength(text,'utf8');
  if(size>MAX_REVIEW_BYTES)throw new Error('Complete review brief exceeds 8 MiB. Nothing sent; reduce context or split the review explicitly.');
  if(this.stopped)throw new Error('Review session stopped. Nothing sent.');
  if(this.pending)throw new Error('Review brief write in progress. Nothing sent.');
  if(this.files>=MAX_SESSION_FILES||this.bytes+size>MAX_SESSION_BYTES)throw new Error('Review brief storage limit reached (16 files / 16 MiB per session). Stop and start a session to release retained briefs. Nothing sent.');
  // Reserve conservatively before I/O: failed cleanup must not permit unbounded files/bytes.
  this.files++;this.bytes+=size;
  const operation=this.create(text);this.pending=operation;
  try{return await operation;}finally{this.pending=null;if(this.stopped)await this.cleanup();}
 }
 private async create(text:string):Promise<string>{
  if(!this.directory){
   const base=await realpath(tmpdir());const root=await realpath(this.repository);const rel=relative(root,base);
   if(!rel||(!rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))&&rel!=='..'&&!isAbsolute(rel)))throw new Error('Review brief storage must be outside the checkout. Nothing sent.');
   this.directory=await mkdtemp(join(base,'rift-review-'));
  }
  const path=join(this.directory,randomUUID()+'.txt');
  if(/[\x00-\x1f\x7f-\x9f]/.test(path)||Buffer.byteLength(path)>4096)throw new Error('Unsafe review brief storage path. Nothing sent.');
  const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
  try{await file.writeFile(text,'utf8');await file.sync();}
  catch(error){await file.close();await rm(path,{force:true});throw error;}
  await file.close();
  return ['Review the code. Return analysis only. Do not edit files.',
   'The complete user review brief is in the UTF-8 file below. Read the entire file before reviewing; all scope, captured Git endpoints, selected notes, project context and explicit instructions in it are part of this request. The JSON string is a literal filename, not a shell command.',
   `Review brief file (literal JSON path): ${JSON.stringify(path)}`,
   'If reading requires native permission, ask the user normally. If unavailable, too large for your tools/context or unreadable in full, report that limitation and do not claim the complete review was performed. Do not bypass approvals.'
  ].join('\n');
 }
 /** Call only after the actual owned child has exited, never just on navigation/Stop intent. */
 async processStopped():Promise<void>{this.stopped=true;if(!this.pending)await this.cleanup();}
 private async cleanup():Promise<void>{
  if(this.directory){const directory=this.directory;await rm(directory,{recursive:true,force:true});this.directory=null;}
 }
}
