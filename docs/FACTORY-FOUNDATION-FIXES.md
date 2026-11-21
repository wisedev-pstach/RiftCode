# Factory foundation review fixes

## Snapshot deletion/rename blocker

`git ls-files --cached` retains tracked paths after their containing directory is removed or renamed. Parent validation previously happened outside the `ENOENT` handler, so a genuinely missing directory aborted capture before the deleted file could be omitted. Parent validation and file `lstat` now share the existing narrow `ENOENT` handler. No other errors are swallowed; existing symlink/special parents still block.

Real isolated scratch Git regression fixtures delete or rename a complete tracked directory, then create the task revision. They assert deletion/addition status, original bytes, quoted patch paths (including newline names), unchanged HEAD, and byte-identical index. Separate fixtures replace a tracked parent with a live symlink, dangling symlink, regular file, or FIFO and require rejection.

The existing immutable-review test now creates and queues task B's revision after B edits the same file as A, opens a fresh store for the same root/userData, reads A's original revision and patch through that reopened store, and verifies A rather than B remains visible. This is store-reopen coverage, not a claim of full application/native restart acceptance.

## Zero-exit auth/trust blocker

A new auth/trust diagnostic matcher blocks successful-looking captures when stderr or explicit `system` events report authentication/login required or an untrusted workspace/folder. Six diagnostic variants cover both channels, including the two reviewer examples. Matches remain sticky despite a later success result. ANSI diagnostic formatting is removed before matching. New auth/trust matching does not scan arbitrary user messages, Claude result prose, or Codex agent messages. Existing permission-denial scanning and provider protocol checks are unchanged.

This is deliberately fail-closed on diagnostic channels: quoted auth/trust examples emitted by a provider on stderr or in system diagnostics may also block. Literal non-JSON stdout already blocks as malformed protocol. No auth, trust, approval, or provider configuration bypass was introduced. No adapter interfaces changed.

## Small packaged-skill hardening

Skill loading rejects symlinks within the packaged skill path, opens with `O_NOFOLLOW | O_NONBLOCK`, checks regular/non-linked descriptor metadata, rejects an initial size above 32 KiB, reads at most 32 KiB + 1, and checks descriptor metadata again before parsing. A real in-root symlink fixture reproduced the old acceptance before the change. Additional boundary/FIFO fixtures verify exactly 32 KiB is accepted, 32 KiB + 1 is rejected, and a FIFO is rejected without blocking. The resources root remains trusted packaged input; this is not a general hostile-filesystem traversal API.

## Recorded verification

Evidence directory: `/opt/data/output/riftcode/software-factory/foundation-fixes/`.

- `snapshot-red.log`: 5 tests, 3 pass, 2 fail; both directory operations fail with parent `lstat ENOENT`.
- `snapshot-green.log`: 5/5 pass after the minimal fix.
- `snapshot-reopen-guards-green.log`: 9/9 pass including reopen and parent rejection coverage.
- `providers-red.log`: 87 tests, 75 pass, 12 fail; auth/trust diagnostics were incorrectly `candidate` rather than `blocked`.
- `providers-green.log`: 87/87 pass.
- `skills-red.log`: 6 tests, 5 pass, 1 fail; in-root symlink load was incorrectly accepted.
- `skills-green.log`: 7/7 pass including byte boundary and FIFO checks.
- `foundation-seven-green.log` and `foundation-seven-taskset-c0-green.log`: each 118 tests, 118 pass, 0 fail/cancelled/skipped/todo.

Final constrained command:

```sh
taskset -c 0 node_modules/.bin/tsx --test tests/factory-store.test.ts tests/factory-artifacts.test.ts tests/factory-snapshot.test.ts tests/factory-process.test.ts tests/factory-providers.test.ts tests/factory-skills.test.ts tests/factory-verification.test.ts
```

The runner emits the existing Node `DEP0205 module.register()` deprecation warning. No real provider CLI/auth/account/network calls, real user data, UI/build/package runs, commits, or pushes were used. Provider captures and verification receipts in the new tests are synthetic, not native-provider acceptance evidence. Integration and service/runtime/UI ownership remain with the parent and other workers.
