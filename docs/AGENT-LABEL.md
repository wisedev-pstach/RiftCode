# Agent UI labels (unreleased 0.8.0)

The approved ordinary AI workspace name is **>_ Agent**. **Review** remains Review. This is a renderer-template copy change, not a terminal or permission-mode change.

## Exact copy changes

| Surface | Previous | Current |
| --- | --- | --- |
| Upright ordinary rail text / accessible name | Terminal / AI terminal | Agent / Agent |
| Idle ordinary identity | AI terminal | Agent |
| Ordinary Dock tooltip | Keep code above a resizable terminal | Dock agent |
| Review Dock tooltip | Keep code above a resizable terminal | Dock review |
| Review's dock return switch / accessible name | Terminal / Show Terminal in dock | Agent / Show Agent in dock |
| Selection menu action | Insert selection in AI terminal | Insert selection in Review when `terminalOpen() && reviewWorkbenchOpen()`, otherwise Insert selection in Agent |
| Notes drawer action | Insert N in terminal | Insert N in Review when `terminalOpen() && reviewWorkbenchOpen()`, otherwise Insert N in Agent |
| Context region, ordinary / Review | Terminal context | Agent context / Review context |
| Provider selector, ordinary / Review | Terminal provider | Agent provider / Review provider |
| Pending context editor, ordinary / Review | Pending terminal context | Pending agent context / Pending review context |

The original `>_` prompt icon and `vertical-rl` / `upright` lettering are preserved. Dock still visibly says **Dock ↓**, Unpin still says **Unpin ×** with accessible **Close dock**, and Stop remains separate. Running native conversation titles and Edit/Review session identity are not replaced by a generic Agent heading. Technical terminal diagnostics still describe the actual terminal.

## Strict vertical RED → GREEN

1. Rail/icon/identity regression failed with expected Agent but received Terminal; minimal template labels changed; focused Chromium test passed.
2. Dock/switch regression failed with expected Dock agent but received Keep code above a resizable terminal; tooltip and switch copy changed; focused Chromium test passed.
3. Selection/context regression failed because Agent context was absent; matching action and accessible template labels changed; focused Chromium test passed, retaining selected diff without Start or input/Enter.
4. Destination-label review correction: with an active docked Review, the selection assertion failed because `Insert selection in Review` was absent; only its template text became conditional, then the focused test passed. The notes assertion independently failed because `Insert 1 in Review` was absent; only that template text became conditional, then all three focused destination/pending-context cases passed. Both new behavioral regressions verify actual selection/note context goes to the named Review or Agent slot as one literal `paste:true` insertion, no appended Enter, no review submission, and no extra Start/Stop/input. The existing pending-context case also verifies `Pending review context` with no native calls; Review context/provider accessible labels are explicitly covered.

Existing selector expectations were updated to the exact new names without removing lifecycle, geometry, byte/submission, session-identity or direct-action assertions. Four additional screenshot cases exercise both themes at 1024×900 and 1440×900. The destination correction adds two regressions; it does not change `contextTerminal()`, insertion handlers, routing or native APIs.

## Independent review

Initial review caught a destination-copy mismatch. After the two conditional-label fixes, read-only re-review `deleg_be00eaae` approved with no security/logic concerns. It checked routing/labels and per-slot no-Enter regressions, but did not execute browser tests. Native acceptance remains separate.

## Verification

- `npm test`: **89 core + 30 installer passed**, zero failed/skipped.
- `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome npm run test:ui -- --timeout=90000`: **111 passed** (previous 109 + 2 destination regressions), complete isolated run after the final template change. First complete attempt: 110 passed, one existing `late stop cannot clear a replacement start in another repository` fixture race (`window.finishStart is not a function`); no unrelated fix was made, and a fresh complete isolated rerun passed all 111.
- TypeScript/Angular checking and renderer build passed as part of the UI command; `git diff --check` passed.
- Twelve fresh PNGs from that final complete rerun visually inspected through dark/light contact sheets: `/opt/data/output/riftcode/agent-label/{dark,light}-{1024,1440}-{rail,agent-docked,review-docked}.png`. Synthetic-browser banner is present. Upright Agent rail and dock switch fit both widths/themes; file-above-dock layout remains intact. Exact screenshot sizes/hashes are recorded in `/opt/data/output/riftcode/agent-label/destination-screenshot-manifest.json`.
- Owned Playwright preview server was torn down; port 4173 has no listener.
- Parent reran the **9 focused Agent/destination/screenshot browser cases** successfully against the final renderer and independently passed **89 core + 30 installer tests**. A parent complete browser attempt was interrupted by the 420-second tool deadline after 91 cases; it is not counted as a complete pass. Parent parallel packaging and Electron-runtime attempts also timed out under host contention; their incomplete outputs do not qualify the final build. The tracked serial retry subsequently passed all **89 actual Electron-runtime tests** and verified **all four current packages**, six exact runtime assets each; incomplete attempts remain non-passes.
- Evidence logs: `/opt/data/cache/scratch/rift-destination-selection-{red,green}.log`, `rift-destination-notes-red.log`, `rift-destination-green.log`, `rift-destination-ui.log` (first complete attempt), `rift-destination-ui-rerun.log` (111 passed), and `rift-destination-core.log`, all in that same scratch directory.

No core/backend, CSS/layout, technical IDs, IPC, types, file paths, provider native argv, PTY/session/checkpoint behavior or version metadata changed. No authenticated provider/model calls, account writes, packaging, commit or push were performed. Browser fixtures and harmless POSIX PTY regressions do not establish native Windows ConPTY, macOS app acceptance or authenticated provider acceptance; those limits remain unchanged. Earlier parent verification (before this destination-copy correction): **89 core + 30 installer + 109 complete Chromium UI + 89 actual Electron-runtime tests**, four unsigned macOS/Windows x64/arm64 packages with six byte-exact runtime assets per archive plus native architectures and dependencies, renderer `index-BCCthYT7.js`, SHA-256 `0f5f6be7c9476c30132dc698b94f384d1b0a9ae92489beafe1b9a4ca95dfe1cf`. That renderer/package evidence is now superseded. Current renderer: `index-COh7CSMW.js`, SHA-256 `93235d1935cea77f38780e4f9e737656d0d3435fb2533c66a09456c7b31f82b7`; current source template SHA-256 `1f1f2728f7e97b3f187c37f581a5045dc84555587c9d7a64b3e568a22f8231dc`. Parent final serial retry regenerated the missing ARM64 targets, validated the current x64 outputs, and read back all four unsigned archives with six exact current runtime assets each plus native architecture/dependency checks. All 89 Electron-runtime tests passed serially. Final package receipt: `/opt/data/cache/scratch/rift-agent-final-package-verification.json`. Cross-packaging is not native GUI acceptance; publication remains PR-only.

Existing Node DEP0205 deprecation notices and the fixture browser's missing-resource 404 remain non-failing; neither required product changes.
