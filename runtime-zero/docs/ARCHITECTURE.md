# Architecture orders

Implement a modular Godot application with a deterministic domain core and separate local production tools. All paths below are intended outputs; create them through their tickets.

| Path | Responsibility |
|---|---|
| game/project.godot | Only the shipped game's project root |
| game/src/domain/ | Combat state, commands, pure resolution, stable events, seeded RNG |
| game/src/application/ | Encounter/run orchestration, reward and save use cases |
| game/src/presentation/ | Scenes, controls, animation, sound and input translation |
| game/src/infrastructure/ | Content loading, save I/O and engine adapters |
| game/content/ | Versioned encounter/build/enemy/item data |
| game/assets/ | Approved production assets only |
| game/tests/ | Headless test entry points and regression fixtures |
| tools/studio_mcp/ | Python application services, adapters and MCP transport |
| tools/balance/ | Analysis of Godot-emitted measurements; no duplicate combat engine |
| workflows/ | ComfyUI API-format workflows and parameter bindings |
| config/ | Sanitized tool/model/workflow locks and examples |
| reports/ | Committed concise evidence, ignored bulky local outputs |
| backlog/ | Development board, never part of game exports |

## Runtime boundaries

Use typed GDScript. Domain classes should be RefCounted/value-oriented objects, not scene-tree-dependent Nodes. Accept state, validated command and explicit RNG state; return the next state and ordered domain events. No scene lookup, timers, wall clock, audio, networking or filesystem access inside combat resolution.

Application code translates a run request into domain actions and calls repositories for persistence/content. Presentation subscribes to events and sends validated intent. UI must not directly change HP, inventory or RNG. Tests and headless simulation instantiate exactly the same domain/application combat services as the playable game.

Keep initial calculations integer-based. Avoid claiming cross-version or cross-platform determinism from seeded Godot RNG alone. Pin the engine and content revision, test replay, and version the RNG/rules contract. If stable cross-version replay becomes a requirement, use a specified PRNG algorithm with fixtures rather than relying on an engine implementation detail.

Use explicit IDs and schema versions. Validate content before a run. Do not evaluate arbitrary scripts from JSON. Persist domain state via a versioned serializer to `user://`; use temporary-file replacement, backup, migration and malformed-data fallback.

## Production tool boundaries

MCP transport → application services → adapters (ComfyUI HTTP, ACE-Step HTTP, Stable Audio worker, Godot CLI, FFmpeg subprocess). Application services own job lifecycle, GPU scheduling, paths, validation and provenance. Adapters contain backend-specific endpoint/flag knowledge.

Implement and test CLI/application calls before exposing them through MCP. Do not expose unrestricted shell execution as a studio tool. Use argument arrays, timeouts, capped logs, output-path validation and structured errors. Bind local APIs to loopback; credentials live in private environment/config only.

The studio does not run inside the distributed game. Export only `game/` with explicit filtering: no model weights, prompts, candidate assets, backlog, Python environments, keys or diagnostic logs.

## Dependency policy

Use the minimum necessary dependencies and commit successful lockfiles. Do not import sibling Capacitor, payment, ads or relay dependencies. Record new dependencies with purpose, source and version. Pin CI actions and third-party source revisions when introducing production CI. Keep GPU integration tests local/manual or on an explicitly provisioned GPU runner; normal CI must not download models.
