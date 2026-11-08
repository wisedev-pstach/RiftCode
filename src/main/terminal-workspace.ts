import {TerminalService} from './terminal-service';
import type {TerminalProvider} from '../shared/terminal';
import type {TerminalMode} from '../shared/terminal';
class ReviewTerminalService extends TerminalService {
 override async start(root:string,provider:TerminalProvider,mode:TerminalMode,cols:number,rows:number,resumeSessionId?:string){
  if(mode!=='review')throw new Error('Review slot requires review mode.');
  return super.start(root,provider,mode,cols,rows,resumeSessionId);
 }
}
/** Exactly two owned native sessions; navigation never mutates either one. */
export class TerminalWorkspace {
 readonly terminal:TerminalService;
 readonly review:TerminalService;
 constructor(...args:ConstructorParameters<typeof TerminalService>){
  this.terminal=new TerminalService(...args);
  this.review=new ReviewTerminalService(...args);
 }
 slot(value:unknown='terminal'):TerminalService{
  if(value==='terminal')return this.terminal;
  if(value==='review')return this.review;
  throw new Error('Invalid terminal slot.');
 }
 reset():void{this.terminal.reset();this.review.reset();}
}
