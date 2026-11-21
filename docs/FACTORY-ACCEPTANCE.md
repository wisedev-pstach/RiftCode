# Software-factory 0.9.0 — candidate acceptance

This records automated source-candidate acceptance, not an official release, signing, authenticated-provider acceptance or native macOS/Windows execution.

## Delivered

- Deliberate Creation / Review entry in the actual App; existing Review, upright Notes / Agent / Review rail, retained terminals, docking and Enter-free insertion preserved.
- Editable requirements/questions, architecture and bounded diagram preview, dependency/task plan and exact native verification commands.
- Explicit, separately consented planning generation, approval and Start; sequential implementation/verification/repair with bounded attempts/time.
- Independently queued immutable task revisions, saved source/patches, real native command receipts and local supporting files outside the checkout. Human review is optional during execution and never commits or merges.
- Five bundled portable skills; trusted main-owned capability discovery; strict IPC; persisted approval/source/Git metadata fences; awaited Stop/disposal and root-wide cleanup-uncertainty fencing.

## Final execution results

- **286 core tests passed**, zero failures/cancellations/skips, serial CPU-0 execution.
- **32 preview-installer tests passed**, including 0.9 source/bootstrap and actual-version reporting fixtures.
- Production build and TypeScript/Angular template checks passed.
- **184 production App browser tests passed**, zero skipped/unexpected/flaky results; includes the 12 actual App workflow-entry cases and retained real scratch PTY/session/DOM identity coverage.
- Review source-location test synchronization was separately repeated in both themes, five times each, before the complete App suite. The barrier awaits the committed actual Review host, not an arbitrary sleep.
- **16 standalone actual-Angular factory tests passed** against an explicitly synthetic API, independently reviewed and source-hash matched. This separate harness is intentionally excluded from the production App preview config because it owns port 4189 rather than 4173.
- **47 real Electron-as-Node retained-PTY tests passed** under Electron 43.4.1 / Node 24.18.1 / ABI 148. This is Linux native PTY evidence, not a native desktop GUI/provider test.
- `git diff --check` passed.
- Four fresh unsigned directory packages built and read back: macOS x64/arm64 and Windows x64/arm64. Each ASAR has byte-identical final main/preload/renderer assets, expected node-pty dependencies and target native architectures, correct helper permissions, package version 0.9.0 and five byte-identical outer portable skill files.

The last two core failures were fixture observation deadlines, not an observed scheduler deadlock. Controlled contention showed the same jobs crossing the old 15-second test observation limit and then completing; the fixture now allows 90 seconds without changing the application's approved execution budget, verifier limits or behavioral assertions. Three complete service-file repeats passed 45/45 each before the final 286-test run. Earlier failed/interrupted attempts remain preserved and are not counted as passing acceptance.

Independent backend review resolved four reproduced defects and passed seven desired-safe adversarial scenarios. Separate native-boundary and renderer re-reviews passed. Cleanup-failure fault injection happens after a real harmless child settles; no real OS kill failure is claimed. Source hashes were unchanged across the final build/App suite, core/installer/Electron stages and package readbacks.

## Reproduction

```sh
# Run from the checkout with dependencies installed.
taskset -c 0 node_modules/.bin/tsx --test --test-concurrency=1 tests/*.test.ts
npm run test:installer
npm run build
CHROMIUM_EXECUTABLE=/absolute/path/to/chrome npx playwright test --timeout=90000
```

`taskset` is a Linux resource-control choice, not an application prerequisite; omit it on macOS/Windows. The standalone Angular harness instructions are in [FACTORY-UI.md](FACTORY-UI.md). Native smoke tests require the target Electron runtime and platform libraries, not just system Node. Native install fixtures and foreign directory packaging cannot establish owner-machine launch success.

Detailed local evidence is retained under `/opt/data/output/riftcode/software-factory/`: `final/acceptance.json`, `final/final-source-hashes.json`, `final/app-acceptance/`, `final/post-app-gates.json`, `final/packages/verification-manifest.json`, `ui-review-fixes/`, `backend-review-fixes-2/` and `final-timeout-fix/`. These server-local paths are evidence handles, not publicly downloadable attachments.

## Remaining boundaries

- No real model/provider login, paid calls, account data, native macOS/Windows execution, signing, store upload, tag/release or merge was performed.
- Windows factory execution stays Blocked; existing desktop Review/Agent support is independent.
- OpenCode needs trusted exact-version capability evidence and has no read-only planning transport. Default factory discovery supports native binaries, not npm shell/JS shims. Existing interactive provider terminals remain available.
- Claude/Codex paths are capability-gated; fixture success is not authenticated-provider acceptance. Provider configuration and approved commands execute under the OS user and may use the network. This is not an OS sandbox.
- Async source/Git checks detect boundary changes, not hostile modifications restored between observations. Intentionally detached processes remain outside process-group containment.
- Generated artifacts are bounded local evidence, not cloud sync. Existing per-plan quotas and the eight-plan retention limit fail honestly rather than evicting previous evidence; see [FACTORY-RUNTIME.md](FACTORY-RUNTIME.md).
