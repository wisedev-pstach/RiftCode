# Folder change status (0.8.3)

## Behavior

Folder indicators are **Explorer-only**. Changes retains the exact base flat file-list markup and behavior: no folder rows, folder metadata, or expand/collapse controls. Explorer folder rows summarize all matching changed descendants, independently of expansion. A means added, M modified, and A/M both. Existing D (deleted), R (renamed), and U (untracked) conventions are preserved, including combined kinds. Unchanged folders have no indicator.

The flat Changes list retains its original file order, exclusion/hide-reviewed filters, file statuses, keyboard activation, and review controls. Explorer summaries follow its file-name inclusion filter; they do not inherit Changes-only filters. Summaries recompute from actual comparison files, not visible expanded rows.

## Minimal Explorer presentation

Folder status is quiet monospace text, without a border, background, or chip. A/M is a single compact group. Explorer shares status/count columns across nested folder rows using CSS subgrid; ordinary A/M cases reserve only three characters, while longer combinations can grow the common status column. Counts remain subdued plain numerals in a separate aligned column. Existing left review checkboxes, folder icon positions, and depth indentation are preserved.

## Actual-App preview

The presentation fixture is separate from broad functional status fixtures. It shows a synthetic interface-kit repository: added docs, modified tests, and expanded src containing a collapsed mixed added/modified components folder. A source diff is open, not the Agent startup screen. It performs no provider/account/network actions.

Current screenshots under `/opt/data/output/riftcode/folder-change-status/`:

- `explorer-minimal-preview.png` — dark, 1440px; preferred Explorer example.
- `changes-flat-preview.png` — dark, 1440px; unchanged flat Changes list with the same realistic fixture and open diff.
- `explorer-minimal-dark-940.png`, `explorer-minimal-dark-1024.png`.
- `explorer-minimal-light-940.png`, `explorer-minimal-light-1024.png`, `explorer-minimal-light-1440.png`.

Earlier boxed-badge captures, Changes folder-tree captures, and `example-badges.png` are superseded historical evidence and do not represent the current scope or presentation.

## Focused verification

`tests/ui/folder-status-visual.spec.ts` checks both themes at 940/1024/1440: no badge/count backgrounds, no status border, shared metadata geometry across root/nested rows, visible full components label, viewport bounds and center-point hit testing, left checkbox ordering, and icon x positions identical to the existing flex-row layout. Functional tests assert Changes contains zero folder rows/expand controls, preserves every nested file path in input order, and retains exclusion, hide-reviewed, review marking, and Enter activation. Explorer tests retain status/filter/collapse/keyboard/live-update coverage; node tests cover aggregation and the production version comparator.

Use the worktree-local `playwright.folder-status.local.ts` (port 4177, `.local/folder-status-results`) and worktree-owned `app-out`. The shared dependency symlink must not be reinstalled. Parent owns independent review and final combined regression gates; this document does not claim the full UI suite passed.
