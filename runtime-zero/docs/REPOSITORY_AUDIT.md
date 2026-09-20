# Repository inspection and reuse record

Inspected `MHTaleb/gaming` default branch `main` at commit `8473dfccded6b6ae685eb7b936603fe933ccde6b`, on 2026-09-20. This is a targeted repository/tooling review, not a full game, security or release audit.

## Findings

- Existing project directories are `neon-stack` and `packet-defense`, plus shared deployment configuration. The requested name `nean-stack` corresponds to `neon-stack` in the repository.
- The reusable JSON ticket board is in `packet-defense/backlog/`, with `packet-defense/tools/backlog.js`. No corresponding board was found in neon-stack.
- The original board fetches `backlog.json` from its own directory, renders filters/status columns/details/dependency links, and does not persist edits. It can be copied as a self-contained development tool.
- No AGENTS.md or Copilot/DeepSeek instruction file was found in the inspected tree. No Runtime Zero/Godot RPG design was found in the Markdown search. The new RPG's decisions explicitly distinguish the supplied toolchain direction from provisional gameplay defaults.
- The inherited validator checks IDs, enums, dependency existence, done prerequisites and reciprocal cycles. Its ready query only checks `status === next`; it does not check dependency completion. Longer cycles are not detected. The RPG copy strengthens both rules.
- The repository's active root verification workflow targets Packet Defense. Nested project `.github/workflows` files alone are not repository-level Actions. The new RPG specification check is placed in the root workflow directory and scoped to relevant paths.

## Reuse boundary — explicit owner clarification

**Runtime Zero is a new RPG in its own folder. Only the Kanban board and its JSON validator are copied from Packet Defense.** No game mechanics, levels, actors, combat rules, art/audio assets, economy, commercial SDKs, servers, package dependencies or deployment configuration are reused. No runtime file imports a sibling project. Existing tracked sibling files remain unchanged.

Copied source paths:

- `packet-defense/backlog/index.html` → `runtime-zero/backlog/index.html` (RPG branding)
- `packet-defense/backlog/board.css` → `runtime-zero/backlog/board.css`
- `packet-defense/backlog/board.js` → `runtime-zero/backlog/board.js` (agent steps/outputs/checks/evidence detail sections)
- `packet-defense/tools/backlog.js` → `runtime-zero/tools/backlog.js` (readiness, cycle and completion validation extensions)

New RPG backlog: 30 independent `RZ-` tickets. Initial work statuses: RZ-001 ready; 29 later; zero done. The deliverable prepares execution; it does not claim the game is built or the user's machine configured.

## Baseline observations

Before the owner's reuse clarification, the existing backlog validation passed: 83 items, no reported warnings. An initial existing fast verification run passed syntax (39 files), backlog, screenshot-shape checks, relay, co-op, campaign invariants and replay. Its asset check failed because `@resvg/resvg-js` was not installed in this workspace. Dependencies were subsequently installed locally with `npm ci --ignore-scripts`, but that gate was not rerun; do not describe the entire existing game as verified. This installation was in the temporary inspection checkout, not on Housseyn's Lenovo, and made no tracked changes.

The work following clarification concerns the independent RPG specification and copied board only. No assertion is made about overall gameplay quality, Play readiness, device performance or the correctness of every existing JSON claim.

## RPG validation evidence

`node runtime-zero/tools/verify.js` passed in the preparation workspace (Node v24.19.0, Python 3.12.14): JavaScript/Python syntax, specification refs, 30-ticket validation and eight focused behavior tests. Tests cover initial readiness, unmet dependencies, long/self cycles, ownership/evidence, malformed arrays/unknown dependencies, blocked reasons, done dependencies, duplicate epic/failed evidence, and the read-only board server's isolation.

The local server serves only the four RPG board files on loopback, refuses writes, and returns 404 for configuration/parent-project paths. No game, GPU generation, MCP backend or Android device test was run because these are future implementation tickets.

Visual/browser interaction verification was attempted but not completed: no browser binary was installed, and the Playwright Chromium download failed with HTTP 502/network connection refusal. Search/filter/drawer rendering was inspected in code, not certified by a browser run. Re-run the browser smoke checklist in docs/TESTING.md on the local machine. Markdown relative links were checked and resolved successfully. Existing tracked neon-stack, packet-defense and deploy paths have no diff.
