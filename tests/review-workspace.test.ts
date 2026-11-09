import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildTerminalReview} from '../src/shared/review-request';
import {TerminalWorkspace} from '../src/main/terminal-workspace';
const until=async(fn:()=>boolean)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}assert.fail('Fixture timeout');};
test('bounded review PTY preserves edit terminal, submits literal request and follow-up once, and stops independently',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rift-review-'));const fixture=join(root,'fixture');
 await writeFile(fixture,'#!/usr/bin/env node\nprocess.stdin.setRawMode(true);console.log("PID="+process.pid+" ARGS="+JSON.stringify(process.argv.slice(2)));process.stdin.on("data",d=>console.log("INPUT="+d.toString("hex")));setTimeout(()=>process.stdout.write("\\x1b[?2004h"),250);process.on("SIGWINCH",()=>console.log("SIZE="+process.stdout.columns));',{mode:0o755});
 const workspace=new TerminalWorkspace(async()=>fixture);
 try{
  assert.throws(()=>workspace.slot('arbitrary' as any),/slot/i);
  const terminal=workspace.slot('terminal'),review=workspace.slot('review');
  const edit=await terminal.start(root,'codex','edit',80,24);
  await assert.rejects(review.start(root,'codex','edit',80,24),/review/i);
  const state=await review.start(root,'codex','review',80,24);
  await until(()=>review.read(state.id,0).data.includes('PID='));
  await assert.rejects(review.submit(state.id,'not ready'),/ready|readiness/i);
  await until(()=>review.read(state.id,0).data.includes('2004h'));
  assert.match(review.read(state.id,0).data,/read-only/);
  assert.throws(()=>review.input(edit.id,'wrong slot'),/running/);await assert.rejects(review.submit(edit.id,'wrong slot'),/running/);
  const editPid=Number(terminal.read(edit.id,0).data.match(/PID=(\d+)/)![1]);const reviewPid=Number(review.read(state.id,0).data.match(/PID=(\d+)/)![1]);assert.notEqual(editPid,reviewPid);
  const request=buildTerminalReview({repository:'scratch',comparison:'Working tree',startRevision:'HEAD',endRevision:null,files:['src/a.ts'],currentPath:'src/a.ts',notes:'src/a.ts:12 — test failures',projectContext:''},'file','security\x03','professional');
  await review.submit(state.id,request);
  const {contextPaste}=await import('../src/shared/terminal');
  const bytes=()=>[...review.read(state.id,0).data.matchAll(/INPUT=([0-9a-f]+)/g)].map(m=>m[1]).join('');
  await until(()=>bytes()===Buffer.from(contextPaste(request)+'\r').toString('hex'));
  await review.submit(state.id,'Explain src/a.ts:12');
  await until(()=>bytes()===Buffer.from(contextPaste(request)+'\r'+contextPaste('Explain src/a.ts:12')+'\r').toString('hex'));
  assert.equal(Buffer.from(bytes(),'hex').toString().split('\r').length-1,2);
  review.resize(state.id,100,30);await until(()=>review.read(state.id,0).data.includes('SIZE=100'));
  review.reset();await until(()=>{try{process.kill(reviewPid,0);return false;}catch{return true;}});assert.equal(terminal.read(edit.id,0).state?.id,edit.id);
  terminal.input(edit.id,'still here',true);await until(()=>terminal.read(edit.id,0).data.includes(Buffer.from('still here').toString('hex')));
  const next=await review.start(root,'claude','review',80,24);await until(()=>review.read(next.id,0).data.includes('PID='));const nextPid=Number(review.read(next.id,0).data.match(/PID=(\d+)/)![1]);
  workspace.reset();await until(()=>[editPid,nextPid].every(pid=>{try{process.kill(pid,0);return false;}catch{return true;}}));assert.equal(terminal.read(null,0).state,null);assert.equal(review.read(null,0).state,null);
 }finally{workspace.reset();await rm(root,{recursive:true,force:true});}
});
