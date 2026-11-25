import {join} from 'node:path';
import type {FactoryArtifact} from '../../shared/factory';
import {type FactoryStore,newId,sha256,readRecord,safeRead,publishBytes,publishRecord,withStoreLock} from './store';
const extensions={markdown:'md',mermaid:'mmd',patch:'patch',source:'bin',receipt:'log'} as const;
/** Trusted native writers only. Receipts must be created by the verifier, never renderer/model prose. */
export async function writeArtifact(store:FactoryStore,input:{kind:FactoryArtifact['kind'];content:string|Buffer}):Promise<FactoryArtifact>{return withStoreLock(store,()=>writeArtifactUnlocked(store,input));}
/** Batch primitive: caller must hold withStoreLock. */
export async function writeArtifactUnlocked(store:FactoryStore,input:{kind:FactoryArtifact['kind'];content:string|Buffer}):Promise<FactoryArtifact>{
 if(!Object.hasOwn(extensions,input.kind))throw new Error('Invalid factory artifact kind.');
 const bytes=Buffer.isBuffer(input.content)?input.content:Buffer.from(input.content);const id=newId('artifact');
 const record:FactoryArtifact={version:1,id,scope:store.scope,kind:input.kind,fileName:`${id}.${extensions[input.kind]}`,sha256:sha256(bytes),bytes:bytes.length,createdAt:new Date().toISOString()};
 await publishBytes(store,record.fileName,bytes);await publishRecord(store,record);return record;
}
export async function readArtifact(store:FactoryStore,id:string):Promise<{record:FactoryArtifact;content:Buffer}>{
 const record=await readRecord<FactoryArtifact>(store,id);
 if(!id.startsWith('artifact-')||!Object.hasOwn(extensions,record.kind)||record.fileName!==`${id}.${extensions[record.kind]}`)throw new Error('Invalid factory artifact metadata.');
 const content=await safeRead(store,join(store.directory,record.fileName));if(content.length!==record.bytes||sha256(content)!==record.sha256)throw new Error('Factory artifact integrity mismatch; interrupted.');return {record,content};
}
