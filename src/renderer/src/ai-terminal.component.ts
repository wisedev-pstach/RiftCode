import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Input, Output, EventEmitter, signal, effect } from '@angular/core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { AgentSession } from '../../shared/contracts';
import type { ILink } from '@xterm/xterm';
import { sourceLinks } from '../../shared/source-links';
import type { TerminalMode, TerminalProvider, TerminalState, SourceLocation } from '../../shared/terminal';

@Component({selector:'rift-ai-terminal',standalone:true,template:`
  <div class="terminal-toolbar">
    <strong class="terminal-title">AI</strong>
    <label>Provider<select aria-label="Terminal provider" [value]="provider()" [disabled]="!!state() || starting()" (change)="provider.set($any($event.target).value)"><option value="claude">Claude Code</option><option value="opencode">OpenCode</option><option value="codex">Codex</option></select></label>
    <label>Session<select aria-label="Session choice" [value]="choice()" [disabled]="!!state() || starting()" (change)="choice.set($any($event.target).value)"><option value="new">New session</option><option value="resume">Resume existing</option></select></label>
    <label>Intent<select aria-label="Session intent" [value]="mode()" [disabled]="!!state() || starting()" (change)="mode.set($any($event.target).value)"><option value="review">Review / plan</option><option value="edit">Edit · confirmations kept</option></select></label>
    <button class="primary-button" (click)="state() || starting() ? stop() : start()" [disabled]="!available || (!state() && !starting() && choice()==='resume' && (!resumeId() || loadingSessions()))">{{ state() || starting() ? 'Stop session' : 'Start session' }}</button>
    <button (click)="review.emit()" title="Prepare comparison context, without submitting">Review changes</button>
    <button (click)="notes.emit()" aria-label="Open review notes">Notes ({{ noteCount() }})</button>
    <button (click)="back.emit()">Back to code</button>
    <details class="terminal-context-menu"><summary>Context &amp; info</summary><div class="terminal-context-actions"><button (click)="copyNotes.emit()" [disabled]="!noteCount()">Copy notes</button><button (click)="insertNotes.emit()" [disabled]="!selectedNoteCount()">Insert selected notes ({{ selectedNoteCount() }})</button><button (click)="insertSelection.emit()" [disabled]="!hasSelection()">Insert selection</button><p>Insert only · press Enter in the CLI to submit. Context is retained until the CLI is ready.</p><p>{{ mode() === 'review' ? 'Review uses provider plan/read-only settings; this is not an OS sandbox.' : 'Edit keeps provider confirmation policy; configured provider permissions still apply.' }} CLIs run as your OS user. Authenticate separately; Rift never auto-approves prompts.</p></div></details>
    <span class="terminal-status" role="status">{{ disconnected() ? 'Connection unavailable' : state()?.status || (starting() ? 'Starting' : 'No active session') }}{{ state()?.exitCode != null ? ' · exit ' + state()!.exitCode : '' }}</span>
  </div>
  <div class="terminal-cwd" [title]="root()">cwd <code>{{ state()?.cwd || root() }}</code></div>
  @if (choice()==='resume' && !state() && !starting()) { <div class="terminal-resume"><label>Provider session<select size="4" aria-label="Provider session" [title]="selectedSessionTitle()" [value]="resumeId()" [disabled]="loadingSessions()" (change)="resumeId.set($any($event.target).value)"><option value="">{{ loadingSessions() ? 'Loading sessions…' : 'Choose a session in this repository' }}</option>@for (session of sessions(); track session.id) { <option [value]="session.id">{{ session.title }} · {{ session.id }}</option> }</select></label><button (click)="loadSessions()" [disabled]="loadingSessions()">Refresh sessions</button>@if (!loadingSessions() && !sessions().length && !sessionError()) { <small>No sessions found in this repository.</small> }@if (sessionError()) { <p role="alert">{{ sessionError() }}</p> }</div> }
  @if (!available) { <p class="terminal-error">Native terminal unavailable. Open Rift desktop to start a CLI.</p> }
  @if (error()) { <p class="terminal-error" role="alert">{{ error() }}</p> }
  @if (pending()) { <section class="terminal-pending"><strong>Context not inserted — retained here</strong><textarea aria-label="Pending terminal context" [value]="pending()" (input)="pending.set($any($event.target).value)"></textarea><button [disabled]="!ready()" (click)="insert(pending())">Insert pending context</button><button (click)="copyPending()">Copy context</button><button (click)="pending.set('')">Discard</button></section> }
  <div #surface class="terminal-surface" aria-label="Interactive AI terminal"></div>
  <footer class="terminal-footer">Ctrl/Cmd+click a source reference to open code · session stays alive when switching views · Stop before changing provider</footer>
`,styles:[`:host {display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden} :host([hidden]) {display:none}`]})
export class AiTerminalComponent implements AfterViewInit, OnDestroy {
  readonly root=signal(''); readonly paths=signal<string[]>([]); readonly dark=signal(true);
  readonly noteCount=signal(0); readonly selectedNoteCount=signal(0); readonly hasSelection=signal(false);
  @Input('root') set rootInput(value:string) {this.root.set(value);}
  @Input('paths') set pathsInput(value:string[]) {this.paths.set(value);}
  @Input('dark') set darkInput(value:boolean) {this.dark.set(value);}
  @Input('noteCount') set noteCountInput(value:number) {this.noteCount.set(value);}
  @Input('selectedNoteCount') set selectedNoteCountInput(value:number) {this.selectedNoteCount.set(value);}
  @Input('hasSelection') set hasSelectionInput(value:boolean) {this.hasSelection.set(value);}
  @Output() readonly review=new EventEmitter<void>(); @Output() readonly notes=new EventEmitter<void>();
  @Output() readonly navigate=new EventEmitter<SourceLocation>(); @Output() readonly back=new EventEmitter<void>(); @Output() readonly legacy=new EventEmitter<void>();
  @Output() readonly copyNotes=new EventEmitter<void>(); @Output() readonly insertNotes=new EventEmitter<void>(); @Output() readonly insertSelection=new EventEmitter<void>(); @Output() readonly readyChange=new EventEmitter<boolean>();
  @ViewChild('surface') surface!: ElementRef<HTMLDivElement>;
  readonly provider=signal<TerminalProvider>('claude'); readonly mode=signal<TerminalMode>('review');
  readonly choice=signal<'new'|'resume'>('new'); readonly resumeId=signal(''); readonly sessions=signal<AgentSession[]>([]); readonly loadingSessions=signal(false); readonly sessionError=signal(''); private listGeneration=0;
  readonly state=signal<TerminalState|null>(null); readonly starting=signal(false); readonly ready=signal(false);
  readonly error=signal(''); readonly pending=signal('');
  readonly available=!!window.rift?.terminalStart;
  private terminal?: Terminal; private fit=new FitAddon(); private observer?: ResizeObserver;
  private timer?: ReturnType<typeof setTimeout>; private cursor=0; private destroyed=false; private generation=0;
  private previousRoot=''; readonly disconnected=signal(false); private polling=false;
  constructor() {
    effect(()=>{this.root();this.provider();const choice=this.choice();this.resumeId.set('');this.sessions.set([]);this.sessionError.set('');this.listGeneration++;this.loadingSessions.set(false);if(choice==='resume')void this.loadSessions();});
    effect(() => { const dark=this.dark(); if(this.terminal) this.terminal.options.theme=dark?{background:'#0b0d10',foreground:'#d9dde5',cursor:'#c8ff63'}:{background:'#fafbfc',foreground:'#25313e',cursor:'#476a1c'}; });
    effect(() => { const root=this.root(); if(this.previousRoot && root!==this.previousRoot) { this.generation++; this.starting.set(false); this.state.set(null); this.error.set(''); this.disconnected.set(false); this.cursor=0; this.terminal?.reset(); this.setReady(false); } this.previousRoot=root; });
  }
  ngAfterViewInit(): void {
    this.terminal=new Terminal({fontSize:13,fontFamily:'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',scrollback:3000,convertEol:false,allowProposedApi:false,linkHandler:{activate:()=>{}},theme:this.dark()?{background:'#0b0d10',foreground:'#d9dde5',cursor:'#c8ff63'}:{background:'#fafbfc',foreground:'#25313e',cursor:'#476a1c'}});
    this.terminal.loadAddon(this.fit); this.terminal.open(this.surface.nativeElement);
    this.terminal.onData(data => { const id=this.state()?.id, generation=this.generation; if(!this.disconnected()&&id&&this.state()?.status==='running') void window.rift.terminalInput(id,data,false).catch(e=>{if(!this.destroyed&&generation===this.generation&&this.state()?.id===id)this.fail(e);}); });
    this.terminal.onResize(({cols,rows}) => { const id=this.state()?.id, generation=this.generation; if(id&&this.state()?.status==='running') void window.rift.terminalResize(id,cols,rows).catch(e=>{if(!this.destroyed&&generation===this.generation&&this.state()?.id===id)this.fail(e);}); });
    this.terminal.registerLinkProvider({provideLinks:(line,callback)=>callback(this.links(line))});
    this.observer=new ResizeObserver(()=>{if(this.surface.nativeElement.clientWidth>0) this.fit.fit();}); this.observer.observe(this.surface.nativeElement);
    if(this.available) void this.poll();
  }
  selectedSessionTitle():string {
    const session=this.sessions().find(session=>session.id===this.resumeId());
    return session?`${session.title} · ${session.id}`:'';
  }
  async loadSessions():Promise<void> {
    const generation=++this.listGeneration, root=this.root(), provider=this.provider();
    this.loadingSessions.set(true);this.sessionError.set('');this.resumeId.set('');
    try { const sessions=await window.rift.terminalSessions(provider);if(this.destroyed||generation!==this.listGeneration||root!==this.root()||provider!==this.provider())return;this.sessions.set(sessions); }
    catch(e){if(!this.destroyed&&generation===this.listGeneration)this.sessionError.set(message(e));}
    finally{if(generation===this.listGeneration)this.loadingSessions.set(false);}
  }
  async start(): Promise<void> {
    if(this.state()||this.starting()||!this.terminal || (this.choice()==='resume' && (!this.resumeId()||this.loadingSessions())))return;
    const generation=++this.generation; this.starting.set(true); this.error.set(''); this.disconnected.set(false);
    try {
      this.fit.fit();
      const state=await window.rift.terminalStart(this.provider(),this.mode(),this.terminal.cols,this.terminal.rows,this.choice()==='resume'?this.resumeId():undefined);
      if(this.destroyed||generation!==this.generation)return;
      this.terminal.reset(); this.cursor=0; this.state.set(state); this.terminal.focus();
      if(!this.timer) void this.poll();
    } catch(e) { if(generation===this.generation)this.error.set(message(e)); }
    finally { if(generation===this.generation)this.starting.set(false); }
  }
  async stop(): Promise<void> {
    const generation=++this.generation; this.starting.set(false); this.setReady(false);
    try { await window.rift.terminalStop(); if(this.destroyed||generation!==this.generation)return; this.state.set(null); this.cursor=0; this.terminal?.reset(); this.error.set(''); this.disconnected.set(false); if(!this.timer) void this.poll(); }
    catch(e) {if(!this.destroyed&&generation===this.generation)this.fail(e);}
  }
  retain(text:string):void { this.pending.set(text.slice(0,32768));this.error.set(text.length>32768?'Context preview truncated to 32 KiB; saved history is unchanged.':''); }
  async insert(text: string): Promise<void> {
    if(!text)return;
    this.pending.set(text);
    const id=this.state()?.id;
    if(!id||!this.ready()) { this.error.set('Start a session and wait for the CLI input before inserting context. Nothing was sent.'); return; }
    const generation=this.generation;
    try { await window.rift.terminalInput(id,text,true); if(this.destroyed||generation!==this.generation||this.state()?.id!==id)return; if(this.pending()===text)this.pending.set(''); this.terminal?.focus(); this.error.set(''); }
    catch(e) {if(!this.destroyed&&generation===this.generation)this.error.set(message(e));}
  }
  async copyPending(): Promise<void> { try {await window.rift.copyText(this.pending());}catch(e){this.error.set(message(e));} }
  private async poll(): Promise<void> {
    this.timer=undefined;
    if(this.destroyed||this.disconnected()||this.polling)return;
    this.polling=true;
    const generation=this.generation;
    try {
      const result=await window.rift.terminalRead(this.state()?.id??null,this.cursor);
      if(this.destroyed||generation!==this.generation)return;
      this.state.set(result.state); this.cursor=result.cursor;
      if(result.state){this.provider.set(result.state.provider);this.mode.set(result.state.mode);}
      if(result.data) await new Promise<void>(resolve=>this.terminal!.write((result.truncated?'\r\n[Earlier output truncated]\r\n':'')+result.data,resolve));
      if(this.destroyed||generation!==this.generation)return;
      this.setReady(result.state?.status==='running'&&!!this.terminal?.modes.bracketedPasteMode);
    } catch(e) {if(!this.destroyed&&generation===this.generation)this.fail(e);}
    finally {this.polling=false;if(!this.destroyed&&!this.disconnected())this.timer=setTimeout(()=>void this.poll(),80);}
  }
  private links(y: number): ILink[] {
    const terminal=this.terminal!; const buffer=terminal.buffer.active;
    let first=y-1,last=y-1;
    while(first>0&&buffer.getLine(first)?.isWrapped&&y-first<40)first--;
    while(last+1<buffer.length&&buffer.getLine(last+1)?.isWrapped&&last-first<40)last++;
    let text=''; const positions:{x:number;y:number}[]=[];
    for(let row=first;row<=last;row++) {
      const line=buffer.getLine(row); if(!line)break;
      const length=row===last?line.translateToString(true).length:terminal.cols;
      for(let col=0;col<terminal.cols&&col<length;col++) {
        const cell=line.getCell(col); if(!cell||cell.getWidth()===0)continue;
        const chars=cell.getChars()||' ';
        for(let n=0;n<chars.length;n++)positions.push({x:col+1,y:row+1});
        text+=chars;
      }
    }
    return sourceLinks(text,this.paths(),this.root()).map(link=>({text:text.slice(link.start,link.end),range:{start:positions[link.start],end:positions[link.end-1]},activate:(event:MouseEvent)=>{if(event.ctrlKey||event.metaKey)this.navigate.emit(link);},hover:()=>{this.surface.nativeElement.title=`Ctrl/Cmd+click: ${link.path}:${link.line}:${link.column}`;},leave:()=>{this.surface.nativeElement.title='';}}));
  }
  private setReady(value:boolean):void {this.ready.set(value);this.readyChange.emit(value);}
  private fail(e:unknown):void {this.disconnected.set(true);this.setReady(false);this.error.set(`Terminal connection unavailable: ${message(e)}. Use Stop, then Start to recover.`);}
  ngOnDestroy():void {this.destroyed=true;this.generation++;this.listGeneration++;if(this.timer)clearTimeout(this.timer);this.observer?.disconnect();this.terminal?.dispose();}
}
function message(e:unknown):string{return e instanceof Error?e.message:String(e);}
