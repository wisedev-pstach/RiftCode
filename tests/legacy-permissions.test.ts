import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('legacy interoperability paths do not silently retain auto-approval flags',()=>{
 const main=readFileSync(new URL('../src/main/index.ts',import.meta.url),'utf8');
 assert.equal(main.includes('"--auto"'),false);
 assert.equal(main.includes('mode === "edit" ? "auto"'),false);
});
