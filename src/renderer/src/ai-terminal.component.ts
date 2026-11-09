import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Input, Output, EventEmitter, signal, effect, HostListener } from '@angular/core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { AgentSession,PromptSummary } from '../../shared/contracts';
import type { ILink } from '@xterm/xterm';
import {buildTerminalReview,type ReviewContext,type ReviewScope} from '../../shared/review-request';
import { sourceLinks } from '../../shared/source-links';
import type { TerminalMode, TerminalProvider, TerminalState, SourceLocation } from '../../shared/terminal';

@Component({selector:'rift-ai-terminal',standalone:true,templateUrl:'./ai-terminal.component.html',styles:[`:host {position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden} :host([hidden]) {display:none}`]})
export class AiTerminalComponent implements AfterViewInit, OnDestroy {
  readonly reviewWorkbench:boolean=false;
  readonly slot:'terminal'|'review'='terminal';
  @Input() reviewContext:ReviewContext|null=null;
  @Input() docked=false;
  @Output() readonly dock=new EventEmitter<void>();
  @Output() readonly closeDock=new EventEmitter<void>();
  @Output() readonly switchDock=new EventEmitter<void>();
  readonly briefCollapsed=signal(false);
  readonly reviewScope=signal<ReviewScope>('comparison');readonly instructions=signal('');readonly reviewTone=signal<'professional'|'honest'>('professional');readonly followUp=signal('');readonly reviewSending=signal(false);readonly reviewRuns=signal(0);readonly lastReview=signal('');
  async runReviewRequest(followUp=false):Promise<void>{
    const id=this.state()?.id,generation=this.generation;
    if(!this.reviewWorkbench||!id||!this.ready()||this.reviewSending())return;
    let text:string;
    try{text=followUp?this.followUp():buildTerminalReview(this.reviewContext!,this.reviewScope(),this.instructions(),this.reviewTone());if(!text.trim())return;}catch(e){this.error.set(message(e));return;}
    this.reviewSending.set(true);this.error.set('');if(!followUp)this.briefCollapsed.set(true);
    try{await window.rift.terminalSubmitReview(id,text);if(this.destroyed||generation!==this.generation||id!==this.state()?.id)return;if(followUp){if(this.followUp()===text)this.followUp.set('');}else{this.reviewRuns.update(n=>n+1);this.lastReview.set(text);}this.terminal?.focus();}
    catch(e){if(!this.destroyed&&generation===this.generation&&id===this.state()?.id){if(!followUp)this.briefCollapsed.set(false);this.error.set(message(e));}}
    finally{if(!this.destroyed&&generation===this.generation&&id===this.state()?.id)this.reviewSending.set(false);}
  }
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
  @ViewChild('trackedInput') set trackedInput(ref:ElementRef<HTMLTextAreaElement>|undefined){ref?.nativeElement.focus();}
  @ViewChild('contextMenu') contextMenu?: ElementRef<HTMLDetailsElement>;
  @Output() readonly checkpointReset=new EventEmitter<void>();
  @Output() readonly checkpointReview=new EventEmitter<PromptSummary>();
  readonly trackOpen=signal(false);readonly trackDraft=signal('');readonly tracking=signal(false);readonly summaries=signal<PromptSummary[]>([]);readonly summaryError=signal('');readonly summaryLoading=signal(false);private summaryRequest=0;
  async refreshCheckpoints():Promise<void>{
    if(this.reviewWorkbench||!window.rift.promptSummaries)return;
    const request=++this.summaryRequest,root=this.root(),generation=this.generation;this.summaryLoading.set(true);
    try{const result=await window.rift.promptSummaries();if(!this.destroyed&&request===this.summaryRequest&&root===this.root()&&generation===this.generation){this.summaries.set(result);this.summaryError.set('');}}
    catch(e){if(request===this.summaryRequest&&generation===this.generation)this.summaryError.set(`${message(e)}. Previous summary may be stale; refresh changes to retry.`);}
    finally{if(request===this.summaryRequest)this.summaryLoading.set(false);}
  }
  async sendTracked():Promise<void>{
    const id=this.state()?.id,text=this.trackDraft(),generation=this.generation;
    if(this.tracking()||!id||!this.ready()||!text.trim())return;
    this.tracking.set(true);this.error.set('');
    try{await window.rift.terminalSendTracked(id,text);if(this.destroyed||generation!==this.generation||id!==this.state()?.id)return;if(this.trackDraft()===text)this.trackDraft.set('');this.trackOpen.set(false);this.terminal?.focus();await this.refreshCheckpoints();}
    catch(e){if(!this.destroyed&&generation===this.generation)this.error.set(message(e));}
    finally{if(generation===this.generation)this.tracking.set(false);}
  }
  async finishCheckpoint():Promise<void>{const generation=this.generation;try{await window.rift.promptFinish();if(generation===this.generation)await this.refreshCheckpoints();}catch(e){if(generation===this.generation)this.summaryError.set(`${message(e)}. Previous summary may be stale; refresh changes to retry.`);}}
  readonly menuOpen=signal(false);
  @HostListener('document:pointerdown',['$event']) outsideContext(event:PointerEvent):void {
    if(this.contextMenu?.nativeElement.open && !this.contextMenu.nativeElement.contains(event.target as Node))this.closeContext();
  }
  @HostListener('document:keydown',['$event']) escapeContext(event:KeyboardEvent):void {
    if(event.key==='Escape' && this.contextMenu?.nativeElement.open) { event.preventDefault();this.closeContext();this.contextMenu.nativeElement.querySelector('summary')?.focus(); }
  }
  closeContext():void { if(this.contextMenu)this.contextMenu.nativeElement.open=false;this.menuOpen.set(false); }
  readonly provider=signal<TerminalProvider>('claude'); readonly mode=signal<TerminalMode>('edit');
  readonly choice=signal<'new'|'resume'>('new'); readonly resumeId=signal(''); readonly sessions=signal<AgentSession[]>([]); readonly loadingSessions=signal(false); readonly sessionError=signal(''); private listGeneration=0;
  readonly state=signal<TerminalState|null>(null); readonly starting=signal(false); readonly ready=signal(false);
  readonly error=signal(''); readonly pending=signal(''); readonly hasOutput=signal(false); readonly activeTitle=signal('');
  readonly available=!!window.rift?.terminalStart;
  private terminal?: Terminal; private fit=new FitAddon(); private observer?: ResizeObserver; private fitFrame?:number;
  private timer?: ReturnType<typeof setTimeout>; private cursor=0; private destroyed=false; private generation=0;
  private previousRoot=''; readonly disconnected=signal(false); private polling=false;
  constructor() {
    effect(()=>{const tracking=(this.tracking()&&this.trackOpen())||this.reviewSending();if(this.terminal)this.terminal.options.disableStdin=tracking;});
    effect(()=>{this.root();this.provider();const choice=this.choice();this.resumeId.set('');this.sessions.set([]);this.sessionError.set('');this.listGeneration++;this.loadingSessions.set(false);if(choice==='resume')void this.loadSessions();});
    effect(() => { const dark=this.dark(); if(this.terminal) this.terminal.options.theme=dark?{background:'#0b0d10',foreground:'#d9dde5',cursor:'#c8ff63'}:{background:'#fafbfc',foreground:'#25313e',cursor:'#476a1c'}; });
    effect(() => { const root=this.root(); if(this.previousRoot && root!==this.previousRoot) { this.reviewSending.set(false);this.reviewRuns.set(0);this.lastReview.set('');this.briefCollapsed.set(false);this.followUp.set(''); this.generation++;this.tracking.set(false);this.summaries.set([]);this.summaryRequest++;this.summaryLoading.set(false);this.summaryError.set(''); this.starting.set(false); this.state.set(null); this.error.set(''); this.disconnected.set(false); this.cursor=0; this.hasOutput.set(false); this.activeTitle.set(''); this.terminal?.reset(); this.setReady(false); } this.previousRoot=root; });
  }
  ngAfterViewInit(): void {
    this.terminal=new Terminal({fontSize:13,fontFamily:'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',scrollback:3000,convertEol:false,allowProposedApi:false,linkHandler:{activate:()=>{}},theme:this.dark()?{background:'#0b0d10',foreground:'#d9dde5',cursor:'#c8ff63'}:{background:'#fafbfc',foreground:'#25313e',cursor:'#476a1c'}});
    this.terminal.loadAddon(this.fit); this.terminal.open(this.surface.nativeElement);
    this.terminal.onData(data => { if(this.reviewSending()||(this.tracking()&&this.trackOpen()))return;const id=this.state()?.id, generation=this.generation; if(!this.disconnected()&&id&&this.state()?.status==='running') void window.rift.terminalInput(id,data,false,this.slot).catch(e=>{if(!this.destroyed&&generation===this.generation&&this.state()?.id===id)this.fail(e);}); });
    this.terminal.onResize(({cols,rows}) => { const id=this.state()?.id, generation=this.generation; if(id&&this.state()?.status==='running') void window.rift.terminalResize(id,cols,rows,this.slot).catch(e=>{if(!this.destroyed&&generation===this.generation&&this.state()?.id===id)this.fail(e);}); });
    this.terminal.registerLinkProvider({provideLinks:(line,callback)=>callback(this.links(line))});
    this.observer=new ResizeObserver(()=>this.scheduleFit()); this.observer.observe(this.surface.nativeElement);
    if(this.available) void this.poll();
  }
  private fitVisible():void {
    const surface=this.surface.nativeElement;
    if(surface.clientWidth>0&&surface.clientHeight>0&&surface.checkVisibility()) {
      const terminal=this.terminal,buffer=terminal?.buffer.active;
      // xterm's row shrink otherwise shifts the viewport even when reading history.
      // A buffer marker follows wrapped-line reflow; never pin users who were at bottom.
      const viewport=buffer?.viewportY,cols=terminal?.cols;
      const anchor=terminal&&buffer&&buffer.viewportY<buffer.baseY
        ? terminal.registerMarker(buffer.viewportY-buffer.baseY-buffer.cursorY) : undefined;
      try {
        this.fit.fit();
        if(anchor&&!anchor.isDisposed) {
          const target=terminal!.cols===cols?viewport!:anchor.line;
          terminal!.scrollToLine(target);
          // xterm 6's resize can leave DOM scroll and buffer ydisp out of sync.
          // Its public scrollToLine applies a delta against DOM scroll, not an
          // absolute position; one bounded correction reconciles them pre-paint.
          if(buffer!.viewportY!==target)terminal!.scrollToLine(target);
        }
      } finally {anchor?.dispose();}
    }
  }
  private scheduleFit():void {
    if(this.destroyed||this.fitFrame!==undefined)return;
    this.fitFrame=requestAnimationFrame(()=>{this.fitFrame=undefined;if(!this.destroyed)this.fitVisible();});
  }
  providerLabel():string { return {claude:'Claude Code',opencode:'OpenCode',codex:'Codex'}[this.provider()]; }
  sessionIso(value:number):string { return new Date(value).toISOString(); }
  sessionDate(value:number):string { return new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  sessionKey(event:KeyboardEvent):void {
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const rows=Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="option"]'));
    if(!rows.length)return;
    event.preventDefault();
    const current=rows.indexOf(document.activeElement as HTMLButtonElement);
    const index=event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,current+(event.key==='ArrowDown'?1:-1)));
    rows[index].focus();
  }
  selectedSessionTitle():string {
    const session=this.sessions().find(session=>session.id===this.resumeId());
    return session?.title || '';
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
    const generation=++this.generation; this.starting.set(true); this.activeTitle.set(this.choice()==='resume'?this.selectedSessionTitle():''); this.hasOutput.set(false); this.error.set(''); this.disconnected.set(false);
    try {
      // Starting removes the launcher; let Angular commit the running-size surface
      // (including footer/composers) before spawning a provider that redraws on resize.
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      if(this.destroyed||generation!==this.generation)return;
      this.fitVisible();
      const state=await window.rift.terminalStart(this.provider(),this.mode(),this.terminal.cols,this.terminal.rows,this.choice()==='resume'?this.resumeId():undefined,this.slot);
      if(this.destroyed||generation!==this.generation)return;
      this.terminal.reset(); this.cursor=0; this.state.set(state);this.reviewRuns.set(0);this.lastReview.set('');this.briefCollapsed.set(false);this.summaries.set([]);this.summaryError.set('');if(!this.reviewWorkbench)this.checkpointReset.emit(); if(this.surface.nativeElement.checkVisibility())this.terminal.focus();
      if(!this.timer) void this.poll();
    } catch(e) { if(generation===this.generation)this.error.set(message(e)); }
    finally { if(generation===this.generation)this.starting.set(false); }
  }
  async stop(): Promise<void> {
    const generation=++this.generation; this.starting.set(false);this.tracking.set(false);this.reviewSending.set(false);this.summaryRequest++;this.summaryLoading.set(false); this.setReady(false);
    try { const stopped=await window.rift.terminalStop(this.slot); if(this.destroyed||generation!==this.generation)return; this.state.set(null); this.cursor=0; this.hasOutput.set(false); this.terminal?.reset(); this.error.set(''); this.disconnected.set(false);if(stopped?.checkpointError)this.summaryError.set(`Session stopped, but checkpoint freeze failed: ${stopped.checkpointError}. Previous summary may be stale; retry Finish checkpoint.`);else await this.refreshCheckpoints(); if(!this.timer) void this.poll(); }
    catch(e) {if(!this.destroyed&&generation===this.generation)this.fail(e);}
  }
  retain(text:string):void { this.pending.set(text.slice(0,32768));this.error.set(text.length>32768?'Context preview truncated to 32 KiB; saved history is unchanged.':''); }
  async insert(text: string): Promise<void> {
    if(!text)return;
    this.pending.set(text);
    const id=this.state()?.id;
    if(!id||!this.ready()) { this.error.set('Start a session and wait for the CLI input before inserting context. Nothing was sent.'); return; }
    const generation=this.generation;
    try { await window.rift.terminalInput(id,text,true,this.slot); if(this.destroyed||generation!==this.generation||this.state()?.id!==id)return; if(this.pending()===text)this.pending.set(''); this.terminal?.focus(); this.error.set(''); }
    catch(e) {if(!this.destroyed&&generation===this.generation)this.error.set(message(e));}
  }
  async copyPending(): Promise<void> { try {await window.rift.copyText(this.pending());}catch(e){this.error.set(message(e));} }
  private async poll(): Promise<void> {
    this.timer=undefined;
    if(this.destroyed||this.disconnected()||this.polling)return;
    this.polling=true;
    const generation=this.generation;
    try {
      const result=await window.rift.terminalRead(this.state()?.id??null,this.cursor,this.slot);
      if(this.destroyed||generation!==this.generation)return;
      this.state.set(result.state); this.cursor=result.cursor;
      if(this.terminal){const previous=this.terminal.options.windowsPty;const next:{backend?:'conpty'|'winpty';buildNumber?:number}=result.state?.windowsPty??{};if(previous?.backend!==next.backend||previous?.buildNumber!==next.buildNumber)this.terminal.options.windowsPty=next;}
      if(result.state){this.provider.set(result.state.provider);this.mode.set(result.state.mode);}
      if(result.data) await new Promise<void>(resolve=>this.terminal!.write((result.truncated?'\r\n[Earlier output truncated]\r\n':'')+result.data,resolve));
      if(this.destroyed||generation!==this.generation)return;
      // Wait for xterm's parser, not raw nonempty data: partial escape frames are not visible output.
      if(!this.hasOutput() && this.terminal) {
        const buffer=this.terminal.buffer.active;
        for(let y=buffer.viewportY;y<Math.min(buffer.length,buffer.viewportY+this.terminal.rows);y++) {
          if(buffer.getLine(y)?.translateToString(true).trim()) { this.hasOutput.set(true); break; }
        }
      }
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
  ngOnDestroy():void {this.destroyed=true;this.generation++;this.listGeneration++;if(this.timer)clearTimeout(this.timer);if(this.fitFrame!==undefined)cancelAnimationFrame(this.fitFrame);this.observer?.disconnect();this.terminal?.dispose();}
}
function message(e:unknown):string{return e instanceof Error?e.message:String(e);}
