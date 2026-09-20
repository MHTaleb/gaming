# Session handoff protocol

Use the same protocol whether switching models inside Copilot or handing a branch to another agent. A model label alone is not an ownership lock.

At session start: read the most recent committed reports/session-*.md, inspect Git changes, inspect the current ticket owner/status and verify any claimed dependency evidence. Do not overwrite another active agent's work. If both agents are present, one owns the ticket and the other reviews a diff; do not have both edit the same files.

At session end create `reports/session-YYYYMMDD-HHMM-<agent>.md` with:

```markdown
# Session handoff
- Agent/client/model:
- Environment: Lenovo WSL / Windows / remote runner (actual)
- Branch and implementation commit:
- Ticket IDs completed / still doing / blocked:
- Changed paths and behavior:
- Commands run, exit codes, measured outcomes:
- Evidence artifacts and hashes:
- Human reviews obtained (actual reviewer/date) or pending:
- Services still running and how to stop project-owned processes:
- Known failures / skipped checks and why:
- Next eligible ticket and exact first action:
```

For each completed ticket add evidence entries to backlog JSON, for example:

```json
{
  "command": "godot --headless --path game --script res://tests/run_tests.gd",
  "result": "passed",
  "artifact": "reports/session-20260920-1200-copilot.md",
  "environment": "Lenovo WSL; actual engine/version recorded in report"
}
```

This is a format example, not an executed test. For owner acceptance use `command: human review <scenario>` with the actual review record. Commit evidence and status changes together after implementation validation; never invent a future commit hash or store secrets in logs.

A next-action prompt for either executor:

> Read AGENTS.md, START_HERE.md, docs/DECISIONS.md, the latest reports/session-*.md and backlog/backlog.json. Verify the active environment. Resume the owned ticket or run tools/backlog.js --ready and execute the first eligible ticket. Follow its refs, steps, outputs, checks and acceptance criteria. Install its missing tools according to SETUP.md. Produce real evidence and a handoff.
