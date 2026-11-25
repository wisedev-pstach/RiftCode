import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,symlink,link,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openFactoryStore,publishBytes,readManifest} from '../src/main/factory/store';
import {writeArtifact,readArtifact} from '../src/main/factory/artifacts';

test('real external Markdown/Mermaid immutable artifacts resolve by ID with hash checks and bounded writes',async()=>{
 const dir=await mkdtemp(join(process.env.TMPDIR??tmpdir(),'factory-artifact-'));
 try{const root=join(dir,'repo');await mkdir(root);const s=await openFactoryStore({root,userData:join(dir,'data'),limits:{maxObjectBytes:4096}});
 const a=await writeArtifact(s,{kind:'markdown',content:'# Requirements\n\nR1\n'});assert.ok(a.fileName.endsWith('.md'));assert.equal((await readArtifact(s,a.id)).content.toString(),'# Requirements\n\nR1\n');
 const diagram=await writeArtifact(s,{kind:'mermaid',content:'graph TD; A-->B;'});assert.ok(diagram.fileName.endsWith('.mmd'));
 await assert.rejects(publishBytes(s,a.fileName,Buffer.from('overwrite')),/EEXIST/);
 await assert.rejects(readArtifact(s,'../escape'),/ID/);
 await assert.rejects(writeArtifact(s,{kind:'markdown',content:'x'.repeat(4097)}),/limit/);
 await writeFile(join(s.directory,'partial-dead'),'{');assert.equal(await readManifest(s),null);assert.equal((await readdir(s.directory)).filter(x=>x.startsWith('artifact-')&&x.endsWith('.json')).length,2);
 await writeFile(join(s.directory,a.fileName),'tamper');await assert.rejects(readArtifact(s,a.id),/integrity/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('linked external storage entries never read or overwritten',async()=>{
 const dir=await mkdtemp(join(process.env.TMPDIR??tmpdir(),'factory-links-'));
 try{const root=join(dir,'repo');await mkdir(root);const s=await openFactoryStore({root,userData:join(dir,'data')});const a=await writeArtifact(s,{kind:'markdown',content:'safe'});
 await link(join(s.directory,a.fileName),join(dir,'hard'));await assert.rejects(readArtifact(s,a.id),/linked/);await assert.rejects(writeArtifact(s,{kind:'markdown',content:'bad'}),/Unsafe/);
 const linked=join(dir,'linked');await symlink(root,linked);await assert.rejects(openFactoryStore({root:linked,userData:join(dir,'else')}),/Unsafe/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
