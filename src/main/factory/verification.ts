import { randomUUID } from 'node:crypto'
import type { SourceCapture, VerificationReceipt } from '../../shared/factory-verification'
import { BoundedProcessRunner, type ApprovedCommand } from './process'

export interface VerificationRequest {
  taskId: string
  taskRevision: string
  command: ApprovedCommand
  approvalRevision: number
  signal?: AbortSignal
  /** Must include repository/session/lifetime AND current approval revision checks. */
  isCurrent: () => boolean
  /** Trusted source/snapshot service callback, never provider JSON. */
  captureSource: () => Promise<SourceCapture>
}
export class VerificationRunner {
  private readonly processes = new BoundedProcessRunner()
  private readonly receipts = new Map<string, VerificationReceipt>()
  private readonly receiptSizes = new Map<string, number>()
  private retainedBytes = 0
  private disposed = false
  private cleanupUncertain = false
  /** Trusted main-owned observer, invoked before cancellation/publication fences. */
  constructor(
    private readonly observeCleanup: (process: VerificationReceipt['process']) => void = () => {},
    /** Native read-only observation after settlement, independent of receipt publication. */
    private readonly observeSettlement: () => Promise<void> = async () => {}
  ) {}
  stop(): void { this.disposed = true; this.processes.stop() }
  dispose(): void { this.stop() }
  getReceipt(id: string): VerificationReceipt | undefined { return this.receipts.get(id) }
  async verify(input: VerificationRequest): Promise<VerificationReceipt> {
    if (this.cleanupUncertain) throw new Error('Verifier cleanup uncertain; manual recovery required.')
    const request = { ...input }
    const current = () => !this.disposed && !request.signal?.aborted && request.isCurrent() && request.approvalRevision === request.command.approvalRevision && input.approvalRevision === request.approvalRevision
    const check = () => { if (!current()) throw new Error('Verification cancelled or approval revision changed') }
    check()
    const before = Object.freeze({ ...await request.captureSource() })
    check()
    if (before.taskRevision !== request.taskRevision) throw new Error('Source task revision changed')
    let process: VerificationReceipt['process']
    try {
      process = await this.processes.run(request.command, { signal: request.signal, isCurrent: current })
      this.cleanupUncertain ||= process.cleanup === 'failed' || process.reason === 'cleanup-failed'
      this.observeCleanup(process)
    } finally { await this.observeSettlement() }
    if (this.cleanupUncertain) throw new Error('Verifier owned process cleanup could not be confirmed; manual recovery required.')
    check()
    const after = Object.freeze({ ...await request.captureSource() })
    check()
    const stale = before.taskRevision !== after.taskRevision || before.fingerprint !== after.fingerprint
    const receipt: VerificationReceipt = Object.freeze({ receiptId: randomUUID(), taskId: request.taskId, taskRevision: request.taskRevision, before, after, process, stale, checksPassed: !stale && process.reason === 'success', evidenceType: 'raw-exit' })
    // Bounded ephemeral app-owned registry. Provider results have no write path.
    const size = Buffer.byteLength(process.stdout) + Buffer.byteLength(process.stderr) + process.args.reduce((total, arg) => total + Buffer.byteLength(arg), 0) + 4096
    while (this.receipts.size && (this.receipts.size >= 256 || this.retainedBytes + size > 64 * 1024 * 1024)) {
      const oldest = this.receipts.keys().next().value!
      this.retainedBytes -= this.receiptSizes.get(oldest)!
      this.receiptSizes.delete(oldest)
      this.receipts.delete(oldest)
    }
    this.retainedBytes += size
    this.receiptSizes.set(receipt.receiptId, size)
    this.receipts.set(receipt.receiptId, receipt)
    return receipt
  }
}
