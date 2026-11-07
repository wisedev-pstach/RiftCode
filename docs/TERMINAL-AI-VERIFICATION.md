# Terminal workspace verification — 0.8.0

Verification is against the uncommitted `feat/terminal-ai-workspace` working tree based on `ec48372d2c1d2aeaa3e82bdb1b49413687a22cbb`. No commit, push, merge or release was performed.

## Executed checks

- `npm test`: **15 core + 30 installer passed**, no skips. Includes genuine POSIX PTY fixture execution, raw TTY input, multiline bracketed paste bytes, resize, retained state, PID cleanup, stubborn-process termination, natural-exit descendant cleanup and cancellation after the final resolver await. The default command now runs the installer suite too.
- `npm run test:ui` with `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome`: **9 passed**. This also reruns Angular/TypeScript typecheck and the complete production build.
- `ELECTRON_RUN_AS_NODE=1 LD_LIBRARY_PATH=/opt/data/cache/scratch/rift-native-libs/root/usr/lib/x86_64-linux-gnu node_modules/electron/dist/electron --import tsx --test tests/terminal-service.test.ts`: **4 passed** using Electron 43.4.1's actual Node runtime and native node-pty. This is not an Electron BrowserWindow acceptance test.
- `git diff --check`: passed.

### Bugs caught and fixed with observed RED → GREEN

1. After selecting a commit and searching for a different commit, the default working-tree comparison disappeared. The new Chromium test failed with expected option count 1, received 0. Filtering now preserves both working-tree and current-branch fallback choices as well as the active selection. Tests cover keyboard selection, Escape, case-insensitive filtering, both clear controls and no-results states without selection changes.
2. A rejected terminal read stopped polling but left the status badge saying `running`. The new Chromium assertion failed with expected `Connection unavailable`, received `running`. Disconnect state is now reactive and the badge reports connection loss without falsely declaring the native process exited. A substitute-bridge test verifies exactly one failed read, no automatic restart, disabled insertion and explicit Stop/Start recovery.
3. Switching repositories during a pending terminal start left the new repository permanently `Starting`. Both delayed-start Chromium cases first failed with expected `No active session`, received `Starting`. The repository-root effect now clears starting, session, error and disconnect state while invalidating the old generation; it never starts a replacement process. Tests verify enabled Start/disabled Stop immediately after switching, no automatic start, and both late resolve and late reject while an explicitly requested replacement start is pending. Neither old completion clears the replacement's Starting state, installs an obsolete session, or exposes an obsolete error; the replacement then starts successfully in `/fixture/other`. RED/GREEN logs: `/opt/data/cache/scratch/rift-pending-start-{red,green}.log`.

## UI evidence

Real Chromium and xterm.js, with a clearly labeled substitute preload bridge, synthetic repository data and no provider requests. Screenshots are regenerated under ignored `test-results/`:

- `terminal-dark.png`: running Codex-selected fixture, provider/intent controls, OS-user permission warning, literal-insertion guidance.
- `terminal-light.png`: light theme, stopped session, enabled Start and disabled Stop.
- `terminal-notes.png`: selected review note, Copy notes, Insert selected notes (1), diff insertion and sidebar context.
- `source-jump.png`: wrapped ANSI-styled reference to unchanged `src/my file.ts:14:2`; full source viewer highlights line 14 and displays column 2.
- `branch-search.png`, `branch-search-filtered.png`, `branch-search-no-results.png`: clear controls and active selection retained through filtering/no-results.
- `terminal-disconnected.png`: visible Connection unavailable status and explicit recovery guidance.
- `terminal-repository-switch-resolve.png`, `terminal-repository-switch-reject.png`: new `/fixture/other` root, No active session, enabled Start and disabled Stop after invalidating a pending start.

Screenshots were opened and inspected, not merely generated. At 1440×900 the controls and warnings are visible without overlap; long target branch labels are truncated in the compact native select and remain available in its options. The preview emits a nonblocking missing-resource 404; Node emits a module.register deprecation warning. Neither failed the tests.

## Actual cross-platform package artifacts

Both commands completed successfully after the final renderer build:

```sh
npx electron-builder --mac --x64 --arm64 --dir -c.directories.output=/opt/data/cache/scratch/rift-final-package-mac
npx electron-builder --win --x64 --arm64 --dir -c.directories.output=/opt/data/cache/scratch/rift-final-package-win
```

Real target Electron 43.4.1 distributions were packaged by electron-builder 26.15.3. All four packages were regenerated after the pending-start lifecycle fix, replacing the stale `index-CVo4eXfS.js` evidence. All four actual `app.asar` archives were inspected: version 0.8.0, node-pty runtime, node-addon-api, and the byte-identical final renderer `index-I-jVlWT9.js` are present. Exact target binary architecture was checked from Mach-O/PE headers, not directory names. Native assets are outside asar. Fresh packaging logs: `/opt/data/cache/scratch/rift-pending-start-package-{mac,win}.log`. The regenerated terminal-dark, source-jump and repository-switch screenshots were opened and inspected.

| Target | Native addon bytes | Additional verified assets |
| --- | ---: | --- |
| macOS x64 | pty.node 52,864 | spawn-helper 9,248 bytes, mode 0755 |
| macOS arm64 | pty.node 85,496 | spawn-helper 50,480 bytes, mode 0755 |
| Windows x64 | pty.node 303,104; conpty.node 312,320 | conpty_console_list.node, exact-arch OpenConsole.exe and conpty.dll |
| Windows arm64 | pty.node 293,376; conpty.node 302,592 | conpty_console_list.node, exact-arch OpenConsole.exe and conpty.dll |

Local evidence: `/opt/data/cache/scratch/rift-package-verification.json`; assertion script `/opt/data/cache/scratch/rift-verify-packages.cjs`. These are scratch artifacts, not distributed releases.

## Acceptance boundary

The hosted Linux Electron GUI smoke attempt with `--no-sandbox --headless --disable-gpu --rift-preview` failed with missing DBus/GSettings diagnostics and SIGSEGV (exit 139). The successful native Electron check above therefore establishes Electron Node-runtime/PTY execution only; UI screenshots are Chromium substitute-bridge evidence. Cross-packaging does not establish native macOS app launch/signing/Gatekeeper or Windows ConPTY/cmd behavior. Those still require owner testing. Actual authenticated Claude Code/OpenCode/Codex sessions were deliberately not run; no credentials, provider login or billed requests were used.

The separately owned Mac preview installer files were not modified by this lifecycle fix. Its 30-test `.test.cjs` suite is included in the current default `npm test` command and passed in this verification run.
