export interface ReviewContext {
 repository:string;comparison:string;startRevision:string;endRevision:string|null;
 files:string[];currentPath:string;notes:string;projectContext:string;
}
export type ReviewScope='comparison'|'file'|'notes';
export function buildTerminalReview(context:ReviewContext,scope:ReviewScope,instructions:string,tone:'professional'|'honest'):string{
 if(scope==='file'&&!context.currentPath)throw new Error('Select a file first.');
 if(scope==='notes'&&!context.notes.trim())throw new Error('Select notes first.');
 const request=[
  'Review the code. Return analysis only. Do not edit files.',
  `Repository: ${context.repository}`,
  `Comparison: ${context.comparison}`,
  `Start revision: ${context.startRevision}`,
  `End revision: ${context.endRevision??'working tree'}`,
  `Scope: ${scope==='file'?'current file':scope==='notes'?'selected notes':'complete comparison'}`,
  ...(scope==='notes'?['Review the code referenced by these selected notes:',context.notes]:['Inspect the Git diff and surrounding code for these files:',...(scope==='file'?[context.currentPath]:context.files).map(path=>`- ${path}`),...(context.notes?['Selected notes (additional context):',context.notes]:[])]),
  'Prioritize correctness, security, regressions and missing tests. Lead with findings ordered by severity, include file:line references, evidence, consequences and practical fixes. Finish with a concise summary and remaining verification gaps. Do not invent findings.',
  tone==='honest'?'Be blunt about the code, never the author. Humor must be supported by technical evidence.':'Be professional, objective and specific.',
  ...(context.projectContext?['Project context:',context.projectContext]:[]),
  ...(instructions.trim()?['Review focus:',instructions.trim()]:[])
 ].join('\n');
 if(new TextEncoder().encode(request).length>32768)throw new Error('Review request exceeds 32 KiB. Narrow the scope or reduce notes/instructions.');
 return request;
}
