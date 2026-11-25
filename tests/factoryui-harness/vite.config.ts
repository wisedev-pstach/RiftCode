import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
export default defineConfig({root:resolve('tests/factoryui-harness'),server:{host:'127.0.0.1',port:4189,strictPort:true,fs:{allow:[resolve('.')] }},plugins:[{name:'factory-owned-angular-templates',enforce:'pre',transform(code,id){if(!id.endsWith('.component.ts'))return;return code.replace(/templateUrl:\s*(['"])(\.\/[^'"]+)\1/g,(_,q,p)=>`template: ${JSON.stringify(readFileSync(resolve(dirname(id),p),'utf8'))}`);}}]});
