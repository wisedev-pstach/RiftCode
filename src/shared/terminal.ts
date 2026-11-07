export type TerminalProvider = 'claude' | 'opencode' | 'codex';
export type TerminalMode = 'review' | 'edit';
export interface TerminalState {
  id: string; provider: TerminalProvider; mode: TerminalMode; cwd: string;
  status: 'running' | 'exited'; exitCode?: number;
}
export interface TerminalRead { state: TerminalState | null; data: string; cursor: number; truncated: boolean }
export interface SourceLocation { path: string; line: number; column: number; endLine?: number }

export function providerArgs(provider: TerminalProvider, mode: TerminalMode): string[] {
  if (mode !== 'review' && mode !== 'edit') throw new Error('Invalid terminal mode.');
  switch (provider) {
    case 'claude': return ['--permission-mode', mode === 'review' ? 'plan' : 'default'];
    case 'opencode': return ['--agent', mode === 'review' ? 'plan' : 'build'];
    case 'codex': return [...(mode === 'review' ? ['--sandbox', 'read-only'] : []), '--ask-for-approval', 'on-request'];
    default: throw new Error('Unsupported terminal provider.');
  }
}

export function contextPaste(text: string): string {
  if (typeof text !== 'string' || text.length > 32768) throw new Error('Context is too large (32 KiB maximum).');
  const clean = text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
  return `\x1b[200~${clean}\x1b[201~`;
}
