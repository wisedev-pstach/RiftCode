import {test} from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,link,utimes} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {listTerminalSessions,listOpenCodeSessions} from '../src/main/terminal-sessions';
const id='01953d6c-1234-7123-9123-123456789abc';
const other='01953d6c-1234-7123-9123-123456789abd';
const ses='ses_2f6b4a8c9001AbCdEfGhIjKlMn';
async function fixture(){
 const home=await mkdtemp(join(tmpdir(),'rift-metadata-safe-')),root=join(home,'repo');await mkdir(root);
 const put=async(path:string,data:string)=>{await mkdir(join(path,'..'),{recursive:true});await writeFile(path,data);};
 const claude=join(home,'.claude','projects',root.replace(/[^a-zA-Z0-9]/g,'-'),id+'.jsonl');
 const codex=join(home,'.codex','sessions','2026','01','01',`rollout-2026-01-01T00-00-00-${id}.jsonl`);
 const opencode=join(home,'.local','share','opencode','storage','session','project',ses+'.json');
 return {home,root,put,claude,codex,opencode,cleanup:()=>rm(home,{recursive:true,force:true})};
}
for(const provider of ['claude','codex','opencode'] as const)for(const kind of ['symlink','hardlink'] as const)test(`${provider} rejects ${kind} metadata redirection`,async()=>{
 const f=await fixture();try{
  const text=provider==='claude'?JSON.stringify({type:'user',sessionId:id,cwd:f.root,message:{content:'Do not expose'}}):provider==='codex'?JSON.stringify({type:'session_meta',payload:{id,cwd:f.root,timestamp:'2026-01-01T00:00:00Z'}}):JSON.stringify({id:ses,directory:f.root,title:'Do not expose',time:{updated:42}});
  const outside=join(f.home,'outside');await f.put(outside,text+'\n');await mkdir(join(f[provider],'..'),{recursive:true});
  if(kind==='symlink')await symlink(outside,f[provider]);else await link(outside,f[provider]);
  assert.deepEqual(await listTerminalSessions(f.root,provider,{home:f.home}),[]);
 }finally{await f.cleanup();}
});
test('Codex FIFO rename index cannot block metadata discovery', {skip:process.platform==='win32'}, async()=>{
 const f=await fixture();try{
  await f.put(f.codex,JSON.stringify({type:'session_meta',payload:{id,cwd:f.root,timestamp:'2026-01-01T00:00:00Z'}})+'\n');
  await exec('mkfifo',[join(f.home,'.codex','session_index.jsonl')]);
  // A killed isolated child bounds the regression even when open() never resolves.
  const source=new URL('../src/main/terminal-sessions.ts',import.meta.url).href;
  const script=`import {listTerminalSessions} from ${JSON.stringify(source)}; console.log(JSON.stringify(await listTerminalSessions(${JSON.stringify(f.root)},'codex',{home:${JSON.stringify(f.home)}})));`;
  const result=await exec(process.execPath,['--import','tsx','--input-type=module','-e',script],{timeout:2500,killSignal:'SIGKILL'});
  const rows=JSON.parse(result.stdout);
  assert.equal(rows.length,1);assert.equal(rows[0].id,id);assert.equal(rows[0].title,'Untitled conversation');
 }finally{await f.cleanup();}
});
test('Codex index cannot authorize foreign IDs, invalid timestamps or hardlinked names',async()=>{
 const f=await fixture();try{
  await f.put(f.codex,JSON.stringify({type:'session_meta',payload:{id,cwd:f.root,timestamp:'2026-01-01T00:00:00Z'}})+'\n');
  const index=join(f.home,'.codex','session_index.jsonl');
  await f.put(index,[{id:other,thread_name:'Foreign',updated_at:'2026-01-01T00:00:00Z'},{id,thread_name:'Invalid',updated_at:'bad-date'}].map(v=>JSON.stringify(v)).join('\n')+'\n');
  assert.equal((await listTerminalSessions(f.root,'codex',{home:f.home}))[0].title,'Untitled conversation');
  await rm(index);await f.put(join(f.home,'linked'),JSON.stringify({id,thread_name:'Redirected',updated_at:'2026-01-01T00:00:00Z'})+'\n');await link(join(f.home,'linked'),index);
  assert.equal((await listTerminalSessions(f.root,'codex',{home:f.home}))[0].title,'Untitled conversation');
 }finally{await f.cleanup();}
});
test('Codex index tail finds latest rename after oversized obsolete prefix without exposing arbitrary records',async()=>{
 const f=await fixture();try{
  await f.put(f.codex,JSON.stringify({type:'session_meta',payload:{id,cwd:f.root,timestamp:'2026-01-01T00:00:00Z'}})+'\n');
  await f.put(join(f.home,'.codex','session_index.jsonl'),'x'.repeat(1200000)+'\n'+JSON.stringify({id,thread_name:'Latest name\u001b\nwith controls',updated_at:'2026-01-01T14:23:45.678Z'})+'\n');
  await utimes(f.codex,new Date('2026-01-01T01:00:00Z'),new Date('2026-01-01T01:00:00Z'));
  const list=await listTerminalSessions(f.root,'codex',{home:f.home});assert.deepEqual(list,[{id,title:'Latest name with controls',updatedAt:Date.parse('2026-01-01T14:23:45.678Z')}]);
 }finally{await f.cleanup();}
});
test('Claude latest summary is bounded and assistant text never becomes a title',async()=>{
 const f=await fixture();try{
  await f.put(f.claude,[{type:'user',sessionId:id,cwd:f.root,isMeta:true,message:{content:'SYSTEM'}},{type:'summary',summary:'Old summary'},{type:'assistant',message:{content:'SECRET RESPONSE'.repeat(8000)}},{type:'summary',summary:'Latest summary'}].map(v=>JSON.stringify(v)).join('\n')+'\n');
  assert.equal((await listTerminalSessions(f.root,'claude',{home:f.home}))[0].title,'Latest summary');
 }finally{await f.cleanup();}
});
test('bounded metadata scans fail explicitly rather than silently returning partial lists',async()=>{
 const f=await fixture();try{
  await mkdir(join(f.claude,'..'),{recursive:true});
  for(let i=0;i<1002;i++)await f.put(join(f.claude,'..',`ignored-${i}.json`),'{}');
  await assert.rejects(listTerminalSessions(f.root,'claude',{home:f.home}),/unavailable or unsupported/);
 }finally{await f.cleanup();}
});
test('OpenCode rejects malformed and oversized JSON list output without exposing it',async()=>{
 const f=await fixture();try{
  for(const text of ['not json','{}',' '.repeat(1024*1024+1)])await assert.rejects(listOpenCodeSessions(f.root,async()=>text),/unavailable or unsupported/);
  const rows=[-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER].map(updated=>({id:ses,title:'Bad time',directory:f.root,updated}));
  assert.deepEqual(await listOpenCodeSessions(f.root,async()=>JSON.stringify(rows)),[]);
 }finally{await f.cleanup();}
});
