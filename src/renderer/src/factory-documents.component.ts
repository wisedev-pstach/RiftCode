import {ChangeDetectionStrategy,Component,Input,computed,signal} from '@angular/core';
export interface FactoryFlowNode {id:string;label:string;x:number;y:number}
export interface FactoryFlow {nodes:FactoryFlowNode[];edges:{from:FactoryFlowNode;to:FactoryFlowNode;startX:number;startY:number;endX:number;endY:number;arrow:string}[];width:number;height:number;reason:string}
/** Deliberately a declarative flowchart subset, not a general Mermaid/HTML interpreter. */
export function factoryFlow(source:string):FactoryFlow {
 const empty=(reason:string):FactoryFlow=>({nodes:[],edges:[],width:600,height:120,reason});
 if(source.length>12000)return empty('Diagram exceeds the 12,000-character preview limit.');
 const lines=source.trim().split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('%%'));
 const header=/^(?:flowchart|graph) (LR|TD|TB)$/.exec(lines.shift()?.trim()||'');
 if(!header)return empty('Supported subset: flowchart LR / TD / TB, plain rectangular nodes and --> edges.');
 const nodes=new Map<string,string>();const links:[string,string][]=[];
 const node='([A-Za-z][A-Za-z0-9_]{0,31})(?:\\[([^\\[\\]<>\\n]{1,80})\\])?';
 const edge=new RegExp(`^${node}\\s*-->\\s*${node}\\s*;?$`);const single=new RegExp(`^${node}\\s*;?$`);
 for(const line of lines){const match=edge.exec(line.trim());if(match){const [,a,al,b,bl]=match;if(a===b)return empty('Self-loop edges are unsupported. Original source is retained.');nodes.set(a,al||nodes.get(a)||a);nodes.set(b,bl||nodes.get(b)||b);links.push([a,b]);}else{const m=single.exec(line.trim());if(!m)return empty('Unsupported diagram syntax. Source is retained; no partial or invented diagram is rendered.');nodes.set(m[1],m[2]||nodes.get(m[1])||m[1]);}}
 if(nodes.size>24||links.length>48)return empty('Preview supports at most 24 nodes and 48 edges.');
 if(!nodes.size)return empty('Add a node or an edge to preview the diagram.');
 const vertical=header[1]!=='LR';const placed=[...nodes].map(([id,label],i)=>({id,label,x:vertical?140:(i%3)*230+110,y:vertical?i*100+50:Math.floor(i/3)*110+50}));
 const map=new Map(placed.map(n=>[n.id,n]));
 return {nodes:placed,edges:links.map(([a,b])=>{
  const from=map.get(a)!,to=map.get(b)!,dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
  const inset=Math.min(dx?95/Math.abs(dx):Infinity,dy?27/Math.abs(dy):Infinity);
  const startX=from.x+dx*inset,startY=from.y+dy*inset,endX=to.x-dx*inset,endY=to.y-dy*inset;
  return {from,to,startX,startY,endX,endY,arrow:`${endX},${endY} ${endX-ux*9-uy*4},${endY-uy*9+ux*4} ${endX-ux*9+uy*4},${endY-uy*9-ux*4}`};
 }),width:vertical?300:690,height:vertical?placed.length*100:Math.ceil(placed.length/3)*110,reason:''};
}
@Component({selector:'rift-factory-documents',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,templateUrl:'./factory-documents.component.html',styles:[`:host{display:block;min-width:0}small{color:var(--fw-muted,#a0acb8)}pre{font:12px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:440px;overflow:auto;padding:12px;background:var(--fw-bg,#0b0d10);border:1px solid var(--fw-line,#303842);border-radius:4px}svg{display:block;width:100%;height:auto;min-height:110px;max-height:440px;border:1px solid var(--fw-line,#303842);background:var(--fw-surface,#13171c)}rect{fill:var(--fw-hover,#20262d);stroke:var(--fw-line,#303842)}line{stroke:var(--fw-muted,#a0acb8);stroke-width:2}polygon{fill:var(--fw-muted,#a0acb8)}text{fill:var(--fw-text,#e1e6ed);font:12px sans-serif}summary{cursor:pointer;margin:12px 0}p{line-height:1.6}`]})
export class FactoryDocuments {
 private readonly source=signal('');private readonly format=signal('markdown');
 @Input() set content(value:string){this.source.set(value||'');}get content():string{return this.source();}
 @Input() set kind(value:string){this.format.set(value);}get kind():string{return this.format();}
 readonly flow=computed(()=>factoryFlow(this.source()));
}
