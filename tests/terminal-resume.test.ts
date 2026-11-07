import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerArgs, openCodeInteractiveArgs } from '../src/shared/terminal.js';
import { terminalLaunch } from '../src/main/terminal-service.js';
const uuid = '01953d6c-1234-7123-9123-123456789abc';
const ses = 'ses_2f6b4a8c9001AbCdEfGhIjKlMn';

test('OpenCode keeps plan/build intent across v1 root and v2 mini interactive CLIs',()=>{
 for(const mode of ['review','edit'] as const){
  assert.deepEqual(openCodeInteractiveArgs(mode,ses,'opencode [project]\n--agent Agent to use'),providerArgs('opencode',mode,ses));
  assert.deepEqual(openCodeInteractiveArgs(mode,ses,'opencode [directory]\nmini Start minimal interactive interface'),['mini',...providerArgs('opencode',mode,ses)]);
 }
 assert.throws(()=>openCodeInteractiveArgs('review',ses,'unsupported CLI'),/unsupported/i);
});

test('resume uses native interactive IDs with the selected permission mode and no prompt replay', () => {
  for (const mode of ['review', 'edit'] as const) {
    assert.deepEqual(providerArgs('claude', mode, uuid), [...providerArgs('claude', mode), '--resume', uuid]);
    assert.deepEqual(providerArgs('opencode', mode, ses), [...providerArgs('opencode', mode), '--session', ses]);
    assert.deepEqual(providerArgs('codex', mode, uuid), [...providerArgs('codex', mode), 'resume', uuid]);
  }
});

test('resume IDs cannot become options, paths, shell syntax or another provider ID', () => {
  for (const id of ['', '--last', '../escape', uuid+'\n', uuid+' & whoami', 'a'.repeat(300), null, 4, ses]) {
    assert.throws(() => providerArgs('claude', 'review', id as never), /session/i);
    assert.throws(() => providerArgs('codex', 'edit', id as never), /session/i);
  }
  assert.throws(() => providerArgs('opencode', 'review', uuid), /session/i);
});

test('Windows npm shim serializer accepts validated resume IDs but rejects metacharacters', () => {
  for (const provider of ['claude', 'opencode', 'codex'] as const) {
    const id = provider === 'opencode' ? ses : uuid;
    const launch = terminalLaunch(`C:\\Program Files\\${provider}.cmd`, providerArgs(provider, 'review', id), 'win32');
    assert.ok(String(launch.args).includes(id));
  }
  for (const arg of ['abc&calc', '%HOME%', '!x!', 'abc\n', '"foo"', 'x y']) {
    assert.throws(() => terminalLaunch('C:\\cli.cmd', [arg], 'win32'), /Unsafe/);
  }
});
