import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { realpath, stat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { validateVerificationCommand, type ProcessReceipt, type ProcessTerminationReason } from '../../shared/factory-verification'

export interface ApprovalPolicy {
  repositoryRoot: string
  policyId: string
  approvalRevision: number
  /** Explicit main-owned values. Never pass process.env wholesale. */
  environment: Readonly<Record<string, string>>
}
export interface ApprovedCommand {
  readonly commandId: string
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly repositoryRoot: string
  readonly cwdRelative: string
  readonly timeoutMs: number
  readonly stdoutBytes: number
  readonly stderrBytes: number
  readonly policyId: string
  readonly approvalRevision: number
  readonly environment: Readonly<Record<string, string>>
}
const approvals = new WeakSet<object>()
const allowedEnvironment = /^(PATH|HOME|USERPROFILE|SYSTEMROOT|WINDIR|TMP|TEMP|TMPDIR|LANG|LC_ALL|CI|TERM|PATHEXT|JAVA_HOME|GOPATH|GOROOT|CARGO_HOME|RUSTUP_HOME)$/i

export async function canonicalCwd(root: string, relative: string): Promise<{ root: string; cwd: string }> {
  if (!path.isAbsolute(root) || path.isAbsolute(relative) || /^(?:[a-z]:|[\\/])/i.test(relative) || relative.split(/[\\/]/).includes('..') || relative.includes('\0')) throw new Error('Invalid cwd')
  const canonicalRoot = await realpath(root)
  const cwd = await realpath(path.resolve(canonicalRoot, relative))
  const rel = path.relative(canonicalRoot, cwd)
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) || !(await stat(cwd)).isDirectory()) throw new Error('Cwd escapes repository')
  return { root: canonicalRoot, cwd }
}

/** Call only after explicit user consent through a trusted main-owned command registry. */
export async function approveCommand(input: unknown, policy: ApprovalPolicy): Promise<ApprovedCommand> {
  const dto = validateVerificationCommand(input)
  if (!path.isAbsolute(dto.executable) || /\.(cmd|bat)$/i.test(dto.executable)) throw new Error('Blocked: requires absolute native executable, no shell launcher')
  if (!policy.policyId || !Number.isSafeInteger(policy.approvalRevision)) throw new Error('Invalid approval policy')
  const { root, cwd } = await canonicalCwd(policy.repositoryRoot, dto.cwdRelative)
  const environment: Record<string, string> = Object.create(null)
  for (const key of dto.environmentKeys) {
    if (!allowedEnvironment.test(key)) throw new Error(`Blocked environment key: ${key}`)
    if (Object.hasOwn(policy.environment, key)) {
      const value = policy.environment[key]
      if (typeof value !== 'string' || value.includes('\0') || value.length > 32768) throw new Error('Invalid environment value')
      environment[key] = value
    }
  }
  const approved = Object.freeze({ ...dto, args: Object.freeze(dto.args), environment: Object.freeze(environment), repositoryRoot: root, cwd, policyId: policy.policyId, approvalRevision: policy.approvalRevision })
  approvals.add(approved)
  return approved
}

/** npm/pnpm JS launchers require a separately discovered, approved native Node, not Electron process.execPath. */
export function nativeNodeCli(nodeExecutable: string, cliEntry: string, args: readonly string[]): { executable: string; args: string[] } {
  if (!path.isAbsolute(nodeExecutable) || !path.isAbsolute(cliEntry) || !/\.[cm]?js$/i.test(cliEntry) || /\.(cmd|bat)$/i.test(nodeExecutable) || /(?:^|[\\/])electron(?:\.exe)?$/i.test(nodeExecutable) || [nodeExecutable, cliEntry, ...args].some(s => s.includes('\0'))) throw new Error('Blocked native Node/CLI entry')
  return { executable: nodeExecutable, args: [cliEntry, ...args] }
}
export interface RunOptions {
  signal?: AbortSignal
  stdin?: string | Uint8Array
  /** Rechecked after async cwd validation, immediately before spawn. */
  isCurrent?: () => boolean
}

async function groupHasLiveMembers(group: number): Promise<boolean> {
  if (process.platform !== 'linux') {
    try { process.kill(-group, 0); return true } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') return false; throw e }
  }
  // Host init can retain orphan zombies. They have exited and cannot execute or hold pipes.
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const status = await readFile(`/proc/${entry}/stat`, 'utf8')
      const fields = status.slice(status.lastIndexOf(')') + 2).split(' ')
      if (Number(fields[2]) === group && fields[0] !== 'Z' && fields[0] !== 'X') return true
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT' && (e as NodeJS.ErrnoException).code !== 'ESRCH') throw e }
  }
  return false
}

function boundedText(chunks: Buffer[], cap: number): string {
  // Re-encode replacements before slicing; write (without end) drops an incomplete trailing codepoint.
  const bytes = Buffer.from(Buffer.concat(chunks).toString('utf8')).subarray(0, cap)
  return new StringDecoder('utf8').write(bytes)
}

export class BoundedProcessRunner {
  private disposed = false
  private busy = false
  private active = new Set<() => void>()
  stop(): void { this.disposed = true; for (const stop of this.active) stop() }
  dispose(): void { this.stop() }
  async run(command: ApprovedCommand, options: RunOptions = {}): Promise<ProcessReceipt> {
    if (this.busy) return this.execute(command, options, true)
    this.busy = true
    try { return await this.execute(command, options, false) } finally { this.busy = false }
  }
  private async execute(command: ApprovedCommand, options: RunOptions, busy: boolean): Promise<ProcessReceipt> {
    if (!approvals.has(command)) throw new Error('Command is not main-approved')
    const startedAt = new Date().toISOString()
    const invocationId = randomUUID()
    const base = { invocationId, startedAt, executable: command.executable, args: command.args, cwd: command.cwd, commandId: command.commandId, policyId: command.policyId, approvalRevision: command.approvalRevision }
    const early = (reason: ProcessTerminationReason, error?: string): ProcessReceipt => Object.freeze({ ...base, completedAt: new Date().toISOString(), reason, error, exitCode: null, signal: null, stdout: '', stderr: '', stdoutBytes: 0, stderrBytes: 0, cleanup: 'not-started' })
    if (busy) return early('blocked', 'Runner already active')
    if (process.platform === 'win32') return early('blocked', 'Native Windows tree-cleanup guarantees unverified; fail closed')
    if (options.stdin && Buffer.byteLength(options.stdin) > 1048576) return early('blocked', 'stdin exceeds 1 MiB')
    try {
      const checked = await canonicalCwd(command.repositoryRoot, command.cwdRelative)
      if (checked.root !== command.repositoryRoot || checked.cwd !== command.cwd) return early('blocked', 'Cwd changed since approval')
    } catch (e) { return early('blocked', String(e)) }
    if (this.disposed || options.signal?.aborted || options.isCurrent?.() === false) return early('stopped')
    return new Promise(resolve => {
      let reason: ProcessTerminationReason | undefined
      let error: string | undefined
      let cleanupFailed = false
      let drainTimer: ReturnType<typeof setTimeout> | undefined
      let stdoutBytes = 0, stderrBytes = 0
      const stdout: Buffer[] = [], stderr: Buffer[] = []
      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(command.executable, [...command.args], { cwd: command.cwd, env: { ...command.environment }, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (e) { resolve(early('spawn-error', String(e))); return }
      const killGroup = () => {
        if (!child.pid) return
        try { process.kill(-child.pid, 'SIGKILL') } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') { cleanupFailed = true; error = String(e) } }
      }
      const terminate = (why: ProcessTerminationReason) => {
        reason ??= why; killGroup()
        drainTimer ??= setTimeout(() => {
          cleanupFailed = true
          error = 'Owned process pipes did not close after termination; detached descendants may remain'
          child.stdout.destroy(); child.stderr.destroy(); child.stdin.destroy()
        }, 1000)
      }
      const stop = () => terminate('stopped')
      this.active.add(stop)
      options.signal?.addEventListener('abort', stop, { once: true })
      const timer = setTimeout(() => terminate('timeout'), command.timeoutMs)
      child.on('error', e => { reason ??= 'spawn-error'; error = e.message })
      child.stdin.on('error', () => { /* EPIPE is normal when the child exits without reading. */ })
      child.stdin.end(options.stdin)
      const collect = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
        const cap = stream === 'stdout' ? command.stdoutBytes : command.stderrBytes
        const seen = stream === 'stdout' ? stdoutBytes : stderrBytes
        const remaining = Math.max(0, cap - seen)
        if (remaining) (stream === 'stdout' ? stdout : stderr).push(Buffer.from(chunk.subarray(0, remaining)))
        if (stream === 'stdout') stdoutBytes += chunk.length; else stderrBytes += chunk.length
        if (seen + chunk.length > cap) terminate('output-overflow')
      }
      child.stdout.on('data', (b: Buffer) => collect(b, 'stdout'))
      child.stderr.on('data', (b: Buffer) => collect(b, 'stderr'))
      // A successful parent may leave descendants holding pipes; clean the owned group on exit too.
      child.on('exit', killGroup)
      child.on('close', async (exitCode, signal) => {
        clearTimeout(timer)
        clearTimeout(drainTimer)
        killGroup()
        try {
          if (child.pid) {
            const deadline = Date.now() + 1000
            while (await groupHasLiveMembers(child.pid)) {
              if (Date.now() >= deadline) throw new Error('Process group exit could not be confirmed')
              await new Promise(r => setTimeout(r, 10))
            }
          }
        } catch (e) { cleanupFailed = true; error = String(e) }
        clearTimeout(drainTimer)
        options.signal?.removeEventListener('abort', stop)
        this.active.delete(stop)
        resolve(Object.freeze({ ...base, completedAt: new Date().toISOString(), reason: cleanupFailed ? 'cleanup-failed' : (reason ?? (exitCode === 0 ? 'success' : 'nonzero')), exitCode, signal, stdout: boundedText(stdout, command.stdoutBytes), stderr: boundedText(stderr, command.stderrBytes), stdoutBytes, stderrBytes, error, cleanup: cleanupFailed ? 'failed' : child.pid ? 'posix-group-exited' : 'not-started' }))
      })
    })
  }
}
