import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute only actual main-source declarations/registration, without importing Electron.
function mainLifecycleSource():string {
 const source=readFileSync(new URL('../src/main/index.ts',import.meta.url),'utf8');
 const tree=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 const watch=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='watchRepository');
 const state=tree.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>ts.isIdentifier(declaration.name)&&declaration.name.text==='factoryQuitCleanupComplete'));
 const registrations=tree.statements.filter(node=>{
  if(!ts.isExpressionStatement(node)||!ts.isCallExpression(node.expression))return false;
  const call=node.expression;
  return ts.isPropertyAccessExpression(call.expression)&&call.expression.expression.getText(tree)==='app'&&call.expression.name.text==='on'&&call.arguments[0]&&ts.isStringLiteral(call.arguments[0])&&call.arguments[0].text==='before-quit';
 });
 assert.ok(watch);assert.ok(state);assert.equal(registrations.length,1);
 return ts.transpileModule([watch,state,...registrations].map(node=>node.getText(tree)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('cancelled factory quit preserves observation, queued refresh and attachments; retry cleans up only after disposal',async()=>{
 let beforeQuit!:(event:{preventDefault():void})=>void;
 let resolveClose!:()=>void;let rejectClose!:(error:Error)=>void;
 let closeCalls=0;let quitCalls=0;let watchCreates=0;let watcherCloses=0;
 let onChange!:(event:string,filename:string)=>void;
 const timers=new Map<number,()=>void>();let nextTimer=0;
 const notifications:unknown[][]=[];const removed:string[]=[];const errors:unknown[][]=[];
 const repository={root:'/fixture/repository'};
 const context={
  app:{on(name:string,callback:typeof beforeQuit){assert.equal(name,'before-quit');beforeQuit=callback;},quit(){quitCalls++;assert.equal(requestQuit(),false,'successful reentrant quit must be permitted');}},
  terminals:{reset(){}},watcher:null as null|{active:boolean;close():void},watchedRoot:null as string|null,
  watch(_root:string,...args:unknown[]){watchCreates++;onChange=args.at(-1) as typeof onChange;const watcher={active:true,close(){watcher.active=false;watcherCloses++;}};return watcher;},
  changedRepositoryPaths:new Set<string>(),refreshTimer:null as number|null,
  setTimeout(callback:()=>void){const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout(id:number){timers.delete(id);},
  mainWindow:{webContents:{send(...args:unknown[]){notifications.push(args);}}},
  snapshot:repository,currentRepositoryPath:repository.root,repositoryLoadQueue:Promise.resolve(),
  attachmentDirectory:'/fixture/attachments' as string|null,rm:async(path:string)=>{removed.push(path);},factoryGeneration:1,
  factoryManager:{close(){closeCalls++;return new Promise<void>((resolve,reject)=>{resolveClose=resolve;rejectClose=reject;});}},
  console:{error(...args:unknown[]){errors.push(args);}},
 };
 function requestQuit(){let prevented=false;beforeQuit({preventDefault(){prevented=true;}});return prevented;}
 vm.runInNewContext(mainLifecycleSource(),context);
 const watchRepository=(context as typeof context&{watchRepository(root:string):void}).watchRepository;
 watchRepository(repository.root);const originalWatcher=context.watcher!;
 onChange('change','queued.ts');const pendingTimer=context.refreshTimer;
 assert.equal(requestQuit(),true);assert.equal(closeCalls,1);assert.equal(quitCalls,0);
 rejectClose(Error('fixture disposal failure'));await settle();
 assert.equal(errors.length,1);assert.equal(quitCalls,0);
 watchRepository(repository.root);
 assert.equal(originalWatcher.active,true,'cancelled quit must not close the active same-root watcher');
 assert.equal(watchCreates,1);assert.equal(watcherCloses,0);
 assert.equal(context.refreshTimer,pendingTimer);assert.equal(timers.has(pendingTimer!),true);
 assert.equal(context.snapshot,repository);assert.equal(context.currentRepositoryPath,repository.root);
 assert.equal(context.attachmentDirectory,'/fixture/attachments');assert.deepEqual(removed,[]);
 timers.get(pendingTimer!)!();timers.delete(pendingTimer!);
 assert.deepEqual(JSON.parse(JSON.stringify(notifications)),[['repository:changed',['queued.ts']]]);
 onChange('change','after-failure.ts');timers.get(context.refreshTimer!)!();
 assert.deepEqual(JSON.parse(JSON.stringify(notifications.at(-1))),['repository:changed',['after-failure.ts']]);
 assert.equal(requestQuit(),true);assert.equal(closeCalls,2);assert.equal(originalWatcher.active,true);assert.deepEqual(removed,[]);
 resolveClose();await settle();
 assert.equal(quitCalls,1);assert.equal(watcherCloses,1);assert.equal(originalWatcher.active,false);
 assert.equal(context.watcher,null);assert.equal(context.watchedRoot,null);
 assert.deepEqual(removed,['/fixture/attachments']);assert.equal(context.attachmentDirectory,null);
 assert.equal(requestQuit(),false);assert.equal(closeCalls,2);assert.equal(watcherCloses,1);assert.equal(removed.length,1);
});
