import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listTerminalSessions } from '../src/main/terminal-sessions.js';
const id = '01953d6c-1234-7123-9123-123456789abc';
const other = '01953d6c-1234-7123-9123-123456789abd';
const ses = 'ses_2f6b4a8c9001AbCdEfGhIjKlMn';
async function fixture() {
 const home = await mkdtemp(join(tmpdir(), 'rift-session-metadata-'));
 const root = join(home, 'Resources Service'); await mkdir(root);
 const put = async (path: string, text: string) => { await mkdir(join(path, '..'), {recursive:true}); await writeFile(path,text); };
 return {home,root,put,cleanup:()=>rm(home,{recursive:true,force:true})};
}

test('Claude lists only matching metadata from its encoded project directory and exposes no transcript', async () => {
 const f=await fixture();try {
  const dir=join(f.home,'.claude','projects',f.root.replace(/[^a-zA-Z0-9]/g,'-'));
  await f.put(join(dir,id+'.jsonl'), JSON.stringify({type:'user',sessionId:id,cwd:f.root,timestamp:'2026-01-01T00:00:00Z',message:{content:'SECRET TRANSCRIPT'}})+'\n'+JSON.stringify({type:'summary',summary:'Metadata title'})+'\n');
  await f.put(join(dir,other+'.jsonl'), JSON.stringify({type:'user',sessionId:other,cwd:f.home,message:{content:'different repo'}})+'\n');
  const list=await listTerminalSessions(f.root,'claude',{home:f.home});
  assert.equal(list.length,1);assert.equal(list[0].id,id);assert.equal(list[0].title,'Metadata title');
  assert.deepEqual(Object.keys(list[0]).sort(),['id','title','updatedAt']);assert.ok(!JSON.stringify(list).includes('SECRET'));
 }finally{await f.cleanup();}
});

test('Codex recognizes session_meta in canonical date tree, exact cwd and matching filename UUID',async()=>{
 const f=await fixture();try{
  const dir=join(f.home,'.codex','sessions','2026','01','01');
  const meta=(sid:string,cwd:string)=>JSON.stringify({timestamp:'2026-01-01T00:00:00Z',type:'session_meta',payload:{id:sid,cwd,timestamp:'2026-01-01T00:00:00Z',originator:'codex_cli_rs',cli_version:'0.100.0'}})+'\n';
  await f.put(join(dir,`rollout-2026-01-01T00-00-00-${id}.jsonl`),meta(id,f.root)+'{"secret":"never returned"}\n');
  await f.put(join(dir,`rollout-2026-01-01T00-00-00-${other}.jsonl`),meta(other,f.home));
  const list=await listTerminalSessions(f.root,'codex',{home:f.home});assert.equal(list.length,1);assert.equal(list[0].id,id);assert.equal(list[0].title,'Codex conversation');
 }finally{await f.cleanup();}
});

test('OpenCode legacy metadata is scoped by directory rather than trusting project hash',async()=>{
 const f=await fixture();try{
  const dir=join(f.home,'.local','share','opencode','storage','session','projecthash');
  await f.put(join(dir,ses+'.json'),JSON.stringify({id:ses,projectID:'projecthash',directory:f.root,title:'Existing OpenCode',time:{created:1,updated:2}}));
  const list=await listTerminalSessions(f.root,'opencode',{home:f.home});assert.deepEqual(list,[{id:ses,title:'Existing OpenCode',updatedAt:2}]);
 }finally{await f.cleanup();}
});
