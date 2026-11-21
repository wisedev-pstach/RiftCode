import type {FactoryApi,FactoryDraftInput,FactoryApprovalInput,FactoryGenerateInput,FactoryReviewInput} from '../../shared/factory-api';
import {validateVerificationCommand} from '../../shared/factory-verification';

type Handler=(event:unknown,...args:unknown[])=>Promise<unknown>;
interface Registrar {handle(name:string,handler:Handler):unknown}
const providers=['claude','codex','opencode'];
const consentIds=['provider-execution','provider-config-execution','claude-print-startup','workspace-write','opencode-private-server'];
function record(value:unknown,keys:string[],label:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Invalid '+label);
 const object=value as Record<string,unknown>;
 if(Object.keys(object).length!==keys.length||Object.keys(object).some(key=>!keys.includes(key)))throw Error('Invalid '+label+' fields');
 return object;
}
function text(value:unknown,max:number,label:string):asserts value is string {if(typeof value!=='string'||value.length>max||value.includes('\0'))throw Error('Invalid '+label);}
function list(value:unknown,max:number,label:string):asserts value is unknown[]{if(!Array.isArray(value)||value.length>max)throw Error('Invalid '+label);}
function id(value:unknown):asserts value is string{if(typeof value!=='string'||!(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/).test(value))throw Error('Invalid factory ID');}
function stringList(value:unknown,count:number,max:number,label:string){list(value,count,label);for(const item of value)text(item,max,label);}
function provider(value:unknown){if(typeof value!=='string'||!providers.includes(value))throw Error('Invalid provider');}
function consents(value:unknown){list(value,5,'consents');if(new Set(value).size!==value.length||value.some(v=>typeof v!=='string'||!consentIds.includes(v)))throw Error('Invalid consents');}
function draft(value:unknown):FactoryDraftInput{
 const v=record(value,['title','requirements','architecture','diagram','tasks','commands'],'factory draft');
 text(v.title,200,'title');text(v.requirements,262144,'requirements');text(v.architecture,262144,'architecture');text(v.diagram,65536,'diagram');
 list(v.tasks,100,'tasks');for(const task of v.tasks){const t=record(task,['id','title','description','acceptanceCriteria','dependencies','pathScope','testCommandIds'],'task');id(t.id);text(t.title,200,'task title');text(t.description,32768,'description');stringList(t.acceptanceCriteria,100,4096,'criteria');stringList(t.dependencies,100,128,'dependencies');stringList(t.pathScope,100,4096,'scope');stringList(t.testCommandIds,64,128,'commands');}
 list(v.commands,64,'commands');for(const command of v.commands)validateVerificationCommand(command);
 return structuredClone(v) as unknown as FactoryDraftInput;
}
function approval(value:unknown):FactoryApprovalInput{
 const v=record(value,['draftRevision','provider','consents','maxTaskAttempts','maxRunMs'],'approval');provider(v.provider);consents(v.consents);
 if(!Number.isSafeInteger(v.draftRevision)||(v.draftRevision as number)<1||!Number.isSafeInteger(v.maxTaskAttempts)||(v.maxTaskAttempts as number)<1||(v.maxTaskAttempts as number)>5||!Number.isSafeInteger(v.maxRunMs)||(v.maxRunMs as number)<1||(v.maxRunMs as number)>3600000)throw Error('Invalid approval bounds');
 return structuredClone(v) as unknown as FactoryApprovalInput;
}
function generate(value:unknown):FactoryGenerateInput{
 const v=record(value,['stage','instruction','provider','consents'],'generation');if(!['requirements','architecture','plan'].includes(v.stage as string))throw Error('Invalid generation stage');text(v.instruction,65536,'instruction');provider(v.provider);consents(v.consents);return structuredClone(v) as unknown as FactoryGenerateInput;
}
function review(value:unknown):FactoryReviewInput{
 const v=record(value,['revisionId','decision','comment'],'review');id(v.revisionId);if(!['accepted','changesrequested'].includes(v.decision as string))throw Error('Invalid review decision');text(v.comment,32768,'review comment');return structuredClone(v) as unknown as FactoryReviewInput;
}

/** Register only closed operations; repository/store paths and receipts are never IPC arguments. */
export function registerFactoryIpc(ipc:Registrar,getApi:()=>Promise<FactoryApi>,assertSender:(event:unknown)=>void,epoch:()=>unknown=()=>undefined):void{
 const entries:Record<string,{arity:number;parse?:(value:unknown)=>unknown;call:(api:FactoryApi,value:unknown)=>Promise<unknown>}>= {
  load:{arity:0,call:api=>api.load()},
  'save-draft':{arity:1,parse:draft,call:(api,value)=>api.saveDraft(value as FactoryDraftInput)},
  generate:{arity:1,parse:generate,call:(api,value)=>api.generate(value as FactoryGenerateInput)},
  approve:{arity:1,parse:approval,call:(api,value)=>api.approve(value as FactoryApprovalInput)},
  start:{arity:0,call:api=>api.start()},
  stop:{arity:0,call:api=>api.stop()},
  review:{arity:1,parse:review,call:(api,value)=>api.review(value as FactoryReviewInput)},
  rework:{arity:1,parse:value=>{id(value);return value;},call:(api,value)=>api.rework(value as string)},
  revision:{arity:1,parse:value=>{id(value);return value;},call:(api,value)=>api.readRevision(value as string)},
  artifact:{arity:1,parse:value=>{id(value);return value;},call:(api,value)=>api.readArtifact(value as string)},
 };
 for(const [name,entry] of Object.entries(entries))ipc.handle('factory:'+name,async(event,...args)=>{
  assertSender(event);const version=epoch();if(args.length!==entry.arity)throw Error('Invalid factory arguments');
  const input=entry.parse?entry.parse(args[0]):undefined;
  const check=()=>{assertSender(event);if(epoch()!==version)throw Error('Factory workspace changed');};
  const api=await getApi();check();const result=await entry.call(api,input);check();return result;
 });
}
