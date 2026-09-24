# Glad to See You

**A serious, visually polished 3D dark-fantasy action game for mobile.**
Android first, iOS-compatible architecture. Unity 6.3 LTS + URP.

> Internal working name: `glad-to-see-you` (folder/codename). Genre tag: mobile dark fantasy.
> This is a **vertical slice** project: one hero, one arena, excellent feel — not an RPG.
> See `Documentation/GAME_VISION.md` for scope guardrails (section "DO NOT BUILD YET").

---

## Status

| Area | State |
| --- | --- |
| Repository structure | ✅ created (Unity project layout + docs + scripts) |
| Architecture (runtime C#) | ✅ implemented (modular components, SO-driven data, tests) |
| Unity Editor install | ✅ installed locally (Linux/WSL, user-space) — see `Documentation/DEVELOPMENT_SETUP.md` |
| Android build support | ⚠️ scripted install available; verify on your machine |
| Vertical slice scene | 🔜 generated in-editor: `Glad to See You ▸ Bootstrap ▸ Build Vertical Slice Scene` |
| Art / audio / characters | 🔜 placeholders only (procedural). Real assets via Blender/Meshy pipeline |

---

## Onboarding path (new dev or AI agent)

1. Read `AGENTS.md` (workflow contract) — it applies to any coding model.
2. Read `Documentation/GAME_VISION.md` → `ARCHITECTURE.md` → `DEVELOPMENT_SETUP.md`.
3. Check your environment: `./scripts/check-environment.sh` (or `.ps1`-less on Windows: manual steps in `DEVELOPMENT_SETUP.md`).
4. Open the project in **Unity 6000.3.24f1** (or newer 6000.3.x patch).
5. Run `Glad to See You ▸ Bootstrap ▸ 1. Setup Project` once (URP, layers, quality).
6. Run `Glad to See You ▸ Bootstrap ▸ 2. Build Vertical Slice Scene`, then press Play.
7. Keyboard/gamepad works in editor; touch controls appear on device.

## Repository layout (top level)

```
Assets/_Game/        our code, art, scenes, settings (see ARCHITECTURE.md)
Documentation/       art direction, pipelines, budgets, setup, MCP
scripts/             environment check + reproducible setup scripts
Packages/            Unity package manifest (URP, Input System, AI Navigation…)
ProjectSettings/     Unity project settings (pinned to 6000.3.24f1)
.env.example         secret template — copy to .env, never commit keys
```

## Verification (what "done" means here)

- Unity compiles with **zero errors** (check console; use Unity MCP to read it).
- EditMode tests green: `Window ▸ General ▸ Test Runner ▸ EditMode ▸ Run All`.
- PlayMode smoke test green (builds the slice programmatically and exercises combat).
- Any new runtime system has: an architecture note (or PR description), and events/SO rather than hard-coded data where configurable.
- Mobile cost considered: see `Documentation/PERFORMANCE_BUDGET.md`.

## Next milestone

**"One visually polished playable arena with one animated character and one enemy."**
Concrete tasks live in `Documentation/ROADMAP.md`.

## Licensing / credits

Third-party assets must be logged in `Documentation/AI_ASSET_PIPELINE.md` (source + license + commercial-use rights) before entering `Assets/_Game/Art/`.
