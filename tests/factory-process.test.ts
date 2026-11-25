import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath, readFile, symlink, unlink } from 'node:fs/promises'
import { validateVerificationCommand } from '../src/shared/factory-verification'
import { nativeNodeCli } from '../src/main/factory/process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { approveCommand, BoundedProcessRunner } from '../src/main/factory/process'

export async function fixture(code: string, extra = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'factory-process-')))
  const command = await approveCommand({ commandId: 'test', executable: process.execPath, args: ['-e', code], cwdRelative: '.', timeoutMs: 2000, stdoutBytes: 4096, stderrBytes: 4096, environmentKeys: [], ...extra }, { repositoryRoot: root, policyId: 'policy', approvalRevision: 1, environment: {} })
  return { root, command }
}

test('real native process has literal argv, isolated environment and separate bounded streams', async () => {
  const { command } = await fixture(`process.stdout.write(JSON.stringify([process.argv[1],process.env.NODE_OPTIONS,process.env.SECRET]));process.stderr.write('err')`, { args: ['-e', `process.stdout.write(JSON.stringify([process.argv[1],process.env.NODE_OPTIONS,process.env.SECRET]));process.stderr.write('err')`, ';$(literal)&'] })
  const result = await new BoundedProcessRunner().run(command)
  assert.equal(result.reason, 'success')
  assert.equal(result.stdout, '[";$(literal)&",null,null]')
  assert.equal(result.stderr, 'err')
  assert.equal(result.exitCode, 0)
})

test('DTO rejects unknown keys, NULs, traversal and unsafe environment without banning literal metacharacters', async () => {
  const { command, root } = await fixture('')
  const dto = { commandId: 'test', executable: process.execPath, args: [';|$()`&'], cwdRelative: '.', timeoutMs: 1000, stdoutBytes: 50, stderrBytes: 50, environmentKeys: [] }
  assert.deepEqual(validateVerificationCommand(dto).args, dto.args)
  for (const extra of [{ unexpected: true }, { args: ['a\0b'] }, { cwdRelative: '../outside' }, { cwdRelative: '..\\outside' }, { timeoutMs: 0 }]) assert.throws(() => validateVerificationCommand({ ...dto, ...extra }))
  for (const executable of ['node', '/tmp/launch.cmd', '/tmp/launch.BAT']) await assert.rejects(approveCommand({ ...dto, executable }, { repositoryRoot: root, policyId: 'p', approvalRevision: 1, environment: {} }))
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'SECRET', 'LD_PRELOAD', 'BASH_ENV']) await assert.rejects(approveCommand({ ...dto, environmentKeys: [key] }, { repositoryRoot: root, policyId: 'p', approvalRevision: 1, environment: { [key]: 'danger' } }))
  await assert.rejects(new BoundedProcessRunner().run({ ...command }))
  assert.deepEqual(nativeNodeCli(process.execPath, '/approved/npm-cli.js', ['test']), { executable: process.execPath, args: ['/approved/npm-cli.js', 'test'] })
  assert.throws(() => nativeNodeCli('/app/electron', '/approved/npm-cli.js', []))
  await assert.rejects(approveCommand({ ...dto, environmentKeys: ['HOME'] }, { repositoryRoot: root, policyId: 'p', approvalRevision: 1, environment: { HOME: 'bad\0value' } }))
})

test('cwd approval rejects outside symlinks and rechecks symlink retargeting before launch', async () => {
  const { root } = await fixture('')
  const outside = await mkdtemp(path.join(tmpdir(), 'factory-outside-'))
  await symlink(outside, path.join(root, 'escape'))
  await assert.rejects(fixture('', { cwdRelative: '../escape' }))
  const dto = { commandId: 'test', executable: process.execPath, args: ['-e', ''], cwdRelative: 'escape', timeoutMs: 1000, stdoutBytes: 50, stderrBytes: 50, environmentKeys: [] }
  await assert.rejects(approveCommand(dto, { repositoryRoot: root, policyId: 'p', approvalRevision: 1, environment: {} }))
  await unlink(path.join(root, 'escape'))
  await symlink(root, path.join(root, 'escape'))
  const approved = await approveCommand(dto, { repositoryRoot: root, policyId: 'p', approvalRevision: 1, environment: {} })
  await unlink(path.join(root, 'escape'))
  await symlink(outside, path.join(root, 'escape'))
  assert.equal((await new BoundedProcessRunner().run(approved)).reason, 'blocked')
})

test('precise nonzero, spawn missing, timeout, output overflow and stdin receipts', async () => {
  for (const [code, extra, reason] of [
    ['process.exit(7)', {}, 'nonzero'],
    ['', { executable: '/nonexistent/factory-node' }, 'spawn-error'],
    ['setInterval(()=>{},100)', { timeoutMs: 80 }, 'timeout'],
    ["process.stdout.write('x'.repeat(10000))", { stdoutBytes: 100 }, 'output-overflow'],
    ["process.stderr.write('x'.repeat(10000))", { stderrBytes: 100 }, 'output-overflow']
  ] as const) {
    const { command } = await fixture(code, extra)
    const result = await new BoundedProcessRunner().run(command)
    assert.equal(result.reason, reason)
    assert.ok(Buffer.byteLength(result.stdout) <= command.stdoutBytes)
    assert.ok(Buffer.byteLength(result.stderr) <= command.stderrBytes)
    if (reason === 'nonzero') assert.equal(result.exitCode, 7)
  }
  const { command } = await fixture("process.stdin.on('data',b=>process.stdout.write(b))")
  assert.equal((await new BoundedProcessRunner().run(command, { stdin: 'prompt literal\n' })).stdout, 'prompt literal\n')
})

test('Stop waits for actual parent/child exit and permanently prevents next launch', async () => {
  const { root } = await fixture('')
  const marker = path.join(root, 'pids')
  const code = `const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e','setInterval(()=>{},100)'],{stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(marker)},JSON.stringify([process.pid,c.pid]));setInterval(()=>{},100)`
  const { command } = await fixture(code)
  const runner = new BoundedProcessRunner()
  const running = runner.run(command)
  let pids: number[] = []
  for (let i = 0; i < 100; i++) { try { pids = JSON.parse(await readFile(marker, 'utf8')); break } catch { await new Promise(r => setTimeout(r, 10)) } }
  assert.equal(pids.length, 2)
  runner.stop()
  const receipt = await running
  assert.equal(receipt.reason, 'stopped')
  assert.equal(receipt.cleanup, 'posix-group-exited')
  for (const pid of pids) {
    // Linux zombies are exited, awaiting the host init's reaping, not running descendants.
    try { const status = await readFile(`/proc/${pid}/stat`, 'utf8'); assert.equal(status.slice(status.lastIndexOf(')') + 2).split(' ')[0], 'Z') } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  }
  assert.equal((await runner.run(command)).cleanup, 'not-started')
})

test('async prerequisite cancellation prevents process launch', async () => {
  const { command } = await fixture('')
  const runner = new BoundedProcessRunner()
  const controller = new AbortController()
  const pending = runner.run(command, { signal: controller.signal })
  controller.abort()
  const result = await pending
  assert.equal(result.reason, 'stopped')
  assert.equal(result.cleanup, 'not-started')
})

test('UTF-8 truncation respects byte bounds and each runner permits one active process', async () => {
  const { command } = await fixture("process.stdout.write('😀')", { stdoutBytes: 1 })
  const receipt = await new BoundedProcessRunner().run(command)
  assert.equal(receipt.reason, 'output-overflow')
  assert.ok(Buffer.byteLength(receipt.stdout) <= 1)
  const wait = await fixture('setInterval(()=>{},100)')
  const runner = new BoundedProcessRunner()
  const first = runner.run(wait.command)
  const second = await runner.run(wait.command)
  assert.equal(second.reason, 'blocked')
  runner.stop()
  await first
})

test('synchronous OS spawn rejection still produces a precise immutable receipt', async () => {
  const { command } = await fixture('', { args: Array.from({ length: 256 }, () => 'x'.repeat(32768)) })
  const receipt = await new BoundedProcessRunner().run(command)
  assert.equal(receipt.reason, 'spawn-error')
  assert.equal(receipt.cleanup, 'not-started')
  assert.ok(Object.isFrozen(receipt))
})
