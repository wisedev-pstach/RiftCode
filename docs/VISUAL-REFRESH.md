# Command workspace visual refresh — 0.8.0

Implemented on `feat/terminal-ai-workspace` over the previous published revision `c11df00fc790b4be00b6d1080d21c47be80cdfc5`, for delivery through existing PR #4 only. No merge, release, schedule, dependency or version change. The pre-existing brief edit was preserved.

## Composition and scope

Primary surface: **Command / Inspect**. Secondary surface: **Configure**, present only while stopped.

- A focused launch sheet replaces the always-visible provider/session/intent toolbar. New/Resume is a segmented choice; provider and purpose are aligned fields. Resume displays readable conversation titles, provider and dates, with bounded scrolling and keyboard navigation, not clipped UUID options. One primary Start/Resume action; Review changes still prepares context without starting or submitting.
- Running sessions show a single 56px identity/action bar: conversation title, actual provider/purpose/status, repository tooltip, Notes, Context, Stop. Configuration is absent, not a row of disabled controls. A retained session reflects its actual provider without respawning. At narrow pane widths the redundant cwd label yields space to readable provider/status text.
- Code/AI navigation exists once in the application header. Repository/comparison breadcrumbs are separate from workspace actions. Search remains inside each branch popover; no checkout semantics changed. Project knowledge is one compact folder/Context action, not a large promotional card.
- Code view keeps essential actions aligned; layout/full-file options live in View. A pane container query deliberately separates filename/search and actions when the notes inspector reduces available width. Notes now has readable source/body text and horizontal, safe-height actions in both themes.
- Chosen chrome typography is the native Apple/Windows sans family; mono is reserved for code/terminal. Graphite surfaces and restrained existing lime identity remain. The misleading pale insert action and purple notes sparkle were removed.
- Terminal CSS is separated into `workspace.css`, replacing the prior terminal rules rather than appending another override layer. The terminal template is extracted into its own HTML file. The existing Vite inliner now resolves template URLs for either component; Angular template checking still runs.

Backend contracts, provider flags, metadata discovery, permissions, installer source, version 0.8.0, and the raw retained PTY remain unchanged.

## Truthful loading and recovery

- Repository opening uses a branded workspace skeleton with the same header/sidebar regions as the ready application, including the deliberate two-region header at 1024px. The previous artificial two-second minimum was removed. Resolution releases loading immediately; rejection exposes the actual error, Retry and repository selection.
- Session discovery uses three skeleton rows and semantic busy/status state. Refresh hides stale selectable rows until metadata returns. Existing provider/root/list generation cancellation remains intact; changing back to New cannot leave a stuck spinner.
- Starting/resuming immediately displays a cancellable connection surface in the terminal area. It remains until **xterm's parsed visible buffer** contains content after the write callback, not until a timer fires or an ANSI-only chunk arrives. Partial control frames do not dismiss it. Real login/prompt text does dismiss it and remains raw terminal content, never HTML.
- Reduced-motion media disables the skeleton/connection pulse. No fake percentage, manufactured provider log or application delay is introduced. Synthetic latency exists only in explicit deferred test bridges.
- Start failure leaves prepared context intact and offers an explicit Retry session/Dismiss path. No retry, start, Enter or context submission happens automatically. Existing disconnected-session Stop/Start recovery is retained.
- Context disclosure supports keyboard activation, expanded state, outside dismissal and Escape with focus return. Native View/file-list popovers support Escape/outside dismissal.

## Observed RED → GREEN

Each new behavior/layout slice was tested before its implementation. Observed failures included:

1. No launch region; the running view still exposed provider/session/intent configuration.
2. No segmented Resume action or titled/date conversation rows.
3. No single Code navigation or View disclosure.
4. No semantic session-list skeleton or connection surface.
5. Repository loading had no semantic workspace skeleton and retained a two-second delay.
6. Context disclosure lacked explicit expanded state and Escape/outside behavior.
7. Sidebar text was 8px and its 44px header baseline differed from the terminal bar.
8. Code controls were below 32px/12px and overflowed the notes-reduced pane.
9. Running identity displayed only the provider, not the chosen conversation/purpose.
10. A failed launch had no explicit retry while preserving context.
11. Notes used a 44px header, micro typography and insufficiently legible light-mode actions.
12. A resumed session's narrow status line clipped; redundant cwd text now yields space.
13. Narrow repository skeleton used 64px instead of the ready two-region 112px header.
14. Refresh still exposed a stale selectable conversation during unresolved metadata discovery.
15. A final start-dimensions regression caught a 2-column PTY request caused by collapsing the hidden terminal to one pixel. The retained invisible surface now keeps pane-sized geometry; actual renderer start requests are asserted above 80 columns / 20 rows at the primary viewport, without delaying startup.

All existing workflow regressions were retained and adapted to the real new controls. The obsolete-resize fixture now captures one specific old request and restores the normal fixture method: the new layout legitimately resizes replacements, so globally deferring every resize could overwrite the old rejection callback. The renderer unit harness gained only the newly used HostListener decorator stub; lifecycle assertions were not weakened.

## Measured geometry and visual audit

Baseline was rebuilt independently from the exact published HEAD into `/opt/data/cache/scratch/rift-visual-baseline`, using the same synthetic bridge. No source reversion or old package reuse was used to obtain before images.

| Width | Previous running bar | Current running bar | Previous visible controls | Current visible controls |
| --- | ---: | ---: | ---: | ---: |
| 1024 | 105px | 56px | 8 | 3 |
| 1280 | 91px | 56px | 8 | 3 |
| 1440 | 70px | 56px | 8 | 3 |

Both themes match. Counts include visible button/select/summary controls, excluding descendants of closed disclosures. Previous select heights were 33px and action heights 29px, with unequal baselines. Current running controls are uniformly 32px on the same y coordinate. With notes open, terminal pane widths are 460/715/875px at 1024/1280/1440; controls remain inside the pane. The narrow Code toolbar deliberately has two aligned regions rather than arbitrarily wrapping.

Claude-design ten-tell self-audit of the primary flow: **before 3/10** (decorative Context accent rail, unchosen generic type, wrong-surface configuration mixed into operation); **after 0/10** for the audited launcher/running/notes composition. This rubric is not a claim of aesthetic perfection or an accessibility certification. Alignment, readability, real loading behavior and workflow tests are separate acceptance evidence. Existing unrelated legacy/update dialogs were not comprehensively redesigned.

Inspected full-size current dark 1440 resume/running, light 1024 loading/running-notes/selection-notes and the rebuilt baseline. Pixel review caught the pale notes action and clipped narrow status; both received failing regressions and fixes before final captures.

## Current screenshots

All are the actual built Angular renderer and real xterm in Chromium, with an **explicit synthetic native bridge/repository/session/notes fixture**. They are visibly labeled browser previews, not native provider/model runs.

Gallery: `/opt/data/output/riftcode/visual-refresh/index.html`

Verified manifest: `/opt/data/output/riftcode/visual-refresh/screenshot-manifest.json` — **66 current + 18 rebuilt-baseline images**, each with its file SHA-256.

Current matrix for both themes at 1024/1280/1440:

```text
{dark,light}-{1024,1280,1440}-{launcher,resume,list-loading,connecting,running,branch,code-notes,selection-notes,running-notes,review-context,repository-opening}.png
before-{dark,light}-{1024,1280,1440}-{launcher,resume,running}.png
```

Useful full-size examples:

- `dark-1440-resume.png`
- `dark-1440-running.png`
- `light-1024-running-notes.png`
- `light-1024-selection-notes.png`
- `light-1024-repository-opening.png`
- `before-dark-1440-resume.png`

An early mislabeled intermediate loading capture was removed; only the verified manifest is the evidence set.

## Executed checks

- `npm test`: **33 core + 30 installer passed**, no skips.
- `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome npm run test:ui -- --reporter=line`: **55 passed**, including all prior workflow cases, the new vertical regressions and six complete visual-state matrix cases. Includes TypeScript, Angular template checking and production build.
- `ELECTRON_RUN_AS_NODE=1 LD_LIBRARY_PATH=/opt/data/cache/scratch/rift-native-libs/root/usr/lib/x86_64-linux-gnu node_modules/electron/dist/electron --import tsx --test tests/terminal-service.test.ts`: **8 passed** using the real Electron Node runtime/node-pty, not a BrowserWindow/provider run.
- Exact-HEAD baseline build and six independent capture cases: passed.
- `git diff --check`: passed.

Final logs: `/opt/data/cache/scratch/rift-visual-ui-final.log`, `rift-visual-tests-final.log`, `rift-visual-baseline.log`. The existing nonblocking browser missing-resource 404 and Node module.register deprecation warning remain; no Angular runtime/page failure was observed in the successful final UI run.

## Fresh cross-platform package readback

All four packages were regenerated **after the final renderer build**, using the existing cached/pinned dependencies and commands:

```sh
npx electron-builder --mac --x64 --arm64 --dir -c.directories.output=/opt/data/cache/scratch/rift-final-package-mac
npx electron-builder --win --x64 --arm64 --dir -c.directories.output=/opt/data/cache/scratch/rift-final-package-win
node /opt/data/cache/scratch/rift-verify-packages.cjs
```

macOS x64/arm64 and Windows x64/arm64 archives all contain version 0.8.0 and **six byte-exact current runtime assets per package**. Native addon/helper architectures and macOS spawn-helper 0755 modes passed. Main/preload hashes remain unchanged. Final renderer is `index-soLudHW1.js`, SHA-256 `041a9a7858318e186944d63e1caab53a61f9dacdb3f4202207be6bb43296dbde`; CSS is `index-Sc_dPAty.css`.

Readback: `/opt/data/cache/scratch/rift-visual-package-verification.log` and `rift-package-verification.json`. Packaging logs: `rift-visual-package-{mac,win}.log`. Earlier c11df00 renderer packages are superseded.

## Acceptance boundary / parent handoff

No authenticated provider calls, model billing, real-home metadata scan, macOS GUI/Gatekeeper/signing test, Windows GUI/ConPTY acceptance or new Linux BrowserWindow acceptance is claimed. Previously reported Linux GUI limitations still apply. Cross-packaging and browser fixtures do not prove native provider authentication/resume. Owner testing remains necessary.

Independent review `deleg_53f8dd59` found no blocking security or logic defect and confirmed lifecycle guards, retained hidden-terminal geometry, alignment and loading composition. Its concurrent UI run encountered preview-server interference. After the reviewer stopped, the parent ran the full isolated production-build UI suite: **55/55 passed**, including repository-loading reload/retry and all six visual matrices. The parent also independently passed 33 core + 30 installer tests, 8 actual Electron-runtime PTY tests, four-package current-asset/native-architecture readback and the 66 current + 18 baseline screenshot hash manifest. Same-PR publication and its exact revision are recorded in the PR rather than self-referencing this commit.
