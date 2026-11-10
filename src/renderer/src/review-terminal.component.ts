import {Component} from '@angular/core';
import {AiTerminalComponent} from './ai-terminal.component';
/** A second bounded retained PTY, sharing native terminal mechanics, not permission state. */
@Component({selector:'rift-review-terminal',standalone:true,templateUrl:'./ai-terminal.component.html',host:{role:'region','aria-label':'Code review workbench'},styles:[`:host {position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden} :host([hidden]) {display:none}`]})
export class ReviewTerminalComponent extends AiTerminalComponent {
 override readonly reviewWorkbench=true;
 override readonly slot='review' as const;
 constructor(){super();this.mode.set('review');}
}
