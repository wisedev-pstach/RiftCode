import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile,stat,access} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {ReviewBriefStore,MAX_REVIEW_BYTES} from '../src/main/review-brief-store';
import {TerminalService} from '../src/main/terminal-service';
import {buildTerminalReview} from '../src/shared/review-request';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const script=String.raw`#!/usr/bin/env node
const fs=require('node:fs'),crypto=require('node:crypto');process.stdin.setRawMode(true);
let buffer='',draft='';process.stdout.write('\x1b[?2004hREADY');
process.stdin.on('data',c=>{buffer+=c.toString();const end=buffer.indexOf('\x1b[201~');
if(end>=0){draft=buffer.slice(buffer.indexOf('\x1b[200~')+6,end);buffer=buffer.slice(end+6).replace(/\r/g,'');}
else if(buffer==='\r'){let bytes=draft;const line=draft.split('\n').find(l=>l.startsWith('Review brief file (literal JSON path): '));
if(line){const path=JSON.parse(line.slice('Review brief file (literal JSON path): '.length));bytes=fs.readFileSync(path);process.stdout.write('FILE='+JSON.stringify(path)+'\r\n');}
process.stdout.write('ACCEPTED='+crypto.createHash('sha256').update(bytes).digest('hex')+'\r\n');buffer='';draft='';}});
`;
const until=async(fn:()=>boolean|Promise<boolean>)=>{for(let i=0;i<250;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Fixture observation timed out');};
async function fixture(fn:(service:TerminalService,id:string,root:string)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'rift-brief-fixture-')),command=join(root,'fixture.cjs');await writeFile(command,script,{mode:0o700});const service=new TerminalService(async()=>command);
 try{const state=await service.start(root,'claude','review',80,24);await until(()=>service.read(state.id,0).data.includes('READY'));await fn(service,state.id,root);}
 finally{service.reset();await new Promise(r=>setTimeout(r,60));await rm(root,{recursive:true,force:true});}
}
const request=()=>buildTerminalReview({repository:'synthetic',comparison:'a → b',startRevision:'a'.repeat(40),endRevision:null,files:['src/one.ts'],currentPath:'src/one.ts',notes:'Selected note 界🙂'.repeat(3000),projectContext:'Project context Ł🙂'.repeat(3000)},'file','  Explicit instructions 界🙂'.repeat(3000)+'  ','professional');
test('oversized complete UTF8 brief reaches a real child unchanged via private immutable file',async()=>fixture(async(service,id,root)=>{
 const text=request();await (service as any).submitReview(id,text);await until(()=>service.read(id,0).data.includes('ACCEPTED='+hash(text)));
 const output=service.read(id,0).data;const path=JSON.parse(output.match(/FILE=(".*")/)![1]);
 assert.equal(await readFile(path,'utf8'),text);assert.ok(relative(root,path).startsWith('..')||isAbsolute(relative(root,path)));assert.equal((await stat(path)).mode&0o777,0o600);assert.equal((await stat(join(path,'..'))).mode&0o777,0o700);
 await (service as any).submitReview(id,text+'second');await until(()=>service.read(id,0).data.includes('ACCEPTED='+hash(text+'second')));
 const paths=[...service.read(id,0).data.matchAll(/FILE=(".*")/g)].map(m=>JSON.parse(m[1]));assert.equal(new Set(paths).size,2);assert.equal(await readFile(path,'utf8'),text);assert.equal(service.read(id,0).data.match(/ACCEPTED=/g)?.length,2);
 await assert.rejects(service.submit(id,'x'.repeat(32769)),/32 KiB/);await assert.rejects(service.sendTracked(id,'x'.repeat(32769)),/32 KiB/);assert.throws(()=>service.input(id,'x'.repeat(32769),true),/large/);
 service.reset();await until(async()=>{try{await access(path);return false;}catch{return true;}});
}));

test('failed writes consume bounded reservations instead of allowing unbounded leaked artifacts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rift-failure-fixture-')),store=new ReviewBriefStore(root);
 try{(store as any).directory=join(root,'missing','directory');for(let i=0;i<16;i++)await assert.rejects(store.write('failure'),/ENOENT/);await assert.rejects(store.write('failure'),/storage limit/);}
 finally{await store.processStopped();await rm(root,{recursive:true,force:true});}
});
test('review editor never silently clips long instructions and discloses bounded permissioned file handoff',()=>{
 const html=readFileSync(new URL('../src/renderer/src/ai-terminal.component.html',import.meta.url),'utf8');
 const instructions=html.match(/<textarea aria-label="Review instructions"[^>]*>/)![0];assert.doesNotMatch(instructions,/maxlength/);
 assert.match(html,/8 MiB/);assert.match(html,/16 files/);assert.match(html,/process exits/);assert.match(html,/permission/);assert.match(html,/not.*read|read.*not/);
});

function ipc(service:TerminalService,root:string,id:string){
 const source=readFileSync(new URL('../src/main/index.ts',import.meta.url),'utf8');const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 let registration='';function visit(node:ts.Node){if(ts.isExpressionStatement(node)&&node.getText(ast).startsWith("ipcMain.handle('terminal:submit-review'"))registration=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(registration);
 const sender={mainFrame:{},isDestroyed:()=>false};const event={sender,senderFrame:sender.mainFrame};let handler:any;
 const context=vm.createContext({ipcMain:{handle:(_name:string,fn:any)=>{handler=fn;}},terminals:{review:service},mainWindow:{webContents:sender},repositoryGeneration:0,currentRepositoryPath:root});
 const assertion=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='assertTrustedSender')!.getText(ast);
 vm.runInContext(ts.transpileModule(assertion+'\n'+registration,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {send:(text:string)=>handler(event,id,text),invalidate:(type:string)=>{
  if(type==='sender')context.mainWindow={webContents:{mainFrame:{}}} as any;
  if(type==='renderer')sender.isDestroyed=()=>true;
  if(type==='repository')context.repositoryGeneration++;
 }};
}
function renderer(send:(id:string,text:string)=>Promise<void>,id:string){
 const source=readFileSync(new URL('../src/renderer/src/ai-terminal.component.ts',import.meta.url),'utf8');const ast=ts.createSourceFile('component.ts',source,ts.ScriptTarget.Latest,true);
 let method='';function visit(node:ts.Node){if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='runReviewRequest')method=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(method);
 const value=(initial:any)=>{let current=initial;return Object.assign(()=>current,{set:(next:any)=>{current=next;},update:(fn:any)=>{current=fn(current);}});};
 const component=vm.runInNewContext(ts.transpileModule('({'+method+'})',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{buildTerminalReview,window:{rift:{terminalSubmitReview:send}},message:(e:any)=>String(e)});
 Object.assign(component,{generation:0,reviewWorkbench:true,destroyed:false,state:value({id}),ready:value(true),reviewSending:value(false),instructions:value('  Explicit 界🙂'.repeat(4000)+'  '),reviewScope:value('comparison'),reviewTone:value('professional'),error:value(''),briefCollapsed:value(false),reviewRuns:value(0),lastReview:value(''),reviewContext:{repository:'synthetic',comparison:'captured',startRevision:'a'.repeat(40),endRevision:null,files:['src/one.ts'],currentPath:'src/one.ts',notes:'SELECTED 界🙂'.repeat(3000),projectContext:'PROJECT 界🙂'.repeat(3000)}});
 return component;
}
for(const transition of ['sender','renderer','repository','session','io'] as const)test(`pending native file handoff rejects ${transition} with no paste/Enter and intact renderer draft`,async()=>fixture(async(service,id,root)=>{
 const bridge=ipc(service,root,id),component=renderer((_id,text)=>bridge.send(text),id),draft=component.instructions();
 const briefs=(service as any).reviewBriefs;const original=briefs.write.bind(briefs);let release!:()=>void,entered!:()=>void;const barrier=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});
 if(transition==='io')briefs.directory=join(root,'does-not-exist','missing');
 briefs.write=async(text:string)=>{let result:string|undefined,error:unknown;try{result=await original(text);}catch(e){error=e;}entered();await gate;if(error)throw error;return result;};
 const pending=component.runReviewRequest();await barrier;
 assert.equal(component.reviewSending(),true);assert.equal(component.briefCollapsed(),true);
 assert.throws(()=>service.input(id,'unexpected'),/progress/);await assert.rejects(service.submitReview(id,'duplicate'),/progress/);
 if(transition==='session')service.reset();else bridge.invalidate(transition);
 release();await pending;assert.equal(component.instructions(),draft);assert.equal(component.lastReview(),'');assert.equal(component.reviewRuns(),0);assert.equal(component.briefCollapsed(),false);assert.equal(component.reviewSending(),false);assert.ok(component.error());
 const output=(service as any).output;assert.doesNotMatch(output,/ACCEPTED=|FILE=/);
}));
test('renderer edits during handoff do not mutate the accepted complete request',async()=>fixture(async(service,id,root)=>{
 const bridge=ipc(service,root,id),component=renderer((_id,text)=>bridge.send(text),id);
 const expected=buildTerminalReview(component.reviewContext,'comparison',component.instructions(),'professional');
 const briefs=(service as any).reviewBriefs,original=briefs.write.bind(briefs);let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;}),barrier=new Promise<void>(r=>{entered=r;});
 briefs.write=async(text:string)=>{const result=await original(text);entered();await gate;return result;};
 const pending=component.runReviewRequest();await barrier;component.instructions.set('new unsent draft');component.reviewContext.notes='new notes';component.reviewContext.projectContext='new project';release();await pending;
 await until(()=>service.read(id,0).data.includes('ACCEPTED='+hash(expected)));assert.equal(component.lastReview(),expected);assert.equal(component.instructions(),'new unsent draft');assert.equal(component.reviewRuns(),1);
}));
for(const transition of ['sender','renderer','repository'] as const)test(`pending Enter rejects changed ${transition} after paste without resending`,async()=>fixture(async(service,id,root)=>{
 const bridge=ipc(service,root,id),component=renderer((_id,text)=>bridge.send(text),id);let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;}),barrier=new Promise<void>(r=>{entered=r;});
 const child=(service as any).process,writes:string[]=[],original=child.write.bind(child);child.write=(data:string)=>{writes.push(data);original(data);};
 (service as any).settleInput=()=>{entered();return gate;};const pending=component.runReviewRequest();await barrier;assert.equal(writes.length,1);assert.ok(Buffer.byteLength(writes[0])<32768);bridge.invalidate(transition);release();await pending;
 assert.equal(writes.length,1);assert.match(component.error(),/uncertain/);assert.equal(component.reviewRuns(),0);assert.equal(component.lastReview(),'');assert.equal(component.briefCollapsed(),false);assert.doesNotMatch(service.read(id,0).data,/ACCEPTED=/);
}));
test('actual child exit during an owned write defers cleanup until the pending write settles',async()=>fixture(async(service,id)=>{
 const briefs=(service as any).reviewBriefs,original=briefs.create.bind(briefs);let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;}),barrier=new Promise<void>(r=>{entered=r;});let path='';
 briefs.create=async(text:string)=>{const result=await original(text);path=JSON.parse(result.split('\n').find((l:string)=>l.startsWith('Review brief file'))!.split(': ').slice(1).join(': '));entered();await gate;return result;};
 const pending=service.submitReview(id,request());await barrier;await access(path);service.reset();await until(()=>briefs.stopped);await access(path);release();await assert.rejects(pending,/session|Session/);await assert.rejects(access(path));
}));
test('small review stays direct and its exact immutable request becomes the accepted renderer snapshot',async()=>fixture(async(service,id,root)=>{
 const bridge=ipc(service,root,id),component=renderer((_id,text)=>bridge.send(text),id);component.instructions.set('Check errors');component.reviewContext.notes='';component.reviewContext.projectContext='';
 const expected=buildTerminalReview(component.reviewContext,'comparison','Check errors','professional');await component.runReviewRequest();await until(()=>service.read(id,0).data.includes('ACCEPTED='+hash(expected)));
 assert.equal(component.lastReview(),expected);assert.equal(component.reviewRuns(),1);assert.equal(component.briefCollapsed(),true);assert.equal((service as any).reviewBriefs.directory,null);assert.doesNotMatch(service.read(id,0).data,/FILE=/);
}));
test('five thousand comparison paths become an exact direct request through native IPC and PTY',async()=>fixture(async(service,id,root)=>{
 const bridge=ipc(service,root,id),component=renderer((_id,text)=>bridge.send(text),id);component.instructions.set('Check the entire comparison');component.reviewContext.notes='';component.reviewContext.projectContext='';component.reviewContext.files=Array.from({length:5000},(_,i)=>`src/path/to/file-${i}.ts`);
 const expected=buildTerminalReview(component.reviewContext,'comparison',component.instructions(),'professional');assert.ok(Buffer.byteLength(expected)<32768);assert.match(expected,/complete comparison/);assert.ok(expected.includes(component.reviewContext.startRevision));assert.match(expected,/index.*untracked/);
 await component.runReviewRequest();await until(()=>service.read(id,0).data.includes('ACCEPTED='+hash(expected)));assert.equal(component.lastReview(),expected);assert.equal((service as any).reviewBriefs.directory,null);assert.equal(component.reviewRuns(),1);
}));
test('native UTF8 payload ceiling is complete-or-reject, with bounded session quota',async()=>fixture(async(service,id)=>{
 const full='🙂'.repeat(MAX_REVIEW_BYTES/4);await service.submitReview(id,full);await until(()=>service.read(id,0).data.includes('ACCEPTED='+hash(full)));
 await assert.rejects(service.submitReview(id,full+'a'),/8 MiB/);assert.equal(service.read(id,0).data.match(/ACCEPTED=/g)?.length,1);
 await service.submitReview(id,full);await until(()=>service.read(id,0).data.match(/ACCEPTED=/g)?.length===2);
 await assert.rejects(service.submitReview(id,'z'.repeat(32769)),/storage limit/);assert.equal(service.read(id,0).data.match(/ACCEPTED=/g)?.length,2);
}));
test('owned store bounds artifact count and keeps all live files until actual process exit',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rift-store-fixture-'));const store=new ReviewBriefStore(root);
 try{const paths=[];for(let i=0;i<16;i++){const prompt=await store.write('request '+i);paths.push(JSON.parse(prompt.split('\n').find(l=>l.startsWith('Review brief file'))!.split(': ').slice(1).join(': ')));}
 await assert.rejects(store.write('17'),/16 files/);for(const path of paths)assert.ok(await stat(path));await store.processStopped();for(const path of paths)await assert.rejects(access(path));}
 finally{await store.processStopped();await rm(root,{recursive:true,force:true});}
});
