# Verification orders

Keep fast deterministic checks separate from hardware-dependent integration and human review. Test behavior and material failure modes; do not create tests that merely restate code.

## Available specification gate

From runtime-zero: `node tools/verify.js`. This validates backlog integrity, all-length dependency cycles, ready-state prerequisites, evidence requirements, referenced specifications, JS/Python syntax and focused scheduler/validator regression cases. It does not execute future game or GPU tools.

Board smoke: `node tools/serve.js`, open http://127.0.0.1:8090/backlog/, check counts, search, filters, ticket detail, dependency navigation and reload. Ensure it reads runtime-zero/backlog/backlog.json and cannot expose parent-project files. Board remains read-only.

## Game gates to implement

- RZ-004: `godot --headless --path game --editor --quit` imports/parses the project; GUI launch renders the entry scene. This is a smoke test, not combat correctness.
- RZ-005/RZ-011: implement `godot --headless --path game --script res://tests/run_tests.gd`; nonzero on failures. Cover invalid command without RNG/state change, dead actor cannot act, Guard expiry, skill cost, clamped resources, ordered damage/terminal events, duplicate input and reward prevention.
- RZ-006: content validation rejects duplicate/missing IDs, malformed stats, invalid links and unsupported schemas.
- RZ-009: save round-trip, migration fixture, corrupt/truncated data recovery and atomic replacement behavior.
- RZ-011: fixed replay fixtures match final state/events under pinned engine and rules; tests fail on deliberate rule changes until reviewed.
- RZ-014/RZ-015: full simulation data, retained failing seeds, held-out comparisons, independent statistics cross-check and configured per-build gates.

## Studio gates to implement

Use fake adapters for timeout, failed backend, malformed responses, traversal/symlink escape, duplicate request IDs, concurrency, cancellation and crashed-worker recovery. These tests do not prove real generation. Real local checks require one genuine artifact from each enabled backend with provenance, recorded time/memory and file validation.

Test GPU serialization across two processes and an interrupted job; do not limit the test to two coroutines sharing an in-memory lock. Check available GPU memory after switching backend. Test no network fallback is triggered when local services fail.

## Device and human gates

Run desktop and physical Android smoke checks: cold start, loadout, win/lose/retry, background/resume, text readability, touch targets, audio/mute, settings persistence, thermal/performance observations. Record the actual device and build hash. Use provisional 60 FPS desktop and at least 30 FPS Android targets; establish frame-time/memory budgets from target-device measurement before optimizing.

For manual checks, record reviewer, date, build hash, scenario and observed result. Never invent owner approval. A screenshot proves appearance at one moment, not input behavior or end-to-end completion.

## CI

A root `.github/workflows/runtime-zero-spec.yml` checks this specification package on relevant changes. In RZ-011 add the pinned Godot/content/fast tests to a root workflow; nested workflow files alone do not register as repository Actions. Normal CI must not need the user's GPU, paid APIs, secrets or model downloads. GPU integration remains explicitly separate. Do not change sibling checks as part of RPG work.
