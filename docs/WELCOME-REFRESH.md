# Repository welcome refresh — 0.8.2 candidate

Request `1569822982984044624`. Configure first, Inspect second; no startup-root/backend changes.

## Exact behavior

- A 440px maximum-width, left-aligned group is balanced within the existing entry canvas. Restrained RIFT /code identity and the actual app version remain; no hero, tiles, recent-project invention or extra services.
- Heading: **Open a Git repository**. No-error copy: **Choose an existing checkout to start reviewing code.**
- One primary **Choose repository**, then secondary **Retry** only on error. Both are 38px high, separated by 12px. Existing dark/light workspace tokens supply colors.
- Errors containing `not a git repository` (case-insensitive phrase match) show **This folder is not a Git repository. Choose an existing checkout.**
- Other failures show **Could not open the repository. Try again or choose another checkout.** Their original message is not discarded or misclassified as an empty workspace.
- Every nonempty original error remains verbatim Angular-escaped text in a closed-by-default native **Technical details** disclosure. The preformatted body wraps long paths and scrolls within 132px; at heights up to 480px, reduced spacing and a 64px details body preserve the whole group at the tested 360px height.
- Choose still calls the existing `window.rift.chooseRepository()` bridge. Pending selection says **Choosing…**, disables both welcome actions, and guards duplicate dispatch. Cancellation preserves the prior screen/error and re-enables actions. Picker rejection preserves its detail; a later explicit successful choice accepts the bridge's returned repository normally.
- Retry still calls `window.rift.openRepository()`. Existing repository-loading skeleton/live status appears only while the real promise is pending; failures return to the error state. There is no fake progress, successful empty fallback, Git initialization, folder deletion, authentication or provider call.
- Changes are confined to welcome template/styles, welcome error presentation and repository action guards, plus the standalone welcome test and documentation. Saved Review/navigation changes remain intact.

## Focused RED → GREEN evidence

Logs: `/opt/data/output/riftcode/welcome-refresh/`.

| Slice | Observed RED | GREEN |
|---|---|---|
| Friendly message + original escaped disclosure | `red-error.log`: 1 failed, raw IPC message instead of friendly alert | `green-error.log`: 1 passed |
| Single primary + aligned, proportionate layout | `red-layout.log`: 1 failed, missing grouped single-primary surface | `green-layout.log`: 5 passed |
| Picker busy/cancel/retry bridge behavior | `red-picker.log`: 1 failed, missing disabled Choosing state | `green-picker.log`: 6 passed |
| Whole short-height group with long expanded details | `red-short-height.log`: 1 failed, group bottom 429.46875 > 336px | `focused-final.log`: 12 passed (33.0s) |

Initial harness discovery needed a `listAgents` stub required by existing startup; those harness errors were fixed before recording feature RED. The final run asserts no browser page/console errors. A renderer-only favicon 404 was eliminated in the test route; the host Node runner still emits its existing DEP0205 deprecation warning.

Final 12 focused tests cover both themes × 1024/1440 at 600px height, geometry/hit-testing, single-primary hierarchy, optional original diagnostics, injected-HTML escaping, cancellation, duplicate action protection, picker failure and successful replacement, deferred retry/loading, unknown errors, and 1024×360 long-detail fit. No full suite, build, package, commit or push was run by this welcome worker.

## Preview and rerun

Verified against the live renderer source, using the existing inline-Angular-template plugin and Vite (no shared `app-out` write/build). An isolated scratch Playwright config selects only `welcome.spec.ts` and the running 4173 renderer. The normal repository Playwright config can run this file after the parent's approved build as well.

```sh
# Renderer-only preview, from the repository; keep in a foreground terminal.
taskset -c 0 node --import tsx --input-type=module -e "import {createServer} from 'vite';import config from './electron.vite.config.ts';const server=await createServer({...config.renderer,configFile:false,root:'src/renderer',server:{host:'127.0.0.1',port:4173,strictPort:true}});await server.listen();"
# Focused execution used for this verification:
CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome taskset -c 0 npx playwright test --config /opt/data/cache/scratch/rift-welcome.playwright.config.mjs
```

For template-only preview edits, restart the renderer or invalidate the owning component module so the existing inline-template transform re-reads the HTML. Port 4173 is stopped at handoff. Parent owns full candidate verification after both workers finish.

## Independent review

Read-only review `deleg_7ec463f6` approved the welcome/error changes with no security or logic blockers. It inspected escaping, friendly/unknown errors and picker single-flight/cancel handling; it did not execute browser tests. Existing-repository picker coverage and portable screenshot output paths are nonblocking follow-ups. Native OS picker acceptance is still separate.

## Current screenshots and limitations

`/opt/data/output/riftcode/welcome-refresh/synthetic-{dark,light}-{1024,1440}-{welcome,error,details,loading}.png` plus `synthetic-dark-1024-short-details.png`: **17 fresh screenshots**. Every capture is labeled synthetic browser bridge / no native picker or private data. The neutral screenshot explicitly selects the existing no-error presentation using an empty synthetic rejection; it is not a claim that native startup now returns an empty success. Deferred loading is driven by a held bridge promise, not a timer.

Inspected the gallery and full-size dark error, light details and revised short-height details screenshots. Actions align, only Choose is primary, and expanded diagnostics are bounded without clipping the short-height group. Design audit: 0/10 anti-slop tells; preserved native product typography and intentional narrow Configure group rather than a marketing hero.

This verifies renderer behavior through an explicit substitute bridge, not native Electron folder-dialog execution, OS integration, native Git discovery, credentials or cloud persistence. Native Windows/macOS acceptance and the full candidate suite remain parent-owned.
