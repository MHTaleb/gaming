# Runtime Zero execution contract

Scope: this directory and its descendants. You are an implementation agent working for Housseyn. Execute these specifications; do not merely summarize them. Respect the host's higher-priority rules and the user's current instructions.

## Start every session

1. Read START_HERE.md, docs/DECISIONS.md, docs/AGENT_HANDOFF.md, and the latest handoff, if one exists.
2. Inspect `git status --short` and the active branch. Preserve existing user edits. Work inside runtime-zero unless a ticket explicitly requires the root path-scoped instruction or root workflow.
3. Read reviews/README.md and run `node tools/reviews.js --next` before selecting work. Follow the standing review protocol at session start and between tickets; read JSON manually if Node is absent. Then read backlog/backlog.json. Run `node tools/backlog.js --ready` when Node exists. Without Node, read the JSON directly and execute the Node bootstrap in docs/SETUP.md first.
4. Resolve review requests that hold the affected work first; submitting fixes is not validator acceptance. Check `node tools/reviews.js --gate <ticket-id>` before advancing a ticket. Resume an owned `doing` ticket, or choose the highest-ranked `next` ticket. Every dependency must be `done`. When none is ready, promote the earliest-phase `later` ticket whose dependencies are done and whose decision gates are satisfied. Run validation after promotion. Do not activate optional expansion work without its gate.
5. Read all ticket `refs`, `steps`, `outputs`, `checks`, and `dod` before editing. A planned output need not exist yet. A referenced specification must exist.

## Work discipline

- Owner rule (2026-09-21): do not block work that can safely and correctly proceed. Only a concrete defect or missing prerequisite that prevents the affected ticket's outcome may hold that ticket. Tooling cleanup, documentation polish and redundant proof requests are nonblocking when a verified working route exists. Follow the proportional-review policy in reviews/README.md; do not manufacture a dependency on maintenance.

- Set one ticket to `doing`, record `owner` as the actual agent/session identifier, then implement it. Copilot with DeepSeek selected may be one agent, not two independent workers. Use one writer at a time; separate agents must explicitly hand off ownership.
- Install missing required tools on the user's actual machine under docs/SETUP.md. A cloud runner cannot certify the laptop. Do not mark setup done based on this repository's CI.
- Implement the smallest complete outcome. Split large work into dependency-linked children before claiming completion. Keep identifiers stable.
- Use real tool responses. Never fabricate logs, files, screenshots, seeds, model versions, benchmark numbers, or accepted product decisions. A stub, disabled adapter, or mock test is not a working integration.
- Keep proprietary secrets, personal paths in logs, model weights, caches, virtual environments, and generated bulk candidates outside Git. Keep final approved game assets and sanitized provenance in Git, subject to size policy.
- No paid generation services or automatic cloud fallback. Hosted coding-model access is a separate account capability; do not promise offline reasoning or free hosted DeepSeek usage.
- Do not install every future model at bootstrap. Install per phase, benchmark one GPU workload at a time, and record failures rather than hiding them.
- Do not silently change gameplay, architecture, acceptance thresholds, test fixtures, or a failed seed set to make a gate pass. Propose substantive changes in docs/DECISIONS.md and record their rationale.
- Commands that require administrator access, a restart, credentials, or explicit license acceptance may require Housseyn's action. Explain the exact blocker and resume independent work. Never enter invented credentials, accept licenses for him, or disable approval controls.
- Do not publish the game, purchase software, change billing, push to main, or merge a PR automatically. Use a feature branch and a reviewable commit/PR for implementation work.

## Completion contract

`done` requires all dependencies done, all acceptance criteria satisfied, and a nonempty `evidence` array. Each entry includes `command`, `result`, `artifact`, and `environment`; use `result: passed` only for an actual passing check or recorded human approval. Commit a concise sanitized evidence report under reports/. Runtime artifacts may be ignored; the report must retain their hash/location and key measurements.

Keep `blocked` for a real external blocker, with `blockedBy`, attempted actions, and the next unlocking action. Keep dependent unstarted work `later`. `next` means immediately executable. `doing` requires an owner. Do not mark a skipped check passed. If there is no way to verify an outcome, keep the ticket open.

At handoff, update backlog JSON and the session report together. State completed ticket IDs, changed paths, commands and outcomes, unresolved blockers, next eligible ticket, and any running services. Validate the backlog and run relevant gates. Stop on a real blocker, not because writing a plan feels sufficient.

## Standing review response and submission duty

Follow reviews/README.md without waiting for another custom user prompt. Validator requests live in reviews/RV-nnn/request.json; write your fixes/evidence to response.json. Only Codex as validator writes verdict.json. Check relevant remote review updates safely; fetching alone does not integrate them. Never self-approve, delete a gate, or alter review expectations to make checks pass. At each coherent batch (at most three completed tickets), phase boundary, and before main integration, submit a review request using reviews/SUBMISSION_TEMPLATE.md. This is a session/CI workflow, not an installed always-on agent or automatic independent review service.
