import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {argsToCommandLine}=createRequire(import.meta.url)('node-pty/lib/windowsPtyAgent.js');
import {terminalLaunch,terminalEnvironment} from '../src/main/terminal-service.js';
test('Windows npm launchers quote only discovered paths and fixed arguments; context never enters cmd',()=>{
 const launch=terminalLaunch('C:\\Program Files\\nodejs\\claude.cmd',['--permission-mode','plan'],'win32');
 assert.equal(argsToCommandLine(launch.file,launch.args),`${argsToCommandLine(launch.file,[])} /d /s /c ""C:\\Program Files\\nodejs\\claude.cmd" --permission-mode plan"`);
 for(const path of ['C:\\%TMP%\\claude.cmd','C:\\a&b\\claude.cmd','C:\\a!b\\claude.cmd'])assert.throws(()=>terminalLaunch(path,[],'win32'),/Unsafe/);
 assert.throws(()=>terminalLaunch('C:\\claude.cmd',['user text'],'win32'),/Unsafe/);
});
test('PTY environment keeps OS discovery but excludes inherited service/API credentials and hooks',()=>{
 process.env.RIFT_TEST_SECRET='secret'; process.env.ANTHROPIC_API_KEY='test-only'; process.env.NODE_OPTIONS='--test-only';
 try {
  const env=terminalEnvironment();
  assert.equal(env.RIFT_TEST_SECRET,undefined);assert.equal(env.ANTHROPIC_API_KEY,undefined);assert.equal(env.NODE_OPTIONS,undefined);
  assert.equal(env.PATH,process.env.PATH);assert.equal(env.TERM,'xterm-256color');
 } finally {delete process.env.RIFT_TEST_SECRET;delete process.env.ANTHROPIC_API_KEY;delete process.env.NODE_OPTIONS;}
});
