# Copilot / DeepSeek — validation response orders 001

Read `reports/validation-001.md`, then execute this correction batch before continuing RZ-006. The reviewed implementation is `caf1cce1b7c57b6e88a9b65c52e6000ba25d736f`. The report records validator findings; the previous backlog statuses remain the original agent claims and are not independent approval.

## Execution and ownership

1. Inspect Git status and preserve user edits. Start from the implementation branch with this validation package present (merge/cherry-pick the validation commit or use its branch as a base after inspecting the diff). Do not reset away implementation work, merge into main, or modify sibling games.
2. Read AGENTS.md, the validation report and relevant specs. Keep one writer. Use four correction items V-001 through V-004 in your response; if you represent them in the Kanban, add stable `RZ-031` onward tickets with full existing schema and put dependent unstarted work later until corrections pass. Do not delete original evidence or silently call a validator finding resolved.
3. Fix V-001's single-hit Guard behavior and clarify the spec's consumption/unused-expiry wording. Bump the rule version, update conflicting tests and report, then run both the ordinary suite and the independent regression. A different gameplay rule requires an actual owner decision; logging a proposed interpretation is insufficient.
4. Fix V-002 using a project-local activation script or launcher where possible. User authorization already covers project tool setup; a missing response about editing a global shell file does not prevent implementing a local launcher. Do not silently edit global shell initialization or upgrade unrelated software.
5. Capture V-003 evidence on the actual Lenovo/WSL environment, sanitize it, and make it available in the review branch or a durable selected artifact. Do not substitute cloud results for laptop evidence.
6. Fix V-004's stale README/startup/reports/decision statements to reflect actual code and remaining limitations. Preserve provisional design and future owner gates.
7. Submit `reports/validation-001-response.md` with one row per V-ID: implementation commit, changed paths, commands/exit codes, evidence links, resolved/unresolved and reason. Create a normal implementation PR if none exists. Do not claim validator acceptance on the validator's behalf.

## Required local evidence bundle

Create `validation/evidence/001-response/` for sanitized small logs and the title PNG. Use an ignored temporary directory for unredacted collection. Record the implementation commit once changes are committed; collect tests against that exact code. Evidence-only commits may follow, and must name the implementation commit being exercised.

Every log must include UTC time, exact command, exit code, actual stdout/stderr and enough environment context to repeat it. Redact usernames, home paths and identifying hostnames consistently; retain executable filenames, versions and normalized project paths. Never dump all environment variables, credential stores, tokens, private keys or arbitrary process command lines. Do not ask for or record sudo passwords.

Use command-specific capture, for example in Bash (adapt paths after setting up the actual project launcher):

```bash
mkdir -p reports/local/validation-001-response
capture() {
  local label="$1"
  shift
  local result
  {
    date -u '+start=%Y-%m-%dT%H:%M:%SZ'
    printf 'command: '
    printf '%q ' "$@"
    printf '\n'
    if "$@"; then result=0; else result=$?; fi
    printf 'exit_code=%s\n' "$result"
    date -u '+end=%Y-%m-%dT%H:%M:%SZ'
    return "$result"
  } > "reports/local/validation-001-response/$label.log" 2>&1
}
```

Run checks individually and preserve failures. Do not convert the last command's success into success for the entire batch. Copy only reviewed/sanitized outputs into the committed evidence directory.

| Evidence | Command / observable result |
|---|---|
| Source identity | `git rev-parse HEAD`, `git status --short`, branch and normalized cwd; identify test commit and any uncommitted changes |
| WSL context | `uname -a`, `/etc/os-release`, VS Code connection mode (local WSL versus SSH/remote); user confirmation if necessary |
| GPU | `nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv`; use the actual discovered path if unavailable by name |
| Windows GPU comparison | From the same host: `powershell.exe -NoProfile -Command 'Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion | ConvertTo-Json'` |
| Tool resolution | Fresh VS Code WSL terminal, documented activation/launcher, `command -v node uv godot python3`, version outputs and resolved executable paths |
| Executable provenance | Hash the resolved Godot executable; distinguish executable hash from downloaded archive hash. Record exact release/managed Python version |
| Managed Python | Create a disposable uv venv with the installed exact Python, execute its Python version and a trivial import, record status, remove only that project-owned probe |
| Spec and board tests | `node tools/verify.js`; retain real Node version and full result |
| Fresh engine import | `godot --headless --path game --editor --quit` through the documented tool route |
| Combat behavior | `godot --headless --path game --script res://tests/run_tests.gd` |
| Guard contract | `godot --headless --path game --script "$PWD/validation/guard_contract.gd"`; must return 0 after correction |
| GUI | `godot --path game --quit-after 300 -- --smoke-shot`; retain rendering log, copy the produced PNG to the evidence bundle, include SHA-256 and inspect actual content |
| Client tool capability | Copilot calls an ordinary terminal tool that prints a unique nonsecret review marker and the Git commit; preserve result. Record model-picker identity as observed/user-confirmed, not cryptographically verified |

A CLI version result is enough to establish that a binary executes, not that every feature works. The game import/tests and GUI screenshot address separate capabilities. If a command fails, report the failure and fix its cause instead of editing the output. Do not rerun a destructive command just to produce evidence.

## MCP/service report — scope-aware

In the response add a table with `component`, `phase/ticket`, `installed`, `configured`, `running`, `health-tested`, `actual-tool-call-tested`, `evidence` and `blocker/next action`. Use `unknown`, `not tested`, or `deferred` where accurate; do not turn absence of a port into proof.

For the current phase, Studio MCP, ComfyUI/SDXL, ACE-Step and Stable Audio are expected to be deferred. Report their status honestly; **do not install them just for this review**. Ordinary Copilot terminal access is not MCP functionality. When RZ-020–025 actually execute, the report must show protocol initialization, tools/list, status, one real generated artifact and a real error-path test using the installed version.

## Acceptance for resubmission

- V-001 regression passes and original behavior tests remain meaningful; altered expectations are justified by the specified rule, not by existing code.
- A new intended terminal can use the documented project toolchain and run checks without undocumented PATH fixes.
- Hardware discrepancy is confirmed or remains explicit; laptop claims have actual accessible evidence.
- Title image is available for review; screenshots and logs identify the tested build.
- Entry documents distinguish implemented scaffold/core, pending gameplay and deferred studio services.
- Response maps each finding to evidence and does not invent owner or validator approval.
