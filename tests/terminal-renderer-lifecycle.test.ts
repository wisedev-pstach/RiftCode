import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real renderer class with only its DOM/framework boundaries substituted.
// Browser tests separately exercise real Angular, xterm and root/Stop-Start transitions.
function harness(slot:'terminal'|'review'='terminal') {
  const signal=(initial:unknown)=>{let value=initial;return Object.assign(()=>value,{set:(next:unknown)=>{value=next;},update:(fn:(v:unknown)=>unknown)=>{value=fn(value);}});};
  const decorator=()=>()=>{};
  class Terminal {
    options:any;buffer={active:{viewportY:0,length:0}};modes={bracketedPasteMode:false};
    constructor(options:any){this.options=options;}
    data!:(value:string)=>void; resize!:(value:{cols:number;rows:number})=>void;
    loadAddon(){} open(){} registerLinkProvider(){} dispose(){} focus(){}
    onData(callback:Terminal['data']){this.data=callback;}
    onResize(callback:Terminal['resize']){this.resize=callback;}
  }
  let reject!:(error:Error)=>void;
  const bridge={terminalInput:()=>new Promise((_resolve,no)=>{reject=no;}),terminalResize:()=>new Promise((_resolve,no)=>{reject=no;})};
  const exports:any={};
  const source=readFileSync(new URL('../src/renderer/src/ai-terminal.component.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
  vm.runInNewContext(compiled,{exports,window:{rift:bridge},ResizeObserver:class {observe(){} disconnect(){}},clearTimeout,setTimeout:()=>1,
    require:(id:string)=>{
      if(id==='@angular/core')return {Component:decorator,Input:decorator,Output:decorator,ViewChild:decorator,HostListener:decorator,signal,effect:()=>{},EventEmitter:class {emit(){}}};
      if(id==='@xterm/xterm')return {Terminal};
      if(id==='@xterm/addon-fit')return {FitAddon:class {}};
      if(id==='../../shared/review-request')return {buildTerminalReview:()=> 'Synthetic prepared review'};
      if(id==='../../shared/source-links')return {sourceLinks:()=>[]};
      throw new Error('Unexpected import '+id);
    }});
  const component=new exports.AiTerminalComponent();component.slot=slot;component.reviewWorkbench=slot==='review';
  component.surface={nativeElement:{}};
  component.ngAfterViewInit();
  component.state.set({id:'old',status:'running'});
  component.ready.set(true);
  return {component,bridge,reject:()=>reject(new Error('Deferred IPC failure'))};
}

for(const slot of ['terminal','review'] as const)for(const operation of ['data','resize'] as const) {
  for(const transition of ['destroy','session-identity','current'] as const) {
    test(`${slot} ${operation} rejection respects ${transition}`,async()=>{
      const {component,reject}=harness(slot);
      component.terminal[operation](operation==='data'?'x':{cols:80,rows:24});
      if(transition==='destroy')component.ngOnDestroy();
      if(transition==='session-identity')component.state.set({id:'new',status:'running'});
      reject();
      await Promise.resolve();
      assert.equal(component.disconnected(),transition==='current');
      assert.equal(component.ready(),transition!=='current');
      assert.equal(component.error().includes('Deferred IPC failure'),transition==='current');
    });
  }
}

test('trusted retained Windows metadata configures xterm before rendering',async()=>{
 const {component,bridge}=harness();
 (bridge as any).terminalRead=async()=>({state:{id:'old',provider:'claude',mode:'review',status:'running',windowsPty:{backend:'conpty',buildNumber:26200}},data:'',cursor:0});
 await component.poll();
 assert.equal(component.terminal.options.windowsPty?.backend,'conpty');
 assert.equal(component.terminal.options.windowsPty?.buildNumber,26200);
});

test('ordinary terminal defaults to Edit',()=>{
  const {component}=harness();assert.equal(component.mode(),'edit');
});

for(const outcome of ['resolve','reject','replacement'] as const)test(`review collapses before deferred dispatch acknowledgment: ${outcome}`,async()=>{
  const {component,bridge}=harness('review');
  let resolve!:()=>void,reject!:(e:Error)=>void;
  (bridge as any).terminalSubmitReview=()=>new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
  component.instructions.set('Keep my instructions');
  const pending=component.runReviewRequest();
  assert.equal(component.briefCollapsed(),true,'collapse must happen during dispatch, not after IPC');
  assert.equal(component.reviewSending(),true);assert.equal(component.lastReview(),'');
  if(outcome==='replacement'){component.generation++;component.state.set({id:'new'});component.briefCollapsed.set(false);component.reviewSending.set(true);component.error.set('new state');reject(new Error('obsolete'));}
  else if(outcome==='reject')reject(new Error('uncertain submission'));
  else resolve();
  await pending;
  assert.equal(component.instructions(),'Keep my instructions');
  assert.equal(component.briefCollapsed(),outcome==='resolve');
  assert.equal(component.reviewSending(),outcome==='replacement');
  assert.equal(component.lastReview(),outcome==='resolve'?'Synthetic prepared review':'');
  assert.equal(component.error(),outcome==='replacement'?'new state':outcome==='reject'?'Error: uncertain submission':'');
});
