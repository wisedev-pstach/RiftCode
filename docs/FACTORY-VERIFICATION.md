# Factory process and verification primitives

This is an isolated main-process implementation, not an integrated factory or approval UI. It does not change the Agent PTY, IPC, preload, provider login, repository snapshot service, or retry orchestration.

## Main-owned integration

Exports:

- `validateVerificationCommand(unknown): VerificationCommandDTO` (`src/shared/factory-verification.ts`) is pure strict shape validation. Unknown/missing keys, NUL, relative-cwd traversal and invalid bounds are rejected. Shell metacharacters in argv are permitted **literally**; validation is not consent.
- `approveCommand(input, ApprovalPolicy): Promise<ApprovedCommand>` (`src/main/factory/process.ts`) must only be called by the main-owned command lookup/consent service. Do not expose this function directly to renderer/provider input. Policy includes canonical repository root, policy ID, approval revision, and explicitly selected environment values. Approval objects are frozen and tracked by object identity; JSON/structural copies cannot launch.
- `canonicalCwd(root, relative)` resolves real paths, rejects outside-root symlinks, and checks a directory. The runner repeats this check before spawning and requires the approved canonical root/cwd to match.
- `nativeNodeCli(approvedNativeNodeAbsolutePath, approvedCliJsAbsolutePath, argv)` constructs native Node + JS CLI argv for npm/pnpm-like launchers. It does **not** discover/approve Node, CLI entry or package scripts. The parent must resolve those in trusted main and get consent for the exact command. Never use Electron's `process.execPath` as Node; this module never does. A plainly named Electron executable and `.cmd`/`.bat` launchers are rejected. No shell fallback exists.
- `new BoundedProcessRunner().run(approved, { signal?, stdin?, isCurrent? })` returns an immutable `ProcessReceipt`. One invocation per instance, including pending cwd validation and cleanup. `stop()` / `dispose()` permanently invalidate the instance and stop its active owned group. Await the outstanding `run()` promise for actual close/cleanup; calling the void Stop method alone is **not** completion evidence.
- `new VerificationRunner().verify(VerificationRequest)` creates/stores an immutable `VerificationReceipt`. `getReceipt(id)` looks up app-owned evidence; there is no provider receipt import. Request includes task ID/revision, approved command, approval revision, trusted `captureSource()` and `isCurrent()` callbacks, plus an optional abort signal. `stop()` / `dispose()` permanently prevent the next loop iteration.

Example parent orchestration (snapshot adapter is intentionally injected):

```ts
const approved = await approveCommand(mainOwnedCommand, {
  repositoryRoot, policyId, approvalRevision, environment: explicitlyApprovedEnvironment
})
// Recheck scope/consent after the approval await in the parent too.
const receipt = await verifier.verify({
  taskId, taskRevision, command: approved, approvalRevision,
  signal: repositorySessionAbortController.signal,
  isCurrent: () => sameRepositorySessionAndLifetime() && currentApprovalRevision() === approvalRevision,
  captureSource: async () => ({ taskRevision, fingerprint: await snapshotTreeFingerprint() })
})
// Recheck parent generation after awaiting verify, before publishing into parent state.
// Only app-owned lookup of receipt.receiptId is evidence, never provider JSON.
```

The parent owns command lookup, human consent, current approval revision, repository/session/lifetime identity, source scope, snapshot capture correctness, retry budgets and review queue. Abort the supplied signal on repository/session/lifetime changes to terminate an already-running process; `isCurrent` additionally fences launch and receipt publication. Recheck approval after all parent awaits. An approval revision mismatch aborts verification. Never convert generic exit evidence into framework test counts.

## Execution and evidence semantics

- Executable must be absolute. Spawn uses an argv array, `shell: false`, detached POSIX process group and separate piped stdin/stdout/stderr; no PTY and no renderer command string.
- Timeout: 1–600,000 ms. Each output stream: 1–16,777,216 bytes; retained decoded UTF-8 is also within its byte cap. Observed byte totals can exceed the retention cap. Overflow kills the owned group. Stdin is capped at 1 MiB, sent once and closed. Output is untrusted text, not executable commands or trusted rendered markup.
- Receipts contain app-generated invocation UUID, approved command/policy/revision, executable/argv/cwd, timestamps, precise termination reason, numeric exit/signal, independently capped streams and observed byte totals. Success requires exit zero and confirmed owned-group cleanup. Nonzero, missing executable, timeout, Stop, overflow, blocked and cleanup-failed remain distinct.
- Verification adds an app-generated receipt UUID, task identity/revision, before/after source fingerprints, `stale`, `checksPassed` and `evidenceType: 'raw-exit'`. A zero-test script can pass a command check; it does **not** establish framework tests passed and no counts are manufactured.
- A test that changes source has stale/unstable evidence even if exit zero. Only a subsequent stable check may pass. This runner never retries automatically or advertises verified Ready. The parent must use bounded reruns and bind source captures to the same immutable task revision. Fingerprints must include all relevant test/config/source inputs, dirty/untracked state and scope; HEAD alone is insufficient.
- Source capture failure, obsolete scope/lifetime/approval, or cancellation after an awaited prerequisite prevents launch/publication. Request task identity is copied before the first await. Receipt objects, nested source captures, process receipt and argv are frozen. The ephemeral registry retains at most 256 receipts with a 64 MiB accounted output/argv budget (plus bounded object/string metadata overhead), not durable review snapshots; parent storage must preserve approved immutable evidence independently.

## Consent and environment: not a sandbox

Approved test/build/package scripts execute code with the full OS user's disk and network access. They can read disk credentials, modify files outside the repository, install dependencies or spawn escaped/detached descendants. Canonical cwd checks and filtered environment are **not containment**. Filesystem races against malicious concurrent directory replacement are not prevented by portable path-based spawn. Users must approve executable, argv, cwd, repository policy, network/dependency effects and resource bounds; nothing silently grants installation/network consent.

Only selected allowlisted keys are copied from explicit policy values: HOME/USERPROFILE, PATH, SYSTEMROOT/WINDIR, TMP/TEMP/TMPDIR, LANG/LC_ALL, CI/TERM/PATHEXT and selected JAVA/Go/Rust toolchain roots. No ambient app environment is inherited. NODE_OPTIONS, NODE_PATH, LD_PRELOAD, BASH_ENV and arbitrary tokens are rejected. HOME/PATH/toolchain variables themselves can influence approved tools and require consent. Provider credential environment is a **separate parent/provider policy**; do not apply this test-command allowlist to existing provider PTYs or silently disable their logins. Disk-based native login is not a sandbox escape because there is no sandbox.

## Native platform boundary

Linux fixtures run actual native Node processes under TMPDIR, without models, provider network calls or secrets. Stop kills the owned POSIX process group, waits for actual child close, and confirms no live group members before completing. Linux `/proc` distinguishes exited zombies awaiting host-init reaping from live processes. On other POSIX systems, group disappearance is required; cleanup uncertainty yields cleanup-failed. Pipe closure and group-exit cleanup each have a 1-second grace budget after termination; escaped pipe holders cause cleanup-failed, not claimed successful Stop. Intentionally detached/new-session descendants are not contained and may survive.

Windows execution currently **fails closed** with a blocked receipt: native Windows tree-termination guarantees have not been exercised. No `.cmd`/`.bat`, `cmd /c`, shell fallback, guessed taskkill path or synthetic Windows fixture is represented as native acceptance. A future Windows implementation needs reviewed fixed native taskkill/tree or job-object lifecycle, safe PID validation and actual Windows acceptance. macOS POSIX code is present but native macOS acceptance is unverified.

## Focused verification

Run without full build/UI contention:

```sh
taskset -c 0 node --import tsx --test tests/factory-process.test.ts tests/factory-verification.test.ts
```

RED/GREEN and final logs live under `/opt/data/output/riftcode/software-factory/verification/`. The installed Node 26 / tsx combination emits a `module.register()` deprecation warning; this is not native Electron acceptance. No full factory, authenticated provider, native Windows or native macOS acceptance is claimed.
## Cleanup uncertainty: review regression

`VerificationRunner` accepts an optional **trusted main-only** process-receipt observer. It sees the native runner result before any cancellation, current-generation, source-capture or publication check; renderer/provider JSON never enters this path. A cleanup-failed/failed-cleanup result permanently fences that verifier, even when the signal is aborted or the parent is already obsolete. It is not ordinary nonzero evidence eligible for repair.

The factory coordinator records this uncertainty independently of the short-lived verifier instance. It remains Blocked/manual recovery, forbids further execution/new plans, never reports successful Stopped cleanup, rejects disposal and retains the root writer claim. Cancellation can still prevent durable receipt publication; the sticky native cleanup observation is deliberately independent of that publication fence.

Regression evidence labels injected cleanup failure precisely: an actual harmless native verifier first settles, then a main-only test seam substitutes a cleanup-failed receipt. This verifies propagation for ordinary, cancelled and obsolete generations, not an actual OS kill failure. Existing real PID settlement tests still verify ordinary Stop/dispose. First-cycle logs (superseded by the settlement/provider-latch cycle below): `/opt/data/output/riftcode/software-factory/backend-review-fixes/`.
## Post-settlement observation independent of cancellation

The optional second `VerificationRunner` constructor callback is an awaitable **native-only post-settlement observer**. It runs in finally after the process result (or a rejected native-result handoff), before abort/current-generation checks can skip the after-source capture. Cleanup observation still runs first when a native receipt is available. This observer never imports a renderer/provider receipt and never creates source snapshots or successful verification evidence.

The factory supplies a captured-root identity/native HEAD/index check. It records a separate per-plan Git failure in the root coordinator even after parent invalidation, but does not persist obsolete state. A real approved verifier that stages and waits, then exits on Stop, must yield Blocked/manual reconciliation, leave the real index untouched by the app, and queue no review—not successful Stopped state merely because child cleanup succeeded. Confirmed Git-only failure allows a new explicit reconciled plan; cleanup uncertainty instead retains the root claim and blocks all further execution.

The same async settlement contract covers every provider version/help/planning/execution child. A synchronous provider cleanup observer feeds the same root-wide latch used by verifiers before cancellation/publication fencing. Runtime disposal waits for observers as well as process close. Service provider calls also use finally-based Git observation so throwing injected version discovery cannot bypass the baseline check.

Second-cycle evidence: `/opt/data/output/riftcode/software-factory/backend-review-fixes-2/` (**183 backend tests passed**, full node and scoped native/test typechecks exited 0). The original independent provider and cancelled-verifier reproductions both pass. Native verifier PID exit, staged-index preservation, no stale receipt/review publication and obsolete runtime-byte preservation are exercised. Injected cleanup-failed receipts remain explicitly distinct from real OS kill-failure reproduction; native Windows/macOS/authenticated-provider/UI acceptance remain unclaimed.
