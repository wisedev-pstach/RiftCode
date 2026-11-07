import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {readFileSync} from 'node:fs';
function requireStatus(pid:number):boolean { return process.platform==='linux' && /State:\s+Z/.test(readFileSync(`/proc/${pid}/status`,'utf8')); }
import { tmpdir } from 'node:os';
import { TerminalService } from '../src/main/terminal-service.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(fn: () => boolean) { for (let i=0;i<100;i++) { if(fn()) return; await sleep(30); } assert.fail('Timed out'); }

test('real PTY retains TTY, literal multiline paste, resize and kills its PID on reset', {skip:process.platform==='win32' ? 'POSIX fixture; native ConPTY owner test required' : false}, async () => {
 const root = await mkdtemp(join(tmpdir(), 'rift-pty-'));
 const fixture = join(root, 'fixture');
 await writeFile(fixture, '#!/usr/bin/env node\nprocess.stdin.setRawMode(true);\nconsole.log("TTY="+process.stdin.isTTY+" PID="+process.pid);\nprocess.on("SIGWINCH",()=>console.log("SIZE="+process.stdout.columns));\nprocess.stdin.on("data",data=>console.log("INPUT="+data.toString("hex")));\n', {mode:0o755});
 const service = new TerminalService(async () => fixture);
 try {
  const state = await service.start(root, 'claude','review',80,24);
  await until(() => service.read(state.id,0).data.includes('TTY=true'));
  const pid = Number(service.read(state.id,0).data.match(/PID=(\d+)/)![1]);
  service.input(state.id, 'one\ntwo\x1b[201~\x03', true);
  await until(() => service.read(state.id,0).data.includes('1b5b3230307e6f6e650a74776f5b3230317e1b5b3230317e'));
  service.resize(state.id,110,30);
  await until(() => service.read(state.id,0).data.includes('SIZE=110'));
  const cursor = service.read(state.id,0).cursor;
  assert.equal(service.read(state.id,cursor).data,'');
  await assert.rejects(service.start(root,'claude','edit',80,24), /Stop/);
  service.reset();
  await until(() => { try { process.kill(pid,0); return false; } catch { return true; }});
  assert.equal(service.read(null,0).state,null);
 } finally { service.reset(); await rm(root,{recursive:true,force:true}); }
});

test('reset force-terminates a CLI that ignores hangup and termination', {skip:process.platform==='win32' ? 'POSIX fixture; native ConPTY owner test required' : false}, async () => {
 const root=await mkdtemp(join(tmpdir(),'rift-pty-stubborn-'));
 const fixture=join(root,'fixture');
 await writeFile(fixture,'#!/usr/bin/env node\nprocess.on("SIGHUP",()=>{});process.on("SIGTERM",()=>{});console.log("PID="+process.pid);setInterval(()=>{},1000);\n',{mode:0o755});
 const service=new TerminalService(async()=>fixture);let pid=0;
 try {
  const state=await service.start(root,'codex','edit',80,24);
  await until(()=>service.read(state.id,0).data.includes('PID='));
  pid=Number(service.read(state.id,0).data.match(/PID=(\d+)/)![1]);
  service.reset();
  await until(()=>{try{process.kill(pid,0);return false;}catch{return true;}});
 } finally {service.reset();if(pid){try{process.kill(pid,'SIGKILL');}catch{}}await rm(root,{recursive:true,force:true});}
});

test('natural CLI exit has no shell fallback and closes its remaining owned process group', {skip:process.platform==='win32' ? 'POSIX fixture; native ConPTY owner test required' : false}, async () => {
 const root=await mkdtemp(join(tmpdir(),'rift-pty-exit-')); const fixture=join(root,'fixture');
 await writeFile(fixture,'#!/usr/bin/env node\nconst {spawn}=require("node:child_process");const child=spawn(process.execPath,["-e",`process.on("SIGHUP",()=>{});setInterval(()=>{},1000)`],{stdio:"inherit"});console.log("CHILD="+child.pid);setTimeout(()=>process.exit(7),200);\n',{mode:0o755});
 const service=new TerminalService(async()=>fixture);let pid=0;
 try {
  const state=await service.start(root,'opencode','review',80,24);
  await until(()=>service.read(state.id,0).data.includes('CHILD='));
  pid=Number(service.read(state.id,0).data.match(/CHILD=(\d+)/)![1]);
  await until(()=>service.read(state.id,0).state?.status==='exited');
  assert.equal(service.read(state.id,0).state?.exitCode,7);
  assert.throws(()=>service.input(state.id,'echo unexpected\r'),/No running/);
  // On Linux a dead adopted descendant can be a zombie until PID 1 reaps it; it must not be running.
  await until(()=>{try{process.kill(pid,0);const status=requireStatus(pid);return status;}catch{return true;}});
 } finally {service.reset();if(pid){try{process.kill(pid,'SIGKILL');}catch{}}await rm(root,{recursive:true,force:true});}
});

test('stop cancels pending start even in the final resolver microtask', async () => {
 let resolve!: (s:string)=>void;
 const service = new TerminalService(async () => await new Promise<string>(r => { resolve=r; }));
 const pending = service.start(process.cwd(),'claude','review',80,24);
 await until(() => !!resolve);
 resolve('/not-spawned');
 queueMicrotask(() => service.reset());
 await assert.rejects(pending,/cancelled/);
 assert.equal(service.read(null,0).state,null);
});
