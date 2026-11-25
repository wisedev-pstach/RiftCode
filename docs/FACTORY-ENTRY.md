# Factory entry in the actual App

## Behavior

When the preload exposes `window.rift.factory`, opening a repository lands on **Workflows**, with accessible Creation and Review sections. Older preview/test bridges without that optional field retain their original direct-to-Review behavior.

- Creation mounts the standalone `FactoryWorkbench` only on its first explicit visit. The frozen API object is passed through unchanged, with the current repository root and name.
- Review is **never conditionally destroyed** during mode changes. Its wrapper uses `display: contents` when selected, and `hidden` plus `inert` otherwise. Existing Agent/Review host nodes, actual xterm nodes, drafts, Notes selection and docking survive.
- Creation also stays mounted after first entry. Its `exit` output returns to Home or Review. Repository changes update its root input, allowing its own generation-fenced context reset to discard old repository drafts.
- Navigation never invokes Stop, Start, approval or provider execution. If a previously visited Creation reports a running/stopping native run, a topbar shortcut remains available in Home and Review. Factory polling and native work remain owned by the workbench/service.
- The compact Workflows button supplements—not replaces—the existing upright Notes / Agent / Review rail. Repository selection, theme and native drag-safe topbar remain available in Creation and Home.

## Verification

Evidence directory: `/opt/data/output/riftcode/software-factory/entry/`.

Initial RED: the actual pre-change App lacked the `Choose your workflow` heading; the new entry test failed for that missing feature while the legacy bridge test passed. See `red-results.json`. A second layout RED caught missing explicit `no-drag` on new landing buttons; scoped styles corrected it.

Final focused integrated suite: **12 tests passed**. It exercises the real App and real standalone factory component, not a factory-only prototype. A cloned synthetic bridge uses no native factory storage, credentials or provider commands. One integrated test substitutes **real harmless scratch POSIX PTYs** through the production `TerminalWorkspace`, retaining both Agent and Review session identities and exact host/xterm DOM objects across Home / Creation / Review transitions, with zero input bytes. A separate bridge test checks retained Notes and docked Agent identity plus Enter-free note/selection routing. The factory running state is explicitly synthetic; these tests do not establish authenticated native factory execution.

Screenshots: dark/light × 940/1024/1440 pixels × Home/Creation/Review = **18 PNGs**. Mac traffic-light clearance and interactive `no-drag` regions are asserted. Actual 1440-dark Home and 940-light Creation screenshots were visually inspected; text and controls were legible, with no overlap or clipped primary controls.

`ngc -p src/renderer/tsconfig.app.json --noEmit` passed. Isolated renderer build passed; Vite emits its existing large-chunk warning. No full regression, packaging, publication or actual provider invocation was run for this entry slice.

## Focused replay

The checked-in test uses the normal project Playwright config after a normal renderer build:

```sh
CHROMIUM_EXECUTABLE=/path/to/chrome npx playwright test tests/ui/factory-entry.spec.ts
```

During parallel development, local ignored configs `.local/factory-entry.vite.config.ts` and `.local/factory-entry.playwright.config.ts` built only the renderer into `/opt/data/cache/scratch/rift-entry-renderer`, and previewed it on **4177**, without overwriting canonical `app-out` or occupying the factory-only worker's port. On this host:

```sh
npx vite build --config .local/factory-entry.vite.config.ts
CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1248/chrome-linux64/chrome \
  npx playwright test --config .local/factory-entry.playwright.config.ts
npx ngc -p src/renderer/tsconfig.app.json --noEmit
```

The local configs are verification scaffolding, not shipped app configuration. `source-hashes.json` ties the entry evidence to renderer, test and fixture inputs; changes to those inputs require rerunning the affected evidence.
