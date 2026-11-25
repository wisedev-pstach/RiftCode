import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('native preload exposes the closed factory API through dedicated IPC only',async()=>{
 const calls:unknown[][]=[];let exposed:any;
 const electron={contextBridge:{exposeInMainWorld:(name:string,api:unknown)=>{assert.equal(name,'rift');exposed=api;}},ipcRenderer:{invoke:async(...args:unknown[])=>{calls.push(args);return {native:true};},on:()=>{},removeListener:()=>{}}};
 const source=readFileSync(new URL('../src/preload/index.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(compiled,{exports:{},process:{platform:'linux'},require:(name:string)=>{assert.equal(name,'electron');return electron;}});
 assert.ok(exposed.factory,'Factory bridge is required in native desktop');
 const input={title:'fixture'};
 await exposed.factory.load();await exposed.factory.saveDraft(input);await exposed.factory.generate(input);await exposed.factory.approve(input);await exposed.factory.start();await exposed.factory.stop();await exposed.factory.review(input);await exposed.factory.rework('revision-1');await exposed.factory.readRevision('revision-1');await exposed.factory.readArtifact('artifact-1');
 assert.deepEqual(calls,[['factory:load'],['factory:save-draft',input],['factory:generate',input],['factory:approve',input],['factory:start'],['factory:stop'],['factory:review',input],['factory:rework','revision-1'],['factory:revision','revision-1'],['factory:artifact','artifact-1']]);
});
