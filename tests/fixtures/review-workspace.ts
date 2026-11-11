import {mkdtemp,writeFile,mkdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {TerminalWorkspace} from '../../src/main/terminal-workspace';
import type {TerminalProvider,TerminalMode} from '../../src/shared/terminal';
/** Harmless actual POSIX PTY. No provider executable, home metadata or credentials. */
export async function reviewFixture(){
 const root=await mkdtemp(join(tmpdir(),'rift-review-browser-'));
 await mkdir(join(root,'src'));await writeFile(join(root,'src/changed.ts'),'const value = true;\n');
 execFileSync('git',['init','-q'],{cwd:root});
 const command=join(root,'provider-fixture');
 await writeFile(command,String.raw`#!/usr/bin/env node
const fs=require('node:fs');process.stdin.setRawMode(true);
console.log('ACTUAL LOCAL PTY FIXTURE PID='+process.pid+' ARGS='+JSON.stringify(process.argv.slice(2)));
console.log('INITIAL_SIZE='+process.stdout.columns+'x'+process.stdout.rows);process.on('SIGWINCH',()=>console.log('RESIZED='+process.stdout.columns+'x'+process.stdout.rows));
process.stdout.write('\x1b[?2004hReady > ');
let buffer='',draft='',accepted=[];
process.stdin.on('data',d=>{
 fs.appendFileSync('input.bin',d);buffer+=d.toString();
 const end=buffer.indexOf('\x1b[201~');
 if(end>=0){draft+=buffer.slice(buffer.indexOf('\x1b[200~')+6,end);buffer=buffer.slice(end+6).replace(/\r/g,'');}
 else if(buffer.endsWith('\r')){accepted.push(draft+buffer.slice(0,-1));fs.writeFileSync('accepted.json',JSON.stringify(accepted));console.log('\r\nREQUEST_ACCEPTED='+accepted.length+' Inspect src/changed.ts:2:1');draft='';buffer='';}
});`,{mode:0o755});
 const workspace=new TerminalWorkspace(async()=>command);const starts:{slot:string;mode:string}[]=[];
 return {root,workspace,starts,
 start:async(provider:TerminalProvider,mode:TerminalMode,cols:number,rows:number,resume:string|undefined,slot:'terminal'|'review'='terminal')=>{starts.push({slot,mode});return workspace.slot(slot).start(root,provider,mode,cols,rows,resume);},
 bytes:async()=>{try{return await readFile(join(root,'input.bin'));}catch{return Buffer.alloc(0);}},
 requests:async():Promise<string[]>=>{try{return JSON.parse(await readFile(join(root,'accepted.json'),'utf8'));}catch{return []; }},
 cleanup:async()=>{workspace.reset();await rm(root,{recursive:true,force:true});}
 };
}
