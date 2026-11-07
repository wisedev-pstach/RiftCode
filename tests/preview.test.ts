import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {previewUserData} from '../src/main/preview.js';
test('explicit Mac preview uses a separate profile without altering ordinary launches',()=>{
 assert.equal(previewUserData(['Rift'],'/fixture/Application Support'),null);
 assert.equal(previewUserData(['Rift','--rift-preview'],'/fixture/Application Support'),join('/fixture/Application Support','Rift Preview'));
});
