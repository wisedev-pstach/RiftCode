import {posix,win32} from 'node:path';
import type {FactoryExecutable, FactoryProvider, FactoryProviderCapability, FactoryProviderPlan, FactoryProviderPlanInput, FactoryProviderCapture, FactoryProviderOutput, FactoryProviderEvent} from '../../shared/factory-provider';

export function factoryProviderCapability(provider:FactoryProvider):FactoryProviderCapability {
  const common={provider,mayExecuteProviderConfiguration:true as const,autonomousCompletionGuaranteed:false as const};
  switch(provider){
    case 'claude':return {...common,minimumVersion:'2.1.259',requiredConsents:['provider-execution','provider-config-execution','claude-print-startup'],preservesWorkspaceTrustDialog:false,startsPrivateServer:false,requiresExactVersionVerification:false};
    case 'codex':return {...common,minimumVersion:null,requiredConsents:['provider-execution','provider-config-execution','workspace-write'],preservesWorkspaceTrustDialog:false,startsPrivateServer:false,requiresExactVersionVerification:true};
    case 'opencode':return {...common,minimumVersion:'2.0.0',requiredConsents:['provider-execution','provider-config-execution','opencode-private-server'],preservesWorkspaceTrustDialog:false,startsPrivateServer:true,requiresExactVersionVerification:true};
    default:throw new Error('Unsupported factory provider.');
  }
}
function versionTuple(version:string):number[] | null {
  return /^\d+\.\d+\.\d+$/.test(version)?version.split('.').map(Number):null;
}
function atLeast(version:string,minimum:string):boolean {
  const actual=versionTuple(version),min=versionTuple(minimum);
  if(!actual || !min)return false;
  for(let i=0;i<3;i++){if(actual[i]!==min[i])return actual[i]>min[i];}
  return true;
}
/** Caller-injected discovery only: no PATH/home/auth/help probes occur here. */
export async function locateFactoryExecutable(provider:FactoryProvider,locator:(provider:FactoryProvider)=>Promise<FactoryExecutable|null>):Promise<FactoryExecutable|null> {
  factoryProviderCapability(provider);
  return locator(provider);
}
/** Pure command plan. This function neither executes nor grants any consent. */
export function planFactoryProvider(input:FactoryProviderPlanInput):FactoryProviderPlan {
  const capability=factoryProviderCapability(input.provider);
  const blocked=(reason:string):FactoryProviderPlan=>({status:'blocked',reason,capability});
  const path=input.platform==='win32'?win32:posix;
  if(!['linux','darwin','win32'].includes(input.platform))return blocked('Unsupported platform.');
  if(!path.isAbsolute(input.cwd) || /[\x00-\x1f]/.test(input.cwd) || path.normalize(input.cwd)!==input.cwd)return blocked('Canonical absolute workspace is required.');
  if(!versionTuple(input.version))return blocked('Unverified or prerelease provider version; use manual native session.');
  if(capability.minimumVersion && !atLeast(input.version,capability.minimumVersion))return blocked('Installed provider is below the supported minimum version.');
  // Do not silently treat a future major as protocol compatible.
  if(input.provider==='claude' && versionTuple(input.version)![0]!==2 || input.provider==='opencode' && versionTuple(input.version)![0]!==2)return blocked('Unsupported provider major version.');
  if(capability.requiredConsents.some(consent=>!input.consents.includes(consent)))return blocked('Explicit factory execution/startup/permission consent is missing. Use manual native session.');
  const {timeoutMs,maxOutputBytes,maxRetries,maxTurns}=input.limits;
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>3600000||!Number.isInteger(maxOutputBytes)||maxOutputBytes<1024||maxOutputBytes>16*1024*1024||!Number.isInteger(maxRetries)||maxRetries<0||maxRetries>3||maxTurns!==undefined&&(!Number.isInteger(maxTurns)||maxTurns<1||maxTurns>100))return blocked('Invalid bounded execution budget.');
  if(typeof input.prompt!=='string'||!input.prompt.trim()||Buffer.byteLength(input.prompt)>256*1024||input.prompt.includes('\0'))return blocked('Prompt is empty, invalid or exceeds bounded context.');
  const exe=input.executable;
  if(!exe || !path.isAbsolute(exe.file) || /[\x00-\x1f]/.test(exe.file) || /\.(cmd|bat|ps1|sh)$/i.test(exe.file))return blocked('Native executable or validated Node CLI entrypoint required; shell launchers unsupported.');
  if(input.platform==='win32'&&!/\.exe$/i.test(exe.file))return blocked('Windows requires a native .exe runtime; .cmd support is unverified.');
  if(exe.kind!=='native'&&exe.kind!=='node-cli')return blocked('Unknown executable kind.');
  if(exe.kind==='node-cli'&&(!exe.validatedEntrypoint||!path.isAbsolute(exe.entrypoint)||/[\x00-\x1f]/.test(exe.entrypoint)||!/\.(c?js|mjs)$/i.test(exe.entrypoint)))return blocked('Node CLI entrypoint has not been validated.');
  const v=input.verification;
  const has=(feature:NonNullable<typeof v>['features'][number])=>v?.version===input.version && !!v.source.trim() && v.features.includes(feature);
  let args:string[],protocol:'claude-stream-json'|'codex-exec-jsonl'|'opencode-v2-jsonl';
  if(input.provider==='claude'){
    if(input.outputSchemaPath)return blocked('Schema file transport is not supported by this Claude adapter.');
    args=['-p','--verbose','--output-format','stream-json','--permission-mode','default','--permission-prompts','none'];
    if(maxTurns!==undefined)args.push('--max-turns',String(maxTurns));
    protocol='claude-stream-json';
  }else if(input.provider==='codex'){
    if(!has('codex-exec-json-stdin')||!has('codex-workspace-write')||!has('codex-approval-on-request'))return blocked('Exact Codex version/exec/sandbox/approval capabilities are unverified.');
    args=['--ask-for-approval','on-request','exec','--json','--sandbox','workspace-write'];
    if(input.outputSchemaPath){
      const rel=path.relative(input.cwd,input.outputSchemaPath);
      if(!has('codex-output-schema-file')||!path.isAbsolute(input.outputSchemaPath)||!rel||rel==='..'||rel.startsWith(`..${path.sep}`)||path.isAbsolute(rel)||/[\x00-\x1f]/.test(input.outputSchemaPath)||!input.outputSchemaPath.endsWith('.json'))return blocked('Verified in-workspace schema file required.');
      args.push('--output-schema',input.outputSchemaPath);
    }
    args.push('-'); protocol='codex-exec-jsonl';
  }else{
    if(input.outputSchemaPath)return blocked('OpenCode schema file transport is unsupported.');
    if(!has('opencode-v2-standalone-json-stdin')||!has('opencode-stop-reason'))return blocked('Exact OpenCode V2 standalone/stdin/JSON terminal semantics are unverified. V1 is unsupported.');
    args=['run','--standalone','--format','json','--agent','build'];protocol='opencode-v2-jsonl';
  }
  return {status:'ready',capability,request:{provider:input.provider,file:exe.file,args:[...(exe.kind==='node-cli'?[exe.entrypoint]:[]),...args],stdin:input.prompt,cwd:input.cwd,shell:false,env:input.provider==='opencode'?{PWD:input.cwd}:{},limits:{...input.limits},protocol}};
}

type JsonRecord=Record<string,unknown>;
function record(value:unknown):JsonRecord {return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{};}
function populated(value:unknown):boolean {return value!==undefined&&value!==null&&value!==false&&value!==''&&!(Array.isArray(value)&&value.length===0);}
const BLOCKED_DIAGNOSTIC=/permission[_ -]?(denied|denial|request|required)|approval[_ -]?(required|denied|request)|not authorized|requires? (?:user )?(?:approval|permission)|command (?:was )?declined|deferred|blocked_reason/i;
const AUTH_TRUST_DIAGNOSTIC=/\b(?:(?:authentication|login|log[ -]?in)[_ -]+required|(?:workspace|folder|directory) (?:is )?(?:not trusted|untrusted)|untrusted (?:workspace|folder|directory)|trust this (?:workspace|folder|directory))\b/i;
const diagnosticText=(text:string):string=>text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
const ERROR_DIAGNOSTIC=/\b(?:authentication failed|not logged in|unauthorized|invalid api key|billing error|fatal error|error)\b/i;
/** Parse a bounded, closed capture. Provider output is untrusted; never a test receipt. */
export function parseFactoryProviderOutput(provider:FactoryProvider,capture:FactoryProviderCapture):FactoryProviderOutput {
  factoryProviderCapability(provider);
  const events:FactoryProviderEvent[]=[];
  let sessionId:string|undefined,text='',terminal=false,blocked=false,failed=false,malformed=false;
  let turnStarted=false,messageSeen=false;
  const finish=(status:FactoryProviderOutput['status'],reason:string):FactoryProviderOutput=>({status,reason,sessionId,events,text});
  if(capture.truncated||Buffer.byteLength(capture.stdout)>16*1024*1024||Buffer.byteLength(capture.stderr??'')>1024*1024)return finish('blocked','Incomplete or oversized protocol capture.');
  if(capture.cancelled||capture.timedOut||capture.exitCode===null)return finish('blocked','Process did not complete normally.');
  if(BLOCKED_DIAGNOSTIC.test(capture.stderr??'')||AUTH_TRUST_DIAGNOSTIC.test(diagnosticText(capture.stderr??'')))blocked=true;
  if(ERROR_DIAGNOSTIC.test(capture.stderr??''))failed=true;
  const lines=capture.stdout.split(/\r?\n/).filter(line=>line.trim());
  if(lines.length>50000)return finish('blocked','Protocol event limit exceeded.');
  for(const line of lines){
    let e:JsonRecord;
    try{const value:unknown=JSON.parse(line);e=record(value);if(typeof e.type!=='string')throw new Error('Missing event type.');}catch{malformed=true;continue;}
    const type=e.type as string;
    const blockedBefore=blocked,failedBefore=failed;
    let kind:FactoryProviderEvent['kind']='progress';
    // Scan values, not keys (an empty permission_denials array is not a refusal).
    // Conservative diagnostic matches can block quoted examples: prefer manual review to false autonomy.
    const values:unknown[]=[e];let visited=0;
    while(values.length){
      if(++visited>100000){malformed=true;break;}
      const value=values.pop();
      // Auth/trust diagnostics are scoped to stderr or explicit system events,
      // not arbitrary user/agent prose. Existing permission refusal checks remain.
      if(typeof value==='string'&&(BLOCKED_DIAGNOSTIC.test(value)||type==='system'&&AUTH_TRUST_DIAGNOSTIC.test(diagnosticText(value)))){blocked=true;kind='blocked';}
      else if(Array.isArray(value)){for(const child of value)values.push(child);}
      else if(value!==null&&typeof value==='object'){
        const nested=record(value);
        if(nested.type==='tool_result'&&nested.is_error===true)failed=true;
        for(const child of Object.values(nested))values.push(child);
      }
    }
    if(provider==='claude'&&['assistant','user','stream_event'].includes(type))terminal=false;
    if(provider==='codex'&&type.startsWith('item.'))terminal=false;
    const id=provider==='claude'?e.session_id:provider==='codex'?e.thread_id:e.sessionID;
    if(typeof id==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)){
      if(sessionId&&sessionId!==id)malformed=true;
      sessionId=id;kind='session';
    }
    if(['blocked','deferred'].includes(type)||/(?:^|[._-])(?:permission|approval)(?:[._-]|$)/.test(type)||populated(e.permission_denials)||populated(e.blocked_reason)||populated(e.deferred_reason)){blocked=true;kind='blocked';}
    if(type==='error'||e.is_error===true){failed=true;kind='error';}
    if(provider==='claude'){
      if(type==='result'){
        kind='terminal';
        terminal=e.subtype==='success'&&e.is_error===false&&typeof e.result==='string'&&!!e.result.trim();
        if(!terminal)failed=true;
        if(typeof e.result==='string')text=e.result;
        if(populated(e.errors))failed=true;
        if(populated(e.deferred)||populated(e.blocked)||['blocked','deferred','permission_denied'].includes(String(e.stop_reason))||['blocked','deferred'].includes(String(e.terminal_reason)))blocked=true;
      }
      if(type==='assistant')kind='message';
    }else if(provider==='codex'){
      if(type==='turn.started'){turnStarted=true;terminal=false;messageSeen=false;kind='started';}
      if(type==='turn.failed'){failed=true;kind='error';}
      const item=record(e.item);
      if(type.startsWith('item.')){
        kind=item.type==='agent_message'?'message':'tool';
        if(item.type==='agent_message'&&type==='item.completed'&&typeof item.text==='string'&&item.text.trim()){text=item.text;messageSeen=true;}
        if(['failed','declined','denied','blocked'].includes(String(item.status))||item.type==='command_execution'&&typeof item.exit_code==='number'&&item.exit_code!==0){blocked=true;kind='blocked';}
        if(populated(item.error)){failed=true;kind='error';}
      }
      if(type==='turn.completed'){terminal=turnStarted&&messageSeen&&!!sessionId;kind='terminal';turnStarted=false;}
    }else{
      const part=record(e.part),state=record(part.state);
      if(type==='step_start'){terminal=false;kind='started';}
      if(type==='text'&&typeof part.text==='string'&&part.text.trim()){text+=part.text;messageSeen=true;kind='message';terminal=false;}
      if(type==='step_finish'){terminal=messageSeen&&!!sessionId&&part.reason==='stop';kind='terminal';}
      if(type==='tool_use'){
        kind='tool';terminal=false;
        if(['error','failed','denied','declined','blocked'].includes(String(state.status))||populated(state.error)){blocked=true;kind='blocked';}
      }
      if(/permission|question/.test(type)){blocked=true;kind='blocked';}
      if(populated(e.error)||part.reason==='error'||part.reason==='length'){failed=true;kind='error';}
    }
    if(blocked&&!blockedBefore)kind='blocked';
    else if(failed&&!failedBefore)kind='error';
    events.push({kind,type,...(sessionId?{sessionId}:{})});
  }
  if(blocked)return finish('blocked','Provider reported denied, deferred or unresolved permission work.');
  if(capture.exitCode!==0||failed)return finish('failed','Provider process or protocol reported failure.');
  if(malformed)return finish('blocked','Malformed protocol capture; completion cannot be proven.');
  if(!terminal||!sessionId)return finish('blocked','No verified terminal result/session; use manual native session.');
  return finish('candidate','Provider completion candidate only; independent diff and execution receipts are required.');
}

