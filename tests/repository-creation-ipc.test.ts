import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import ts from 'typescript';
import {createLocalRepository} from '../src/main/create-repository';
import {assertRepositoryName} from '../src/shared/repository-name';
import {loadRepository} from '../src/main/git';
function fixture(){
 const source=readFileSync(new URL('../src/main/index.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 const register=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='registerIpc') as ts.FunctionDeclaration;
 const statement=register.body!.statements.find(n=>n.getText(tree).startsWith("ipcMain.handle('repository:create'"));
 assert.ok(statement,'production repository:create IPC handler must exist');
 let handler!:(event:any,...args:unknown[])=>Promise<any>;let resolvePicker!:(value:any)=>void;
 let picks=0,opens=0;const sender={mainFrame:{},isDestroyed:()=>false};const window={webContents:sender,isDestroyed:()=>false};
 const context={ipcMain:{handle:(_name:string,fn:typeof handler)=>handler=fn},mainWindow:window,repositoryGeneration:0,factoryGeneration:0,repositoryCreationGeneration:0,
  assertTrustedSender:(event:any)=>{if(event.sender!==sender||event.senderFrame!==sender.mainFrame)throw Error('Unauthorized');},assertRepositoryName,createLocalRepository,
  dialog:{showOpenDialog:async(_window:any,options:any)=>{assert.equal(_window,window);assert.match(options.title,/project/);assert.deepEqual(Array.from(options.properties),['openDirectory']);picks++;return new Promise(resolve=>resolvePicker=resolve);}},
  openRepository:async(root:string,guard:()=>void)=>{opens++;context.repositoryGeneration++;context.factoryGeneration++;guard();return loadRepository(root);}
 };
 vm.runInNewContext(ts.transpileModule(statement.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {context,sender,event:{sender,senderFrame:sender.mainFrame},call:(...args:unknown[])=>handler(...args as [any,...unknown[]]),picks:()=>picks,opens:()=>opens,pick:(path:string|null)=>resolvePicker({canceled:path===null,filePaths:path?[path]:[]})};
}
test('actual main IPC validates sender, exact arity and literal name before native selection',async()=>{
 const f=fixture();
 for(const args of [[{},'project'],[f.event],[f.event,'project','/renderer/parent'],[f.event,'../project'],[f.event,{},]])await assert.rejects(async()=>f.call(...args));
 assert.equal(f.picks(),0);
});
test('actual main IPC creates via native parent and publishes a real unborn repository',async()=>{
 const f=fixture(),parent=await mkdtemp(join(tmpdir(),'rift-create-ipc-'));const pending=f.call(f.event,'project');f.pick(parent);
 assert.equal((await pending).root,join(parent,'project'));assert.equal(f.opens(),1);
});
for(const stale of ['repository','renderer','window','new-operation'])test(`actual native picker cannot mutate after ${stale} replacement`,async()=>{
 const f=fixture(),parent=await mkdtemp(join(tmpdir(),'rift-create-ipc-stale-'));const pending=f.call(f.event,'project');
 if(stale==='repository')f.context.repositoryGeneration++;
 if(stale==='renderer')f.sender.mainFrame={};
 if(stale==='window')f.context.mainWindow.isDestroyed=()=>true;
 if(stale==='new-operation')f.context.repositoryCreationGeneration++;
 f.pick(parent);await assert.rejects(pending);assert.deepEqual(await readdir(parent),[]);assert.equal(f.opens(),0);
});
test('actual production preload exposes only project name to native creation IPC',async()=>{
 const source=readFileSync(new URL('../src/preload/index.ts',import.meta.url),'utf8');const calls:unknown[][]=[];let api:any;
 const output=ts.transpileModule(source.replace(/^import .*$/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText.replace(/export \{\};?/g,'');
 vm.runInNewContext(output,{process:{platform:'linux'},contextBridge:{exposeInMainWorld:(_name:string,value:any)=>api=value},ipcRenderer:{invoke:async(...args:unknown[])=>{calls.push(args);return null;}}});
 assert.equal(typeof api.createRepository,'function');assert.equal(await api.createRepository('project'),null);assert.deepEqual(calls,[['repository:create','project']]);
});
function realOpenFixture(){
 const source=readFileSync(new URL('../src/main/index.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 const names=['openRepository','queueRepositoryLoad'];
 const functions=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name&&names.includes(n.name.text));assert.equal(functions.length,2);
 let releaseClose!:()=>void;let closes=0,watches=0,loads=0;
 const context={terminals:{reset(){}},terminal:{checkpoints:{clear(){}}},currentRepositoryPath:'/fixture/original',activeComparisonId:'auto',activeTargetBranch:'auto',repositoryGeneration:0,factoryGeneration:0,
  snapshot:null as any,repositoryLoadQueue:Promise.resolve(),factoryManager:{close:()=>{closes++;return new Promise<void>(resolve=>releaseClose=resolve);}},
  loadRepository:async(...args:Parameters<typeof loadRepository>)=>{loads++;return loadRepository(...args);},
  refreshTimer:null,clearTimeout,watchRepository:()=>{watches++;}
 };
 vm.runInNewContext(ts.transpileModule(functions.map(n=>n.getText(tree)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {context,open:(context as any).openRepository as (root:string,guard?:()=>void)=>Promise<any>,release:()=>releaseClose(),closes:()=>closes,watches:()=>watches,loads:()=>loads};
}
test('real main opening waits for FactoryManager close before Git load and snapshot publication',async()=>{
 const f=realOpenFixture(),parent=await mkdtemp(join(tmpdir(),'rift-create-main-'));
 let current=true;
 const result=createLocalRepository('project',{chooseParent:async()=>parent,assertCurrent:()=>{if(!current)throw Error('Obsolete');},openRepository:root=>f.open(root,()=>{if(!current)throw Error('Obsolete');})});
 while(f.closes()===0)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.loads(),0);assert.equal(f.context.snapshot,null);assert.equal(f.context.currentRepositoryPath,'/fixture/original');
 f.release();assert.equal((await result)?.root,join(parent,'project'));assert.equal(f.context.snapshot.root,join(parent,'project'));assert.equal(f.watches(),1);
});
test('obsolete renderer during real factory teardown cannot load, watch or publish the new root',async()=>{
 const f=realOpenFixture(),parent=await mkdtemp(join(tmpdir(),'rift-create-main-stale-'));let current=true;
 const result=createLocalRepository('project',{chooseParent:async()=>parent,assertCurrent:()=>{if(!current)throw Error('Obsolete');},openRepository:root=>f.open(root,()=>{if(!current)throw Error('Obsolete');})});
 while(f.closes()===0)await new Promise(resolve=>setImmediate(resolve));
 current=false;f.release();await assert.rejects(result,/Obsolete/);
 assert.equal(f.loads(),0);assert.equal(f.context.snapshot,null);assert.equal(f.context.currentRepositoryPath,'/fixture/original');assert.equal(f.watches(),0);
 assert.deepEqual(await readdir(parent),['project']);
});
test('actual repository load completion is fenced before publication',async()=>{
 const f=realOpenFixture(),parent=await mkdtemp(join(tmpdir(),'rift-create-main-publish-'));let releaseLoad!:(repo:any)=>void;let started=false,current=true;
 const original=f.context.loadRepository;
 f.context.loadRepository=async(...args)=>{const repo=await original(...args);started=true;return new Promise(resolve=>releaseLoad=()=>resolve(repo));};
 const result=createLocalRepository('project',{chooseParent:async()=>parent,assertCurrent:()=>{if(!current)throw Error('Obsolete');},openRepository:root=>f.open(root,()=>{if(!current)throw Error('Obsolete');})});
 while(f.closes()===0)await new Promise(resolve=>setImmediate(resolve));f.release();
 while(!started)await new Promise(resolve=>setImmediate(resolve));
 current=false;f.context.repositoryGeneration++;f.context.currentRepositoryPath='/fixture/newer';releaseLoad(null);
 await assert.rejects(result,/Obsolete/);assert.equal(f.context.snapshot,null);assert.equal(f.context.currentRepositoryPath,'/fixture/newer');assert.equal(f.watches(),0);
});
