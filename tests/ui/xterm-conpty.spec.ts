import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';

test('actual xterm Windows row growth preserves ConPTY scrollback instead of pulling it into redraw',async({page})=>{
 await page.setContent('<div id="probe" style="width:800px;height:400px"></div>');
 await page.addStyleTag({path:resolve('node_modules/@xterm/xterm/css/xterm.css')});
 await page.addScriptTag({path:resolve('node_modules/@xterm/xterm/lib/xterm.js')});
 const result=await page.evaluate(async()=>{
  const outcomes:any[]=[];
  for(const windowsPty of [undefined,{backend:'conpty',buildNumber:19045},{backend:'conpty',buildNumber:26200}]){
   const terminal=new (window as any).Terminal({cols:40,rows:4,scrollback:100,windowsPty});terminal.open(document.getElementById('probe'));
   await new Promise<void>(r=>terminal.write(Array.from({length:10},(_,i)=>'Synthetic row '+i).join('\r\n'),r));
   const before=terminal.buffer.active.baseY;
   terminal.resize(40,6);
   const after=terminal.buffer.active.baseY;
   const snapshot=Array.from({length:terminal.buffer.active.length},(_,i)=>terminal.buffer.active.getLine(i).translateToString(true));
   outcomes.push({windowsPty,before,after,snapshot});terminal.dispose();
  }
  return outcomes;
 });
 expect(result[0].after).toBeLessThan(result[0].before);
 for(const item of result.slice(1)){
  expect(item.after).toBe(item.before);
  for(let i=0;i<10;i++)expect(item.snapshot.filter((line:string)=>line===`Synthetic row ${i}`)).toHaveLength(1);
 }
});
