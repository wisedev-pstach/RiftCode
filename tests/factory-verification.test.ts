import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath, writeFile, readFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { approveCommand } from '../src/main/factory/process'
import { VerificationRunner } from '../src/main/factory/verification'

test('app receipts bind source captures and do not invent framework counts; changed source is stale', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'factory-verify-')))
  const command = await approveCommand({ commandId: 'check', executable: process.execPath, args: ['-e', ''], cwdRelative: '.', timeoutMs: 2000, stdoutBytes: 4096, stderrBytes: 4096, environmentKeys: [] }, { repositoryRoot: root, policyId: 'p', approvalRevision: 1, environment: {} })
  let fingerprint = 'before'
  const runner = new VerificationRunner()
  const receipt = await runner.verify({ taskId: 'task', taskRevision: 'r1', command, approvalRevision: 1, isCurrent: () => true, captureSource: async () => { const value = fingerprint; fingerprint = 'after'; return { taskRevision: 'r1', fingerprint: value } } })
  assert.equal(receipt.stale, true)
  assert.equal(receipt.checksPassed, false)
  assert.equal(receipt.evidenceType, 'raw-exit')
  assert.equal(Object.hasOwn(receipt, 'testsPassed'), false)
  assert.ok(Object.isFrozen(receipt))
  assert.ok(Object.isFrozen(receipt.process.args))
  const stable = await runner.verify({ taskId: 'task', taskRevision: 'r1', command, approvalRevision: 1, isCurrent: () => true, captureSource: async () => ({ taskRevision: 'r1', fingerprint: 'after' }) })
  assert.equal(stable.checksPassed, true)
  assert.notEqual(stable.receiptId, receipt.receiptId)
  assert.equal(runner.getReceipt(stable.receiptId), stable)
  assert.equal(runner.getReceipt('provider-minted-id'), undefined)
})

async function setup(code: string) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'factory-verify-')))
  const command = await approveCommand({ commandId: 'check', executable: process.execPath, args: ['-e', code], cwdRelative: '.', timeoutMs: 2000, stdoutBytes: 1024, stderrBytes: 1024, environmentKeys: [] }, { repositoryRoot: root, policyId: 'p', approvalRevision: 1, environment: {} })
  return { root, command }
}

test('real test process changing source makes evidence stale until stable rerun', async () => {
  const { root, command } = await setup("require('fs').writeFileSync('source.txt','after')")
  await writeFile(path.join(root, 'source.txt'), 'before')
  const runner = new VerificationRunner()
  const request = { taskId: 't', taskRevision: 'r', command, approvalRevision: 1, isCurrent: () => true, captureSource: async () => ({ taskRevision: 'r', fingerprint: createHash('sha256').update(await readFile(path.join(root, 'source.txt'))).digest('hex') }) }
  const unstable = await runner.verify(request)
  assert.equal(unstable.process.reason, 'success')
  assert.equal(unstable.stale, true)
  assert.equal(unstable.checksPassed, false)
  assert.equal((await runner.verify(request)).checksPassed, true)
})

test('cancel/dispose/revision invalidation after awaited capture prevents launch or publication', async () => {
  for (const phase of ['before', 'after'] as const) {
    for (const kind of ['stop', 'scope', 'revision', 'abort'] as const) {
      const { root, command } = await setup("require('fs').writeFileSync('launched','yes')")
      const runner = new VerificationRunner()
      const abort = new AbortController()
      let current = true, calls = 0
      const request = { taskId: 't', taskRevision: 'r', command, approvalRevision: 1, signal: abort.signal, isCurrent: () => current, captureSource: async () => {
        calls++
        if (calls === (phase === 'before' ? 1 : 2)) {
          await Promise.resolve()
          if (kind === 'stop') runner.dispose()
          if (kind === 'scope') current = false
          if (kind === 'revision') request.approvalRevision = 2
          if (kind === 'abort') abort.abort()
        }
        return { taskRevision: 'r', fingerprint: 'same' }
      } }
      await assert.rejects(runner.verify(request), /cancelled|revision/)
      if (phase === 'before') await assert.rejects(access(path.join(root, 'launched')))
      if (kind === 'stop') await assert.rejects(runner.verify({ ...request, approvalRevision: 1 }), /cancelled/)
    }
  }
})

test('request identity is immutable across asynchronous source capture', async () => {
  const { command } = await setup('')
  const runner = new VerificationRunner()
  const request = { taskId: 'original', taskRevision: 'r', command, approvalRevision: 1, isCurrent: () => true, captureSource: async () => {
    await Promise.resolve()
    request.taskId = 'replaced'
    return { taskRevision: 'r', fingerprint: 'same' }
  } }
  const receipt = await runner.verify(request)
  assert.equal(receipt.taskId, 'original')
})
import {BoundedProcessRunner} from '../src/main/factory/process'
test('trusted native cleanup observation precedes cancelled receipt publication and runner remains blocked',async()=>{
 const {command}=await setup('');const abort=new AbortController();const original=BoundedProcessRunner.prototype.run;let observed=false,launches=0;
 const runner=new VerificationRunner(receipt=>{observed=receipt.cleanup==='failed'})
 try{BoundedProcessRunner.prototype.run=async function(command,options){launches++;const receipt=await original.call(this,command,options);abort.abort();return {...receipt,reason:'cleanup-failed',cleanup:'failed'}};
 const request={taskId:'t',taskRevision:'r',command,approvalRevision:1,signal:abort.signal,isCurrent:()=>true,captureSource:async()=>({taskRevision:'r',fingerprint:'same'})};
 await assert.rejects(runner.verify(request),/cleanup/);assert.equal(observed,true);
 await assert.rejects(runner.verify({...request,signal:undefined}),/cleanup/);assert.equal(launches,1);
 }finally{BoundedProcessRunner.prototype.run=original;runner.dispose()}
})
for(const mode of ['abort','obsolete','throw-after-settlement'] as const)test(`native verifier settlement observation is awaited before ${mode} publication fencing`,async()=>{
 const {command}=await setup('');const abort=new AbortController();let current=true,observed=false,captures=0;const original=BoundedProcessRunner.prototype.run;
 const runner=new VerificationRunner(()=>{},async()=>{await new Promise<void>(resolve=>setImmediate(resolve));observed=true});
 try{BoundedProcessRunner.prototype.run=async function(command,options){const receipt=await original.call(this,command,options);if(mode==='abort')abort.abort();if(mode==='obsolete')current=false;if(mode==='throw-after-settlement')throw new Error('Injected native-result handoff rejection after actual child settlement');return receipt;};
 await assert.rejects(runner.verify({taskId:'t',taskRevision:'r',command,approvalRevision:1,signal:abort.signal,isCurrent:()=>current,captureSource:async()=>{captures++;return {taskRevision:'r',fingerprint:'same'}}}),/cancelled|revision|handoff/);assert.equal(observed,true);assert.equal(captures,1,'cancelled/throwing settlement never publishes an after-source receipt');
 }finally{BoundedProcessRunner.prototype.run=original;runner.dispose()}
});
