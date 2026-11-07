import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { AgentSession } from '../shared/contracts';
import { assertTerminalProvider, validResumeSessionId, type TerminalProvider } from '../shared/terminal';

const PREFIX_BYTES = 64 * 1024;
const MAX_ENTRIES = 1000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_MS = 3000;
const unavailable = () => new Error('Provider session metadata is unavailable or unsupported. Use the provider in your system terminal; no authentication was attempted.');
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function parse(text: string): Record<string, unknown> | null { try { return record(JSON.parse(text)); } catch { return null; } }
function samePath(a: string, b: string): boolean { return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; }
function title(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0,120) || fallback : fallback;
}
async function matchesRoot(value: unknown, root: string): Promise<boolean> {
  if (typeof value !== 'string' || value.length > 4096 || !isAbsolute(value)) return false;
  try { return samePath(await realpath(value), root); } catch { return false; }
}
// Do not follow symlinks at ANY level of a provider cache (including the cache root).
async function safePath(home: string, path: string): Promise<boolean> {
  const rel = relative(home, path);
  if (rel === '..' || rel.startsWith('..'+sep) || isAbsolute(rel)) return false;
  let cursor = home;
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    try { if ((await lstat(cursor)).isSymbolicLink()) return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw unavailable(); }
  }
  return samePath(await realpath(path), resolve(path));
}

/** Current SQLite-backed OpenCode delegates metadata serialization to its read-only list command. */
export async function listOpenCodeSessions(root:string, run:()=>Promise<string>):Promise<AgentSession[]> {
  try {
    const cwd=await realpath(root), text=await run();
    if(text.length>1024*1024)throw unavailable();
    const rows:unknown=JSON.parse(text);
    if(!Array.isArray(rows)||rows.length>1000)throw unavailable();
    const sessions:AgentSession[]=[];
    for(const value of rows) {
      const row=record(value), time=record(row?.time);
      const updated=time?.updated ?? row?.updated;
      if(!row || !validResumeSessionId('opencode',row.id) || !await matchesRoot(row.directory,cwd) || typeof updated!=='number' || !Number.isSafeInteger(updated) || updated<0)continue;
      sessions.push({id:row.id,title:title(row.title,'OpenCode conversation'),updatedAt:updated});
    }
    return [...new Map(sessions.sort((a,b)=>b.updatedAt-a.updatedAt).map(s=>[s.id,s])).values()].slice(0,100);
  }catch{throw unavailable();}
}

/** Local metadata only: never boots a provider, loads hooks or reads credentials. Bounded results, not a full-history export. */
export async function listTerminalSessions(root: string, provider: TerminalProvider, options: {home?: string} = {}): Promise<AgentSession[]> {
  assertTerminalProvider(provider);
  const cwd = await realpath(root);
  const home = await realpath(options.home ?? homedir());
  const started = Date.now();
  let visited = 0, bytes = 0;
  const sessions: AgentSession[] = [];
  const check = () => { if (visited > MAX_ENTRIES || bytes > MAX_BYTES || Date.now()-started > MAX_MS) throw unavailable(); };
  const readPrefix = async (path: string): Promise<{text:string;mtime:number;complete:boolean} | null> => {
    check();
    if (!await safePath(home,path)) return null;
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const details = await handle.stat();
      if (!details.isFile() || details.nlink !== 1) return null;
      const buffer=Buffer.alloc(PREFIX_BYTES);
      const {bytesRead}=await handle.read(buffer,0,buffer.length,0);
      bytes+=bytesRead;check();
      return {text:buffer.toString('utf8',0,bytesRead),mtime:details.mtimeMs,complete:bytesRead===details.size};
    } finally { await handle.close(); }
  };
  const walk = async (directory: string, depth: number, acceptDirectory: (name:string, depth:number)=>boolean, acceptFile: (name:string)=>boolean, visit:(path:string,name:string)=>Promise<void>): Promise<void> => {
    if (!await safePath(home,directory)) return;
    const handle=await opendir(directory);
    for await (const entry of handle) {
      visited++;check();
      const path=join(directory,entry.name);
      if (entry.isDirectory() && depth>0 && acceptDirectory(entry.name,depth)) await walk(path,depth-1,acceptDirectory,acceptFile,visit);
      else if (entry.isFile() && acceptFile(entry.name)) await visit(path,entry.name);
    }
  };
  try {
    if (provider === 'claude') {
      const directory=join(home,'.claude','projects',cwd.replace(/[^a-zA-Z0-9]/g,'-'));
      await walk(directory,0,()=>false,name=>name.endsWith('.jsonl'),async(path,name)=>{
        const id=name.slice(0,-6);if(!validResumeSessionId(provider,id))return;
        const prefix=await readPrefix(path);if(!prefix)return;
        let scoped=false, label:unknown;
        for(const line of prefix.text.split('\n')) {
          const event=parse(line);if(!event)continue;
          // A matching filename is not sufficient: require the provider's own session and cwd metadata.
          if(event.sessionId===id && await matchesRoot(event.cwd,cwd))scoped=true;
          if(event.type==='ai-title')label??=event.aiTitle;
          if(event.type==='summary')label??=event.summary;
        }
        if(scoped)sessions.push({id,title:title(label,'Claude conversation'),updatedAt:prefix.mtime});
      });
    } else if(provider === 'codex') {
      await walk(join(home,'.codex','sessions'),3,(name,depth)=>depth===3 ? /^\d{4}$/.test(name) : /^\d{2}$/.test(name),name=>/^rollout-.*\.jsonl$/.test(name),async(path,name)=>{
        const prefix=await readPrefix(path);if(!prefix)return;
        const event=parse(prefix.text.split('\n',1)[0]);
        const meta=record(event?.payload);
        if(event?.type!=='session_meta' || !meta || !validResumeSessionId(provider,meta.id) || !name.endsWith(`-${meta.id}.jsonl`) || !await matchesRoot(meta.cwd,cwd))return;
        const timestamp=typeof meta.timestamp==='string'?Date.parse(meta.timestamp):NaN;
        if(!Number.isFinite(timestamp))return;
        sessions.push({id:meta.id,title:'Codex conversation',updatedAt:prefix.mtime});
      });
    } else {
      await walk(join(home,'.local','share','opencode','storage','session'),1,name=>/^[a-zA-Z0-9_-]{1,100}$/.test(name),name=>name.endsWith('.json'),async(path,name)=>{
        const id=name.slice(0,-5);if(!validResumeSessionId(provider,id))return;
        const prefix=await readPrefix(path);if(!prefix?.complete)return;
        const meta=parse(prefix.text),time=record(meta?.time);
        if(meta?.id!==id || !await matchesRoot(meta?.directory,cwd) || typeof time?.updated!=='number' || !Number.isSafeInteger(time.updated) || time.updated<0)return;
        sessions.push({id,title:title(meta.title,'OpenCode conversation'),updatedAt:time.updated});
      });
    }
    return [...new Map(sessions.sort((a,b)=>b.updatedAt-a.updatedAt).map(s=>[s.id,s])).values()].slice(0,100);
  } catch { throw unavailable(); }
}
