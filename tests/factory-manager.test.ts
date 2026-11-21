import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FactoryManager} from '../src/main/factory/manager';

test('factory manager reuses one native service and fences it on repository replacement',async()=>{
 let epoch=1,created=0,closed=0,current:(()=>boolean)|undefined;
 const manager=new FactoryManager(()=>({root:'/fixture/repository',userData:'/fixture/external',resourcesRoot:'/fixture/resources',environment:{},epoch}),async options=>{created++;current=options.isCurrent;return {disposeAsync:async()=>{closed++;}} as never;});
 assert.equal(await manager.get(),await manager.get());assert.equal(created,1);assert.equal(current?.(),true);
 epoch++;assert.equal(current?.(),false);await manager.close();assert.equal(closed,1);
});

test('factory manager does not poison future workspaces when initialization rejects during close',async()=>{
 let reject:((reason:Error)=>void)|undefined;
 const manager=new FactoryManager(()=>({root:'/fixture/repository',userData:'/fixture/external',resourcesRoot:'/fixture/resources',environment:{},epoch:1}),()=>new Promise((_,fail)=>{reject=fail;}));
 const pending=manager.get();await Promise.resolve();const closing=manager.close();
 reject!(Error('transactional initialization fixture failure'));
 await assert.rejects(()=>pending,/initialization fixture failure/);
 await closing;
});

test('factory manager fails closed after cleanup failure until explicit cleanup succeeds',async()=>{
 let created=0,attempts=0;
 const manager=new FactoryManager(()=>({root:'/fixture/repository',userData:'/fixture/external',resourcesRoot:'/fixture/resources',environment:{},epoch:1}),async()=>{created++;return {disposeAsync:async()=>{if(++attempts===1)throw Error('cleanup fixture failure');}} as never;});
 await manager.get();await assert.rejects(()=>manager.close(),/cleanup fixture failure/);
 await assert.rejects(()=>manager.get(),/cleanup failed/);assert.equal(created,1);
 await manager.close();await manager.get();assert.equal(created,2);await manager.close();
});

test('factory manager stops a late-created service and does not hand it to an obsolete renderer',async()=>{
 let finish:((value:never)=>void)|undefined,closed=0,current:(()=>boolean)|undefined;
 const manager=new FactoryManager(()=>({root:'/fixture/repository',userData:'/fixture/external',resourcesRoot:'/fixture/resources',environment:{},epoch:1}),async options=>{current=options.isCurrent;return new Promise(resolve=>{finish=resolve;});});
 const pending=manager.get();await Promise.resolve();const closing=manager.close();assert.equal(current?.(),false);
 await assert.rejects(()=>manager.get(),/closing/);
 finish!({disposeAsync:async()=>{closed++;}} as never);
 await assert.rejects(()=>pending,/obsolete/);await closing;assert.equal(closed,1);
});
