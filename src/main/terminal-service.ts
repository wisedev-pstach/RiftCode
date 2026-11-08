import * as pty from 'node-pty';
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
  private trackedSending=false;
  private pasteReady=false; private controlTail='';
  async sendTracked(id:string,text:string):Promise<void>{
    if(this.trackedSending)throw new Error('Checkpoint capture in progress.');
    const child=this.active(id),generation=this.generation,root=this.state!.cwd;
    if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text,'utf8')>32768)throw new Error('Prompt must be between 1 byte and 32 KiB.');
    if(!this.pasteReady)throw new Error('Wait for native CLI input readiness. Nothing sent.');
    const data=contextPaste(text)+'\r';
    this.trackedSending=true;
    try{
      await this.checkpoints.begin(root,id,text,()=>{
        if(generation!==this.generation||this.active(id)!==child||!this.pasteReady)throw new Error('Session or input readiness changed. Nothing sent.');
        try{child.write(data);}catch{throw new Error('PTY write failed; submission is uncertain. Check the CLI before retrying.');}
      });
    }finally{this.trackedSending=false;}
  }
  /** Explicit user submission only. Readiness is not login/trust approval. */
  async submit(id:string,text:string):Promise<void>{
    const child=this.active(id);
    if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text,'utf8')>32768)throw new Error('Request must be between 1 byte and 32 KiB.');
    if(!this.pasteReady)throw new Error('Wait for native CLI input readiness. Nothing sent.');
    try{child.write(contextPaste(text)+'\r');}catch{throw new Error('PTY write failed; submission is uncertain. Inspect the CLI before retrying.');}
  }
  private generation = 0;
  private starting = false;
  private process: IPty | null = null;
  private state: TerminalState | null = null;
  private output = '';
  private offset = 0;
  private inputWindow = 0;
  private inputCount = 0;
  constructor(private readonly resolveCommand: (provider: TerminalProvider) => Promise<string | null>, private readonly sessions: (root:string, provider:TerminalProvider)=>Promise<AgentSession[]> = listTerminalSessions, private readonly resolveArguments:(provider:TerminalProvider,mode:TerminalMode,resumeSessionId:string|undefined,command:string,root:string)=>Promise<string[]> = async(provider,mode,id)=>providerArgs(provider,mode,id)) {}

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
      this.state = {id: randomUUID(), provider, mode, cwd, status: 'running'};
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
