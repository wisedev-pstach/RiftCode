import type {Page} from '@playwright/test';
/** Cloned synthetic review bridge, isolated from native data/providers. */
export async function installEntryFixture(page:Page, factory=true) {
 await page.addInitScript(() => {
  // Explicit substitute bridge; no provider credentials, network or real repository data.
  localStorage.setItem('rift:theme','dark');
  let state:any=null; let output=''; const calls:any[]=[];
  const repository={root:'/fixture/repo',name:'terminal-fixture',branch:'feature/terminal',baseBranch:'main',targetBranch:null,targetBranches:[],comparisonId:'working-tree',comparisonLabel:'Working tree',startRevision:'HEAD',endRevision:null,includeUntracked:true,comparisons:[{id:'working-tree',kind:'working-tree',label:'Working tree',detail:'Fixture'}],files:[{path:'src/changed.ts',status:'modified',additions:1,deletions:1}],additions:1,deletions:1,updatedAt:0};
  repository.targetBranches=Array.from({length:60},(_,i)=>({ref:'origin/feature-'+i,label:'origin/feature-'+i})) as any;
  repository.targetBranch='origin/feature-0' as any;
  repository.comparisons.push(...Array.from({length:60},(_,i)=>({id:'commit:'+i,kind:'commit',label:'Change '+i,detail:'Comparison '+i})) as any);
  (window as any).fixtureCalls=calls;
  (window as any).fixtureRepository=repository;
  (window as any).fixtureAppend=(text:string)=>{output+=text;};
  (window as any).rift={platform:'linux',terminalSessions:async()=>[{id:'01953d6c-1234-7123-9123-123456789abc',title:'Fixture session in this repository',updatedAt:42}],selectComparison:async(id:string)=>{calls.push({comparison:id});repository.comparisonId=id;return {...repository};},selectTargetBranch:async(ref:string)=>{calls.push({target:ref});repository.targetBranch=ref as any;return {...repository};},setTheme:async()=>{},checkForUpdate:async()=>({currentVersion:'0.8.0',latestVersion:null,releaseNotes:[],updateAvailable:false,installSupported:false,error:null}),openRepository:async()=>repository,refreshRepository:async()=>repository,listRepositoryFiles:async()=>['src/changed.ts','src/my file.ts'],getFilePatch:async()=>({path:'src/changed.ts',binary:false,patch:'diff --git a/src/changed.ts b/src/changed.ts\n--- a/src/changed.ts\n+++ b/src/changed.ts\n@@ -1,2 +1,2 @@\n const unchanged = 1;\n-old\n+new\n'}),listAgents:async()=>[],onRepositoryChanged:()=>()=>{},onAgentEvent:()=>()=>{},copyText:async(text:string)=>{calls.push({copy:text});},readRepositoryViewFile:async(path:string)=>{calls.push({open:path});return{path,content:Array.from({length:30},(_,i)=>'const line'+(i+1)+' = true;').join('\n'),binary:false,truncated:false};},terminalRead:async(id:string|null,cursor:number)=>({state,data:output.slice(cursor),cursor:output.length,truncated:false}),terminalStart:async(provider:string,mode:string)=>{calls.push({start:provider,mode});state={id:'fixture-session',provider,mode,cwd:repository.root,status:'running'};output='\x1b[?2004h\x1b[32mLOCAL FIXTURE — not a provider run\x1b[0m\r\nReview src/my file.ts:12:3\r\nReady > ';return state;},terminalStop:async()=>{state=null;output='';calls.push({stop:true});},terminalInput:async(id:string,data:string,paste:boolean)=>{calls.push({input:data,paste});},terminalResize:async(_id:string,cols:number)=>{(window as any).fixtureCols=cols;}};
  const api=(window as any).rift;let reviewState:any=null,reviewOutput='';
  for(const name of ['terminalStart','terminalRead','terminalStop','terminalInput','terminalResize']){
   const original=api[name];api[name]=async(...args:any[])=>{
    const slot=args[name==='terminalStart'?5:name==='terminalRead'?2:name==='terminalStop'?0:3];
    if(slot!=='review')return original(...args);
    if(name==='terminalStart'){calls.push({reviewStart:args[0],mode:args[1]});reviewState={id:'review-fixture',provider:args[0],mode:args[1],cwd:repository.root,status:'running'};reviewOutput='\x1b[?2004hLOCAL REVIEW FIXTURE — no provider run\r\nReview src/my file.ts:12:3\r\nReady > ';return reviewState;}
    if(name==='terminalRead')return {state:reviewState,data:reviewOutput.slice(args[1]),cursor:reviewOutput.length,truncated:false};
    if(name==='terminalStop'){reviewState=null;reviewOutput='';calls.push({reviewStop:true});}
    if(name==='terminalInput')calls.push({reviewInput:args[1],paste:args[2]});
   };
  }
  api.terminalSubmitReview=async(id:string,text:string)=>{calls.push({reviewSubmit:id,text});};

 });
 if(factory) await page.addInitScript(()=>{const w=window as any;w.factoryCalls=[];w.rift.platform='darwin';w.rift.chooseRepository=async()=>{w.fixtureRepository={...w.fixtureRepository,root:'/fixture/replacement',name:'replacement'};return w.fixtureRepository;};const load=async()=>{w.factoryCalls.push('load');return {workspaceId:w.fixtureRepository.root,repositoryRoot:w.fixtureRepository.root,draft:{title:'',requirements:'',architecture:'',diagram:'',tasks:[],commands:[]},draftRevision:1,approvedRevision:null,approval:null,runState:w.factoryRunning?'running':'idle',activeTaskId:null,message:'Synthetic fixture; no provider run',tasks:[],reviews:[],artifacts:[],providers:[]};};w.rift.factory=Object.freeze({load,saveDraft:async()=>{throw Error('Not used by entry tests');},approve:async()=>{throw Error('Not used');},start:async()=>{throw Error('Not used');},stop:async()=>{w.factoryCalls.push('stop');return load();}});});
}
