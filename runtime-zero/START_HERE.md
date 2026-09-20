# Session bootstrap orders

Execute in order. Paths and commands below are relative to `runtime-zero/` unless stated otherwise.

1. Read reviews/README.md, then run `node tools/reviews.js --next` (or read reviews/index.json and its records if Node is missing). Address blocking review requests before affected implementation. Establish whether the terminal is on Housseyn's Lenovo, WSL on that Lenovo, a container, or a remote machine. Record the distinction. His reported GPU is an RTX 4060 laptop GPU; actual VRAM, RAM and SSD availability are still unmeasured.
2. Follow docs/SETUP.md, RZ-001 then RZ-002. Do not start GPU/model downloads during machine inventory. Missing Node does not block reading the JSON manually or installing Node.
3. Read docs/DECISIONS.md. RPG theme examples survived the earlier discussion, but a complete gameplay design did not. Use the explicitly provisional prototype only. RZ-003 records/reconciles design; RZ-012 is the owner review gate before expanding content.
4. Run `node tools/verify.js`. This verifies only the specification package and board. It is not a game test. Launch `node tools/serve.js` and verify the board reads this project's JSON.
5. Run `node tools/reviews.js --next`, then `node tools/backlog.js --ready`; claim one eligible unheld ticket. Install needed tooling as part of each phase. A dependency is complete only if the recorded evidence supports it.
6. Implement the Godot prototype before custom image/audio tooling. Use simple geometric placeholder art and silence or locally synthesized placeholder cues.
7. Add MCP after the runtime and command-line adapters are independently testable. Confirm the selected coding model actually supports tools in the installed client. DeepSeek availability in Copilot is a capability probe, not an assumption.
8. End each session with docs/AGENT_HANDOFF.md's report. Continue autonomously through eligible tickets within the active phase.

## Available now versus future

Available now: backlog validator, ready query, read-only board server, specification verification, specification documents, and a safe read-only machine doctor.

Future contracts, NOT executable yet: `game/project.godot`, the Godot test/simulation scripts, Studio MCP Python package, ComfyUI workflows, asset promotion commands, and Android exports. Their implementing tickets must create them before invoking them. Do not mistake a command shown in a specification for an installed tool.
