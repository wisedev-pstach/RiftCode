import {constants} from 'node:fs';
import {access,open,realpath,stat} from 'node:fs/promises';
import {delimiter,join,isAbsolute} from 'node:path';
import type {FactoryProvider,FactoryExecutable,FactoryProviderConsent,FactoryCapabilityVerification,FactoryProviderOutput} from '../../shared/factory-provider';
import type {FactoryProviderStatus} from '../../shared/factory-api';
import {planFactoryProvider,parseFactoryProviderOutput,factoryProviderCapability} from './providers';
import {approveCommand,BoundedProcessRunner} from './process';
import {sha256} from './store';
export interface ProviderDiscovery {
 /** Trusted main-only injection. Never deserialize discovery/version/capabilities from renderer. */
 locate?:(provider:FactoryProvider)=>Promise<FactoryExecutable|null>;
 detectVersion?:(executable:FactoryExecutable,signal?:AbortSignal,isCurrent?:()=>boolean)=>Promise<string>;
 verification?:(provider:FactoryProvider,executable:FactoryExecutable,version:string)=>FactoryCapabilityVerification|undefined;
}
export interface ProviderRuntimeOptions {root:string;environment:Readonly<Record<string,string>>;discovery?:ProviderDiscovery;mode?:'production'|'fixture';/** Trusted main-only cleanup latch; never renderer/provider input. */observeCleanupFailure?:(message:string)=>void;/** Native read-only observer, independent of abort/publication fences. */observeSettlement?:()=>Promise<void>}
export interface ResolvedProvider {identity:string;provider:FactoryProvider;executable:FactoryExecutable|null;version:string;consents:FactoryProviderConsent[];verification?:FactoryCapabilityVerification;status:FactoryProviderStatus}
const keys=/^(PATH|HOME|USERPROFILE|SYSTEMROOT|WINDIR|TMP|TEMP|TMPDIR|LANG|LC_ALL|CI|TERM|PATHEXT)$/i;
export function createProviderRuntime(options:ProviderRuntimeOptions){
 const environment:Record<string,string>={};for(const [key,value] of Object.entries(options.environment)){if(!keys.test(key)||typeof value!=='string'||value.includes('\0')||value.length>32768)throw new Error('Blocked provider environment; explicit safe disk-login environment only.');environment[key]=value;}
 const identity=async(executable:FactoryExecutable|null):Promise<string>=>{if(!executable)return sha256('missing');const files=executable.kind==='node-cli'?[executable.file,executable.entrypoint]:[executable.file];const records=[];for(const file of files){if(!isAbsolute(file))throw new Error('Provider must resolve absolute trusted native paths.');const path=await realpath(file);const info=await stat(path);if(!info.isFile())throw new Error('Provider is not a regular installed file.');records.push([path,info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs]);}return sha256(JSON.stringify(records));};
 let disposed=false;let cleanupFailure:string|null=null;const active=new Set<BoundedProcessRunner>();const pending=new Set<Promise<unknown>>();
 const nativeLocator=async(provider:FactoryProvider):Promise<FactoryExecutable|null>=>{
  for(const directory of (environment.PATH??'').split(delimiter).filter(isAbsolute)){
   const candidate=join(directory,provider+(process.platform==='win32'?'.exe':''));try{const file=await realpath(candidate);const info=await stat(file);if(!info.isFile())continue;await access(file,constants.X_OK);const fd=await open(file,'r');let header:Buffer;try{header=Buffer.alloc(4);await fd.read(header,0,4,0);}finally{await fd.close();}
    // Only installed native binaries by default. Shell and JS shims need a trusted main locator.
    if(!(header.equals(Buffer.from([0x7f,0x45,0x4c,0x46]))||header.subarray(0,2).toString()==='MZ'||['cffaedfe','feedfacf','cafebabe','bebafeca'].includes(header.toString('hex'))))continue;
    return {kind:'native',file};
   }catch(e){if(!['ENOENT','EACCES','ENOTDIR'].includes((e as NodeJS.ErrnoException).code??''))throw e;}
  }return null;
 };
 const execute=async(executable:FactoryExecutable,args:string[],revision:number,signal:AbortSignal|undefined,isCurrent:()=>boolean,timeoutMs:number,stdin?:string)=>{
  const command=await approveCommand({commandId:'factory-provider',executable:executable.file,args:executable.kind==='node-cli'?[executable.entrypoint,...args]:args,cwdRelative:'',timeoutMs,stdoutBytes:1024*1024,stderrBytes:65536,environmentKeys:Object.keys(environment)}, {repositoryRoot:options.root,policyId:'factory-provider-native',approvalRevision:revision,environment});
  if(cleanupFailure)throw new Error(cleanupFailure);
  if(disposed||!isCurrent()||signal?.aborted)throw new Error('Provider cancelled or obsolete.');
  const runner=new BoundedProcessRunner();active.add(runner);
  // Include native observers in pending settlement, not merely child close.
  const promise=(async()=>{try{const receipt=await runner.run(command,{signal,isCurrent:()=>!disposed&&isCurrent(),stdin});if(receipt.cleanup==='failed'||receipt.reason==='cleanup-failed'){cleanupFailure='Provider owned process cleanup could not be confirmed; manual recovery required.';options.observeCleanupFailure?.(cleanupFailure);throw new Error(cleanupFailure);}return receipt;}
   finally{try{await options.observeSettlement?.();}finally{active.delete(runner);runner.dispose();}}
  })();pending.add(promise);try{return await promise;}finally{pending.delete(promise);}
 };
 const plan=(resolved:ResolvedProvider,prompt:string,timeoutMs:number)=>planFactoryProvider({provider:resolved.provider,version:resolved.version,executable:resolved.executable,platform:process.platform as 'linux'|'win32'|'darwin',cwd:options.root,prompt,consents:resolved.consents,verification:resolved.verification,limits:{timeoutMs:Math.max(1,Math.min(timeoutMs,600000)),maxOutputBytes:1024*1024,maxRetries:0,maxTurns:8}});
 return {
  async inspect():Promise<FactoryProviderStatus[]>{const statuses:FactoryProviderStatus[]=[];for(const provider of ['claude','codex','opencode'] as const){try{const executable=await (options.discovery?.locate??nativeLocator)(provider);await identity(executable);statuses.push({provider,available:!!executable,version:null,supported:false,reason:executable?'Installed executable located by metadata only; explicit consented approval/generation will check version and capabilities.':'Native executable not found by trusted main locator; manual native terminal remains available.'});}catch{statuses.push({provider,available:false,version:null,supported:false,reason:'Installed executable discovery failed; no CLI was executed.'});}}return statuses;},
  async resolve(provider:FactoryProvider,consents:FactoryProviderConsent[],revision:number,signal?:AbortSignal,isCurrent:()=>boolean=()=>true):Promise<ResolvedProvider>{
   if(!factoryProviderCapability(provider).requiredConsents.every(c=>consents.includes(c)))throw new Error('Provider execution/configuration/startup consent required before discovery.');
   if(disposed||signal?.aborted||!isCurrent())throw new Error('Provider discovery cancelled.');
   const executable=await (options.discovery?.locate??nativeLocator)(provider);const originalIdentity=await identity(executable);let version='';
   if(executable){
    if(options.discovery?.detectVersion)version=await options.discovery.detectVersion(executable,signal,isCurrent);
    else{const receipt=await execute(executable,['--version'],revision,signal,isCurrent,3000);if(receipt.reason==='success'){const match=/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/.exec(receipt.stdout);if(match)version=match[0];}}
   }
   if(disposed||signal?.aborted||!isCurrent())throw new Error('Provider discovery obsolete.');
   if(version.length>100||version.includes('\0'))throw new Error('Invalid trusted provider version.');
   let verification=executable?options.discovery?.verification?.(provider,executable,version):undefined;
   if(executable&&provider==='codex'&&!verification&&/^\d+\.\d+\.\d+$/.test(version)){
    // These are bounded local CLI metadata probes, never model/exec requests. Help must
    // explicitly advertise every flag/value used by our adapter for this exact version.
    const rootHelp=await execute(executable,['--help'],revision,signal,isCurrent,3000);
    const execHelp=await execute(executable,['exec','--help'],revision,signal,isCurrent,3000);
    const flag=(s:string,name:string)=>s.split(/\s+/).some(token=>token===name||token.startsWith(name+'='));
    if(rootHelp.reason==='success'&&execHelp.reason==='success'&&flag(rootHelp.stdout,'--ask-for-approval')&&/\bon-request\b/.test(rootHelp.stdout)&&flag(execHelp.stdout,'--json')&&flag(execHelp.stdout,'--sandbox')&&/\bworkspace-write\b/.test(execHelp.stdout)&&/\bstdin\b/i.test(execHelp.stdout)&&/(?:^|\s)["']?-["']?(?:\s|$|[).,])/m.test(execHelp.stdout)){
     verification={version,source:'bounded-help-sha256:'+sha256(JSON.stringify([executable,version,rootHelp.stdout,execHelp.stdout])),features:['codex-exec-json-stdin','codex-workspace-write','codex-approval-on-request']};
    }
   }
   if(disposed||signal?.aborted||!isCurrent())throw new Error('Provider capability discovery obsolete.');
   if(await identity(executable)!==originalIdentity)throw new Error('Provider executable changed during capability probes.');
   const resolved:ResolvedProvider={identity:originalIdentity,provider,executable,version,consents:[...consents],verification,status:{provider,available:!!executable,version:version||null,supported:false,reason:''}};
   const p=plan(resolved,'Capability check; not executed.',1000);resolved.status.supported=p.status==='ready'&&process.platform!=='win32';resolved.status.reason=process.platform==='win32'?'Native Windows process-tree cleanup unverified; unsupported.':p.status==='blocked'?p.reason:options.mode==='fixture'?'Fixture process only; not authenticated-provider acceptance.':'Trusted native command and version resolved; execution still requires Start.';return resolved;
  },
  async run(resolved:ResolvedProvider,prompt:string,revision:number,signal:AbortSignal,isCurrent:()=>boolean,timeoutMs:number,intent:'implementation'|'planning'='implementation'):Promise<FactoryProviderOutput>{
   if(await identity(resolved.executable)!==resolved.identity)throw new Error('Provider executable changed since approved capability discovery.');
   const p=plan(resolved,prompt,timeoutMs);if(p.status==='blocked')return {status:'blocked',reason:p.reason,text:'',events:[]};
   if(intent==='planning'){
    if(resolved.provider==='opencode')return {status:'blocked',reason:'OpenCode read-only planning capability not verified; use the persistent manual draft.',text:'',events:[]};
    const flag=resolved.provider==='claude'?'--permission-mode':'--sandbox';const position=p.request.args.indexOf(flag);if(position<0)throw new Error('Provider readonly planning flag unavailable.');p.request.args[position+1]=resolved.provider==='claude'?'plan':'read-only';
   }
   // Request overlays are restricted to known keys; never inherit process.env or API tokens.
   for(const [key,value] of Object.entries(p.request.env)){if(key!=='PWD'||value!==options.root)throw new Error('Unexpected provider environment overlay.');}
   const receipt=await execute(resolved.executable!,p.request.args.slice(resolved.executable!.kind==='node-cli'?1:0),revision,signal,isCurrent,Math.max(1,Math.min(timeoutMs,600000)),p.request.stdin);
   if(receipt.reason!=='success')return {status:receipt.reason==='nonzero'?'failed':'blocked',reason:`Provider process ${receipt.reason}; no verified completion.`,text:'',events:[]};
   return parseFactoryProviderOutput(resolved.provider,{stdout:receipt.stdout,stderr:receipt.stderr,exitCode:receipt.exitCode,truncated:false,cancelled:signal.aborted});
  },
  cleanupFailure(){return cleanupFailure;},
  stop(){for(const runner of active)runner.stop();},
  async disposeAsync(){disposed=true;for(const runner of active)runner.stop();await Promise.allSettled([...pending]);if(cleanupFailure)throw new Error(cleanupFailure);},
 };
}
