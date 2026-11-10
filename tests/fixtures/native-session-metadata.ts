import {mkdtemp,mkdir,writeFile,rm,utimes} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {listTerminalSessions,listOpenCodeSessions} from '../../src/main/terminal-sessions';

/** Scratch native-schema inputs, not real-home metadata or an authenticated provider run. */
export async function nativeSessionMetadata(){
 const home=await mkdtemp(join(tmpdir(),'rift-native-picker-fixture-')),root=join(home,'repo');await mkdir(root);
 const id='01953d6c-1234-7123-9123-123456789abc',ses='ses_2f6b4a8c9001AbCdEfGhIjKlMn';
 const updated=Date.parse('2026-11-06T14:23:45.678Z');
 const put=async(path:string,rows:unknown[])=>{await mkdir(join(path,'..'),{recursive:true});await writeFile(path,rows.map(v=>JSON.stringify(v)).join('\n')+'\n');await utimes(path,updated/1000,updated/1000);};
 try {
  await put(join(home,'.claude','projects',root.replace(/[^a-zA-Z0-9]/g,'-'),id+'.jsonl'),[
   {type:'user',sessionId:id,cwd:root,timestamp:'2026-11-05T10:12:34.567Z',message:{content:'Inspect retained provider lifecycle'}},
   {type:'ai-title',sessionId:id,aiTitle:'Generated lifecycle review'},
   {type:'assistant',message:{content:'fixture padding '.repeat(7000)}},
   {type:'custom-title',sessionId:id,customTitle:'Retained sessions — cancellation review'}
  ]);
  await put(join(home,'.codex','sessions','2026','11','05',`rollout-2026-11-05T10-12-34-${id}.jsonl`),[
   {type:'session_meta',payload:{id,cwd:root,timestamp:'2026-11-05T10:12:34.567Z'}},
   {type:'event_msg',payload:{type:'user_message',message:'Check native resume behavior'}}
  ]);
  await put(join(home,'.codex','session_index.jsonl'),[
   {id,thread_name:'Original name',updated_at:'2026-11-05T10:12:34.567Z'},
   {id,thread_name:'Codex resume — preserve review intent',updated_at:'2026-11-06T14:23:45.678Z'}
  ]);
  return {
   claude:await listTerminalSessions(root,'claude',{home}),
   codex:await listTerminalSessions(root,'codex',{home}),
   opencode:await listOpenCodeSessions(root,async()=>JSON.stringify([{id:ses,title:'OpenCode notes — source navigation',directory:root,updated,created:Date.parse('2026-11-05T10:12:34.567Z')}]))
  };
 }finally{await rm(home,{recursive:true,force:true});}
}
