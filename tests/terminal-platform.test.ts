import {test} from 'node:test';
import assert from 'node:assert/strict';
import {terminalWindowsPty} from '../src/main/terminal-service';

test('PTY metadata matches pinned node-pty backend and actual Windows release, never Linux or macOS',()=>{
 for(const platform of ['linux','darwin'])assert.equal(terminalWindowsPty(platform,'10.0.26200'),undefined);
 for(const build of [18309,19045,21375,21376,22631,26200])assert.deepEqual(terminalWindowsPty('win32',`10.0.${build}`),{backend:'conpty',buildNumber:build});
 assert.deepEqual(terminalWindowsPty('win32','10.0.17763'),{backend:'winpty',buildNumber:17763});
 for(const release of ['','unknown','10.0.NaN','10.0.0','10.0.99999999999999999999'])assert.equal(terminalWindowsPty('win32',release),undefined);
});
