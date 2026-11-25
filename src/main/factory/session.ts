import {join} from 'node:path';
import {lstat,realpath} from 'node:fs/promises';
import type {FactoryApprovalInput,FactoryDraftInput,FactoryTaskProgress,FactoryWorkspaceView} from '../../shared/factory-api';
import {type FactoryStore,safeRead,publishBytes,withStoreLock,sha256,assertScope,assertId} from './store';
import {emptyDraft,validateDraft,validateApproval,exact,text} from './draft';
export interface RuntimeState {
 version:1;scope:FactoryStore['scope'];draft:FactoryDraftInput;draftRevision:number;approval:FactoryApprovalInput|null;
 approvedDraft:FactoryDraftInput|null;providerBinding:string|null;manifestDigest:string|null;baseline:string|null;gitBaseline:string|null;runState:FactoryWorkspaceView['runState'];
 activeTaskId:string|null;message:string;tasks:FactoryTaskProgress[];superseded:string[];rework:Record<string,string>;
}
const roots=new Set<string>();
export function claimRoot(root:string):()=>void{if(roots.has(root))throw new Error('Factory root already has a writer.');roots.add(root);let released=false;return ()=>{if(!released){released=true;roots.delete(root);}};}
export interface FactorySession {state:RuntimeState;check():Promise<void>;save():Promise<void>}
export async function openSession(store:FactoryStore):Promise<FactorySession>{
 const rootStat=await lstat(store.scope.canonicalRoot);const file=join(store.directory,'runtime.json');let diskHash:string|null=null;
 const read=async()=>{try{return await safeRead(store,file,1024*1024);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}};
 const initial=await read();let state:RuntimeState={version:1,scope:store.scope,draft:emptyDraft(),draftRevision:0,approval:null,approvedDraft:null,providerBinding:null,manifestDigest:null,baseline:null,gitBaseline:null,runState:'idle',activeTaskId:null,message:'Manual planning; no provider has run.',tasks:[],superseded:[],rework:Object.create(null)};
 if(initial){diskHash=sha256(initial);const parsed=JSON.parse(initial.toString());if(!Object.hasOwn(parsed,'gitBaseline'))parsed.gitBaseline=null;exact(parsed,Object.keys(state));assertScope(store,parsed);if(!Number.isSafeInteger(parsed.draftRevision)||parsed.draftRevision<0||parsed.draftRevision>1000000)throw new Error('Invalid runtime draft revision.');parsed.draft=validateDraft(parsed.draft);if(parsed.approval)parsed.approval=validateApproval(parsed.approval);if(parsed.approvedDraft)parsed.approvedDraft=validateDraft(parsed.approvedDraft);
 if(!['idle','running','stopping','completed','blocked','failed','stopped','interrupted'].includes(parsed.runState)||!Array.isArray(parsed.tasks)||parsed.tasks.length>100||!Array.isArray(parsed.superseded)||parsed.superseded.length>1000||!parsed.rework||typeof parsed.rework!=='object'||Array.isArray(parsed.rework))throw new Error('Invalid runtime record.');
 text(parsed.message,4096);for(const value of [parsed.manifestDigest,parsed.baseline,parsed.gitBaseline,parsed.providerBinding])if(value!==null&&!/^[a-f0-9]{64}$/.test(value))throw new Error('Invalid runtime fingerprint.');for(const id of parsed.superseded)assertId(id);for(const [id,revision] of Object.entries(parsed.rework)){text(id,100,1);assertId(revision as string);}
 for(const t of parsed.tasks){exact(t,['id','title','status','attempts','message']);text(t.id,100,1);text(t.title,256);text(t.message,4096);if(!['pending','implementing','verifying','repairing','readyforreview','blocked','failed','stopped','interrupted'].includes(t.status)||!Number.isSafeInteger(t.attempts)||t.attempts<0||t.attempts>5)throw new Error('Invalid saved task progress.');}
 parsed.rework=Object.assign(Object.create(null),parsed.rework);state=parsed as RuntimeState;
 if(state.runState==='running'||state.runState==='stopping'){state.runState='interrupted';state.message='Interrupted after restart. No automatic resume; inspect worktree and reapprove/reconcile manually.';for(const t of state.tasks)if(['implementing','verifying','repairing'].includes(t.status))t.status='interrupted';state.activeTaskId=null;}
 }
 let operations=Promise.resolve();
 const serialize=<T>(work:()=>Promise<T>):Promise<T>=>{const result=operations.then(work);operations=result.then(()=>{},()=>{});return result;};
 const check=async()=>{const stat=await lstat(store.scope.canonicalRoot);if(stat.dev!==rootStat.dev||stat.ino!==rootStat.ino||stat.isSymbolicLink()||await realpath(store.scope.canonicalRoot)!==store.scope.canonicalRoot)throw new Error('Factory repository root changed.');const disk=await read();if((disk?sha256(disk):null)!==diskHash)throw new Error('Factory runtime generation changed externally; reconciliation required.');};
 return {state,check:()=>serialize(check),save:()=>serialize(async()=>{await check();const bytes=Buffer.from(JSON.stringify(state));if(bytes.length>1024*1024)throw new Error('Factory runtime state bound exceeded.');await withStoreLock(store,async()=>{await check();await publishBytes(store,'runtime.json',bytes,diskHash!==null);});diskHash=sha256(bytes);})};
}
