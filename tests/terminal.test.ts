import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerArgs, contextPaste } from '../src/shared/terminal.js';

test('interactive review launches keep provider confirmations and never print/auto modes', () => {
  assert.deepEqual(providerArgs('claude', 'review'), ['--permission-mode', 'plan']);
  assert.deepEqual(providerArgs('claude', 'edit'), ['--permission-mode', 'default']);
  assert.deepEqual(providerArgs('opencode', 'review'), ['--agent', 'plan']);
  assert.deepEqual(providerArgs('opencode', 'edit'), ['--agent', 'build']);
  assert.deepEqual(providerArgs('codex', 'review'), ['--sandbox', 'read-only', '--ask-for-approval', 'on-request']);
  assert.deepEqual(providerArgs('codex', 'edit'), ['--ask-for-approval', 'on-request']);
  assert.throws(() => providerArgs('shell' as never, 'edit'));
});

test('context paste strips terminal controls and bracket terminators without submitting', () => {
  assert.equal(contextPaste('a\r\nb\t\x1b[201~\x03\x00c'), '\x1b[200~a\nb\t[201~c\x1b[201~');
  assert.throws(() => contextPaste('x'.repeat(32769)), /large/);
});
