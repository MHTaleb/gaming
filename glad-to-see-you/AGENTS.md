# AGENTS.md — contract for ANY coding agent working in `glad-to-see-you/`

This file applies to every AI coding assistant (GitHub Copilot, Claude, Codex, Gemini, local models)
and to humans who want the same discipline. Read it fully before touching code.

## Mission

Build a polished 3D **mobile** dark-fantasy action game: one hero, one arena, excellent combat feel,
premium presentation — on mobile hardware budgets. Unity 6.3 LTS + URP. Android first.

## Priorities (in order)

1. **Stability** — it must run, every commit.
2. **Maintainability** — modular components, no god classes, events over spaghetti references.
3. **Visual quality** — perceived quality per GPU cost, not polygon count.
4. **Game feel** — combat polish systems are first-class, not afterthoughts.
5. **Mobile performance** — every frame cost is a decision.
6. **Iteration speed** — small diffs, fast verification loops.

## Required workflow — never skip steps

```
Understand → Plan → Implement → Compile → Test → Inspect Unity errors → Fix → Profile (when relevant) → Document
```

- **Do not declare a task complete without verification.** "It should work" is not evidence.
- If **Unity MCP** is available, use it to verify inside the editor: read the console, enter play mode,
  inspect objects — the editor's console is the source of truth, not your assumptions.
- If **Blender MCP** is available, use it for mesh/material/LOD work instead of describing what to do.
- If **Meshy MCP** is available: **never trigger a paid generation without explicit owner approval**
  (credits are consumed). Check `Documentation/AI_ASSET_PIPELINE.md` first.
- Never claim success from source code alone. Compile errors, test failures and console errors are real.
- Never fabricate asset filenames — if an asset doesn't exist, either create a placeholder via the
  documented pipeline or say it's missing.

## Hard rules

- **No giant MonoBehaviours.** If a script creeps past ~250 lines, split by responsibility.
- **No new packages without explaining why** in the PR/commit message. The current set is deliberate;
  see `Documentation/ARCHITECTURE.md` ("Dependencies & why").
- **No hard-coded game data** in gameplay classes — use the ScriptableObjects in
  `Assets/_Game/Scripts/ScriptableObjects/`.
- **No `FindObjectOfType` in hot paths.** Wire references (`SerializeField`) or use the service registry on `GameRoot`.
- **No `Resources.Load` for gameplay content.** Direct references or addressables-lite later.
- **No secrets in code, configs, commits, or screenshots.** API keys live in `.env` (gitignored) or CI secrets.
- **No desktop-only graphics.** Every lighting/shadow/post/render feature must be justified on a
  mid-tier Android GPU (see `Documentation/PERFORMANCE_BUDGET.md`).
- **Do not silently change architectural conventions** (namespaces, asmdefs, folder layout, event style).
  Propose the change in the task/PR first.
- **Do not touch other folders in this monorepo** — only `glad-to-see-you/` (plus the repo-level files
  that explicitly reference this project).

## Where things live (map, not an essay)

- Runtime code: `Assets/_Game/Scripts/{Core,Player,Combat,AI,Camera,Input,Animation,UI,Audio,Save,Utilities}`
- Data: `Assets/_Game/Scripts/ScriptableObjects/` · Editor tooling: `Assets/_Game/Editor/`
- Tests: `Assets/_Game/Tests/{EditMode,PlayMode}`
- Visual identity: `Documentation/ART_DIRECTION.md` — assets that don't match it get rejected.
- Budgets: `Documentation/PERFORMANCE_BUDGET.md` — "it runs at 60 on my PC" is not a budget argument.

## Definition of done (per task)

1. Compiles (no errors, no new warnings in *our* assemblies).
2. Relevant tests updated/added and passing (EditMode; PlayMode when scenes are involved).
3. Console clean in play mode for the touched system.
4. Perf note if the change touches per-frame work (what it costs, where measured).
5. Docs updated when behavior/conventions change.
