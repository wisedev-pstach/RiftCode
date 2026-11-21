import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,stat,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openFactoryStore,createManifest,readManifest,writeManifest,newId,publishBytes} from '../src/main/factory/store';

test('external workspace manifest survives reopen, root-bound and private; active work recovers interrupted',async()=>{
 const scratch=await mkdtemp(join(process.env.TMPDIR??tmpdir(),'factory-store-'));
 try{
  const root=join(scratch,'repo'),userData=join(scratch,'data');await mkdir(root);await mkdir(userData);
  const store=await openFactoryStore({root,userData});
  const manifest=await createManifest(store,{title:'Fixture',requirements:['R1'],tasks:[{id:'task-a',title:'A',dependencies:[],testCommandIds:['unit'],pathScope:['src/']}]});
  assert.equal(manifest.version,1);assert.equal(manifest.scope.canonicalRoot,root);
  await writeManifest(store,{...manifest,state:'implementing'});
  const reopened=await openFactoryStore({root,userData});
  assert.equal((await readManifest(reopened))?.state,'interrupted');
  assert.equal((await stat(store.directory)).mode&0o777,0o700);
  assert.equal((await stat(join(store.directory,'manifest.json'))).mode&0o777,0o600);
  assert.equal(JSON.parse(await readFile(join(store.directory,'manifest.json'),'utf8')).state,'implementing');
  await assert.rejects(openFactoryStore({root,userData:join(root,'preview')}),/outside/i);
  await assert.rejects(writeManifest(store,{...manifest,tasks:[]}),/plan.*immutable/i);
  const missing={...manifest,state:'implementing',revisionIds:[newId('revision')]};
  await writeFile(join(store.directory,'manifest.json'),JSON.stringify(missing));
  await assert.rejects(readManifest(store),/incomplete|ENOENT/);
  await writeFile(join(store.directory,'manifest.json'),'{"version":');await assert.rejects(readManifest(store),/JSON/);
  await writeFile(join(store.directory,'manifest.json'),JSON.stringify(manifest));
  await writeFile(join(store.directory,'partial-orphan'),'incomplete bytes');assert.equal((await readManifest(store))?.state,'pending');
  await writeFile(join(store.directory,'write.lock'),'crashed');await assert.rejects(writeManifest(store,manifest),/interrupted/);
  const tiny=await openFactoryStore({root,userData:join(scratch,'tiny'),limits:{maxWorkspaceBytes:1024}});
  await assert.rejects(publishBytes(tiny,'huge.bin',Buffer.alloc(1024)),/workspace byte limit/);
  assert.equal(await readManifest(tiny),null);
 }finally{await rm(scratch,{recursive:true,force:true});}
});
