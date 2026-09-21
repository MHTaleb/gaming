# Runtime Zero — agent implementation headquarters

Housseyn is the product owner. Copilot and DeepSeek are implementation agents. The project is a local-first, technology-fantasy RPG built with Godot and a staged local asset studio.

**Current deliverable: the installed, verified local toolchain with a project-local launcher (`source tools/env.sh` — Node 22+, uv, managed Python, pinned Godot 4.7.2), the working review inbox and Kanban board, a launchable Godot project with a provisional title screen (`game/`), the deterministic combat core behind `game/tests/run_tests.gd`, and validated content packs (`game/content/`, checked by `game/src/infrastructure/content_repository.gd` and `game/tests/content_tests.gd`). Combat UI, loadout/run loop, saves, the headless simulator, the local asset studio, audio and Android are still pending.** Current code status and review records live in `reviews/`; see `reports/prototype-log.md` and `reports/environment.md` for executed evidence. This is a scaffold, core and validated data set — not yet a playable slice.

## Execute

Open `gaming/runtime-zero` as the VS Code folder, preferably through Remote WSL. Read [AGENTS.md](AGENTS.md), then [START_HERE.md](START_HERE.md). If opening the monorepo instead, the root path-scoped Copilot instructions route work here.

Give the agent this order:

> Read AGENTS.md and START_HERE.md in runtime-zero. Execute the earliest eligible ticket in backlog/backlog.json. Begin with RZ-001: inspect my local machine and install the required tools following docs/SETUP.md. Continue through eligible tickets, verify outcomes, and record evidence. Do not replace execution with another plan. Ask me only for genuinely required machine access or unresolved product decisions at their recorded gate.

Once Node is available, from this folder:

```bash
node tools/backlog.js --ready
node tools/backlog.js --summary
node tools/verify.js
node tools/serve.js
```

Open http://127.0.0.1:8090/backlog/ for the board. It reads JSON and does not write changes back. Edit and commit `backlog/backlog.json` to change tickets.

## Specification map

| File | Order to the agent |
|---|---|
| [START_HERE.md](START_HERE.md) | Bootstrap the session and select work |
| [AGENTS.md](AGENTS.md) | Obey execution, scope, evidence and handoff rules |
| [docs/SETUP.md](docs/SETUP.md) | Detect, install, configure and verify the local tools |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Separate confirmed requirements from provisional choices |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | Build a concrete prototype without inventing approved lore |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Implement runtime and tooling boundaries |
| [docs/DATA_CONTRACTS.md](docs/DATA_CONTRACTS.md) | Implement content, saves and asset contracts |
| [docs/ART_BIBLE.md](docs/ART_BIBLE.md) | Produce consistent, readable art |
| [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md) | Build local graphics and audio production |
| [docs/STUDIO_MCP.md](docs/STUDIO_MCP.md) | Expose bounded agent tools through adapters |
| [docs/BALANCING.md](docs/BALANCING.md) | Use the actual combat core for reproducible experiments |
| [docs/TESTING.md](docs/TESTING.md) | Run acceptance gates and distinguish unavailable checks |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Advance through phase gates |
| [docs/ANDROID.md](docs/ANDROID.md) | Produce and test a debug Android build |
| [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md) | Resume safely across agents and sessions |
| [docs/REPOSITORY_AUDIT.md](docs/REPOSITORY_AUDIT.md) | Understand baseline findings and reuse |
| [docs/SOURCES.md](docs/SOURCES.md) | Revalidate external integrations before pinning them |

The backlog is authoritative for work status and dependencies. Specifications define required behavior. A status edit cannot waive an acceptance criterion. All implementation tickets initially remain uncompleted.

## Standing review workflow

Read [reviews/README.md](reviews/README.md). Run `node tools/reviews.js --next` before choosing implementation work. Review requests, executor responses and validator verdicts share reviews/RV-nnn/. RZ-006 is held by RV-001 pending acceptance. Housseyn has confirmed RTX 4050 / 6 GB. The validator report and current request distinguish implemented title/core from the remaining game and studio tasks.
