# RiftCode software factory — requirements brief

Status: discovery and workflow definition, not implemented. Branch `feat/software-factory`, based on merged main `270e1b9f52030f6adc49b0d196b32e5320d7ad1a` (0.8.2). This document is development documentation for RiftCode itself; generated planning files in a user's project have a separate local-only policy.

## Confirmed user requirements

- Opening Rift presents a deliberate Creation / Review choice.
- Review retains the existing working review experience and native provider sessions; this is not permission to remove Notes, Agent docking, checkpoints or current file review/navigation.
- Creation is a tailored software-factory workflow: gather requirements, produce a plan and architecture (including diagrams), implement scoped tasks and review the actual implemented code changes task by task.
- Supporting project docs and diagrams are real unversioned/local-only files: reviewable inside Rift, not included in the code PR. Merely leaving files untracked does not prevent accidental staging; design and verify explicit isolation/exclusion rather than promising that an ordinary untracked file cannot enter a PR.
- Provide reusable skills for agentic implementation loops and tests, ideally across the existing Claude Code, Codex and OpenCode providers.
- The agent must actually exercise its implementation. Test evidence cannot be inferred from terminal prose, claimed completion or a mocked response.
- The user's original message stopped at 'and then'; their follow-ups clarified implemented-code review and agentic self-testing. No additional final deployment/merge stage has been authorized.

## Proposed implementation principles (not yet accepted detail)

- A provider-neutral instruction bundle for requirements/acceptance criteria, architecture/task planning, task implementation, test-and-repair and evidence-based review. Adapt transport to each provider's verified capabilities; do not assume identical native skill discovery or silently install into global provider homes.
- Within-task loop: implementation -> actual scoped checks -> diagnose/fix failures -> rerun -> present task diff, criteria and evidence. Retry/time limits, Stop and honest Failed/Blocked states are necessary; no endless loop or treating missing tools as success.
- Verification uses real execution receipts/logs tied to a source revision or working-tree snapshot, plus appropriate unit/integration/build/UI checks. Native-provider output alone is not test evidence. Fixture checks and authenticated-provider execution must be labeled separately.
- Define per-task code boundaries against the pre-task working tree, including existing dirty/untracked files, without silently committing, staging, resetting or discarding work. Supporting artifacts must not contaminate the task's code diff.
- Require explicit policy/consent for test commands, provider execution, network/dependency installation and other side effects. Preserve native login/trust/tool-approval prompts; never auto-answer them or silently switch providers.
- Keep existing data, sessions, notes, previews and updater identity intact. PR-only delivery with a version bump after scope is settled; no main merge, release, schedules, paid-provider calls or store/deployment actions are authorized here.

## Confirmed execution/review policy

User selected queued individual review: after approval of a plan, the factory may implement and test its tasks sequentially without waiting for human review of each finished task. The user decides when to enter review. A task ready for review is not automatically accepted or merged. Preserve immutable per-task diff/test/artifact snapshots so later implementation cannot rewrite an earlier queued review. Keep failed/blocked tasks explicit and respect task dependencies; do not skip failed prerequisites or exceed the approved scope merely to continue the queue. Review rejection/rework must create a traceable new revision rather than replacing the evidence already reviewed. Native provider/tool approval prompts remain under user control.

## Discovery evidence

Existing application is Angular/Electron with native Claude Code, Codex and OpenCode terminals and working-tree prompt checkpoints. Current released-source metadata is 0.8.2. No software-factory runtime exists yet. Review service constraints, snapshot retention, safe document/diagram rendering, provider capabilities and verification-command execution before choosing architecture.
