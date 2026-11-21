export interface VerificationCommandDTO {
  commandId: string
  executable: string
  args: string[]
  cwdRelative: string
  timeoutMs: number
  stdoutBytes: number
  stderrBytes: number
  environmentKeys: string[]
}

/** Pure shape validation. Approval is a separate main-owned action, never renderer authority. */
export function validateVerificationCommand(value: unknown): VerificationCommandDTO {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid command')
  const v = value as Record<string, unknown>
  const keys = ['commandId', 'executable', 'args', 'cwdRelative', 'timeoutMs', 'stdoutBytes', 'stderrBytes', 'environmentKeys']
  if (Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k))) throw new Error('Unknown or missing command keys')
  const text = (s: unknown): s is string => typeof s === 'string' && !s.includes('\0') && s.length <= 32768
  if (!text(v.commandId) || !/^[a-zA-Z0-9_-]{1,128}$/.test(v.commandId) || !text(v.executable) || !text(v.cwdRelative)) throw new Error('Invalid command strings')
  if (!Array.isArray(v.args) || v.args.length > 256 || !v.args.every(text)) throw new Error('Invalid argv')
  if (!Array.isArray(v.environmentKeys) || v.environmentKeys.length > 64 || !v.environmentKeys.every(k => text(k) && /^[A-Z_][A-Z0-9_]*$/i.test(k))) throw new Error('Invalid environment keys')
  for (const [k, max] of [['timeoutMs', 600000], ['stdoutBytes', 16777216], ['stderrBytes', 16777216]] as const) {
    if (!Number.isSafeInteger(v[k]) || (v[k] as number) < 1 || (v[k] as number) > max) throw new Error(`Invalid ${k}`)
  }
  if (/^(?:[a-z]:|[\\/])/i.test(v.cwdRelative) || v.cwdRelative.split(/[\\/]/).includes('..')) throw new Error('Invalid relative cwd')
  return { ...v, args: [...v.args], environmentKeys: [...v.environmentKeys] } as unknown as VerificationCommandDTO
}

export type ProcessTerminationReason = 'success' | 'nonzero' | 'spawn-error' | 'timeout' | 'stopped' | 'output-overflow' | 'blocked' | 'cleanup-failed'
export interface ProcessReceipt {
  readonly invocationId: string
  readonly startedAt: string
  readonly completedAt: string
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly commandId: string
  readonly policyId: string
  readonly approvalRevision: number
  readonly reason: ProcessTerminationReason
  readonly exitCode: number | null
  readonly signal: string | null
  readonly stdout: string
  readonly stderr: string
  readonly stdoutBytes: number
  readonly stderrBytes: number
  readonly error?: string
  readonly cleanup: 'posix-group-exited' | 'not-started' | 'failed'
}
export interface SourceCapture {
  readonly taskRevision: string
  readonly fingerprint: string
}
export interface VerificationReceipt {
  readonly receiptId: string
  readonly taskId: string
  readonly taskRevision: string
  readonly before: Readonly<SourceCapture>
  readonly after: Readonly<SourceCapture>
  readonly process: ProcessReceipt
  readonly stale: boolean
  readonly checksPassed: boolean
  readonly evidenceType: 'raw-exit'
}
