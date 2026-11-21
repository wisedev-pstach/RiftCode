# Factory storage foundation (version 1)

Native-only modules; **not connected to App, preload, IPC or providers**. No factory UI or authenticated execution is claimed.

## Contract

`src/shared/factory.ts` exports `FactoryRunState`, `FactoryScope`, `FactoryTask`, `FactoryManifest`, `FactoryArtifact`, `FactorySnapshotFile`, `FactorySnapshot`, `FactoryChangedFile`, `FactoryTaskRevision`, and `FactoryReviewDecision`.

States: `pending`, `implementing`, `verifying`, `repairing`, `readyforreview`, `blocked`, `failed`, `stopped`, `interrupted`. Ready for review is not accepted. Dependencies need successful queued revisions, not human acceptance. The coordinator must continue tasks sequentially and stop on failed prerequisites.

```ts
import {openFactoryStore, createManifest, writeManifest} from './factory/store';
import {writeArtifact, readArtifact} from './factory/artifacts';
import {captureSnapshot, createTaskRevision, readTaskRevision,
        appendReviewDecision, listReviewDecisions} from './factory/snapshot';

// Both paths come from trusted main, never renderer path arguments.
const store = await openFactoryStore({root: canonicalRepositoryRoot, userData: app.getPath('userData')});
const manifest = await createManifest(store, {
  title: 'Approved plan', requirements: ['R1'],
  tasks: [{id:'task-a', title:'A', dependencies:[], testCommandIds:['unit'], pathScope:['src/']}]
});
const requirements = await writeArtifact(store, {kind:'markdown', content:'# Requirements\n\nR1\n'});
const before = await captureSnapshot(store);
// Explicit authorized implementation and real verifier execution happen elsewhere.
const after = await captureSnapshot(store);
// trustedReceiptIds must resolve to native-created receipt artifacts, not model claims.
const revision = await createTaskRevision(store, {
  taskId:'task-a', beforeSnapshotId:before.id, afterSnapshotId:after.id,
  receiptIds:trustedReceiptIds, artifactIds:[requirements.id]
});
await writeManifest(store, {...manifest, state:'readyforreview', revisionIds:[revision.id]});
const review = await readTaskRevision(store, revision.id);
const patch = await readArtifact(store, review.changes[0].patchArtifactId);
// Retrieve source by beforeSourceId/afterSourceId, never a live repo diff.
await appendReviewDecision(store, {revisionId:revision.id, decision:'changesrequested', comment:'Fix R1'});
// Rework: createTaskRevision with previousRevisionId: revision.id; never overwrite it.
```

Other exports in `store.ts`: `readManifest`, `DEFAULT_FACTORY_LIMITS`, `FactoryStore`, `FactoryLimits`, `newId`, `assertId`, `sha256`, `readRecord`, `publishRecord`, `safeRead`, `publishBytes`, `assertScope`, `assertStore`, `safeDirectory`, `withStoreLock`. Low-level primitives and `writeArtifactUnlocked` are internal native integration surfaces, **not renderer APIs**. Do not expose arbitrary record/artifact writes through IPC. Never call lock-taking functions inside another `withStoreLock`; unlocked primitives are only for a trusted batch already holding the lock.

Receipt artifacts contain serialized native verifier `VerificationReceipt` data: `taskId`, `before.fingerprint`, `after.fingerprint`, `stale`, `checksPassed`, and `process.{commandId,reason,exitCode}`. Both fingerprints must equal the immutable after-snapshot fingerprint; all required command IDs need successful, nonstale receipts. Storage validates references and source identity, **not execution authenticity**: the integrating service must exclusively obtain these objects from the real main-owned verifier, preserve its remaining fields and invocation/task-revision identity, and never accept renderer/model receipt JSON. Current tests intentionally use labeled fixture records; these are not real test-execution evidence for an implemented factory task.

## Isolation and persistence

Layout: `<explicit userData>/factory-v1/<sha256(canonicalRoot)>/`. UserData inside the checkout, including a preview override, is rejected. No `.gitignore`, `.git/info/exclude`, worktree, index, HEAD, provider home, export directory or cloud writes. The application must pass its **actual** userData path, not a guessed home. A binding file and every record bind version 1, canonical root and workspace ID. IDs are resolved in this namespace only; record paths are not accepted from renderer.

New directories use 0700; files use 0600. Symlink directory chains, symlink/hardlink/special files are rejected; descriptor reads are bounded, no-follow/nonblocking and root checked. Immutable publication writes and fsyncs a private temporary file, publishes by exclusive hard link, unlinks the temporary name, then fsyncs its directory. Manifest replacement uses same-directory atomic rename. A transient two-link object fails closed rather than being accepted. Platforms/filesystems without these operations fail, not silently fall back to partial writes.

A native exclusive `write.lock` serializes writes. A crashed lock intentionally blocks further writes: recovery must explicitly inspect the interrupted operation; no automatic lock theft. Incomplete metadata throws. Unreferenced partial/orphan files are never interpreted as a completed snapshot/revision and still consume the quota. Immutable evidence is published before the manifest queues its revision. `readManifest` validates referenced evidence before returning; persisted active states are returned as `interrupted` rather than fabricated success (also true for reads during an active run; a future coordinator retains its own live state). Plan fields are immutable; queued/artifact references cannot be removed.

## Capture and review

Working-tree capture includes tracked working bytes and nonignored untracked files, not HEAD contents. A separate directory scan catches Git-omitted FIFOs/special objects. Deletions are absent entries; executable-bit mode is retained. Submodules, symlinks, hardlinks, invalid UTF-8 paths and unsafe paths fail explicitly. Snapshot fingerprints cover ordered paths, content hashes, byte lengths and Git regular-file modes. Git is executed through fixed argv and native cwd, no shell, no hooks/fsmonitor/external diff/textconv, with inherited `GIT_*` redirection removed. Normal Git ignore rules apply. No staging/reset/commit is used.

Patches are computed from saved source artifacts with fixed scratch filenames; unusual original names use quoted headers and replacement callbacks (newlines and `$` cannot inject patch syntax). Binary changes are classified with explicit metadata, not decoded as text; mode changes carry mode headers. Full sources remain separately available. Earlier queued task A remains reviewable after task B edits the same live file.

Capture is not an OS transaction: it detects descriptor mutations and changed file listings, but a concurrent external writer between separate file reads cannot be universally excluded. Integrators must fence root/run generations and coordinate provider writes; never infer provider completion from terminal silence. No sandbox against a malicious same-OS-user process is claimed.

## Bounds and recovery

Defaults (may only be lowered): 1 MiB/file, 20 MiB/snapshot, 5000 files/snapshot, 10000 scanned entries, 24 MiB/object, 128 MiB/workspace persistent files, 20000 workspace files. Overflow throws a clear `blocked` limit error; caller must transition to blocked and retain the task draft. No truncation presented as complete. Diff scratch is temporary (up to two bounded source files), private and removed in `finally`; interrupted scratch may block subsequent storage writes as an unsafe directory until explicitly inspected. No automatic deletion/eviction of queued evidence exists. A future explicit retention/recovery UI is needed before long-running production use.

## Verification

Focused command:

```sh
taskset -c 0 node_modules/.bin/tsx --test tests/factory-{store,snapshot,artifacts}.test.ts
```

Logs and owned-source hashes: `/opt/data/output/riftcode/software-factory/storage/`. Real scratch Git/filesystem fixtures only; no user repository snapshots, provider sessions, model calls, deployment or full UI/build gates. Linux proof only, not native Windows/macOS acceptance.
