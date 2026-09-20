# Studio MCP application contract

Implement Python application services with a thin MCP transport after their direct CLI tests pass. Use the official Python MCP SDK at a verified pinned release. Initial transport is local stdio; protocol data goes to stdout, logs to stderr. Do not assume every backend has native MCP.

## Tool surface

Names below are the target interface, not tools already available in this checkout. Add only capabilities whose implementing tickets have passed.

| Tool | Input contract | Outcome |
|---|---|---|
| studio_status | no arguments | Installed/available capabilities, owned service state and queue; no fabricated readiness |
| generate_item_icon | asset_id, brief, seed, request_id | Queue one candidate icon using approved workflow |
| generate_character_concept | asset_id, brief, reference_ids, seed, request_id | Queue reference-consistent concept candidate |
| generate_background | asset_id, brief, layer, seed, request_id | Queue one background layer candidate |
| generate_music | asset_id, brief, duration_seconds, loop, seed, request_id | Queue a local music candidate |
| generate_sfx | asset_id, brief, duration_seconds, seed, request_id | Queue a local effect candidate |
| job_status | job_id | Progress, artifacts, structured error |
| cancel_job | job_id | Cancel project-owned work, report terminal status |
| inspect_asset | asset_id | Metadata and bounded preview, missing checks and provenance |
| promote_asset | asset_id, candidate_sha256, review_reference | Promote only a reviewed exact candidate |
| simulate_level | level_id, build_ids, seed_start, runs, policy_ids | Queue the actual Godot simulation and report per-build results |
| validate_level | level_id | Schema, reachability/reference and configured balance gate results |
| run_game_tests | suite enum: fast/replay/content | Bounded test run with artifact paths |
| build_debug_apk | preset enum: Android | Bounded debug export; no signing/publishing privileges |

Use typed schemas. IDs match a restricted pattern such as `^[a-z][a-z0-9_]{0,63}$`; IDs resolve to registry entries, never to arbitrary paths. Cap request lengths, image dimensions, duration and run counts according to the installed profile. Validate seed ranges and finite numbers. `simulate_level` initially caps at 2,000 runs per build/policy/request; batching larger work is explicit.

Return the job envelope in DATA_CONTRACTS.md. Generation calls enqueue and return promptly. Missing backend → `BACKEND_UNAVAILABLE`; memory issue → `GPU_OOM`; deadline → `TIMEOUT`; invalid contract → `INVALID_INPUT`; missing review → `REVIEW_REQUIRED`. Never return an empty successful artifact list for a completed generation.

## Required implementation behavior

- Idempotency: repeated `request_id` plus identical payload returns the same job; conflicting payload returns an error. Persist job state and request hashes before starting work.
- Paths: resolve and containment-check symlinks and traversal against allowlisted project/candidate roots. Use adapter-returned local output IDs rather than arbitrary remote download URLs. Reject files outside the allowed root.
- Processes: use argument arrays, fixed executables resolved during setup, cwd, timeouts, log limits and explicit environment. No shell string interpolation and no arbitrary command/path tool.
- Jobs: recover queued jobs after restart; interrupted running jobs become failed/interrupted or safely resume with backend task identity. Release only owned leases. Test cancellation during generation and worker failure.
- Promote: verify hash, rights provenance, review reference and file content before copy; preserve old approved version until success. Automatic model judgment may rank candidates but cannot impersonate Housseyn's art approval.
- GPU lease: shared across all adapters, not just one MCP process. Record lease owner PID/job and handle crash recovery. Do not release another process's live lock.
- Capabilities: advertise supported operations and make unavailable dependencies explicit. Do not expose mock generation as enabled production functionality.

## VS Code / DeepSeek integration

Preferred workspace root: `gaming/runtime-zero` opened in Remote WSL. When RZ-021 implements the actual package and confirms the lockfile, create `.vscode/mcp.json` using the current documented schema. Illustrative configuration (not installed now):

```json
{
  "servers": {
    "runtime-zero-studio": {
      "type": "stdio",
      "command": "uv",
      "args": ["run", "--project", "${workspaceFolder}/tools/studio_mcp", "--frozen", "python", "-m", "studio_mcp.server"]
    }
  }
}
```

Ensure package layout/imports and absolute project-root resolution work independently of the launch cwd. If the workspace is the monorepo, adjust the project path by adding `/runtime-zero`; do not install two copies of the server configuration. Set local nonsecret paths through user-local configuration and supply secret inputs through supported secure mechanisms.

Probe MCP initialization, tool listing, studio_status, one invalid-input response and one actual tool call in Copilot Agent mode. Repeat with DeepSeek selected only if the installed client/account exposes it with tool calling. Record exact client/model/provider and outcomes. If unsupported, record a blocker for that client integration while keeping the tools usable by a supported client. Do not claim a selected model name proves MCP compatibility.
