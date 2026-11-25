# Factory native boundary

The native preload exposes the closed ten-method `FactoryApi`. `registerFactoryIpc` validates the sender, exact arity and bounded DTO fields before obtaining a service; it checks sender and repository/renderer epoch before dispatch and before returning a result. The renderer never supplies an evidence store root, native provider locator, capability verification or trusted receipt.

`FactoryManager` lazily constructs a single main-owned service. It captures the canonical active repository, app-owned external userData directory, packaged skill root and a restricted native environment. No factory service or provider process is created just by opening the app or choosing Review. The factory service's load operation is responsible for remaining execution-free.

Main waits for actual service disposal before opening a replacement repository. Navigation, renderer exit/crash and window close invalidate the generation and request child cleanup. Quit is prevented until cleanup succeeds. A cancelled quit preserves the active repository watcher (including same-root watch requests), queued refresh and attachments; watcher closure and attachment deletion occur only on the permitted quit after successful factory disposal. A cleanup failure blocks new services rather than permitting orphaned execution; an explicit subsequent close can retry cleanup. A transactional initialization failure is not treated as a running child. Late initialization is disposed and never returned to an obsolete renderer.

Factory environment keys are explicitly restricted to PATH, HOME, USERPROFILE, SYSTEMROOT, WINDIR, TMP, TEMP, TMPDIR, LANG, LC_ALL, CI, TERM and PATHEXT. Ambient API tokens and shell configuration keys are not inherited through this boundary. Existing native Agent/Review terminals retain their independent established environment and lifetimes.

Canonical portable skills are packaged using `extraResources` from `resources/factory-skills` to `process.resourcesPath/factory-skills`. Development uses `<app.getAppPath()>/resources`. Source builds must preserve these resources; this is not an installed-provider-home mutation.

## Focused verification

```
taskset -c 0 node_modules/.bin/tsx --test --test-concurrency=1 tests/factory-manager.test.ts tests/factory-ipc.test.ts tests/factory-bridge.test.ts tests/factory-packaging.test.ts tests/factory-main-lifecycle.test.ts
taskset -c 0 node_modules/.bin/tsc --noEmit -p tsconfig.node.json
```

At the native review-fix checkpoint, all 12 boundary/lifetime/resource assertions pass serially on CPU 0. These execute the actual transpiled preload in a VM, the closed IPC registrar, injected service lifetime behavior and the real portable skill files. The new main lifecycle test AST-extracts the actual `before-quit` registration, its cleanup state and `watchRepository` from main source, transpiles them and runs them in a VM without importing Electron. It first failed against the unfixed source because cancelled quit closed the same-root watcher. It now verifies cancellation, continued queued/new refresh delivery, preserved attachments and deferred/idempotent cleanup after a successful retry. Two IPC tests invalidate the epoch or sender while `API.load()` is pending and require rejection of the final result. The native TypeScript check also passes. The test runner emits a `module.register()` deprecation warning. This is not authenticated-provider acceptance, OS-native GUI acceptance or verification of final packaged output. Full application regressions, independent review and final package readback remain separate gates.

Review-fix evidence: `/opt/data/output/riftcode/software-factory/native-review-fixes/` contains `main-lifecycle-red.log`, `native-green.log`, `native-typecheck.log` and `manifest.json` (SHA-256 hashes and observed test totals).

RED/GREEN logs: `/opt/data/output/riftcode/software-factory/manager-{red,green}.log`, `manager-cleanup-red.log`, `manager-initialization-red.log`, `packaging-red.log`, `native-integration-green.log`, `native-typecheck.log`.
