# Software factory: implementation decisions

This is a development plan, not a claim that the runtime or UI is implemented. Confirmed product scope is in SOFTWARE-FACTORY-BRIEF.md.

## Isolation

- Keep Agent and Review interactive PTYs and their lifecycle unchanged. Factory runs use a separate, bounded main-process non-PTY executor.
- Store factory requirements, plans, diagrams, snapshots and test receipts outside the user's checkout. Validate that storage remains outside the checkout even when preview userData is overridden. No automatic checkout-local copy or global provider-skill installation.
- User-generated factory documents are not this repository's implementation documentation: the former are local unversioned artifacts excluded from ordinary Git staging; the latter may be versioned as normal RiftCode development docs.
- No staging, committing, resetting, Git initialization, merge or release is implicit in choosing Creation or accepting a task review.

## Evidence and queue

- Separate provider-finished, implementation-produced, checks-verified and ready-for-review states. Provider prose or JSON cannot mint an app-owned test receipt.
- Queue individual immutable task revisions while the approved plan continues sequentially. Human review is voluntary in timing and independent of execution; it does not silently accept or merge.
- Capture actual dirty/untracked pre-task bytes and file modes, not just HEAD. A later task or rework must never rewrite an earlier task's review. Preserve original index and worktree.
- Failed prerequisites block dependent work. Stop prevents queue advancement. Retry counts, run time, output and evidence storage are bounded; interruption is not success.
- Verification commands are explicit approved executable/argv records with shell disabled. They can still execute arbitrary repository code with ordinary OS/network access; do not describe the runner as a sandbox.
- A check that changes the source does not verify the final source automatically. Detect drift and rerun within bounds or require reconciliation.

## Provider capabilities

- Canonical skills are provider-neutral Markdown included in bounded context packets. Native SKILL.md discovery and subagent formats are optional/provider-specific, not correctness requirements.
- Use version/capability-gated structured CLI execution. Do not infer completion from terminal silence, bracketed-paste readiness or a step-finish event.
- No permission-bypass flags, silent automatic tool approval, persisted project trust, provider switching or implicit credential handling.
- Noninteractive modes can skip startup trust dialogs and execute existing project hooks/MCP configuration. Require explicit factory consent covering the repository/provider configuration before launch; do not promise those modes reproduce interactive trust dialogs.
- Unsupported versions, safe Windows launcher gaps, missing tools or unresolved approvals are Blocked/manual handoff rather than successful automation.
- Provider requests may consume the user's existing subscription/API budget when launched in the finished app. Development tests use harmless fixture processes only; no real model requests are authorized in this implementation session.

## Integration order and ownership

1. Add tested shared DTO/storage/snapshot modules, independent verifier/process modules, provider/skill adapters and an explicitly labeled UX prototype in disjoint files.
2. Review their exported contracts, then implement the serialized factory orchestration service and real fixture end-to-end execution.
3. Integrate trusted-sender/repository-generation IPC, packaged skill resources and safe Angular Creation/Review UI. Preserve existing welcome/repository selection, Notes, Agent docking, full-workspace Review, drafts/sessions and update isolation.
4. Add safe document/diagram review, requirements/plan approval and task-revision review. Never render arbitrary active HTML/SVG or load remote diagram resources.
5. Resolve independent review findings, freeze source, run complete regression/build/native/package gates as applicable, inspect current screenshots, bump version and publish a PR with tested native handoff commands. No main merge or release without a new request.
