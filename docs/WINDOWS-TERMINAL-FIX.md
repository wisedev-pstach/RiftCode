# Windows terminal redraw, prepared review delivery and session defaults

## Scope and acceptance boundary

This change preserves the Notes / Terminal / Review rail and its upright labels, direct Enter-free context actions, independent retained PTYs, native confirmations, checkpoints and source navigation. It does not strip ANSI, clear history during production resize, force output to the bottom, disable resize, or call real provider models in tests.

**Native Windows acceptance is still required.** Development and browser/native fixtures ran on Linux. Windows backend metadata and VT streams are synthetic; macOS and Windows packages were actually built, but their GUIs and authenticated Claude/OpenCode/Codex sessions were not executed here. A private Windows screenshot motivated investigation; none of its conversation, code or repository content was copied into fixtures or this document.

## Ranked diagnosis and observed evidence

1. **Startup geometry mismatch — reproduced.** The real Angular/xterm browser regression recorded initial spawn at **137 columns × 47 rows**, followed immediately by **137 × 41** without user resizing. The launcher used an absolute hidden surface; Start measured it before Angular committed the running surface. Footer, context and review-composer layout therefore caused a second fit after spawn. A TUI can repaint in response. Start now waits for the layout commit, reserves the same running footer/composer during Starting, and fits before dispatch. This removes a demonstrated unnecessary resize; it does not establish the exact cause of the user's Windows screenshot.
2. **Missing ConPTY compatibility metadata — confirmed omission and mechanism.** xterm 6.0.0 was never told that the backend was Windows. Its installed `typings/xterm.d.ts` documents `windowsPty`; `src/common/buffer/Buffer.ts` has a Windows-specific row-growth path that preserves scrollback instead of pulling history into a ConPTY redraw. The actual browser buffer differential demonstrates that POSIX row growth decreases `baseY`, while ConPTY metadata preserves it and all synthetic rows exactly once. Trusted main now derives build number from `node:os.release()` and matches pinned node-pty's backend selection (ConPTY from build 18309, WinPTY below it). Unknown releases get no fabricated metadata; macOS/Linux get none. Renderer applies it before parsing output and changes options only when metadata changes. Modern Windows retains xterm reflow; this is not a blanket `windowsMode` workaround.
3. **Same-event paste + Enter — reproduced with a synthetic event-batched TUI over a real POSIX PTY.** Existing Run review already built the complete scoped/default/custom request and invoked trusted review submission, but main wrote `contextPaste(text) + '\r'` in one write. A fixture which commits bracketed paste after its stdin event swallowed that Enter: all three provider-path tests failed waiting for a parsed request, despite receiving bytes. Delivery now writes one sanitized bracketed paste, separates the Enter by 100 ms, rechecks generation, child identity and readiness, and writes exactly one CR. The fixture now parses and acknowledges the request and follow-up once, without additional input. A fixed separation is transport mitigation, not a provider semantic acknowledgment or authentication signal. Supporting external report: https://github.com/mbailey/tmux/blob/master/docs/claude-code-interaction.md (community evidence, not proof of the installed user's CLI).
4. **Polling replay / scroll anchoring — not reproduced.** Main output cursor and slicing both use JavaScript string offsets. Existing generation fences remain. Split VT frames, cursor-up redraw, output arriving while scrolled, returning to bottom, normal bottom-follow, and subsequent resizing are covered using real Angular/xterm. No production output rewrite or forced scroll was added.
5. **Windows font metrics — unproven.** No font workaround was applied without native reproduction.

## Behavior changes

- A fresh ordinary Terminal starts in **Edit** across Claude, OpenCode and Codex. Explicit purpose selection and actual retained/polled session mode still win. Dedicated Review initializes Review/plan separately; trusted main's Review-only slot gate is unchanged.
- **Run review** sends the existing prepared prompt, including actual revisions/comparison, chosen files/notes, project context, tone, default review instructions and custom focus. Start/Resume remains explicit when no native session is available. Navigation, readiness, expansion and collapse never submit automatically. Login, trust and tool confirmations remain the user's responsibility; bracketed-paste readiness is not authentication proof.
- After local request validation, dispatch collapses the brief **before awaiting IPC**, making terminal space available while **Sending…** is visible. Accepted writes show **Request sent**, not agent/model completion. A rejection reopens the brief and preserves instructions; accepted snapshots update only after accepted delivery. Late old-session results cannot mutate a replacement. Expanding while a send is pending is not overridden by its later success.
- Follow-up and Send & track use the same two-phase delivery. Checkpoint acceptance awaits delivery; cancellation or an uncertain write never creates a successful new checkpoint. The main process blocks interleaved input during delivery, and the renderer disables review input while pending. There is no automatic retry or second Enter. If paste was delivered but Enter was cancelled/failed, the warning explicitly requires inspecting the native CLI before retrying.
- ResizeObserver work is coalesced to a frame and zero-area/hidden surfaces are not fitted. Startup layout waits are tied to animation frames, not an artificial loading-duration timer.

## Regression evidence

RED observations before the corresponding fixes:

- Ordinary-mode assertion returned `review`, not `edit`.
- Three deferred submission cases found `briefCollapsed === false` during pending IPC.
- Trusted Windows metadata renderer test found `undefined`, not `conpty` (`/opt/data/cache/scratch/rift-metadata-red.log`).
- Startup geometry test recorded 137×47 → 137×41.
- Three actual-PTY synthetic-TUI tests timed out waiting for a parsed request with combined paste/CR delivery.

Final completed checks:

- `npm test`: **89 core + 30 installer tests passed** (`/opt/data/cache/scratch/rift-scroll-core.log`).
- `npm run build`: typechecking, Angular compilation and production build passed (`/opt/data/cache/scratch/rift-scroll-build.log`).
- `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome npx playwright test --timeout=90000`: **93 passed**, 3.1 minutes, one worker (`/opt/data/cache/scratch/rift-scroll-full-ui-final.log`). This is a qualified extended-timeout run, not a claim about the default timeout. An earlier whole run had 88 passes and five failures from assertions which inspected Start before asynchronous layout/spawn or selected the outgoing retained view's button; those tests now await running state / scope navigation to the intended view, retaining their original acceptance assertions. The earlier log remains `/opt/data/cache/scratch/rift-scroll-full-ui.log`.
- Actual Electron-as-Node fixtures: **36 passed**, covering terminal service, checkpoints, review request/workspace, two-phase delivery and platform metadata (`/opt/data/cache/scratch/rift-scroll-electron.log`).
- Real POSIX PTY browser tests cover all three provider paths, independent edit/review children, initial native geometry without startup SIGWINCH, exact sanitized request/follow-up bytes, parsed acknowledgments, one Enter per explicit send and independent Stop. Synthetic CLI fixture, not provider execution.
- Deferred rejection/reset/replacement/readiness/write-failure tests establish that no old Enter reaches a replacement and uncertain submissions are not retried.
- Actual xterm buffer differential and production renderer stream tests cover modern Windows metadata, split cursor controls, stable rows, scroll anchors, visible resizing and zero resize IPC while hidden.

Synthetic screenshots: `/opt/data/output/riftcode/terminal-scroll-fix/` contains dark/light at 1024/1440, each in redraw/scrolled/resized states, plus `review-dispatch-pending.png`. The stream images are visibly labeled **synthetic Windows metadata, Chromium on Linux, no provider call**. Inspected dark narrow resized and light wide scrolled images show readable rows, one intact synthetic header/mascot and the original upright rail; these are not native Windows after-fix screenshots.

## Final package evidence

After the final source build:

```sh
npx electron-builder --mac --x64 --arm64 --dir -c.directories.output=/opt/data/cache/scratch/rift-final-package-mac
npx electron-builder --win --x64 --arm64 --dir -c.directories.output=/opt/data/cache/scratch/rift-final-package-win
node /opt/data/cache/scratch/rift-verify-packages.cjs
```

Four real foreign-target packages passed verification: **six current runtime assets byte-identical per archive**, production node-pty/node-addon-api present, exact native/helper architecture, executable macOS spawn helpers. Readback: `/opt/data/cache/scratch/rift-package-verification.json`; log: `/opt/data/cache/scratch/rift-scroll-package-verification.log`.

Final renderer: `index-DRl9Z_LC.js`, SHA-256 `987d6c7cacc9d5c24619101d15b3f3be16c37b52454d004330169414ea81cce2`.
Main SHA-256: `d4e90661b874a7718fb7981a54f854b0030a10e4585ada345cd1608e1c49a0fd`.

Independent read-only review `deleg_15498819` approved with no security or logic blockers, independently passing renderer/checkpoint and Electron service/submission/platform tests. The parent independently passed 89 core + 30 installer tests, the entire 93-case production browser suite (3.5 minutes, extended timeout), 36 actual Electron-runtime cases and all four current-package readbacks. Native Windows/provider acceptance remains outstanding.

## Native owner acceptance

On the new pinned preview build, exercise ordinary New/Edit, explicit Review, Resume and retained sessions for each installed provider; resize both directions, scroll up while output arrives, switch hidden panes, toggle notes, run a prepared review, inspect Sending compaction, reopen the brief, and send one follow-up. Confirm the real CLI starts responding without manual Enter and no header/mascot duplication. Resolve real login/trust prompts manually. Report Windows release, provider version and whether failure occurs on initial output, resize, scrolling or dispatch. Do not resend an uncertain request until inspecting the CLI.

For a Windows source-ZIP checkout (no Git required), avoid the previous PowerShell argument-splitting failure and redundant Electron download. After Node 24 dependency installation (`npm ci --ignore-scripts`) and the pinned downloader (`node node_modules/electron/install.js`), build and invoke the native-process builder with the **fully quoted long option as one argument**:

```powershell
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
node node_modules/electron-builder/cli.js --win --dir "--config.electronDist=node_modules/electron/dist"
if ($LASTEXITCODE -ne 0) { throw 'Packaging failed' }
```

Choose the user's native Node architecture / explicit matching `--x64` or `--arm64`; do not assume every machine is x64. Reuse only a matching platform/architecture/pinned Electron version. The quoted option reuses an installed Electron distribution; it does not remove other packaging-helper download requirements. Publication/pinned download handoff remains with the parent agent. No commit, push, merge, release or tag was performed here.
