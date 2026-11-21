# Factory runtime and native integration

## Implemented entry point

```ts
import {createFactoryService, type FactoryServiceOptions} from './factory/service';

const factory = await createFactoryService({
  root: canonicalRepositoryRoot,
  userData: actualApplicationUserData, // external to checkout
  resourcesRoot: packagedOrDevelopmentResourcesRoot,
  environment: explicitlySelectedSafeEnvironment,
  isCurrent: () => repositoryEpoch === openedEpoch && !applicationClosing,
});
// factory implements the unchanged shared FactoryApi, plus:
await factory.disposeAsync();
```

`createFactoryService(options): Promise<FactoryService>` is asynchronous. Initialization claims one main-process writer per canonical repository root; failed initialization disposes already-created services and releases its claim only if their cleanup succeeds. There is no provider/model execution during initialization. `FactoryService extends FactoryApi` adds `disposeAsync(): Promise<void>` only. Parent-owned main/IPC/preload/App integration is outside these runtime files.

Main owns all options. Never expose `providerDiscovery`, `providerMode`, resources/userData/root paths, `environment`, capability evidence, or `isCurrent` through renderer IPC. `providerMode: 'fixture'` is a main-only test label; it does not select a fake execution engine. Tests still execute the ordinary bounded native runner, pure provider adapters, actual verifier and actual Git/filesystem evidence paths.

On repository changes, renderer destruction or application quit, invalidate the parent epoch and **await `disposeAsync()` before opening another factory**. Disposal invalidates new calls immediately, aborts active provider/verifier children even when `isCurrent()` is already false, and waits for their outstanding execution promises. Provider or verifier cleanup failure rejects disposal and retains the root claim rather than advertising safe replacement. Do not turn a rejected disposal into permission to open the next root. POSIX children and generation-invalidated verifier cancellation are exercised by real PID/exit fixtures.

## Planning, policy and execution

- `load()` performs installed-executable **metadata discovery only**. Available means located, not authenticated or capability-verified. No version/help/hook-capable CLI is launched by load or draft save. The UI must allow an installed-but-not-yet-supported provider to proceed to an explicit consented capability check; `supported: false` is not necessarily final incompatibility.
- `saveDraft()` strictly validates exact keys and bounds before persistence. It saves editable requirements, architecture, inert Mermaid text, complete TaskSpecs and proposed native executable/argv commands outside the checkout. It never runs a provider or a test.
- `generate()` is implemented for requirements/questions, architecture/diagram and task planning. It uses canonical bundled skills, explicit provider/configuration/startup consent, bounded structured processes and stage-specific closed JSON contracts. Claude uses **plan permission mode**; Codex uses **read-only sandbox intent**. Generated output cannot approve policy or replace commands. Plan generation references only command IDs already present in the editable draft. The final output is parsed and passed through the same strict draft validator before being saved. Source is captured before/after; worktree mutation blocks application of the generated draft without resetting the worktree.
- Generation is still not an OS sandbox: provider startup hooks/configuration may execute under the explicitly consented native account. Unknown protocol, permission/auth/trust problems and unsupported read-only transports remain Blocked/manual handoff, not invented planning success.
- `approve()` fences the exact current draft revision, records explicit provider/configuration consent and bounded attempts/elapsed budget, registers exact user-approved shell-free native argv commands in main, captures the actual dirty/untracked baseline, and creates an immutable manifest plus planning/policy/provider-version artifacts. It never starts implementation. Provider executable identity, exact version and capability evidence are pinned to that approval and rechecked at Start.
- `start()` is a separate user action. Tasks execute sequentially, requiring verified queued dependency revisions rather than human acceptance. Each implementation/repair uses canonical skills and a bounded JSON summary contract. Every check comes from `VerificationRunner.verify`, with durable native receipt artifacts; model text cannot mint a receipt.
- A failing check causes bounded repair, not Ready. Source-changing checks invalidate prior receipts and cause up to three complete stable verification sweeps per attempt. Every required command must have a successful stable receipt for the exact final fingerprint. The source is checked again after the last receipt and after immutable review construction, before publication. Failed/stale diagnostic receipts remain reachable as artifacts; only successful final-source receipt IDs enter a queued revision.
- Attempts are 1–5 per task; run elapsed budget is 100–3,600,000 ms. Provider execution is additionally limited to 600,000 ms per invocation, 1 MiB stdout, 64 KiB stderr and canonical prompt bounds. Planning uses a 120-second outer budget. No expense values or test counts are invented. Tests are raw command-exit evidence, not proof a test framework discovered a particular number of cases.
- Stop aborts native execution, awaits actual child completion and prevents advancement. Restarted active state is Interrupted, never auto-resumed. Live polling uses live coordinator state rather than interpreting a low-level manifest read as a restart.

## Saved evidence, rework and new plans

The root-owned `plans.json` index points to separate app-owned plan stores under:

```text
<userData>/factory-v1/<workspaceId>/plans.json
<userData>/factory-plans/<workspaceId>/<planId>/factory-v1/<workspaceId>/...
```

The index and per-plan runtime state use safe bounded private storage primitives, exact scope/version checks, atomic publication and generation fences. Each plan's existing 128 MiB/file-count quotas still apply; the index retains at most eight plans and never evicts evidence. This is a bounded multi-plan namespace, not a claim that all eight plans together share one 128 MiB quota. Snapshot captures may duplicate source objects and exhaust a plan's quota; the runtime fails honestly rather than deleting evidence or claiming a partial capture is complete.

Editing an approved **idle** draft creates a new owned plan, without overwriting the old manifest, sources, receipts or decisions. Draft revision numbers remain monotonic across these plan switches, so an old approval cannot approve a newer plan merely because its revision counter restarted. `load().reviews`, `readRevision`, `readArtifact` and review decisions continue to resolve historical queued reviews through the owned index after restart. Archived-plan rework cannot silently replace the current plan; create a new editable draft referencing that historical evidence instead.

`readRevision()` returns saved changes, artifact records and serialized native receipt objects, not live working-tree diffs. Source/patch artifact IDs resolve to the saved before/after bytes even after another task edits the same file. `readArtifact()` only permits approved/queued references and returns at most 1 MiB of complete UTF-8 text; binary or oversized previews are rejected, not silently truncated.

Human accepted/changesrequested decisions append against the exact immutable revision. They never stage, commit, reset, accept subsequent revisions or merge. Explicit idle rework prepares linked revisions for the selected latest task revision and its dependency descendants; old dependent reviews are labeled superseded / needs re-review. It does not roll the worktree back. Rework still requires explicit Start.

Root inode/identity, parent lifetime, runtime-state generation, approved manifest generation, plan-index generation and approved provider binding are checked at async boundaries. External idle working-tree edits require explicit reconciliation; they are not attributed silently to the next task. Saving a new draft/plan and explicitly approving its actual baseline is the available reconciliation route. Failed/blocked/interrupted runs do not silently resume.

## Provider and platform support: precise limits

| Provider | Production path | Limits / manual fallback |
| --- | --- | --- |
| Claude | Trusted native installed executable; consented bounded `--version`; pure adapter gates stable 2.x >= 2.1.259. Structured print for implementation, plan permission mode for planning. | Requires provider execution, provider configuration and print-startup consent. Print may skip trust dialogs and execute hooks/MCP; no bypass or broad allowed-tools flags. Existing disk-native login is used; no arbitrary ambient API tokens. Not authenticated in these tests. |
| Codex | Trusted main locator plus consented bounded `--version`, root `--help`, and `exec --help`. Required flags/values/stdin support must be advertised. Main pins exact version and a `bounded-help-sha256` evidence source. Structured completion still requires valid terminal JSONL. | A real Node fixture proves these probes and candidate transport, not a live Codex release/account. Missing/ambiguous help blocks. Help proves advertised CLI surfaces, not successful model auth or universal protocol compatibility. Planning switches the approved request to read-only sandbox intent; implementation uses workspace-write consent. |
| OpenCode | Pure adapter and trusted main exact-version verification injection remain available. | Default discovery does not claim that `run --help` proves stop-reason/terminal semantics. Without independently verified exact-version evidence execution is Blocked/manual native handoff. Read-only planning is explicitly unsupported, not silently routed to a build agent. |

Default discovery searches **only explicitly supplied PATH** and accepts native binary formats (ELF, PE and recognized Mach-O). It does not execute shell shims, infer Node from Electron, inspect provider homes or guess npm entrypoints. Common npm-installed Codex/OpenCode shell/JS launchers are therefore **not automatically supported by the default locator**. Main may inject a separately validated `FactoryExecutable` (`native`, or trusted native Node plus validated absolute `.js/.cjs/.mjs` entrypoint) using `providerDiscovery.locate`; absent that integration, use honest manual native handoff. Renderer cannot provide this injection or assert versions/capabilities.

Provider environment is an explicit allowlist: PATH/HOME/USERPROFILE/SYSTEMROOT/WINDIR/TMP/TEMP/TMPDIR/LANG/LC_ALL/CI/TERM/PATHEXT. No `process.env` wholesale inheritance or arbitrary API-token forwarding occurs. Disk credentials and approved commands are not sandboxed from the OS user; do not describe filtered environment as containment.

Linux native process/Git fixtures are verified here. Native Windows execution remains fail-closed Blocked because process-tree cleanup is unverified; no `.cmd`/`.bat` fallback. macOS native execution/packaged account acceptance was not exercised by this worker. Intentionally escaped/detached descendants remain outside the POSIX process-group containment promise. A trusted main-only verifier observer now records cleanup uncertainty before cancellation/current-generation/publication fences. Cleanup uncertainty is sticky: no repair, next task, planning or replacement plan can run; Stop remains Blocked/manual recovery, disposal rejects and the root claim is retained. The regression injects a labeled cleanup-failed receipt **after a real harmless child settles**; it does not claim to reproduce a real OS kill failure. Existing actual-child settlement tests remain in the suite.

## Verification evidence

Final focused command (no full UI/build or authenticated provider calls):

```sh
taskset -c 0 node_modules/.bin/tsx --test \
  tests/factory-{service,draft,session,provider-runtime,store,snapshot,artifacts,process,verification,providers,skills}.test.ts
```

Previous pre-review milestone (not current-source acceptance): **144 passed, 0 failed** (`all-final.log`). Of these, **26 runtime-owned tests** cover the service/draft/session/provider-runtime files. The service fixture executes two tasks touching the same file, a real initial nonzero check, native repair and fresh successful verification, queues both without human intervention, and verifies task A's saved bytes after task B and restart. Additional cases exercise real provider and verifier PID cleanup after invalidation, physical root replacement, Stop, failed dependencies, source-changing checks, rework, new-plan retention, cross-plan stale approval fencing, stage generation, malformed output, output overflow, metadata-only availability and environment privacy. Stop was also repeated in three separate focused runs after a double-Stop race was fixed.

Scoped native/source-and-test typecheck passed (exit 0):

```sh
taskset -c 0 node_modules/.bin/tsc --noEmit --target ES2022 \
  --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --types node \
  src/main/factory/{service,draft,session,provider-runtime}.ts \
  tests/factory-{service,draft,session,provider-runtime}.test.ts
```

Logs: `/opt/data/output/riftcode/software-factory/runtime/`. RED logs include draft/session/provider creation, Codex help capability, generation, new-plan behavior, allocation bounds, reachable stale diagnostics and cross-plan monotonic revision regression. No raw authenticated stdout, credentials, native provider history or user-project captures were logged. Node/tsx emits the existing `module.register()` deprecation warning.

A targeted storage integration change avoids allocating the entire 24 MiB object quota for every tiny safe read: `safeRead` now allocates against descriptor size, retains the cap and rejects size/timestamp/link-count mutations during the read. Its allocation regression was observed RED then GREEN; no snapshot/provider/skill foundation rewrite was made by this worker.

### Historical pre-review source SHA-256 (superseded by backend-review-fixes evidence)

```text
57c51f96ce32cc66155f917acaec3dfa6f1ef5bb9912a5e0c3f4da594c57851d  src/main/factory/service.ts
b1af92c1f35c9a28c294798610ec469799f8bff21f46f6d7025e29bda81ce19b  src/main/factory/draft.ts
14a8b6397679cf137bb141f85097939a67fffa93ea4f9a249e4af72b898f79b2  src/main/factory/session.ts
239e6cbbcff4dc89c634a2b936a5c1aa54fc21b96f2e9e01491407a91ceec16e  src/main/factory/provider-runtime.ts
4bfad44141f10733aff747af7e9601d0533fd8b75b4b937f60fd9c8b898d3db0  src/main/factory/store.ts
358a4707682d1bfda47807fd20effd32e2f2541f6ebb1963426f3915344495a7  tests/factory-service.test.ts
9fbb5c9a400ba69404023db98264f1cd5c9d7a438f8b69cd0a419a09d9be2c25  tests/factory-draft.test.ts
2364d8e9f3352d560a97be849bd7ef19493489ec16ca0f8e0dea893f5965e9c0  tests/factory-session.test.ts
d4a7ec14793e867dac5cee0b1ce0cce0e862db5552fa74fdfa6e3ec6f2fb5bd8  tests/factory-provider-runtime.test.ts
```
## Backend review fixes: native Git metadata fence

`git-state.ts` captures symbolic ref identity (including unborn branches), resolved HEAD object identity (including detached HEAD), and exact index existence/content/location. Main uses Git's `rev-parse --git-path index`, so linked worktrees fence their own index. Only that index is read: a 16 MiB bound, regular non-linked file requirement, nonblocking/no-follow descriptor, descriptor/path identity checks and repeated state capture guard races. There is no recursive `.git` read. The existing read-only native Git helper strips ambient `GIT_*` redirections, disables optional locks, fsmonitor and hooks, and ignores global/system configuration; the selected commands do not invoke filters, external diffs or aliases.

A native-only `gitBaseline` digest is persisted in strict per-plan runtime state **before consented version/help/config probes**. It is checked after every native provider/version/help child settles, in finally paths for throwing/cancelled provider discovery or execution, after native verifier settlement independently of receipt publication, before/after native check source captures, at idle Start/rework boundaries and before manifest/review publication. Provider/renderer JSON cannot supply the baseline. An old approved runtime without this field loads with a missing baseline and cannot Start; it requires explicit reconciliation rather than inventing approval of the current index.

Unexpected HEAD/ref/index mutation is Blocked/manual reconciliation even if the command exited zero and all source-byte tests passed. **Approval of a command is not permission to stage, reset, commit or mutate HEAD/refs/index.** Read-only planning that stages unchanged working bytes cannot apply a generated draft. No staging, reset or rollback is performed by the app, and the unexpected actual index/HEAD remains available for human inspection. Explicitly saving a draft (or creating a new owned plan after approval) and approving its actual baseline establishes fresh consent; old immutable review evidence remains reachable.

The fence detects state at bounded async boundaries; it is not an OS sandbox or an atomic filesystem transaction against a malicious concurrent process that changes and restores state between observations. Native Windows/macOS acceptance and real escaped-child kill-failure reproduction remain unclaimed. Logs and source hashes for this review are under `/opt/data/output/riftcode/software-factory/backend-review-fixes/`; these supersede the historical milestone above.
### First backend review cycle (superseded by second-cycle evidence below)

Serial focused run: **167 passed, 0 failed, 0 cancelled, 0 skipped** (`backend-review-fixes/all-final.log`), including the original 144 backend tests. Command:

```sh
taskset -c 0 node_modules/.bin/tsx --test --test-concurrency=1 \
  tests/factory-{service,draft,session,provider-runtime,store,snapshot,artifacts,process,verification,providers,skills,git-state}.test.ts
```

`tsc --noEmit -p tsconfig.node.json` and scoped native/test typechecking both exited 0 (`nodecheck.log`, `testcheck.log`). RED logs reproduce lost cleanup uncertainty, prohibited staging/read-only planning/probe acceptance, persisted-baseline omission, and Stop masking Git mutation. Real Node `--version` staging is blocked during planning, approval and Start; index remains changed. Linked worktrees, unborn/symbolic/detached HEAD, real scratch-commit movement, bounded/special indexes, unchanged read-only snapshots and environment-redirection/fsmonitor suppression are exercised. No full build, UI, packaging, provider authentication, model/account/network call, user-data fixture, app staging/reset/commit/push or `.local` cleanup was performed by this worker. Scratch Git commits are test-only fixture setup, never changes to the working repository.
## Second narrow backend review cycle: provider latch and cancelled verifier settlement

Independent re-review found that the first cycle still allowed an uncertain **provider** runtime to be bypassed by a new owned plan, and that cancelling an actual verifier could skip its post-command Git check. The first-cycle results above are historical, not sufficient acceptance for these cases.

Both native providers and verifiers now feed the **same root-owned sticky cleanup latch** before abort/current/publication fences. Native version/help probes, planning and implementation all notify it. A cleanup-failed receipt halts the provider probe chain immediately. New-plan creation and the plan-level execution/idle guards recheck the root latch; saveDraft/new plan, generate, approve, start and rework cannot bypass an older plan's uncertainty. Root disposal also explicitly checks the latch before releasing its writer claim.

A distinct, awaitable **native post-settlement observer** checks only captured-root identity and native Git metadata. Verifiers run it in finally before cancellation can skip receipt/source publication. Every individual native provider child runs it before another probe can launch, and service-level provider calls finally observe throwing injected discovery paths as well. Provider disposal awaits these observers, not just child close. Root-wide cleanup uncertainty and per-plan Git failure are separate in-memory latches: Git-only failure requires explicit reconciliation but does not permanently poison a fresh owned plan after confirmed cleanup.

The observation deliberately ignores parent/current-generation/abort flags to inspect the old captured root. It performs no source capture, receipt/artifact publication, or runtime save. A captured root inode guard prevents intentionally reading a replacement checkout at the same path. Obsolete sessions are never persisted by the observers; actual fixtures compare runtime bytes before and after obsolete settlement. Normal service publication remains subject to the existing lifetime/generation fences. Read-only Git metadata observations remain bounded boundary checks, not OS containment or atomic protection against changes restored between observations.

### Frozen second-cycle verification

- Serial CPU-0 backend run: **183 passed, 0 failed, 0 cancelled, 0 skipped**, including the prior 167 tests (`backend-review-fixes-2/all-final.log`). Same complete focused command shown above.
- Full `tsc --noEmit -p tsconfig.node.json` and scoped service/verification/provider-runtime source/test checks both exited 0.
- The exact independent `re-review.ts --provider-uncertainty` reproduction and its default six-scenario mode now exit 0. The actual verifier stages, waits, is Stopped, and its PID is confirmed ESRCH; the state is **Blocked/manual reconciliation**, the real index remains staged and no review is published.
- Added regressions cover provider execution/cancellation/obsolete/planning/version/help cleanup uncertainty; async observer/disposal ordering; verifier abort/obsolete/throwing settlement; version staging followed by Stop/obsolete/throw; help staging preventing the next probe; and obsolete runtime-byte preservation.

Evidence and frozen hashes: `/opt/data/output/riftcode/software-factory/backend-review-fixes-2/`. All cleanup-failed receipts are explicitly labeled injection **after actual harmless child settlement**, never a claim of real OS kill failure. No App/UI/build/server/package, authentication/network/account/model access, commit/push, rollback/reset or `.local` cleanup was performed in this cycle. Parent final acceptance must run against these frozen sources; no UI acceptance is claimed here.

### Final-suite fixture observation timeout

The subsequent full core run recorded **286 tests, 284 passed, 2 failed**: explicit rework and two immutable reviews both hit the service fixture's 15-second polling deadline while still Running. Those original logs are preserved in `/opt/data/output/riftcode/software-factory/final-timeout-fix/original-core.log` and `original-gates.json`; they are the actual RED evidence, not a newly invented failure.

Three CPU-0 serial runs of just those two unchanged tests passed without reproducing contention. A separate diagnostic copy retained their assertions, imported the unchanged production modules and continued polling after recording the old deadline condition. With one low-priority integer-loop worker on the same CPU, it observed Running at **15.119 s → Completed at 16.202 s**, and **17.194 s → Completed at 18.250 s**, during explicit rework. All three diagnostic runs passed both tests, including actual native repair/checks, linked immutable reviews, saved sources and restart assertions. The two-review test did not independently cross the old bound during these diagnostic trials; its actual RED remains the full-run failure. The temporary worker was terminated and awaited after every trial. CPU affinity, not an inferred cgroup quota, supplied the controlled contention; the inspected CPU cgroup had unlimited quota and no recorded throttling.

Only `tests/factory-service.test.ts`'s observation bound changed: **15 → 90 seconds**, still returning immediately on any actual non-Running/non-Stopping state. Completed/Blocked/Failed assertions are unchanged; the approved application `maxRunMs` remains **20,000 ms**, verifier command timeouts remain **3,000 ms**, and the separate five-second native-start/cancellation marker bounds are untouched. A longer observer cannot turn application-budget exhaustion into success. No production fix or additional delay was added. Scheduler tracing confirmed that task Ready precedes awaited manifest/runtime persistence and the final Completed transition; observing Ready tasks with a Running run does not itself establish deadlock.

Verification after the fixture change: three complete serial CPU-0 service runs each passed **45/45**, with **0 failures/cancellations/skips**, taking **168.402 s, 175.361 s and 172.033 s** wall time. Native project typecheck and scoped native/test typecheck both exited 0. All **53 source/resource file hashes** matched before/after (`production-before.json`, `production-after.json`, `production-verification.json`). Logs, commands, elapsed times and the diagnostic harness are in `final-timeout-fix/`. This is focused backend evidence; the parent must rerun full final acceptance.
