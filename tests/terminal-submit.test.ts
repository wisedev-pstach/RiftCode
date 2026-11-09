import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TerminalService} from '../src/main/terminal-service';
import {contextPaste} from '../src/shared/terminal';

// Synthetic event-batched TUI: commits bracketed paste after its stdin event.
// A CR in that same event is swallowed, matching the reported paste/Enter seam.
// This is a real local PTY consumer, not authenticated provider acceptance.
const script=String.raw`#!/usr/bin/env node
process.stdin.setRawMode(true);
let buffer='',draft='',requests=[];
process.stdout.write('\x1b[?2004hREADY');
process.stdin.on('data',chunk=>{
 buffer+=chunk.toString();
 const end=buffer.indexOf('\x1b[201~');
 if(end>=0){const start=buffer.indexOf('\x1b[200~');draft+=buffer.slice(start+6,end);buffer=buffer.slice(end+6);setImmediate(()=>process.stdout.write('PASTE_COMMITTED'));buffer=buffer.replace(/\r/g,'');}
 else if(buffer==='\r'){requests.push(draft);process.stdout.write('ACCEPTED='+JSON.stringify(draft)+'\r\n');draft='';buffer='';}
});
`;
for(const transition of ['reset','replace','readiness','write-failure'] as const)test(`delivery never sends an obsolete Enter after ${transition}`,async()=>{
 let release!:()=>void;const writes:string[]=[],replacement:string[]=[];
 const service=new TerminalService(async()=>null,undefined,undefined,()=>new Promise<void>(r=>{release=r;}));
 const internal=service as any;
 internal.process={write:(data:string)=>{writes.push(data);if(transition==='write-failure'&&data==='\r')throw new Error('write failed');},kill:()=>{},pid:0};
 internal.state={id:'old',cwd:'synthetic',status:'running'};internal.pasteReady=true;
 const pending=service.submit('old','Synthetic request');
 assert.deepEqual(writes,[contextPaste('Synthetic request')]);
 await assert.rejects(service.submit('old','duplicate'),/progress/);
 assert.throws(()=>service.input('old','typing'),/progress/);
 if(transition==='reset'){internal.process=null;service.reset();}
 if(transition==='replace'){internal.process={write:(data:string)=>replacement.push(data)};internal.state={id:'new',status:'running'};}
 if(transition==='readiness')internal.pasteReady=false;
 release();await assert.rejects(pending,/uncertain/);
 assert.deepEqual(replacement,[]);
 assert.deepEqual(writes,transition==='write-failure'?[contextPaste('Synthetic request'),'\r']:[contextPaste('Synthetic request')]);
});

const until=async(fn:()=>boolean)=>{for(let i=0;i<120;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Synthetic TUI did not accept request');};
for(const provider of ['claude','opencode','codex'] as const)test(`${provider}: explicit request and follow-up are parsed once without another Enter`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'rift-submit-'));const command=join(root,'fixture');await writeFile(command,script,{mode:0o755});
 const service=new TerminalService(async()=>command);
 try{
  const state=await service.start(root,provider,'review',80,24);await until(()=>service.read(state.id,0).data.includes('READY'));
  const request='Review synthetic changes.\nFocus on regressions.';
  await service.submit(state.id,request);
  await until(()=>service.read(state.id,0).data.includes('ACCEPTED='+JSON.stringify(request)));
  await service.submit(state.id,'Explain the boundary.');
  await until(()=>service.read(state.id,0).data.includes('ACCEPTED="Explain the boundary."'));
  assert.equal(service.read(state.id,0).data.match(/ACCEPTED=/g)?.length,2);
 }finally{service.reset();await rm(root,{recursive:true,force:true});}
});
