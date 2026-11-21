import type {FactoryApi} from '../../shared/factory-api';
import {createFactoryService,type FactoryService,type FactoryServiceOptions} from './service';

export interface FactoryContext extends Omit<FactoryServiceOptions,'isCurrent'> {epoch:number}
interface Entry {root:string;epoch:number;generation:number;pending:Promise<FactoryService>;cleanup?:Promise<void>}
/** Main-owned service lifetime. Never retain children across repository/renderer epochs. */
export class FactoryManager {
 private generation=0;
 private entry:Entry|null=null;
 private failedCleanup:Entry|null=null;
 private closing:Promise<void>|null=null;
 constructor(private readonly context:()=>FactoryContext,private readonly create:(options:FactoryServiceOptions)=>Promise<FactoryService>=createFactoryService){}
 private current(entry:Entry):boolean {
  if(this.entry!==entry||this.generation!==entry.generation)return false;
  const context=this.context();return context.root===entry.root&&context.epoch===entry.epoch;
 }
 // Service construction is transactional: a rejected constructor has no running children.
 // Disposal failures are different: retain the entry and block all new services until retried.
 private dispose(entry:Entry):Promise<void>{return entry.cleanup??=entry.pending.then(service=>service.disposeAsync(),()=>undefined).catch(error=>{entry.cleanup=undefined;throw error;});}
 async get():Promise<FactoryApi>{
  if(this.closing)throw new Error('Factory closing; retry after repository cleanup.');
  if(this.failedCleanup)throw new Error('Factory cleanup failed; explicit cleanup must succeed before another service can start.');
  const context=this.context();if(!context.root)throw new Error('Open a repository before Creation.');
  if(this.entry&&!this.current(this.entry)){await this.close();return this.get();}
  let entry=this.entry;
  if(!entry){
   entry={root:context.root,epoch:context.epoch,generation:this.generation,pending:null!};
   this.entry=entry;const owned=entry;
   // Capture all native values before asynchronous initialization; never rebind an old request.
   const {epoch:_,...options}=context;
   entry.pending=Promise.resolve().then(()=>this.create({...options,isCurrent:()=>this.current(owned)}));
  }
  let service:FactoryService;
  try{service=await entry.pending;}catch(error){if(this.entry===entry)this.entry=null;throw error;}
  if(!this.current(entry)){await this.dispose(entry);throw new Error('Factory repository session obsolete.');}
  return service;
 }
 close():Promise<void>{
  if(this.closing)return this.closing;
  this.generation++;const entry=this.entry??this.failedCleanup;this.entry=null;
  this.failedCleanup=entry;
  const cleanup=entry?this.dispose(entry):Promise.resolve();
  const result=cleanup.then(()=>{if(this.failedCleanup===entry)this.failedCleanup=null;}).finally(()=>{if(this.closing===result)this.closing=null;});
  this.closing=result;return result;
 }
}
