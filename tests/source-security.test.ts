import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {safeRepositoryFile,readRepositoryViewFile} from '../src/main/git.js';
test('source navigation reads only known repo files and rejects traversal and symlink escapes',{skip:process.platform==='win32' ? 'POSIX symlink fixture' : false},async()=>{
 const scratch=await mkdtemp(join(tmpdir(),'rift-source-'));const root=join(scratch,'repo');await mkdir(root);
 try{
  execFileSync('git',['init','-q',root]);
  await writeFile(join(root,'known file.ts'),'const fixture = true;');
  await writeFile(join(scratch,'outside.ts'),'synthetic outside fixture');
  await symlink(join(scratch,'outside.ts'),join(root,'escape.ts'));
  assert.equal((await readRepositoryViewFile(root,'known file.ts')).content,'const fixture = true;');
  await assert.rejects(safeRepositoryFile(root,'../outside.ts'),/outside/);
  await assert.rejects(readRepositoryViewFile(root,'escape.ts'),/outside/);
  await assert.rejects(readRepositoryViewFile(root,'missing.ts'),/not tracked/);
  await assert.rejects(safeRepositoryFile(root,join(scratch,'outside.ts')),/Invalid/);
 }finally{await rm(scratch,{recursive:true,force:true});}
});
