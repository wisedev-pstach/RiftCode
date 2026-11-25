import '@angular/compiler';
import {bootstrapApplication} from '@angular/platform-browser';
import {Component,signal} from '@angular/core';
import type {FactoryApi,FactoryWorkspaceView} from '../../src/shared/factory-api';
const state:FactoryWorkspaceView={workspaceId:'synthetic-workspace',repositoryRoot:'/synthetic/repository',draft:{title:'Synthetic reading list',requirements:'Keep saved titles meaningful.',architecture:'Validate at the input boundary.',diagram:'flowchart LR\nInput[Entry form] --> Validation[Validate title]\nValidation --> Storage[Local storage]',tasks:[],commands:[]},draftRevision:1,approvedRevision:null,approval:null,runState:'idle',activeTaskId:null,message:'',tasks:[],reviews:[],artifacts:[],providers:[{provider:'codex',available:true,supported:true,version:'synthetic',reason:'Synthetic fixture; no provider launched'}]};
const clone=<T>(x:T):T=>structuredClone(x);
const controls:any={state,calls:[],failSave:false,deferStop:false,deferLoad:false};
const api:FactoryApi={
 async load(){controls.calls.push('load');if(controls.deferLoad)return new Promise(resolve=>controls.resolveLoad=()=>resolve(clone(state)));return clone(state)},
 async saveDraft(draft){controls.calls.push('saveDraft');if(controls.failSave)throw Error('Native permission denied; draft not saved');state.draft=clone(draft);state.draftRevision++;state.approvedRevision=null;return clone(state)},
 async generate(){controls.calls.push('generate');throw Error('Provider blocked: native trust required')},
 async approve(input){controls.calls.push('approve');state.approval=input;state.approvedRevision=state.draftRevision;return clone(state)},
 async start(){controls.calls.push('start');state.runState='running';return clone(state)},
 async stop(){controls.calls.push('stop');if(controls.deferStop)return new Promise(resolve=>controls.resolveStop=()=>{state.runState='stopped';resolve(clone(state))});state.runState='stopped';return clone(state)},
 async review(input){controls.calls.push('review');state.reviews.find(r=>r.id===input.revisionId)!.decision=input.decision;return clone(state)},
 async rework(){controls.calls.push('rework');throw Error('Native rework blocked')},
 async readRevision(id){controls.calls.push('readRevision:'+id);return clone(controls.revisions[id])},
 async readArtifact(id){controls.calls.push('readArtifact:'+id);return clone(controls.artifacts[id])}
};
controls.api=api;controls.revisions={};controls.artifacts={};controls.clone=clone;
controls.seedReviews=()=>{
 const scope={workspaceId:state.workspaceId,canonicalRoot:state.repositoryRoot};const createdAt='2026-01-01T00:00:00.000Z';
 for(const n of [1,2]){
  const id=`synthetic-revision-${n}`;
  const patch={version:1,id:`patch-${n}`,scope,kind:'patch',fileName:`task-${n}.patch`,sha256:'synthetic-digest',bytes:100,createdAt};
  const doc={...patch,id:`doc-${n}`,kind:'markdown',fileName:`requirements-${n}.md`};
  const old={...patch,id:`old-${n}`,kind:'source',fileName:`before-${n}.ts`};
  const diagram={...patch,id:`diagram-${n}`,kind:'mermaid',fileName:`architecture-${n}.mmd`};
  const changes=[{path:`src/task-${n}.ts`,status:'modified',binary:false,beforeMode:33188,afterMode:33261,patchArtifactId:patch.id,beforeSourceId:old.id,afterSourceId:null}];
  const summary={id,taskId:`T${n}`,title:`Synthetic task ${n}`,createdAt,files:1,checksPassed:true,decision:'unreviewed',previousRevisionId:null};
  state.reviews.push(summary as any);
  controls.revisions[id]={summary,revision:{version:1,id,scope,taskId:`T${n}`,previousRevisionId:null,beforeSnapshotId:`before-${n}`,afterSnapshotId:`after-${n}`,sourceFingerprint:`synthetic-source-${n}`,changes,artifactIds:[patch.id,doc.id,old.id,diagram.id],receiptIds:[`receipt-${n}`],createdAt},changes,receipts:[{receiptId:`receipt-${n}`,taskId:`T${n}`,taskRevision:id,before:{taskRevision:id,fingerprint:'synthetic-before'},after:{taskRevision:id,fingerprint:'synthetic-after'},stale:false,checksPassed:true,evidenceType:'raw-exit',process:{invocationId:`invoke-${n}`,startedAt:createdAt,completedAt:createdAt,executable:'/synthetic/node',args:['--test','synthetic.test.ts'],cwd:state.repositoryRoot,commandId:'synthetic-check',policyId:'synthetic-policy',approvalRevision:1,reason:'success',exitCode:0,signal:null,stdout:'SYNTHETIC receipt output — not an executed command',stderr:'<img src=x onerror=alert(1)>',stdoutBytes:52,stderrBytes:32,cleanup:'not-started'}}],artifacts:[patch,doc,old,diagram]};
  for(const record of [patch,doc,old,diagram])controls.artifacts[record.id]={record,content:record===patch?`diff --git a/src/task-${n}.ts b/src/task-${n}.ts\n--- a/src/task-${n}.ts\n+++ b/src/task-${n}.ts\n@@ -1 +1 @@\n-const previous = ${n};\n+const saved = "<img src=x onerror=alert(1)>";`:record===doc?'# Synthetic local document\n<script>alert(1)</script>':record===old?`const previous = ${n};`:'flowchart LR\nA[Input] --> B[Output]'};
 }
};

(window as any).factoryFixture=controls;
try {
 const module=await import('../../src/renderer/src/factory-workbench.component');
 @Component({selector:'rift-factory-harness',standalone:true,imports:[module.FactoryWorkbench],template:'<rift-factory-workbench [api]="api()" [root]="root()" (exit)="onExit($event)" />'})
 class Harness {onExit(value:'home'|'review'){(controls.exits??=[]).push(value)}api=signal(api);root=signal('/synthetic/repository');constructor(){controls.switchApi=(a:FactoryApi)=>this.api.set(a);controls.switchRoot=(r:string)=>this.root.set(r);}}
 document.querySelector('rift-factory-workbench')!.replaceWith(document.createElement('rift-factory-harness'));
 await bootstrapApplication(Harness);
} catch(error){document.body.append('Workbench unavailable: '+String(error));}
