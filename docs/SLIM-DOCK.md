# Slim single-bar Agent / Review dock

Unreleased **0.8.0**, existing PR #4. Exact-source baseline: `b94ee10bef7e8a9be971a8c1079620e7f498bd44`. This supersedes the historical **68px two-row** milestone in [COMPACT-DOCK.md](COMPACT-DOCK.md).

## Current behavior

- Latest feedback `1569630120870674525` / `1569630189107937293` supersedes the earlier 1px sibling gaps and 12px dock font. **32px total shared dock toolbar**, **4px button gaps / 8px group gaps**, 1px vertical / 4px horizontal outer padding, **24px control hitboxes / 14px icons**. Notes/count, insert-selected-notes/count, Copy and Selection are directly visible inside the header, not moved into overflow. Full accessible names, disabled states and no-Enter insertion tooltips remain.
- Distinct Unpin, Agent/Review switch, Context (Agent) and Stop remain directly accessible. SVG icons replace verbose dock labels; the short Agent/Review switch stays textual. The title is single-line and ellipsized; hovering it inherits the full provider, actual mode, status and cwd tooltip. The live indicator stays visible. No second context row or footer occupies dock height.
- Context opens below the header, scrolls within a bounded 220px maximum at minimum dock height, and preserves keyboard Enter activation / Escape dismissal and focus return. It contains the existing tracking, checkpoint and permission details, not the four direct context actions.
- Normal undocked template/layout is retained. Actual xterm is now **11px docked / 13px normal**, changed inside the existing marker-protected visible fit (previously 12px docked). Real rendered row metrics shrink, not a CSS transform. Stable Angular/xterm hosts, two independent PTY slots, trusted main identities, native input callbacks and scroll-anchor/font restoration are preserved. Dock identity status is visually hidden rather than `display:none`, retaining its live `role=status` in the accessibility tree alongside the full actual metadata tooltip.
- Review brief/scope/instructions, explicit Run, dispatch collapse, accepted request and follow-up are preserved. Navigation/session readiness does not collapse the brief. No lifecycle, backend, IPC, provider, account or version changes.

## Exact measured native-surface gain

900px viewport height, identical **480px dock**, harmless synthetic bridge, running Agent and explicitly accepted/collapsed Review. Both 1024/1440 widths and dark/light themes return the same measurements:

| Surface | Baseline shared chrome | Current shared chrome | Baseline native surface | Current native surface | Gain |
| --- | ---: | ---: | ---: | ---: | ---: |
| Agent | 34 + 34 = 68px | 32px | 400px | 436px | **36px** |
| Review | 34 + 34 = 68px | 32px | 185px | 221px | **36px** |

The 24px context group is **inside** the 32px header, not another row; do not add its nested height to total chrome. Review workflow controls remain additional purposeful content. Expanded briefs, checkpoints, pending context and errors can still consume space.

## RED → GREEN and evidence

- Captured baseline geometry and 16 screenshots from unchanged HEAD before production edits. Four strengthened geometry regressions then failed as expected: zero gain versus the 400/185px baseline rather than required ≥30px (`slim-red-geometry.log`). Minimal dock-template/CSS changes produced 36px gain. Corrected two test-only issues without reducing action/identity coverage: allow Angular dock rendering to settle before DOM inspection, and skip text Range bounds only for genuinely textless icons / screen-reader-only labels. Visible counts and switch text still require containment; all controls retain center-point hit checks with Notes closed/open.
- Added minimum-dock/Notes-open Context keyboard tests before fixing clipping: both themes failed `inside:false` (`slim-red-menu.log`). Bounded dock-only popover scrolling fixed it. Added a separate failing tooltip regression because a child `title=""` suppressed inherited metadata; dock title now removes the child attribute (`slim-green-menu-red-tooltip.log`).
- Focused geometry, font/reflow/identity, Enter-free selected-note/selection routing/copy and Context/tooltip suite: **11 passed** (`slim-green-focused.log`). Existing real harmless two-PID POSIX/provider fixture tests remain in the full browser suite.
- Synthetic gallery: `/opt/data/output/riftcode/slim-dock/`, 32 before/after normal/docked screenshots across Agent/Review, widths and themes; four comparison sheets, per-state geometry JSON, and two Context-minimum/Notes-open screenshots. Inspected all four sheets, full-size dark 1024 Agent and light minimum-dock Context. Direct controls stay in one row, native area grows, Review workflow stays visible, and Context is contained with scrollable safety details.
- Initial focused gallery: all **eight normal Agent/Review × width × theme screenshots matched baseline pixel-for-pixel**. Final isolated recapture: six remain exact; light Agent 1024/1440 differ at only 17/13 pixels respectively, every channel by at most 1 RGB value (antialias/rounding noise, no geometry change). Final comparison is `normal-pixel-comparison.json`. No private screenshot code/output was copied.

## Latest correction: strict RED → GREEN evidence

- Font regression first failed **expected 11px, received 12px** (`/opt/data/cache/scratch/rift-spaced-red-font.log`); minimal production change is `this.docked?12:13` → `this.docked?11:13` inside the existing anchored fit. Focused GREEN passed, including real xterm row-height reduction, normal 13px restoration, exact wrapped-history anchor, unchanged host/xterm identity and unchanged native writes (`rift-spaced-green-font-before-spacing.log`).
- Spacing regression next failed **expected 8px group gap, received 1px** (`rift-spaced-red-gaps.log`); dock-only CSS now uses 4px button / 8px group gaps and 1px 4px toolbar padding. GREEN checks computed styles, physical sibling bounding-box separation, 24px hitboxes, text containment and center-point hits at 1024/1440 with Notes closed/open (`rift-spaced-green-gaps.log`).
- Accessibility regression next failed because live `role=status` was absent from the accessibility lookup under `display:none` (`rift-spaced-red-status.log`). Visually hidden dock metadata restores real accessible running status without another row. Both minimum-dock/Notes-open keyboard Context cases passed afterward. The focused invocation printed all **11 individual passing cases**, but its foreground command timed out at 360 seconds before Playwright printed the final summary; retain `slim-dock-spaced/focused.log` as interrupted evidence, not a completed suite pass.
- Current gallery: `/opt/data/output/riftcode/slim-dock-spaced/after-{dark,light}-{1024,1440}-{agent,review}-{normal,docked}.png`, plus four `gallery-*.png` sheets. Inspected every sheet and full-size dark 1024 Agent / light 1440 Review. Direct controls are visibly separated in one row; source remains above; Review workflow and follow-up remain visible. Synthetic fixture banner is present. All **eight normal screenshots match unchanged-HEAD baseline pixel-for-pixel** (`normal-comparison.json`). `baseline68-*` preserves exact-HEAD screenshots; `before-spacing-*` is an intermediate **11px / 1px-gap** capture, not a 12px baseline.
- Geometry remains 32px toolbar / 436px Agent native surface / 221px accepted Review native surface at the same 480px dock, a 36px gain over HEAD for both widths/themes. More button separation costs no additional vertical space.

## Latest completed verification

- **Clean full browser run: 122 passed (31.2m), exit 0**, including production typecheck/build, the previously failing exact scroll/draft Unpin anchor test, actual two-PID harmless PTY fixtures and all final spacing/font/routing/accessibility tests. Command: `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome taskset -c 0 npm run test:ui -- --timeout=90000`. Log: `/opt/data/output/riftcode/slim-dock-spaced/full-ui.log`. No test weakening, retries or anchor production changes. Historical failures below remain recorded rather than relabeled harmless.
- Four font tests were then strengthened to inspect **actual `terminal.options.fontSize` plus xterm CSS cell width/height**, not only DOM font styling, and completed separately: **4 passed (51.5s)** (`actual-options-cell-metrics.log`). At 1024: normal/restored font 13, cell 7.821428571428571 × 15px; docked font 11, cell 6.621359223300971 × 13px. At 1440: normal/restored 7.824817518248175 × 15px; docked 6.620481927710843 × 13px. Both themes return exactly the original metrics after Unpin, retaining the exact history anchor and unchanged native Start/Stop/input counts.
- Current renderer bytes/hashes and compiled 11/13 option are in `renderer-bytes.json`: JS `index-CtUf-RRK.js` **2,859,493 bytes**, CSS `index-NOB991cM.css` **171,546 bytes**. No production changes after this build.
- Core/installer and actual Electron suites below passed on the preceding slim renderer; they were **not rerun for this last dock-only correction**, following the parent instruction to return after the completed full browser gate. Parent owns independent review and package regeneration.

## Historical completed verification (preceding 1px-gap / 12px-font version)

- `taskset -c 0 npm test`: **89 core + 30 installer passed**, zero failed/skipped (`/opt/data/output/riftcode/slim-full-npm-test-affinity.log`). Unrestricted `npm test` twice hit the existing metadata FIFO subprocess's fixed 3s timeout on this CPU-constrained host (88 passed / 1 failed; retained as `slim-full-core.log` and `slim-full-core-final.log`). The identical full suite also passed with explicit serial Node execution. CPU affinity makes the unchanged runner choose serial concurrency; no timeout/test weakening or unrelated source changes.
- Full `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome npm run test:ui -- --timeout=90000` **completed: 121 passed, 1 failed (37.2m)**, including production typecheck/build and every new slim-dock case (`/opt/data/output/riftcode/slim-full-ui.log`). The failure was the existing scroll/draft test's exact Unpin history assertion, expected `SCROLL-LINE-256`, received `SCROLL-LINE-247`, after Notes open/close. It is **not** represented as a clean full-suite pass. No terminal lifecycle/anchor production code or that regression's final assertions were changed.
- Isolated affinity-constrained rerun of the **unchanged failing scroll/draft test plus all four final geometry tests: 5 passed** (`slim-final-scroll-geometry.log`); this does not turn the preceding full run into a full pass. A clean full-browser rerun remains a verification gate for the parent. No further full run was started after the parent requested completion of the current tracked run and handoff.
- Actual Electron Node runtime: `taskset -c 0 env ELECTRON_RUN_AS_NODE=1 LD_LIBRARY_PATH=/opt/data/cache/scratch/rift-native-libs/root/usr/lib/x86_64-linux-gnu node_modules/electron/dist/electron --import tsx --test --test-concurrency=1 tests/*.test.ts`: **89 passed**, zero failed/skipped (`slim-full-electron-final.log`). An earlier serial attempt concurrent with the slow browser run hit the same fixed 3s FIFO subprocess timeout, 88/89 (`slim-full-electron.log`); the final isolated affinity-constrained pass used unchanged tests.
- `git diff --check` passed. The owned preview server ended; port 4173 refused a final connection check.

## Fresh parent verification

Parent independently passed **89 core + 30 installer + 89 actual Electron-runtime tests** on the final spaced 11px source, using CPU affinity/serial execution without changing test assertions. All four macOS/Windows x64/arm64 unsigned packages were regenerated and read back: six byte-exact current runtime assets each, production dependencies and native architecture/helper modes verified. Windows cross-packaging skips executable decoration/signing; macOS signing is unavailable on Linux.

Current renderer: `/app-out/renderer/assets/index-CtUf-RRK.js`, SHA-256 `1095112addb01b20e69114cb2eb970b130bd85cf6c4ec4f65df57d115f21cf23`. Receipt: `/opt/data/cache/scratch/rift-spaced-package-verification.json`. Browser evidence is the completed 122-case run plus four strengthened font/cell cases above; no parent full-browser rerun is claimed. Native GUI/provider acceptance remains pending.

## Final independent review

Read-only review `deleg_cae3e65c` approved the complete final production diff with no security, logic or lifecycle blockers. It confirmed that 11px is applied to actual xterm options inside marker-protected fitting and that Unpin restores 13px with retained identity/anchors, direct Agent/Review routing, Enter-free insertion and accessible live status. The reviewer inspected the recorded 122-case and four actual-font results but did not execute tests.

## Evidence boundary

Browser/xterm and harmless POSIX PTYs establish local geometry, lifecycle and input behavior, **not native Windows ConPTY, macOS GUI or authenticated provider acceptance**. Those remain owner gates. No model/auth/account calls, commits, pushes, release/schedule writes or packages were made. Parent owns independent review and installer regeneration/publication.
