import test from 'node:test';
import assert from 'node:assert/strict';
import {planFactoryProvider, parseFactoryProviderOutput, locateFactoryExecutable, factoryProviderCapability} from '../src/main/factory/providers';
import type {FactoryProviderPlanInput, FactoryCapabilityVerification} from '../src/shared/factory-provider';
const input:FactoryProviderPlanInput={provider:'claude',version:'2.1.259',cwd:'/workspace/project',prompt:'input; never shell interpolation',platform:'linux',executable:{kind:'native',file:'/usr/bin/claude'},consents:['provider-execution','provider-config-execution','claude-print-startup'],limits:{timeoutMs:60000,maxOutputBytes:1048576,maxRetries:0,maxTurns:4}};
test('Claude plans stdin print with denial instead of unattended approval',()=>{
  const plan=planFactoryProvider(input);
  assert.equal(plan.status,'ready');
  if(plan.status!=='ready')return;
  assert.deepEqual(plan.request.args,['-p','--verbose','--output-format','stream-json','--permission-mode','default','--permission-prompts','none','--max-turns','4']);
  assert.equal(plan.request.stdin,input.prompt);
  assert.equal(plan.request.shell,false);
  assert.equal(plan.capability.preservesWorkspaceTrustDialog,false);
});
const jsonl=(...events:unknown[])=>events.map(e=>JSON.stringify(e)).join('\n')+'\n';
const claudeResult={type:'result',subtype:'success',is_error:false,result:'done',session_id:'fixture-session',permission_denials:[]};
test('synthetic Claude JSONL success is only a candidate, not execution evidence',()=>{
  const result=parseFactoryProviderOutput('claude',{stdout:jsonl({type:'system',subtype:'init',session_id:'fixture-session'},claudeResult),exitCode:0});
  assert.equal(result.status,'candidate');
  assert.equal(result.sessionId,'fixture-session');
  assert.equal(result.text,'done');
});
const openText={type:'text',sessionID:'ses_fixture',part:{text:'completed change'}};
const openStop={type:'step_finish',sessionID:'ses_fixture',part:{reason:'stop'}};
test('synthetic OpenCode step finish alone never proves completion',()=>{
  assert.equal(parseFactoryProviderOutput('opencode',{stdout:jsonl(openStop),exitCode:0}).status,'blocked');
  assert.equal(parseFactoryProviderOutput('opencode',{stdout:jsonl(openText,{...openStop,part:{reason:'tool-calls'}}),exitCode:0}).status,'blocked');
  assert.equal(parseFactoryProviderOutput('opencode',{stdout:jsonl(openText,openStop),exitCode:null}).status,'blocked');
});
test('synthetic OpenCode requires valid text capture, stop reason, session and successful process close',()=>{
  const out=parseFactoryProviderOutput('opencode',{stdout:jsonl(openText,openStop),exitCode:0});
  assert.equal(out.status,'candidate');assert.equal(out.sessionId,'ses_fixture');assert.equal(out.text,'completed change');
});
const codexStart=[{type:'thread.started',thread_id:'fixture-thread'},{type:'turn.started'}];
const codexEnd=[{type:'item.completed',item:{id:'m',type:'agent_message',text:'implemented'}},{type:'turn.completed',usage:{}}];
test('synthetic Codex complete turn retains session and normalized events',()=>{
  const out=parseFactoryProviderOutput('codex',{stdout:jsonl(...codexStart,...codexEnd),exitCode:0});
  assert.equal(out.status,'candidate');assert.equal(out.sessionId,'fixture-thread');assert.equal(out.text,'implemented');
  assert.ok(out.events.some(e=>e.kind==='started'));
});
test('synthetic Codex failed or declined command blocks even after a zero-exit complete turn',()=>{
  for(const status of ['failed','declined']){
    assert.equal(parseFactoryProviderOutput('codex',{stdout:jsonl(...codexStart,{type:'item.completed',item:{type:'command_execution',status,exit_code:1}},...codexEnd),exitCode:0}).status,'blocked');
  }
});


const verification:FactoryCapabilityVerification={version:'0.130.0',source:'synthetic fixture; NOT real provider acceptance',features:['codex-exec-json-stdin','codex-workspace-write','codex-approval-on-request','codex-output-schema-file']};
const codexInput:FactoryProviderPlanInput={...input,provider:'codex',version:verification.version,verification,consents:['provider-execution','provider-config-execution','workspace-write']};
const openInput:FactoryProviderPlanInput={...input,provider:'opencode',version:'2.0.0',verification:{version:'2.0.0',source:'synthetic fixture only',features:['opencode-v2-standalone-json-stdin','opencode-stop-reason']},consents:['provider-execution','provider-config-execution','opencode-private-server']};
test('Codex explicit approved sandbox and version-verified approval flags with stdin sentinel',()=>{
  const p=planFactoryProvider({...codexInput,outputSchemaPath:'/workspace/project/schema.json'});
  assert.equal(p.status,'ready');if(p.status!=='ready')return;
  assert.deepEqual(p.request.args,['--ask-for-approval','on-request','exec','--json','--sandbox','workspace-write','--output-schema','/workspace/project/schema.json','-']);
  assert.equal(p.request.stdin,input.prompt);
});
test('OpenCode V2 private server plan pins canonical PWD and never attaches shared service',()=>{
  const p=planFactoryProvider(openInput);assert.equal(p.status,'ready');if(p.status!=='ready')return;
  assert.deepEqual(p.request.args,['run','--standalone','--format','json','--agent','build']);
  assert.deepEqual(p.request.env,{PWD:input.cwd});assert.equal(p.capability.startsPrivateServer,true);
});
for(const [label,patch] of Object.entries({
  oldVersion:{version:'2.1.258'},unknownVersion:{version:'latest'},prerelease:{version:'2.1.259-beta'},futureMajor:{version:'3.0.0'},
  noConsent:{consents:[]},missingExecutable:{executable:null},relativeExecutable:{executable:{kind:'native',file:'claude'}},
  shellShim:{executable:{kind:'native',file:'/bin/claude.cmd'}},noncanonicalWorkspace:{cwd:'/workspace/project/../other'},
  emptyPrompt:{prompt:''},oversizedPrompt:{prompt:'x'.repeat(256*1024+1)},unboundedTimeout:{limits:{...input.limits,timeoutMs:0}},
  unlimitedRetry:{limits:{...input.limits,maxRetries:4}},unlimitedTurns:{limits:{...input.limits,maxTurns:101}},
} as Record<string,Partial<FactoryProviderPlanInput>>))test(`planning blocks ${label}`,()=>assert.equal(planFactoryProvider({...input,...patch}).status,'blocked'));
for(const [label,value] of Object.entries({
  codexUnverified:{...codexInput,verification:undefined},codexVersionMismatch:{...codexInput,version:'0.131.0'},
  codexMissingApprovalFeature:{...codexInput,verification:{...verification,features:['codex-exec-json-stdin','codex-workspace-write']}},
  schemaOutside:{...codexInput,outputSchemaPath:'/private/schema.json'},schemaInline:{...codexInput,outputSchemaPath:'{"type":"object"}'},
  openV1:{...openInput,version:'1.9.0'},openUnverified:{...openInput,verification:undefined},
} as Record<string,FactoryProviderPlanInput>))test(`capability gate blocks ${label}`,()=>assert.equal(planFactoryProvider(value).status,'blocked'));
test('Windows native executable or vetted Node entrypoint only; no relaxation of terminalLaunch',()=>{
  const windows:FactoryProviderPlanInput={...input,platform:'win32',cwd:'C:\\work',executable:{kind:'native',file:'C:\\bin\\claude.exe'}};
  assert.equal(planFactoryProvider(windows).status,'ready');
  assert.equal(planFactoryProvider({...windows,executable:{kind:'native',file:'C:\\bin\\claude.cmd'}}).status,'blocked');
  const p=planFactoryProvider({...windows,executable:{kind:'node-cli',file:'C:\\bin\\node.exe',entrypoint:'C:\\cli\\claude.cjs',validatedEntrypoint:true}});
  assert.equal(p.status,'ready');if(p.status==='ready')assert.equal(p.request.args[0],'C:\\cli\\claude.cjs');
  assert.equal(planFactoryProvider({...windows,executable:{kind:'node-cli',file:'C:\\bin\\node.exe',entrypoint:'relative.cjs',validatedEntrypoint:true}}).status,'blocked');
});
test('locator is injected and never discovers from provider homes',async()=>{
  const calls:string[]=[];
  const exe=await locateFactoryExecutable('claude',async id=>{calls.push(id);return input.executable;});
  assert.deepEqual(calls,['claude']);assert.deepEqual(exe,input.executable);
  assert.equal(await locateFactoryExecutable('codex',async()=>null),null);
  assert.equal(factoryProviderCapability('claude').minimumVersion,'2.1.259');
  assert.throws(()=>factoryProviderCapability('other' as never));
});
for(const [label,change] of Object.entries({
  denial:{permission_denials:[{tool_name:'Bash'}]},deferred:{deferred_reason:'approval'},blocked:{blocked_reason:'awaiting user'},
  falseSuccess:{is_error:true},missingErrorFlag:{is_error:undefined},wrongSubtype:{subtype:'error_max_turns'},
  emptyResult:{result:''},errors:{errors:['failure']},
}))test(`synthetic Claude never accepts ${label}`,()=>assert.notEqual(parseFactoryProviderOutput('claude',{stdout:jsonl({...claudeResult,...change}),exitCode:0}).status,'candidate'));
for(const [provider,stdout] of [['claude',jsonl(claudeResult)],['codex',jsonl(...codexStart,...codexEnd)],['opencode',jsonl(openText,openStop)]] as const){
  for(const [label,patch] of Object.entries({truncated:{truncated:true},cancelled:{cancelled:true},timeout:{timedOut:true},notClosed:{exitCode:null},nonzero:{exitCode:1},permissionStderr:{stderr:'permission denied'},genericErrorStderr:{stderr:'Error: provider transport stopped'},authStderr:{stderr:'authentication failed'}}))test(`synthetic ${provider} rejects ${label}`,()=>assert.notEqual(parseFactoryProviderOutput(provider,{stdout,exitCode:0,...patch}).status,'candidate'));
  test(`synthetic ${provider} rejects malformed JSON even after valid completion`,()=>assert.equal(parseFactoryProviderOutput(provider,{stdout:stdout+'{broken',exitCode:0}).status,'blocked'));
  test(`synthetic ${provider} requires terminal event`,()=>assert.equal(parseFactoryProviderOutput(provider,{stdout:jsonl({type:'progress'}),exitCode:0}).status,'blocked'));
}
test('synthetic protocol errors are failures and permissions are blocked at zero exit',()=>{
  for(const type of ['blocked','deferred','permission.request','approval.required'])assert.equal(parseFactoryProviderOutput('claude',{stdout:jsonl({type},claudeResult),exitCode:0}).status,'blocked');
  assert.equal(parseFactoryProviderOutput('codex',{stdout:jsonl(...codexStart,{type:'turn.failed',error:{message:'model failure'}}),exitCode:0}).status,'failed');
  assert.equal(parseFactoryProviderOutput('codex',{stdout:jsonl(...codexStart,...codexEnd,{type:'error',message:'bad'}),exitCode:0}).status,'failed');
  assert.equal(parseFactoryProviderOutput('opencode',{stdout:jsonl(openText,openStop,{type:'permission_request'}),exitCode:0}).status,'blocked');
  assert.equal(parseFactoryProviderOutput('opencode',{stdout:jsonl({type:'tool_use',sessionID:'ses_fixture',part:{state:{status:'error',error:'denied'}}},openText,openStop),exitCode:0}).status,'blocked');
});

test('synthetic Claude nested tool permission denial cannot be hidden by successful result',()=>{
  const denied={type:'user',message:{content:[{type:'tool_result',is_error:true,content:'Permission denied: user approval required'}]}};
  assert.equal(parseFactoryProviderOutput('claude',{stdout:jsonl(denied,claudeResult),exitCode:0}).status,'blocked');
});
test('synthetic diagnostic permission refusal in a result is not completion',()=>{
  assert.equal(parseFactoryProviderOutput('claude',{stdout:jsonl({...claudeResult,result:'Permission denied; work deferred.'}),exitCode:0}).status,'blocked');
});
test('synthetic normalized events preserve denial/error classification',()=>{
  const out=parseFactoryProviderOutput('claude',{stdout:jsonl({...claudeResult,permission_denials:[{tool:'write'}]}),exitCode:0});
  assert.equal(out.events[0].kind,'blocked');
  const failed=parseFactoryProviderOutput('claude',{stdout:jsonl({...claudeResult,is_error:true}),exitCode:0});
  assert.equal(failed.events[0].kind,'error');
});
test('synthetic new work after terminal completion requires a new terminal',()=>{
  assert.equal(parseFactoryProviderOutput('claude',{stdout:jsonl(claudeResult,{type:'assistant',message:{content:[]}}),exitCode:0}).status,'blocked');
  assert.equal(parseFactoryProviderOutput('codex',{stdout:jsonl(...codexStart,...codexEnd,{type:'item.started',item:{id:'late',type:'command_execution',status:'in_progress'}}),exitCode:0}).status,'blocked');
});

const authTrustDiagnostics=[
 'Authentication required. Please run /login.',
 'Workspace is not trusted. Trust this folder before continuing.',
 'Login required. Run /login to continue.',
 'login-required',
 'Workspace untrusted: trust this folder first.',
 'untrusted workspace',
];
for(const diagnostic of authTrustDiagnostics){
 test(`synthetic zero-exit Claude blocks stderr diagnostic: ${diagnostic}`,()=>{
  assert.equal(parseFactoryProviderOutput('claude',{stdout:jsonl(claudeResult),stderr:diagnostic,exitCode:0}).status,'blocked');
 });
 test(`synthetic zero-exit Claude blocks system diagnostic: ${diagnostic}`,()=>{
  const out=parseFactoryProviderOutput('claude',{stdout:jsonl({type:'system',subtype:'diagnostic',message:diagnostic},claudeResult),exitCode:0});
  assert.equal(out.status,'blocked');assert.ok(out.events.some(e=>e.kind==='blocked'));
 });
}
test('auth/trust words in user or agent task prose are not system diagnostics',()=>{
 const prose='Document login-required and untrusted workspace messages, including Authentication required. Please run /login.';
 assert.equal(parseFactoryProviderOutput('claude',{stdout:jsonl({type:'user',message:{content:prose}},{...claudeResult,result:prose}),exitCode:0}).status,'candidate');
 assert.equal(parseFactoryProviderOutput('codex',{stdout:jsonl(...codexStart,{type:'item.completed',item:{type:'agent_message',text:prose}},{type:'turn.completed'}),exitCode:0}).status,'candidate');
});
