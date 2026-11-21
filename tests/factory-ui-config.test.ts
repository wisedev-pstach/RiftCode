import {test} from 'node:test';
import assert from 'node:assert/strict';
import appConfig from '../playwright.config';

test('production App UI suite excludes the separately served factory-only harness',()=>{
 const ignored=[appConfig.testIgnore].flat();
 assert.ok(ignored.some(pattern=>typeof pattern==='string'&&pattern==='**/factory.spec.ts'),'factory.spec.ts requires its separate port 4189 harness, not the production App preview');
});
