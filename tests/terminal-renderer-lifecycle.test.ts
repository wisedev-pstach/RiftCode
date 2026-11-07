import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real renderer class with only its DOM/framework boundaries substituted.
// Browser tests separately exercise real Angular, xterm and root/Stop-Start transitions.
function harness() {
  const signal=(initial:unknown)=>{let value=initial;return Object.assign(()=>value,{set:(next:unknown)=>{value=next;}});};
  const decorator=()=>()=>{};
  class Terminal {
    data!:(value:string)=>void; resize!:(value:{cols:number;rows:number})=>void;
    loadAddon(){} open(){} registerLinkProvider(){} dispose(){}
    onData(callback:Terminal['data']){this.data=callback;}
    onResize(callback:Terminal['resize']){this.resize=callback;}
  }
  let reject!:(error:Error)=>void;
  const bridge={terminalInput:()=>new Promise((_resolve,no)=>{reject=no;}),terminalResize:()=>new Promise((_resolve,no)=>{reject=no;})};
  const exports:any={};
  const source=readFileSync(new URL('../src/renderer/src/ai-terminal.component.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
  vm.runInNewContext(compiled,{exports,window:{rift:bridge},ResizeObserver:class {observe(){} disconnect(){}},clearTimeout,
    require:(id:string)=>{
      if(id==='@angular/core')return {Component:decorator,Input:decorator,Output:decorator,ViewChild:decorator,HostListener:decorator,signal,effect:()=>{},EventEmitter:class {emit(){}}};
      if(id==='@xterm/xterm')return {Terminal};
      if(id==='@xterm/addon-fit')return {FitAddon:class {}};
      if(id==='../../shared/source-links')return {sourceLinks:()=>[]};
      throw new Error('Unexpected import '+id);
    }});
  const component=new exports.AiTerminalComponent();
  component.surface={nativeElement:{}};
  component.ngAfterViewInit();
  component.state.set({id:'old',status:'running'});
  component.ready.set(true);
  return {component,reject:()=>reject(new Error('Deferred IPC failure'))};
}

for(const operation of ['data','resize'] as const) {
  for(const transition of ['destroy','session-identity','current'] as const) {
    test(`terminal ${operation} rejection respects ${transition}`,async()=>{
      const {component,reject}=harness();
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
