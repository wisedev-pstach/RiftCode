import {isAbsolute} from 'node:path';
import type {FactoryDraftInput,FactoryApprovalInput,FactoryGenerateInput,FactoryReviewInput} from '../../shared/factory-api';
import type {FactoryProviderConsent} from '../../shared/factory-provider';
import {validateVerificationCommand} from '../../shared/factory-verification';
import {assertId} from './store';
export function exact(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw new Error('Unknown/missing factory input keys.');return value as Record<string,unknown>;
}
export function text(value:unknown,max:number,min=0):string {if(typeof value!=='string'||value.includes('\0')||Buffer.byteLength(value)>max||value.length<min)throw new Error('Invalid/bounded factory text.');return value;}
function list<T>(value:unknown,max:number,parse:(v:unknown)=>T):T[]{if(!Array.isArray(value)||value.length>max)throw new Error('Invalid/bounded factory list.');return value.map(parse);}
function id(v:unknown):string{const s=text(v,100,1);if(!/^[\w-]+$/.test(s))throw new Error('Invalid task/command ID.');return s;}
function unique(a:string[]):string[]{if(new Set(a).size!==a.length)throw new Error('Duplicate factory item.');return a;}
function integer(v:unknown,min:number,max:number):number{if(!Number.isSafeInteger(v)||(v as number)<min||(v as number)>max)throw new Error('Invalid factory numeric bound.');return v as number;}
export function provider(v:unknown):'claude'|'codex'|'opencode'{if(v!=='claude'&&v!=='codex'&&v!=='opencode')throw new Error('Unknown provider.');return v;}
const consentValues:FactoryProviderConsent[]=['provider-execution','provider-config-execution','claude-print-startup','workspace-write','opencode-private-server'];
function consents(v:unknown):FactoryProviderConsent[]{return unique(list(v,5,x=>{if(!consentValues.includes(x as FactoryProviderConsent))throw new Error('Unknown consent.');return x as FactoryProviderConsent;})) as FactoryProviderConsent[];}
export function validateDraft(value:unknown):FactoryDraftInput{
 const v=exact(value,['title','requirements','architecture','diagram','tasks','commands']);
 const commands=list(v.commands,64,x=>{const c=validateVerificationCommand(x);if(!isAbsolute(c.executable)||/\.(cmd|bat|ps1|sh)$/i.test(c.executable)||Buffer.byteLength(JSON.stringify(c))>65536)throw new Error('Commands require bounded native absolute executable and argv.');return c;});unique(commands.map(c=>id(c.commandId)));
 const seen=new Set<string>();const tasks=list(v.tasks,100,x=>{const t=exact(x,['id','title','description','acceptanceCriteria','dependencies','pathScope','testCommandIds']);const taskId=id(t.id);if(seen.has(taskId))throw new Error('Duplicate task.');const dependencies=unique(list(t.dependencies,100,id));if(dependencies.some(d=>!seen.has(d)))throw new Error('Dependencies must precede tasks.');seen.add(taskId);
 const pathScope=unique(list(t.pathScope,100,p=>{const s=text(p,4096,1);if(isAbsolute(s)||s.includes('\\')||s.includes(':')||s.replace(/\/$/,'').split('/').some(a=>!a||a==='.'||a==='..'||a.toLowerCase()==='.git'))throw new Error('Unsafe task scope.');return s;}));
 const testCommandIds=unique(list(t.testCommandIds,64,id));if(!pathScope.length||!testCommandIds.length||testCommandIds.some(c=>!commands.some(a=>a.commandId===c)))throw new Error('Task requires scope and approved command IDs.');
 return {id:taskId,title:text(t.title,256,1),description:text(t.description,16384,1),acceptanceCriteria:list(t.acceptanceCriteria,50,c=>text(c,2048,1)),dependencies,pathScope,testCommandIds};});
 const result={title:text(v.title,256),requirements:text(v.requirements,65536),architecture:text(v.architecture,65536),diagram:text(v.diagram,16384),tasks,commands};if(Buffer.byteLength(JSON.stringify(result))>512*1024)throw new Error('Factory draft total bound exceeded.');return result;
}
export function validateApproval(value:unknown):FactoryApprovalInput{const v=exact(value,['draftRevision','provider','consents','maxTaskAttempts','maxRunMs']);return {draftRevision:integer(v.draftRevision,1,1000000),provider:provider(v.provider),consents:consents(v.consents),maxTaskAttempts:integer(v.maxTaskAttempts,1,5),maxRunMs:integer(v.maxRunMs,100,3600000)};}
export function validateGenerate(value:unknown):FactoryGenerateInput{const v=exact(value,['stage','instruction','provider','consents']);if(!['requirements','architecture','plan'].includes(v.stage as string))throw new Error('Unknown generation stage.');return {stage:v.stage as FactoryGenerateInput['stage'],instruction:text(v.instruction,16384,1),provider:provider(v.provider),consents:consents(v.consents)};}
export function validateReview(value:unknown):FactoryReviewInput{const v=exact(value,['revisionId','decision','comment']);assertId(v.revisionId as string);if(!['accepted','changesrequested'].includes(v.decision as string))throw new Error('Unknown review decision.');return {revisionId:v.revisionId as string,decision:v.decision as FactoryReviewInput['decision'],comment:text(v.comment,16384)};}
export function emptyDraft():FactoryDraftInput{return {title:'',requirements:'',architecture:'',diagram:'',tasks:[],commands:[]};}
