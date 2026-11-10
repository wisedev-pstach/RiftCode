# Retained bottom docking

## Delivered behavior

Terminal and dedicated Review each expose **Dock ↓** in the existing compact header. Docking keeps the file/diff viewer above a lower pane, without changing the upright Notes / Terminal / Review rail. The lower header explicitly switches **Terminal / Review**; only one is visible while both independent sessions remain retained. **Unpin ×** (accessible name: Close dock) returns the selected surface to its original placement. It does not hide or stop that session. Stop remains a separate native action.

The separator supports pointer capture, cancellation and Arrow Up / Arrow Down (20px), Home (minimum), End (maximum). Its current/minimum/maximum heights are exposed through separator ARIA values. The preferred height defaults to 480px and is retained only for the renderer lifetime. A ResizeObserver measures the actual workspace, including its responsive application header; the split clamps both panes without storage changes. The upper minimum is 180px on ordinary workspaces and 30% on shorter ones; the lower minimum is 280px or 45% on shorter ones. At very short heights, lower-pane controls remain scroll-accessible rather than covering the file area.

File references, changed-file selection, explorer selection and checkpoint review continue to open in the upper viewer without undocking or opening Notes. Direct notes/copy/selection actions remain present. Expanded Review brief content gets a bounded scrolling region in the split so it cannot consume all native output; the launcher Start control remains reachable.

## Identity and lifecycle design

The existing Angular terminal hosts remain stable siblings under the same workspace parent. Only CSS grid row placement changes. There is no reparenting, duplicate conditional terminal, dock-triggered remount, session start, stop, native input or submission. Review keeps its existing lazy first-visit creation; once visited, neither dock switching nor closing removes it. Hidden hosts do not fit zero-area terminals. Existing main/preload two-slot ownership and permission enforcement are unchanged.

Tests compare exact host and xterm DOM identities; native fixture tests retain two distinct live POSIX PIDs and session nonces across docking/switching/unpinning, with unchanged input bytes. Review requests pending acknowledgment and tracked submissions pending rejection retain their state and drafts. Existing real-filesystem checkpoint tests now exercise docking/unpinning before reviewing the same checkpoint.

### Actual xterm scroll defect found and fixed

An exact first-visible-history-line assertion exposed a real xterm 6 row-resize problem that a weaker “not at bottom” check missed. Shrinking 41 rows to 19 changed buffer viewport 259 → 281 while its DOM scroll position remained 259. Public `scrollToLine(259)` computes a delta against buffer ydisp but applies it against DOM scroll, producing 237 instead of 259. Waiting a frame did not resolve that mismatch.

The retained component now captures an anchor only when the user was already reading scrollback. Unchanged columns retain the exact viewport line; width reflow uses a temporary buffer marker. After fit, it restores the target and makes one bounded corrective public scroll call only if viewportY still differs, before paint, then disposes the marker. It never clears history or forces users to bottom. The regression checks exact first-visible-line retention across docking, keyboard resize, unpinning and Notes-width changes, plus incoming output while scrolled.

## Vertical RED → GREEN evidence

Each implementation slice was exercised before its production change, not a pile of tests implemented afterward:

| Slice | Observed RED | GREEN |
| --- | --- | --- |
| Terminal dock / original-placement return | Dock button absent | Stable CSS grid split; host/xterm identity and no extra Start/Stop/input |
| Dedicated Review switch / pending request / source above | Explicit dock switch absent | Pending request resolves on same review surface; source opens above |
| Pointer + keyboard split | Separator absent | Drag, keyboard, clamping, responsive geometry and remembered height in both themes / widths |
| Expanded Review split | Native surface only 72px high | Bounded brief and reachable launcher; native output at least 120px |
| Changed/explorer file navigation | Explorer selection hides retained host | Dock remains visible during upper-view navigation |
| Exact scroll anchor | Top history line changes on dock; single-call and deferred attempts also fail | Real xterm reproduction and bounded pre-paint correction retain exact anchor |

Logs preserve the failed attempts. Initial full-suite run: 93 passed / 8 failed. Seven failures were old three-control header expectations after adding the authorized Dock control; they now explicitly require the fourth Dock action while preserving alignment/bounds assertions. The remaining narrow identity regression was real clipping; wrapping the status in narrow panes fixed it without increasing the compact 56px header. Screenshot capture waits for the existing 140ms workspace transition to settle; early intermediate drawer screenshots were regenerated.

## Completed checks on final production source

- `npm test`: **89 core + 30 installer passed**, zero skipped/failed.
- `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome npm run test:ui -- --timeout=90000`: **102 passed**, single worker, complete isolated run. This command also completed typecheck and production build.
- Actual **Electron 43.4.1 Node runtime**, `ELECTRON_RUN_AS_NODE=1`, running all `tests/*.test.ts`: **89 passed**, zero skipped/failed. This includes actual harmless local PTY/process tests; it is not an Electron GUI acceptance claim.
- Browser-to-actual-POSIX-PTY fixture coverage for Claude/OpenCode/Codex argument modes: two retained native PIDs, one explicit request + one follow-up, exact sanitized paste/Enter bytes, no layout-induced input/start/stop.
- `git diff --check`: passed.
- Preview port 4173: connection refused after checks; no owned preview server left running.

## Current artifacts

`/opt/data/output/riftcode/terminal-docking/` contains **24 PNGs**: dark/light × 1024/1440 × normal, docked, resized, closed, review, review-notes. All have a visible **Synthetic browser bridge / harmless fixtures / no provider run** label. See `index.html` for the local gallery and `evidence/` for RED/GREEN, failed intermediate and final logs. Screenshots are from the final production renderer; browser mocks are not represented as authenticated native-provider output.

## Remaining owner acceptance / handoff

- Native macOS and Windows GUI resize/ConPTY behavior, authenticated providers, real permissions/login/trust interactions and owner visual acceptance remain unverified on this Linux host.
- Do not interpret Linux browser ConPTY metadata tests or Electron Node-runtime tests as native Windows GUI acceptance.
- Parent independently reran all **89 core + 30 installer + 102 browser + 89 actual Electron-runtime tests**; all passed. The complete production browser run took 3.8 minutes.
- Parent regenerated all four macOS/Windows x64/arm64 packages after the final renderer build. Six current runtime assets per archive match byte-for-byte; production dependencies and exact native architecture/helper modes passed readback. Windows cross-packaging skipped executable decoration/signing; macOS signing was unavailable on Linux. These are unsigned cross-package checks, not native GUI acceptance.
- Current renderer: `index-BZBqNhMb.js`, SHA-256 `75e0b06a45c0a9cf6958c4babc13283e2e3d0dc6d77f6d3605b2c3d36406bbcb`. Parent package receipt: `/opt/data/cache/scratch/rift-docking-package-verification.json`.
- Independent read-only review `deleg_3406dce4` approved the production diff with no security or logic blockers. It inspected lifecycle/navigation, installed xterm behavior and tests, but did not rerun suites; parent reruns are recorded above. Keep native acceptance outstanding and preserve the exact scroll-anchor regression on future xterm upgrades.
- Worker did not commit/push or access task/account data. Parent owns independent review and same-PR publication; no merge, release, paid provider call or schedule is authorized. The RiftTask account has a separate Dockable terminal workspace milestone; native acceptance must remain outstanding.
