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

test('Claude latest native custom rename after 64 KiB wins over generated titles and foreign metadata',async()=>{
 const f=await fixture();try{
  const path=join(f.home,'.claude','projects',f.root.replace(/[^a-zA-Z0-9]/g,'-'),id+'.jsonl');
  await f.put(path,[{type:'user',sessionId:id,cwd:f.root,message:{content:'First meaningful prompt'}},{type:'custom-title',sessionId:id,customTitle:'Old name'},{type:'assistant',message:{content:'x'.repeat(90000)}},{type:'ai-title',sessionId:id,aiTitle:'Generated title'},{type:'custom-title',sessionId:id,customTitle:'Review retained sessions'},{type:'custom-title',sessionId:other,customTitle:'Foreign name'}].map(v=>JSON.stringify(v)).join('\n')+'\n');
  const list=await listTerminalSessions(f.root,'claude',{home:f.home});
  assert.equal(list[0].title,'Review retained sessions');
 }finally{await f.cleanup();}
});

test('Codex recognizes session_meta in canonical date tree, exact cwd and matching filename UUID',async()=>{
 const f=await fixture();try{
  const dir=join(f.home,'.codex','sessions','2026','01','01');
  const meta=(sid:string,cwd:string)=>JSON.stringify({timestamp:'2026-01-01T00:00:00Z',type:'session_meta',payload:{id:sid,cwd,timestamp:'2026-01-01T00:00:00Z',originator:'codex_cli_rs',cli_version:'0.100.0'}})+'\n';
  await f.put(join(dir,`rollout-2026-01-01T00-00-00-${id}.jsonl`),meta(id,f.root)+'{"secret":"never returned"}\n');
  await f.put(join(dir,`rollout-2026-01-01T00-00-00-${other}.jsonl`),meta(other,f.home));
  const list=await listTerminalSessions(f.root,'codex',{home:f.home});assert.equal(list.length,1);assert.equal(list[0].id,id);assert.equal(list[0].title,'Untitled conversation');
 }finally{await f.cleanup();}
});

test('Codex latest native indexed rename is joined only to verified repository members',async()=>{
 const f=await fixture();try{
  const path=join(f.home,'.codex','sessions','2026','01','01',`rollout-2026-01-01T00-00-00-${id}.jsonl`);
  await f.put(path,JSON.stringify({type:'session_meta',payload:{id,cwd:f.root,timestamp:'2026-01-01T00:00:00Z'}})+'\n');
  await f.put(join(f.home,'.codex','session_index.jsonl'),[
   {id,thread_name:'Old name',updated_at:'2026-01-01T00:00:00Z'},
   {id:other,thread_name:'Other repository',updated_at:'2026-01-03T12:34:56.789Z'},
   {id,thread_name:'Codex renamed conversation',updated_at:'2026-01-02T12:34:56.789Z'}
  ].map(v=>JSON.stringify(v)).join('\n')+'\n');
  const list=await listTerminalSessions(f.root,'codex',{home:f.home});
  assert.equal(list.length,1);assert.equal(list[0].title,'Codex renamed conversation');
 }finally{await f.cleanup();}
});

test('Claude native prompt preview fallback skips system and tool-result messages',async()=>{
 const f=await fixture();try{
  await f.put(join(f.home,'.claude','projects',f.root.replace(/[^a-zA-Z0-9]/g,'-'),id+'.jsonl'),[
   {type:'user',sessionId:id,cwd:f.root,isMeta:true,message:{content:'SYSTEM'}},
   {type:'user',sessionId:id,cwd:f.root,message:{content:[{type:'tool_result',content:'SECRET TOOL'}]}},
   {type:'user',sessionId:id,cwd:f.root,message:{content:[{type:'text',text:'Fix the session picker'}]}}
  ].map(v=>JSON.stringify(v)).join('\n')+'\n');
  const list=await listTerminalSessions(f.root,'claude',{home:f.home});assert.equal(list[0].title,'Fix the session picker');
 }finally{await f.cleanup();}
});

test('Codex native first user message is the fallback when its rename index is absent',async()=>{
 const f=await fixture();try{
  await f.put(join(f.home,'.codex','sessions','2026','01','01',`rollout-2026-01-01T00-00-00-${id}.jsonl`),[
   {type:'session_meta',payload:{id,cwd:f.root,timestamp:'2026-01-01T00:00:00Z'}},
   {type:'event_msg',payload:{type:'user_message',message:'Improve the Codex workflow'}},
   {type:'event_msg',payload:{type:'agent_message',message:'SECRET RESPONSE'}}
  ].map(v=>JSON.stringify(v)).join('\n')+'\n');
  const list=await listTerminalSessions(f.root,'codex',{home:f.home});assert.equal(list[0].title,'Improve the Codex workflow');
 }finally{await f.cleanup();}
});

test('OpenCode native JSON keeps renamed titles and newest duplicate, excludes out-of-range dates',async()=>{
 const f=await fixture();try{
  const {listOpenCodeSessions}=await import('../src/main/terminal-sessions.js');
  const rows=[
   {id:ses,title:'Renamed OpenCode session',directory:f.root,updated:1793975025678},
   {id:ses,title:'Stale duplicate',directory:f.root,updated:2},
   {id:'ses_2f6b4a8c9001AbCdEfGhIjKlMo',title:'Invalid date',directory:f.root,updated:Number.MAX_SAFE_INTEGER}
  ];
  assert.deepEqual(await listOpenCodeSessions(f.root,async()=>JSON.stringify(rows)),[{id:ses,title:'Renamed OpenCode session',updatedAt:1793975025678}]);
 }finally{await f.cleanup();}
});

test('OpenCode legacy metadata is scoped by directory rather than trusting project hash',async()=>{
 const f=await fixture();try{
  const dir=join(f.home,'.local','share','opencode','storage','session','projecthash');
  await f.put(join(dir,ses+'.json'),JSON.stringify({id:ses,projectID:'projecthash',directory:f.root,title:'Existing OpenCode',time:{created:1,updated:2}}));
  const list=await listTerminalSessions(f.root,'opencode',{home:f.home});assert.deepEqual(list,[{id:ses,title:'Existing OpenCode',updatedAt:2}]);
 }finally{await f.cleanup();}
});
