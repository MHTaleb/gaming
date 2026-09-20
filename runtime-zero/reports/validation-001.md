# Validator report 001 — changes requested

Reviewed implementation: `caf1cce1b7c57b6e88a9b65c52e6000ba25d736f` on `codex/runtime-zero-impl`.
Baseline specification: `8e92de5dbef9213d16f4d545f6ab320b3f80cfe9`.
Reviewer: Codex, acting as Housseyn's independent validator. Date: 2026-09-20.
Scope: six pushed commits, claimed completion of RZ-001 through RZ-005. This report does not certify the laptop, an entire playable game or future MCP services.

**Verdict: useful implementation progress, but do not treat all five claimed completions as independently accepted. Resolve V-001 and the local setup/evidence requests before using this batch as the accepted baseline.** The agent's original task statuses are preserved as claims; the acceptance decisions below are the validator's separate findings.

## What was independently verified

- All implementation changes are within runtime-zero/. No sibling game mechanics, assets or application dependencies were imported.
- `node tools/verify.js` passed: eight Node behavior tests, backlog, reference and syntax checks. This command explicitly does not test Godot.
- Retrieved the official Godot 4.7.2 release metadata, downloaded its Linux executable archive, verified SHA-256 against that metadata, and verified that its SHA-512 equals the value in the agent's lockfile. Executable reports `4.7.2.stable.official.ed1daf0bf`.
- Fresh Godot headless import exited 0. The agent's combat test entry point independently exited 0 with **ALL TESTS PASSED (86 checks)**.
- A separate specification-based two-enemy Guard regression exited **1**, exposing V-001. Accepted resolution left the input state unchanged in that probe.
- The uv release's published archive digest matches the lockfile's claimed digest. This checks provenance consistency, not the existence of an installed executable on the Lenovo.
- GitHub Actions query returned no runs for the implementation HEAD at review time. The specification workflow runs for PRs and main pushes; pushing only this feature branch does not trigger it. The existing PR #1 still points to the specification branch, not this implementation.

Independent runtime: remote Linux review workspace, Node v24.19.0, Python 3.12.14, verified Godot 4.7.2. No Lenovo terminal or WSLg display access. Downloading the same engine here does not validate the laptop installation.

Reproduction logs: [import](../validation/evidence/001/import.log), [86 combat checks](../validation/evidence/001/combat.log), [Guard counterexample](../validation/evidence/001/guard-contract.log). The failing script is [validation/guard_contract.gd](../validation/guard_contract.gd), deliberately outside the exported game root. It is not silently added to the existing passing specification gate.

## Findings and requested corrections

### V-001 — high priority: Guard changes the specified combat rule

Location: `game/src/domain/combat_resolver.gd`, lines 23–25 and 134–139; `game/tests/run_tests.gd`, Guard test; `reports/prototype-log.md`, RZ-005 interpretation.

`docs/GAME_DESIGN.md` says Guard halves the **next incoming damage**. The resolver leaves `guard_active` set after taking damage, so every enemy attack in the round is reduced. The report candidly records this interpretation for later owner review, but that does not reconcile it with RZ-005's requirement to implement the specified rules. The original sentence also mentions expiry at the next turn; make consumption versus timeout explicit now rather than carrying two interpretations into content and balance work.

Reproduction: hero HP 100, defense 3; two enemies, attack 9 each; issue Guard. Single-hit rule: first hit 3, second hit 6, ending HP **91**. Actual: hits **[3,3]**, ending HP **94**. The existing 86 checks pass because they do not assert the single-hit two-enemy outcome and explicitly expect guard to remain active.

Required correction: consume Guard after the first incoming hit; expire an unused Guard at the next hero turn; preserve floor/minimum damage and no stacking. Make that wording explicit in GAME_DESIGN.md, update the rule version and evidence, and test the two-enemy outcome, single-hit consumption, unused expiry, re-Guard, minimum damage and boss interaction. Do not merely change this regression's expectation to 94. If Housseyn explicitly chooses full-round Guard instead, record that decision and align the specification and all tests before acceptance. No such choice is currently recorded.

### V-002 — medium priority: standard tool commands are not ready in the intended terminal

Location: `reports/environment.md` tool inventory/RZ-002 results; `config/toolchain.lock.json` Node, uv, Python and Godot entries; latest session handoff.

The report states that VS Code terminals still select Node 20, while fresh shells select Node 22, and that `~/.local/bin` is absent from PATH. Consequently `godot` and `uv` examples cannot be replayed directly in the stated execution environment. One recorded Python verification uses bare `uv` even though that same report says it is not resolvable. Absolute-path invocations may have succeeded; the current evidence should record the exact command/environment rather than an approximate equivalent.

Required correction: provide and verify one deterministic project-local activation script or launcher, or record an actual host configuration change authorized by Housseyn. A project-local launcher avoids requiring a global shell edit. In a newly opened VS Code WSL terminal, demonstrate Node 22+, uv, the pinned Godot executable and managed Python resolution, then execute the specification and combat checks through the documented route. Keep the system Python venv limitation explicit; a working uv environment is an acceptable alternative and does not require repairing unrelated system Python.

### V-003 — validation gap: local terminal and GUI evidence is not available for independent inspection

Location: `reports/environment.md`, `reports/prototype-log.md`, `reports/session-20260920-1340-copilot.md` and `config/toolchain.lock.json`.

The committed summaries are useful and include commands, versions and a screenshot hash. However, most raw outputs remain in the agent session or temporary files; the title screenshot and board probe are in ignored reports/local/. A hash alone cannot show the image's content, and a prose claim cannot independently establish which terminal executable ran. This is **an evidence gap, not a finding that the agent fabricated its work**. The original specification allowed large artifacts to remain untracked, so do not characterize that storage choice by itself as a violation.

Provide a small sanitized evidence bundle tied to an exact implementation commit: command, cwd/environment, UTC start/end, exit code and actual stdout/stderr for hardware/versions, spec checks, Godot import and combat checks. Include the title PNG (small enough for Git, or a durable user-accessible artifact with hash). Capture a fresh coding-client tool call; client/model picker identity may be user-confirmed, but do not infer the backend identity from an installed extension alone. A screenshot proves rendering, not gameplay input or an entire end-to-end game.

The report says RTX **4050**, 6141 MiB, whereas Housseyn reported RTX **4060**. Treat this as a discrepancy to confirm with fresh `nvidia-smi` output and Windows video-controller output; do not silently replace the user's hardware identity as an independently verified fact. WSL/Windows interop demonstrates a WSL host connection, but does not by itself rule out a remote editor session. Record the actual VS Code connection context with Housseyn if needed.

### V-004 — medium priority: entry documentation still describes the pre-implementation state

Location: `README.md` current-deliverable paragraph; `START_HERE.md` Available now versus future; `reports/README.md`; D-004/D-010 in `docs/DECISIONS.md`.

The README still says the game has not been implemented, START_HERE still classifies `game/project.godot` and Godot test scripts as nonexistent future outputs, and reports/README says no setup/game evidence exists. These statements now conflict with the pushed files. The decision register's GPU entry also still says the device is unmeasured while the report claims a measurement.

Update the entry documents to describe a title scaffold and combat core, with content/UI/run-loop still pending and validation status linked here. Distinguish reported measurements from independently confirmed hardware. Preserve the provisional gameplay/owner review gates. Do not claim the playable slice, Studio MCP or local generation exists.

## Ticket acceptance matrix

| Ticket | Agent status | Validator assessment |
|---|---|---|
| RZ-001 | done | Inventory report present; local host/GPU identity is reported, not independently certified; V-003 follow-up required |
| RZ-002 | done | Installed-version provenance partly corroborated; terminal readiness/evidence requires V-002/V-003 |
| RZ-003 | done | Documented provisional adoption is consistent with permitted fallback; no owner approval was invented in the committed design record |
| RZ-004 | done | Code and fresh headless import verified; GUI screenshot remains unavailable for review under V-003 |
| RZ-005 | done | 86 checks independently pass; changes requested for the Guard contract under V-001 |
| RZ-006 | next | Planned content work; resolve this validation batch before promoting its implementation as the next accepted baseline |

## MCP and backend status at this stage

| Component | Repository evidence | Required now |
|---|---|---|
| Studio MCP server | No implementation package or active `.vscode/mcp.json`; specification only | Report `not implemented / deferred to RZ-020–022` |
| Copilot/DeepSeek client | Agent reports successful ordinary file/terminal tools; exact provider identity not independently verified | Fresh benign tool-call record; do not call it an MCP test |
| ComfyUI / SDXL | No runtime/workflow/model implementation; report says not installed | Report deferred to RZ-017; no model downloads for this review |
| ACE-Step / Stable Audio | No backend adapters or artifacts; report says not installed | Report deferred to RZ-023/024 |
| FFmpeg / Android tooling | Report says deferred | Preserve phase-based installation; not current failure |
| RPG board | Server code and HTTP isolation tests independently pass | Can be stopped between sessions; it is not an MCP server |

No live laptop ports were queried by the validator. A free port alone does not prove a service is absent, and an occupied port does not identify a healthy backend. At the future MCP phase require initialize → tools/list → studio_status → actual backend operation with output artifacts and error handling. Installing those backends now solely to satisfy a review would violate the intended phase order.

## Nonblocking follow-ups

- Open/update an implementation PR with the implementation branch as head so CI can see this work. Do not confuse green checks on the original specification commit with this implementation. Actual Godot CI is scheduled in RZ-011; a reproducible local terminal transcript is still needed now.
- The backlog test change removes the obsolete hardcoded RZ-001 readiness assertion; that is reasonable as progress advances. Eventually use a small isolated fixture to assert both inclusion of an eligible task and exclusion of an ineligible one, avoiding a vacuous `every()` check.
- Add boundary coverage when correcting Guard: exactly 3 versus 2 energy, extreme defense/minimum damage, and accepted-input immutability. Do not claim those specific assertions already exist among the 86 checks.

## Next validation submission

Follow [VALIDATOR_ORDERS.md](../validation/VALIDATOR_ORDERS.md). Preserve the original claims as history and submit a response mapping V-001 through V-004 to exact changes, commands and evidence. The validator will review the new commit and reproduce the targeted checks. No persistent automatic monitoring or laptop access is implied by this report.

## Owner confirmation and protocol addendum (2026-09-20)

Housseyn subsequently confirmed RTX 4050 / 6 GB and corrected his earlier RTX 4060 statement. The hardware identity discrepancy above is resolved; do not ask him to confirm it again. V-003 still requests accessible terminal and GUI execution evidence. Current structured requests and responses now live under reviews/RV-001/; follow reviews/README.md for the standing protocol. Earlier passages are retained as the historical review of caf1cce.
