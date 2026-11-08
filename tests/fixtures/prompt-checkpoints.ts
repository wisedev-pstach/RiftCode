import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {PromptCheckpoints} from '../../src/main/prompt-checkpoints';
/** Real scratch Git/filesystem checkpoint service; browser bridge only is synthetic. */
export async function promptFixture(){
 const root=await mkdtemp(join(tmpdir(),'rift-prompt-browser-'));execFileSync('git',['init','-q'],{cwd:root});
 execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:root});execFileSync('git',['config','user.name','Fixture'],{cwd:root});
 await writeFile(join(root,'reverted.ts'),'const value = "HEAD";\n');await writeFile(join(root,'deleted.ts'),'delete this line\n');
 execFileSync('git',['add','.'],{cwd:root});execFileSync('git',['commit','-qm','fixture'],{cwd:root});
 await writeFile(join(root,'reverted.ts'),'const value = "dirty before prompt";\n');
 const service=new PromptCheckpoints();let sends=0;
 return {root,service,send:async(id:string,text:string)=>{
  await service.begin(root,id,text,()=>{sends++;});
  if(sends>1){await writeFile(join(root,'added.ts'),'second prompt line\n');return;}
  await writeFile(join(root,'reverted.ts'),'const value = "HEAD";\n');await rm(join(root,'deleted.ts'),{force:true});await writeFile(join(root,'added.ts'),'new first line\nnew second line\n');
 },get sends(){return sends;},cleanup:()=>rm(root,{recursive:true,force:true})};
}
