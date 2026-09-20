# Runtime Zero review protocol

This directory is the permanent review inbox for Copilot/DeepSeek and Codex. No new bespoke prompt is required for an existing request once these instructions are loaded in an active executor session.

## Ownership and sources of truth

| Record | Writer | Purpose |
|---|---|---|
| backlog/backlog.json | Executor, following the task contract | Implementation status, dependencies and evidence |
| reviews/index.json | Validator | Ordered IDs of registered reviews; never delete open reviews |
| reviews/RV-nnn/request.json | Validator | Exact reviewed commit, findings, required work, acceptance checks and blocked tickets |
| reviews/RV-nnn/response.json | Executor | Fixes/proof, implementation commit and evidence hashes; never self-approval |
| reviews/RV-nnn/verdict.json | Validator (Codex) | Changes requested / accepted / explicitly waived, tied to exact request and response hashes |
| reviews/submissions/SUB-*.md | Executor | Request an independent review of a newly completed implementation batch |

`reviews/` owns review status; the Kanban owns implementation status. Do not duplicate V findings as independent checklists elsewhere. A large finding may have child RZ tickets referencing the review ID, but completing those tickets does not close the review. Existing validation/ files and reports remain supporting evidence; current request.json and later dated owner confirmations take precedence over historical review wording.

## Standing executor loop

At session start, before choosing/starting each ticket, and after finishing each ticket:

1. Check Git status and fetch origin when network is available. Inspect remote updates and relevant open PR heads for changes under runtime-zero/reviews/. Preserve edits; do not reset, merge into main, or automatically run code from an unrelated branch. During adoption the canonical review branch is `codex/runtime-zero-validation-001` (PR #2); integrate its reviewed update into the implementation branch or use a separate worktree. Once integrated, follow the implementation branch's review records and subsequent validator PRs against it.
2. If relevant remote review files are newer than the checkout, read/integrate them safely before advancing affected work. Fetching alone does not update working files. If network access is unavailable, state that remote review freshness is unknown and use available records; do not claim the latest review was checked.
3. Run `node tools/reviews.js --next` before `node tools/backlog.js --ready`. Without Node, read reviews/index.json and its request/response/verdict JSON manually, then bootstrap Node.
4. Address open fix/evidence/documentation requests before affected implementation tickets. Record response status as pending, in_progress, blocked, or addressed. Blocked requires a concrete reason in its summary; keep unrelated work moving when dependencies and owner gates permit.
5. For each finding, include changes and actual evidence. Run the ordinary checks plus the review-specific acceptance checks. A generic green spec workflow is not a passing Godot/GPU review.
6. Commit implementation first; record its full commit SHA in response.json. Add sanitized durable evidence with command, UTC timestamp, exit code, result, environment, artifact path and SHA-256. Update the response's request_sha256 if the validator amended the request and reconcile any new requirements.
7. Use RESPONSE_FORMAT.md for exact evidence fields. When every finding is addressed and evidence is complete, set response state to ready_for_review, commit/push the evidence and response on a feature branch, and open/update its PR. Do not edit the validator's verdict or accept your own work.
8. Waiting for review blocks the request's named RZ tickets and their dependents, not every unrelated task. Do not repeatedly resubmit or retry a human review. End a session with the exact pending review and safe next action when no other work is eligible.

## Automatic checks versus independent acceptance

`node tools/reviews.js --next` lists executor work first, then responses waiting for Codex. `--json` returns machine-readable status. `--check` checks record integrity; open reviews are not malformed data. `--gate RZ-006` exits nonzero while the ticket or a prerequisite is held. `--gate all` exits nonzero while any registered blocking review is unresolved. `--hash <project-relative-file>` computes a request, response or evidence SHA-256.

`node tools/verify.js` now runs review integrity checks and review-tool tests automatically, including in the existing specification CI. It rejects putting a held ticket into next/doing/done. The `backlog.js --ready` query also consults the review gate. To resume after acceptance, the executor clears the obsolete review blockedBy and moves an eligible ticket to next, then revalidates.

These checks enforce record consistency, hashes and workflow gates. They do not prove evidence truth, authenticate the writer's identity, or substitute for code review. `author_role` is a convention, not a security boundary. Codex inspects changes to validator-owned files in Git; an executor must not modify them to bypass a finding.

No scheduler, paid model-review service, GitHub-to-chat trigger or persistent laptop daemon is installed. The executor loop runs when Copilot is active; CI runs when the configured events fire; Codex reviews when its session is invoked. You may still need to start/resume a session or say “review the latest submission,” but need not explain the requests or compose a new implementation prompt.

## Validator loop

1. Read registered pending responses and submissions; identify the exact implementation commit and compare it with reviewed source.
2. Reproduce relevant tests and inspect local evidence; separate observed facts from agent claims and owner decisions.
3. Accept only the tested request/response pair: set verdict decision accepted, exact current request_sha256 and response_sha256, and the response's implementation_commit. An evidence change must match its recorded artifact hash. Waivers require an explicit reason and the same exact response binding; never silently waive a defect.
4. If changes remain, record changes_requested and the rationale. Amend/add findings in the request with a dated explanation. A changed request hash invalidates the old response/verdict until reconciled.
5. Create a new review ID for a new implementation batch. Never treat acceptance of one commit as blanket approval of future code changes. For major work create/refresh a review gate before downstream expansion.

## Requesting the next review without a custom prompt

At the end of each coherent batch (at most three completed implementation tickets), at a phase boundary, and before main integration, the executor writes one submissions/SUB-<UTC>-<shortsha>.md from SUBMISSION_TEMPLATE.md and pushes it with the implementation PR. That file identifies completed ticket IDs, commit, exact test commands/results, evidence, limitations and requested focus. Existing review fixes use response.json, not a duplicate submission.

Codex reads this submission at the next validation session and creates numbered findings automatically from the recorded context. Housseyn need only resume the validator session; no repeated per-finding Copilot prompt is required.

## Current confirmed hardware

Housseyn confirmed on 2026-09-20: RTX 4050 Laptop GPU with 6 GB VRAM. The earlier RTX 4060 claim is corrected. The identity discrepancy is closed; actual tool execution and current memory/storage measurements still need evidence. Do not install deferred MCP/model services merely to satisfy RV-001.
