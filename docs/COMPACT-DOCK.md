# Historical compact retained Agent / Review dock

**Superseded:** the 68px two-row milestone below is historical. The current user request and 32px single-bar implementation are documented in [SLIM-DOCK.md](SLIM-DOCK.md). Measurements and package references below belong to that earlier milestone, not the current renderer.

Unreleased **0.8.0**, existing PR #4 only. Baseline renderer: `868fd936a67cf084bb5a4dfc1f71f519e80c6030`. No backend, IPC, provider argument, credential, account, packaging, commit or push changes.

## Behavior

- Dock-only 34px identity/action header and 34px direct context strip: **68px total chrome**. Normal header remains 56px. Inline truncated session title, provider, actual permission mode and status; secondary cwd ellipsis retains its full tooltip. Unpin, Agent/Review switch, Context (Agent) and Stop remain distinct controls with their existing accessible names/keyboard behavior.
- Direct **Notes (count), Insert notes (selected count), Copy, Selection** buttons are 28px high. Full accessible names remain `Insert selected notes (N)`, `Copy notes`, `Insert selection`; insertion tooltips explicitly say no Enter. No actions were moved into Context and routing remains unchanged.
- Dock footer occupies zero height; retained-session/tracking/source-navigation information remains discoverable in the toolbar tooltip, with Agent tracking and permission details still in Context. Error/pending/checkpoint state is not hidden.
- Actual xterm `fontSize` changes **13 → 12px** while docked and restores **exactly 13px** when visible after Unpin. No CSS canvas transforms. A coalesced fit captures the disposable history marker *before* changing cell metrics, applies the new font and fits, then uses the existing bounded public-API scroll correction through column reflow. Hidden panes still do not fit; the next visible fit applies the current dock state.
- Same Angular host/xterm/PTY, two bounded independent slots, direct Enter-free insertion and explicit Review Run/follow-up remain intact. Review scope, custom draft, immediate dispatch collapse, accepted request and follow-up composer stay available; neither navigation nor resizing submits or approves anything. File navigation remains above the dock; renderer-lifetime height preference and rail are unchanged.

## Exact measured geometry

Viewport height 900px; identical **480px dock**; harmless synthetic bridge, running Agent and accepted/collapsed Review, no notes/checkpoints/pending context. Every row was measured independently for dark/light at both widths; all four returned identical values:

| Surface | Baseline header + context + footer | Compact | Baseline native surface | Compact native surface | Gain |
| --- | ---: | ---: | ---: | ---: | ---: |
| Agent, 1024 / 1440 | 56 + 53 + 38 = 147px | 34 + 34 + 0 = 68px | 293px | 400px | **107px** |
| Review, 1024 / 1440 | 56 + 53 + 26 = 135px | 34 + 34 + 0 = 68px | 120px | 185px | **65px** |

Surface excludes stage padding. Review workflow controls are additional purposeful content, not included in the 68px shared chrome budget; they were not removed. Agent also gains 28px by reducing stage padding. Review retains its minimum stage and overflow handling. Expanded briefs, accepted-request disclosure, warnings and selected context can intentionally consume extra space.

## Vertical RED → GREEN

1. Updated the top of `TERMINAL-AI-BRIEF.md` before renderer edits. Captured baseline geometry and 16 focused baseline screenshots with the unchanged HEAD renderer. Added four browser geometry regressions, then ran them against the baseline: **4 expected failures, header 56px > 36px** (`compact-red-geometry.log`). Applied only dock CSS and short dock labels; reran to **4 passed** (`compact-green-geometry.log`). Tests assert same dock height, ≥60px surface gain, ≤70px chrome, 28px controls, text Range containment and center-point hit bounds.
2. Added actual xterm font/reflow regression before changing font behavior. After correcting a test-only hover target (xterm-screen owns pointer events), observed the expected **13px instead of 12px** failure (`compact-red-font.log`). Added dock input fit scheduling and font update inside the existing marker-protected fit. Focused font/geometry/direct destination/real POSIX PTY checks passed (`compact-green-font.log`). Font regression is expanded across both widths/themes, checks exact logical history anchor through wrapped output, divider change and Unpin, exact font restore, same DOM identity and unchanged native writes.
3. Added compatibility regressions for the four directly visible context actions routing to both retained slots: selected notes count, copies, selected diff payload, paste=true, no Enter, no Start/Stop/Review-submit side effects. Extended each real harmless provider fixture test to assert 12px on both independent PIDs through docking/switch/resize and 13px after Unpin, retaining exact byte/request assertions and process liveness. These are regressions for preserved behavior, not extra production changes.

Baseline constants in the geometry test are captured measurements, so a clean checkout does not depend on workstation output files. `COMPACT_BASELINE=1` is an explicit evidence-capture mode only; normal test runs always assert the hard-coded HEAD baseline.

## Verification and evidence

- `npm test`: **89 core + 30 installer tests passed**, zero failed/skipped. Log: `/opt/data/output/riftcode/compact-full-core.log`.
- Actual Electron Node runtime: `ELECTRON_RUN_AS_NODE=1 LD_LIBRARY_PATH=/opt/data/cache/scratch/rift-native-libs/root/usr/lib/x86_64-linux-gnu node_modules/electron/dist/electron --import tsx --test --test-concurrency=1 tests/*.test.ts`: **89 passed**. Log: `compact-full-electron.log` under the same output root.
- `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome npm run test:ui -- --timeout=90000`: **120 passed (4.7m)** in the completed final isolated full run, including production typecheck/build, geometry/control hit bounds with Notes closed/open, four font/theme/width cases, direct context routing and real two-PID POSIX fixtures for all three providers. Log: `/opt/data/output/riftcode/compact-full-ui-final.log`.
- Focused gallery: `/opt/data/output/riftcode/compact-dock/{before,after}-{dark,light}-{1024,1440}-{agent,review}-{normal,docked}.png`, 32 labeled synthetic screenshots, plus per-state geometry JSON and before/after contact sheets. Inspected all four contact sheets and full-size current dark Agent / light Review screenshots. Compact controls are aligned, identity stays on one row and native area is visibly larger. Normal surfaces match baseline pixel-for-pixel except a tiny theme icon animation region in one light screenshot; no normal layout/font change.
- The initial font test hover timeout was a harness error, not renderer evidence; the corrected RED run established the missing font behavior. An accidental concurrent focused Playwright invocation was refused because the full suite owned port 4173; no existing server was reused. A later full run had 116 passing tests and four geometry harness failures because `.review-panel` includes the permanently visible rail even when Notes is closed; corrected the drawer-state assertion to `.workspace.review-open`, then all four focused geometry cases passed with Notes both open and closed (`compact-geometry-notes.log`). Retained that failed run as `compact-full-ui-drawer-harness-failure.log`. Completed final runs, not these failed attempts, establish acceptance.

## Parent verification

Parent independently passed all **9 compact geometry/font/scroll-anchor/direct-context browser cases**, plus **89 core + 30 installer + 89 actual Electron-runtime tests**. All four macOS/Windows x64/arm64 unsigned packages were regenerated from the final renderer; six runtime assets per archive match byte-for-byte, and production dependencies/native architecture/helper modes passed readback. Windows cross-packaging skips executable decoration/signing; macOS signing is unavailable on Linux. Neither is native GUI acceptance.

Current renderer: `/app-out/renderer/assets/index-ClLL0oMI.js`, SHA-256 `1c8cf1df041420e5acaaa0783c3ba402467caec631e0071fdd62a0a942ad74b5`. Receipt: `/opt/data/cache/scratch/rift-compact-package-verification.json`.

Independent read-only review `deleg_276d0c53` approved the full production diff with no security or logic blockers. It inspected lifecycle/routing and the recorded test evidence but did not rerun suites. Additional dock-minimum Context-popover coverage is a nonblocking follow-up; native acceptance stays pending.

## Remaining owner gates

Browser bridge and real harmless POSIX PTY tests prove local geometry/lifecycle/input behavior, **not native Windows ConPTY, macOS GUI, or authenticated Claude/OpenCode/Codex acceptance**. Those remain pending owner checks. No model/auth/account calls were made. No installers were regenerated, no schedules or releases created, no main merge, commit or push performed. Parent owns independent review, publication and installers. Private screenshot code/output was not copied into fixtures, tests or docs.
