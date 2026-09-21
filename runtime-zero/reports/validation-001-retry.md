# RV-001 attempt 002 review — 2026-09-21

**Changes requested: one remaining V-002 shell-compatibility correction.** V-001 and V-004 remain verified. V-003's missing-collector and inaccurate-evidence-summary issues are now satisfied. RZ-006 remains held until the complete review is accepted.

Reviewed head: `621670143e0ed1a2612bb401d8f2a7ff85e4d58c`.
Tested implementation named by the executor: `74b2b74bb46e686ad56941a1e30d6573d27896d5`.
The final commit adds only the response and evidence. Changes stay inside runtime-zero. Game code, backlog, validator request/verdict, prior independent regressions and historical evidence remain unchanged.

## What is verified

- Both original executable-selection regressions now pass independently. A competing Godot/uv entry no longer wins; the selected Node wins on first and repeated activation.
- All 18 specification, board and review-tool tests pass independently. Response artifact hashes pass the review integrity check; all 12 files listed by attempt 002's manifest also match their recorded hashes.
- The committed `validation/evidence/collect.zsh` makes the previously missing probe bodies inspectable. Substantive steps retain command output and individual exit codes; the response corrects the old claim about uv/Godot being absent from the earlier live terminal.
- Submitted laptop logs show Node 20 before controlled activation, then Node 22.23.2, uv 0.12.17 and Godot 4.7.2 through the corrected route. Managed Python 3.12.14 is exercised in a disposable environment. Fresh-terminal reconstruction is explicitly labelled; it is not an independently observed new terminal on the laptop.
- Submitted import, combat (96 checks), and unchanged Guard-regression logs pass. The game code did not change since the previous independent successful engine run, so that behavior validation is carried forward rather than presenting another engine run as performed in this review.
- Previously inspected GPU/title artifacts remain tied to their original commit. No new GPU confirmation or MCP installation is needed. The service status remains phase-appropriate.

## Remaining V-002 defect: zsh does not remove duplicate entries

In `tools/env.sh`, `_rz_pin_path_dir` uses `IFS=':'` followed by `for segment in $PATH`. Ordinary zsh does not split an unquoted scalar this way by default. The loop receives the complete PATH as one segment; it therefore does not remove selected directories already present inside PATH. Each activation prepends two more entries.

The selected tools still resolve correctly. The defect is incomplete normalization and repeated PATH growth, not a recurrence of the prior wrong-executable selection. It violates the explicitly requested removal of duplicate selected entries and stable repeated activation in the user's documented zsh environment.

Independent reproduction:

```sh
python3 validation/launcher_contract.py
python3 validation/launcher_shell_contract.py
```

The original regression passes. The new shell regression passes in Bash and fails in zsh. It supplies duplicate selected directories plus an unrelated directory containing spaces, then compares the complete PATH after first and second activation. Both runs use disposable executable stubs and a copy with only literal home-path references substituted. HOME and installed tools are not modified.

Evidence: `validation/evidence/002-validator/launcher-shell-contract.log` and the adjacent manifest. In a simpler `/usr/bin:/bin` case, first activation yields `[Node]:[user-bin]:/usr/bin:/bin`; second activation yields `[Node]:[user-bin]:[Node]:[user-bin]:/usr/bin:/bin`.

## Exact executor action

1. Safely integrate this review update. Change only the remaining launcher normalization behavior and related evidence. Keep all verified Guard, documentation and collector work.
2. Replace reliance on implicit word splitting with explicit colon-delimited parsing that works in both Bash and zsh. A quoted remainder loop using parameter expansion to extract the next segment is suitable. Preserve unrelated entries and spaces, remove exact duplicates of the two selected directories, and restore the caller's shell state. Do not globally enable zsh word splitting as a workaround.
3. Run both validator launcher regressions without weakening their expectations. Show identical normalized PATH after first and repeated activation in both shells, with each selected directory appearing exactly once.
4. Commit the implementation, then record the new full SHA and focused laptop evidence in a new attempt directory. Run the existing collector through the corrected route and record the new shell regression too. Preserve earlier bundles. Retain satisfied V-001/V-003/V-004 evidence with accurate commit attribution; GPU/GUI evidence does not need recapturing for this PATH-only change.
5. Set the response to draft while working, then resubmit it as ready_for_review with current hashes. Leave verdict.json and RZ-006's hold untouched. Open/update an implementation PR as required by the standing protocol; at review time the only open PR was the original specification PR #1.

## Collector usage limits

The collector currently runs the entire batch; it does not implement a `- probe <name>` command-line interface despite that annotation in response command strings. Its actual invocation is `zsh validation/evidence/collect.zsh`; function names in individual logs identify the probes. Use the actual invocation in the next response.

Its top-level exit code is not an aggregate validation gate: `run_log` deliberately returns zero so collection continues. Inspect each recorded step/probe status. The deliberate exit-3 sample verifies recording of that probe's exit, while step-failure aggregation is visible in the committed probe bodies. This review accepts the inspectable per-command evidence; it does not certify the collector's process exit as a CI success signal.

## Verdict and scope

The exact request/response pair is bound in verdict.json. `node tools/reviews.js --next` returns executor_action with this report as the next action. V-002 is the only remaining substantive correction; V-003 does not require another evidence redesign. All independent checks in this attempt ran in the validator's Linux environment, not on Housseyn's laptop.
