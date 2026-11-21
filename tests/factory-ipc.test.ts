import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerFactoryIpc} from '../src/main/factory/ipc';

test('factory IPC rejects unknown senders and malformed arity before obtaining a native workspace',async()=>{
 const handlers=new Map<string,(event:unknown,...args:unknown[])=>unknown>();let obtained=0;
 registerFactoryIpc({handle:(name,fn)=>{handlers.set(name,fn);}},async()=>{obtained++;return {} as never;},event=>{if(event!=='trusted')throw Error('Untrusted sender');});
 assert.deepEqual([...handlers.keys()].sort(),['load','save-draft','generate','approve','start','stop','review','rework','revision','artifact'].map(name=>'factory:'+name).sort());
 await assert.rejects(async()=>handlers.get('factory:load')!('untrusted'),/Untrusted/);
 await assert.rejects(async()=>handlers.get('factory:load')!('trusted','unexpected'),/arguments/);
 await assert.rejects(async()=>handlers.get('factory:artifact')!('trusted','../escape'),/ID/);
 await assert.rejects(async()=>handlers.get('factory:save-draft')!('trusted',{title:'incomplete'}),/draft/);
 await assert.rejects(async()=>handlers.get('factory:approve')!('trusted',{draftRevision:1,provider:'unknown',consents:[],maxTaskAttempts:3,maxRunMs:1000}),/provider/);
 assert.equal(obtained,0);
});

test('factory IPC cannot dispatch after its repository generation changes',async()=>{
 const handlers=new Map<string,(event:unknown,...args:unknown[])=>unknown>();let generation=1;let dispatched=false;
 registerFactoryIpc({handle:(name,fn)=>{handlers.set(name,fn);}},async()=>{generation++;return {load:async()=>{dispatched=true;}} as never;},()=>{},()=>generation);
 await assert.rejects(async()=>handlers.get('factory:load')!('trusted'),/workspace changed/);
 assert.equal(dispatched,false);
});

test('factory IPC delegates only bounded parsed inputs to the main-owned API and checks the sender again',async()=>{
 const handlers=new Map<string,(event:unknown,...args:unknown[])=>unknown>();const calls:unknown[]=[];let valid=true;let asserts=0;
 const api={load:async()=>{calls.push('load');return {workspaceId:'workspace'};},readArtifact:async(id:string)=>{calls.push(id);return {content:'saved only'};}};
 registerFactoryIpc({handle:(name,fn)=>{handlers.set(name,fn);}},async()=>api as never,()=>{asserts++;if(!valid)throw Error('Untrusted sender');});
 assert.deepEqual(await handlers.get('factory:load')!('trusted'),{workspaceId:'workspace'});
 assert.deepEqual(await handlers.get('factory:artifact')!('trusted','artifact-123'),{content:'saved only'});
 assert.deepEqual(calls,['load','artifact-123']);assert.ok(asserts>=4);
 const later=new Map<string,(event:unknown,...args:unknown[])=>unknown>();
 registerFactoryIpc({handle:(name,fn)=>{later.set(name,fn);}},async()=>{valid=false;return api as never;},()=>{if(!valid)throw Error('Untrusted sender');});
 await assert.rejects(async()=>later.get('factory:load')!('trusted'),/Untrusted/);
 assert.deepEqual(calls,['load','artifact-123']);
});

for(const invalidation of ['epoch','sender'] as const){
 test(`factory IPC rejects the final load result when ${invalidation} changes during API execution`,async()=>{
  const handlers=new Map<string,(event:unknown,...args:unknown[])=>unknown>();
  let generation=1;let valid=true;let loads=0;
  let release!:(value:unknown)=>void;let started!:()=>void;
  const dispatched=new Promise<void>(resolve=>{started=resolve;});
  const result=new Promise<unknown>(resolve=>{release=resolve;});
  const api={load:async()=>{loads++;started();return result;}};
  registerFactoryIpc({handle:(name,fn)=>{handlers.set(name,fn);}},async()=>api as never,()=>{if(!valid)throw Error('Untrusted sender');},()=>generation);
  const pending=Promise.resolve(handlers.get('factory:load')!('trusted'));
  await dispatched;assert.equal(loads,1);
  if(invalidation==='epoch')generation++;else valid=false;
  const rejection=assert.rejects(pending,invalidation==='epoch'?/workspace changed/:/Untrusted sender/);
  release({workspaceId:'obsolete-sensitive-result'});
  await rejection;
 });
}
