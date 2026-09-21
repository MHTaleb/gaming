# RV-001 follow-up — 2026-09-21

Verdict: **changes requested**, limited to V-002 launcher resolution and V-003 evidence reproducibility. V-001's gameplay correction and V-004's entry-document corrections satisfy their requested scope. RZ-006 stays held until the complete review is accepted.

Reviewed branch head: `3713b53fdea9691fd9d2869dedbf71fc534dd318`.
Executor's implementation commit: `1aef2d92efb68a368649119cfc4a0df183e12257`.
The subsequent commit changes only response/evidence files. Validator request, verdict, independent Guard regression, review gate implementation and backlog were not altered by the executor. All changes are inside runtime-zero; sibling games remain untouched.

## Findings and executor orders

### V-001 — correction verified

Guard now consumes itself on the first incoming hit, preserves unused expiry, and records rules version 2. Independently reproduced: 96 combat checks pass; the unchanged validator regression produces hits `[3,6]`, hero HP `91`, and an unchanged input state. Preserve this behavior. No further gameplay redesign is requested.

### V-002 — launcher still needs correction (medium)

`tools/env.sh` lines 38–41 do not guarantee the executable selection promised in its documentation:

- If `~/.local/bin` is already on PATH after a competing installation, the script leaves it there. Bare `godot` and `uv` run the competing programs, despite RZ_GODOT/RZ_UV pointing at the selected files.
- If the user bin directory is absent from PATH but contains another Node, first activation prepends it ahead of the selected nvm Node. First and second activation select different Node executables.

Both cases reproduce with `python validation/launcher_contract.py` (exit 1 at the reviewed implementation). This isolated fixture uses labelled executable stubs and substitutes the script's home-path references; it does not modify HOME, the laptop or installed tools. It establishes a PATH-selection defect, not a claim that these competing installations currently exist on Housseyn's laptop.

Executor must:

1. Make the selected Node directory and selected user tool directory take precedence in a consistent order on first and repeated activation. Remove existing copies of those entries before reinserting them, or use an equally reliable project-local launcher. Preserve other PATH entries and paths containing spaces. Do not edit global shell configuration.
2. Make bare `node`, `uv` and `godot` agree with the documented selected executables. Keep the managed-Python route explicit (`uv` / its managed interpreter); do not claim bare system `python3` changed from 3.8.
3. Pass the independent launcher regression without weakening its expected selections. If replacing activation with a different interface, retain equivalent collision tests and document the reason.
4. On the laptop, record a fresh intended VS Code WSL terminal run and an explicitly labelled controlled test with Node 20 first and the user tool directory absent from PATH. Test repeated activation too. Record actual before/after executable paths, versions and each exit status; run specification, Godot import, combat and Guard checks through the corrected route.

### V-003 — evidence is useful, but not fully replayable (medium)

All response artifact hashes match. The title PNG is present and visually shows the expected 1280×720 provisional title. GPU logs report RTX 4050 Laptop / 6141 MiB; identity remains owner-confirmed. The supplied Godot executable hash matches the independently extracted official executable. The service table correctly keeps future MCP/generation/audio/Android work deferred. Ordinary client terminal access is not proof of MCP or the selected model backend.

Remaining problems:

- Logs name functions such as `python_probe`, `godot_import`, `gui_smoke` and `client_probe`, but their bodies are not committed. `tools.log` invokes `reports/local/tools-probe.zsh`, also absent from Git. A helper name plus an overall exit code does not show the exact internal commands or prove that earlier failures propagate. This is an inspectability gap, not a finding that the output was fabricated.
- V-002's response summary says uv/godot were absent before activation. The supplied transcript instead resolves both from `~/.local/bin` before activation, and its injected PATH already contains that directory. The log therefore does not exercise the claimed missing-PATH condition.

Executor must:

1. Commit a small sanitized evidence collector/probe with the exact executed command bodies, or log the complete individual commands inline. Reference its committed path in the new response. Capture each substantive command's exit code and stdout/stderr; a final cleanup or echo must not hide an earlier failure. Demonstrate failure propagation with a harmless deliberate nonzero probe and label it an expected failure.
2. Commit the launcher/collector implementation first, then collect fresh route-dependent evidence against that full SHA. Preserve the old bundle as historical evidence; use a new attempt directory and recompute hashes. Correct the inaccurate before-activation summary instead of changing historical logs.
3. Keep the inspected GPU/GUI evidence with its original tested commit. No repeat GPU confirmation, model downloads, MCP installation or OS upgrade is requested. If the GUI collector is rerun, retain the actual warnings and screenshot; do not erase failures to make a clean report.

The supplied GUI log includes missing optional X11/xkb symbols and a V-Sync warning, followed by successful rendering and exit 0. These are recorded limitations of that WSLg smoke test, not an additional blocker for the current title scaffold. Gameplay interaction and performance remain untested.

### V-004 — documentation correction verified

README, START_HERE, reports index and D-010 now distinguish the existing scaffold/core from pending gameplay and studio work. Provisional design and RZ-012 owner review remain explicit. Keep these corrections; align launcher wording with the final verified route while resolving V-002.

## Independent verification and limits

Evidence: `validation/evidence/001-followup/manifest.json` and its logs.

| Check | Result |
|---|---|
| Specification, board isolation and review-tool tests | PASS, 18 tests |
| Godot 4.7.2 headless import | PASS |
| Combat suite | PASS, 96 checks |
| Unchanged independent Guard contract | PASS |
| Launcher precedence regression | FAIL, both scenarios |
| Executor evidence hashes and commit ancestry/scope | PASS |
| Title PNG | Inspected; provisional title rendered |

These reruns occurred in an independent Linux validator environment, not on the Lenovo. Laptop execution remains supported by the executor's submitted artifacts with the limitations above. No matching GitHub Actions runs were returned for the implementation branch at review time; local test results are not described as hosted CI success.

The validator's cached Godot executable was truncated and initially exited 139 before producing output. It was re-extracted from the cached archive after verifying archive SHA-256 `cadd3204e728a35d3f13adb7fd0d7902636b79f6b95c40c265eb73b6c35329e4`. Restored executable SHA-256: `8d106cbe6144c2dc7e881d61d2429c1a8a76e6b22ef48bd5e48dcf934953f71e`. The successful engine results above use that restored executable. This was a validator environment issue, not a project failure.

## Standing-protocol handoff

The verdict binds the exact submitted response hash and implementation commit. The original request remains unchanged because these are outstanding parts of V-002/V-003, not a new implementation batch. `node tools/reviews.js --next` now reports `executor_action` and points here through the verdict reason.

Copilot: safely integrate this validator update, set the response back to draft while fixing V-002/V-003, retain V-001/V-004's satisfied work, execute the orders above, and resubmit the complete response with fresh evidence. Keep RZ-006 blocked. Open/update the implementation PR as required by the standing protocol; do not merge into main or edit validator-owned records. Housseyn need only resume the executor session; no new custom prompt is required.
