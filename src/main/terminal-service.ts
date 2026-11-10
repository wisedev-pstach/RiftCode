import * as pty from 'node-pty';
import {release} from 'node:os';
import {PromptCheckpoints} from './prompt-checkpoints';
import type { IPty } from 'node-pty';
import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { listTerminalSessions } from './terminal-sessions';
import type { AgentSession } from '../shared/contracts';
import { contextPaste, providerArgs } from '../shared/terminal';
import type { TerminalMode, TerminalProvider, TerminalRead, TerminalState } from '../shared/terminal';

const OUTPUT_LIMIT = 256 * 1024;
export class TerminalService {
  readonly checkpoints=new PromptCheckpoints();
  private trackedSending=false; private submitting=false;
  private pasteReady=false; private controlTail='';
  async sendTracked(id:string,text:string):Promise<void>{
    if(this.trackedSending)throw new Error('Checkpoint capture in progress.');
    const child=this.active(id),generation=this.generation,root=this.state!.cwd;
    if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text,'utf8')>32768)throw new Error('Prompt must be between 1 byte and 32 KiB.');
    if(!this.pasteReady)throw new Error('Wait for native CLI input readiness. Nothing sent.');
    this.trackedSending=true;
    try{
      await this.checkpoints.begin(root,id,text,async()=>{
        if(generation!==this.generation||this.active(id)!==child||!this.pasteReady)throw new Error('Session or input readiness changed. Nothing sent.');
        await this.deliver(id,text,child,generation);
      });
    }finally{this.trackedSending=false;}
  }
  /** Explicit user submission only. Readiness is not login/trust approval. */
  async submit(id:string,text:string):Promise<void>{
    const child=this.active(id);
    if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text,'utf8')>32768)throw new Error('Request must be between 1 byte and 32 KiB.');
    if(!this.pasteReady)throw new Error('Wait for native CLI input readiness. Nothing sent.');
    if(this.trackedSending)throw new Error('Checkpoint capture in progress.');
    await this.deliver(id,text,child,this.generation);
  }
  private async deliver(id:string,text:string,child:IPty,generation:number):Promise<void>{
    if(this.submitting)throw new Error('Request delivery in progress. Nothing sent.');
    this.submitting=true;
    try{
      child.write(contextPaste(text));
      // A paste and Enter in one stdin event can be consumed as one paste by TUIs.
      // Separate the keypress from the paste burst; never add a second Enter/retry.
      await this.settleInput();
      if(generation!==this.generation||this.active(id)!==child||!this.pasteReady)throw new Error('Session or readiness changed after paste.');
      child.write('\r');
    }catch{throw new Error('PTY submission is uncertain. Inspect the CLI before retrying.');}
    finally{this.submitting=false;}
  }
  private generation = 0;
  private starting = false;
  private process: IPty | null = null;
  private state: TerminalState | null = null;
  private output = '';
  private offset = 0;
  private inputWindow = 0;
  private inputCount = 0;
  constructor(private readonly resolveCommand: (provider: TerminalProvider) => Promise<string | null>, private readonly sessions: (root:string, provider:TerminalProvider)=>Promise<AgentSession[]> = listTerminalSessions, private readonly resolveArguments:(provider:TerminalProvider,mode:TerminalMode,resumeSessionId:string|undefined,command:string,root:string)=>Promise<string[]> = async(provider,mode,id)=>providerArgs(provider,mode,id), private readonly settleInput:()=>Promise<void> = ()=>new Promise(resolve=>setTimeout(resolve,100))) {}

  async start(root: string, provider: TerminalProvider, mode: TerminalMode, cols: number, rows: number, resumeSessionId?:string): Promise<TerminalState> {
    providerArgs(provider, mode, resumeSessionId); // Validate renderer values before any asynchronous work.
    dimensions(cols, rows);
    if (this.starting || this.state) throw new Error('Stop the current session before starting another.');
    const generation = this.generation;
    this.starting = true;
    try {
      const cwd = await realpath(root);
      if (!(await stat(cwd)).isDirectory()) throw new Error('Repository unavailable.');
      if (generation !== this.generation) throw new Error('Terminal start cancelled.');
      if (resumeSessionId !== undefined) {
        const sessions = await this.sessions(cwd, provider);
        if (generation !== this.generation) throw new Error('Terminal start cancelled.');
        if (!sessions.some(session=>session.id===resumeSessionId)) throw new Error('Session does not belong to the current repository and provider.');
      }
      const command = await this.resolveCommand(provider);
      if (generation !== this.generation) throw new Error('Terminal start cancelled.');
      if (!command) throw new Error(`${provider} is not installed or is not on PATH. Install and authenticate it in your system terminal first.`);
      const args=await this.resolveArguments(provider,mode,resumeSessionId,command,cwd);
      if (generation !== this.generation) throw new Error('Terminal start cancelled.');
      const launch = terminalLaunch(command, args);
      const child = pty.spawn(launch.file, launch.args, { name: 'xterm-256color', cwd, cols, rows, env: terminalEnvironment() });
      this.process = child;
      this.state = {id: randomUUID(), provider, mode, cwd, status: 'running', ...(process.platform==='win32'?{windowsPty:terminalWindowsPty(process.platform,release())}:{})};
      this.output = ''; this.offset = 0;this.pasteReady=false;this.controlTail='';this.checkpoints.clear();
      const id = this.state.id;
      child.onData(data => {
        if (this.state?.id !== id) return;
        this.controlTail+=data;
        for(const match of this.controlTail.matchAll(/\x1b\[\?2004([hl])/g))this.pasteReady=match[1]==='h';
        this.controlTail=this.controlTail.slice(-16);
        this.output += data;
        if (this.output.length > OUTPUT_LIMIT) {
          const removed = this.output.length - OUTPUT_LIMIT;
          this.output = this.output.slice(removed); this.offset += removed;
        }
      });
      child.onExit(({exitCode}) => {
        if (this.state?.id !== id) return;
        if (process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Group already gone. */ } }
        this.state = {...this.state, status:'exited',exitCode};
        this.process = null;
      });
      return {...this.state};
    } finally { if (generation === this.generation) this.starting = false; }
  }
  read(id: string | null, cursor: number): TerminalRead {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('Invalid output cursor.');
    if (id !== null && id !== this.state?.id) throw new Error('Terminal session is no longer available.');
    const start = id === null ? this.offset : Math.max(this.offset, cursor);
    const end = Math.min(this.offset + this.output.length, start + 65536);
    return {state: this.state ? {...this.state} : null, data: this.output.slice(start-this.offset,end-this.offset),cursor:end,truncated: id !== null && cursor < this.offset};
  }
  input(id: string, data: string, paste = false): void {
    if(this.trackedSending)throw new Error('Checkpoint capture in progress. Wait before typing.');
    if(this.submitting)throw new Error('Request delivery in progress. Wait before typing.');
    const child = this.active(id);
    if (typeof data !== 'string' || data.length > 32768) throw new Error('Terminal input is too large.');
    const now = Date.now();
    if (now-this.inputWindow > 1000) { this.inputWindow=now; this.inputCount=0; }
    this.inputCount += data.length;
    if (this.inputCount > 131072) throw new Error('Terminal input rate exceeded.');
    child.write(paste ? contextPaste(data) : data);
  }
  resize(id: string, cols: number, rows: number): void { dimensions(cols,rows); this.active(id).resize(cols, rows); }
  reset(): void {
    this.generation++; this.starting = false;
    const child = this.process;
    this.process = null; this.state = null; this.output = ''; this.offset = 0;
    if (child) {
      // An explicit Stop is final, including foreground descendants in the owned POSIX PTY group.
      if (process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Group may already be gone. */ } }
      try { child.kill('SIGKILL'); } catch { /* Process may already have exited. */ }
    }
  }
  private active(id: string): IPty {
    if (this.state?.id !== id || !this.process || this.state.status !== 'running') throw new Error('No running terminal session.');
    return this.process;
  }
}
/** Metadata is derived in trusted main, never from the renderer's OS/user agent. */
export function terminalWindowsPty(platform:string,osRelease:string):TerminalState['windowsPty'] {
  if(platform!=='win32')return undefined;
  const match=/^\d+\.\d+\.(\d+)(?:\.\d+)?$/.exec(osRelease);
  const buildNumber=match?Number(match[1]):NaN;
  if(!Number.isSafeInteger(buildNumber)||buildNumber<=0)return undefined;
  // Match pinned node-pty's default backend selection (system ConPTY from 18309).
  return {backend:buildNumber>=18309?'conpty':'winpty',buildNumber};
}
function dimensions(cols: number, rows: number): void {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols<2 || cols>500 || rows<1 || rows>200) throw new Error('Invalid terminal dimensions.');
}
export function terminalLaunch(command: string, args: string[], platform = process.platform): {file:string;args:string[] | string} {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    // Only discovered executable paths and fixed provider arguments reach cmd. Never interpolate input/context.
    if (/["%\r\n&|<>^!]/.test(command) || args.some(arg => !/^[a-zA-Z0-9_-]+$/.test(arg))) throw new Error('Unsafe Windows CLI launcher path. Install a native executable instead.');
    return {file: `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\cmd.exe`, args:`/d /s /c ""${command}" ${args.join(' ')}"`};
  }
  return {file:command,args};
}
export function terminalEnvironment(): Record<string,string> {
  const env: Record<string,string> = {TERM:'xterm-256color',COLORTERM:'truecolor'};
  // Do not leak app/service tokens. Providers can use their own user-owned on-disk credentials.
  for (const key of ['PATH','HOME','USER','LOGNAME','SHELL','LANG','LC_ALL','LC_CTYPE','TMPDIR','TMP','TEMP','SystemRoot','SYSTEMROOT','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PATHEXT','COMSPEC']) {
    if (process.env[key]) env[key] = process.env[key]!;
  }
  return env;
}
