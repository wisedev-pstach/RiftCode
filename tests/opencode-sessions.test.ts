import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {listOpenCodeSessions} from '../src/main/terminal-sessions';
test('current OpenCode JSON session list validates directory, IDs, titles and timestamps',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rift-list-'));
 const id='ses_2f6b4a8c9001AbCdEfGhIjKlMn';
 try {
  const rows=[{id,title:'Review\u001b\nchanges',directory:root,time:{updated:42}},{id:'--last',directory:root,time:{updated:42}},{id:id+'x',directory:'/',time:{updated:42}},{id:id+'y',directory:root,time:{updated:'42'}}];
  assert.deepEqual(await listOpenCodeSessions(root,async()=>JSON.stringify(rows)),[{id,title:'Review changes',updatedAt:42}]);
  await assert.rejects(listOpenCodeSessions(root,async()=>'{'),/unavailable/);
  await assert.rejects(listOpenCodeSessions(root,async()=>JSON.stringify({sessions:rows})),/unavailable/);
 }finally{await rm(root,{recursive:true,force:true});}
});
