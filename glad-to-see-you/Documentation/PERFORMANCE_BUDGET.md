# PERFORMANCE_BUDGET.md — starting targets (mobile, URP)

> These are **starting targets to be validated on device**, not universal laws.
> Measure: Unity Profiler (device build!), `PerformanceOverlay` in-game, GPU timing via the platform profiler.
> Keep this file updated when real measurements replace estimates.

## Frame timing

| Profile | Target | Frame budget | Notes |
| --- | --- | --- | --- |
| High | 60 fps | 16.6 ms (CPU ≤ 8, GPU ≤ 12) | flagship-class devices (2023+) |
| Balanced | 60 fps | 16.6 ms | mid-tier; render scale 0.9 |
| Low | 30 fps | 33.3 ms | older devices; render scale 0.8, reduced effects |

- Stability > average: a locked 60 with rare spikes is worse than a steady 59. Watch p99 frame time.
- CPU 60 fps ⇒ **main-thread gameplay ≤ 4 ms**, render thread + workers the rest.

## Geometry

| Item | Budget (per frame, on screen) |
| --- | --- |
| Triangles | ≤ 150k (High) / ≤ 100k (Balanced) / ≤ 60k (Low) |
| Skinned meshes rendered | ≤ 12 characters-class objects, ≤ 2 skinned bones heavy (≤ 75 bones each) |
| Unique meshes (no instancing) | ≤ 120 |
| LOD coverage | All environment meshes > 5k tris have LOD1 (and LOD2 if > 20k) |

## Rendering

| Item | Budget |
| --- | --- |
| Draw calls (SRP Batcher active) | ≤ 120 (High) / ≤ 80 (Balanced) / ≤ 50 (Low) |
| Materials (unique per scene) | ≤ 60 |
| Texture memory | ≤ 250 MB total; hero 2048² max, others 1024², VFX 256–512² |
| Realtime lights (mobile) | 1 directional + ≤ 4 punctual visible |
| Shadow-casting lights | 1 (directional, single cascade set) + ≤ 1 dynamic spot |
| Shadow map | 2048² directional cascade (High) / 1024² (Balanced/Low) |
| Post-processing | Bloom (threshold high), color grade, vignette. No motion blur, no DoF, no SSAO-by-default |
| Overdraw | Full-screen effects ≤ 1.5× screen; particles additive ≤ 3 layers at peak |
| MSAA | Disabled or 2× max; prefer render-scale + FXAA-like filtering |

## Particles / VFX

| Item | Budget |
| --- | --- |
| Peak alive particles | ≤ 300 (High) / ≤ 150 (Balanced) / ≤ 60 (Low) |
| Emitters active simultaneously | ≤ 12 |
| One-shot burst size | ≤ 40 particles (hit), ≤ 80 (death) |
| GPU instanced particles | preferred for sparks; CPU particles for ≤ 20 particle bursts |

## Animation

- Animator: ≤ 3 layers in use on hero; no IK solving beyond lock-on head/upper-body aim.
- Animator culling: `Cull Update Transforms`, off-screen enemies `Cull Completely`.
- No Animator `SetX` calls in `Update` — parameters only set when state actually changes.

## Memory / CPU

| Item | Budget |
| --- | --- |
| Total runtime memory (arena loaded) | ≤ 1.2 GB (High) / ≤ 900 MB (Balanced) / ≤ 700 MB (Low) |
| Managed allocations in steady state | **0 B/frame** in gameplay loops (no LINQ, no closures per frame, no string concat) |
| GC spikes | none above 1 KB/frame during combat |
| Physics | ≤ 6 non-alloc queries per frame from gameplay systems |

## Techniques — required vs optional

**Required now:** LODs on environment, static batching (static arena geometry), GPU instancing
(repeated props), texture compression (ASTC 6x6 default / ASTC 8x8 low), occlusion culling baked for the
arena, limited realtime shadows, baked lighting for static mood (lightmaps on arena shell), sensible post.
**Planned as scale demands:** dynamic resolution (URP render scale), addressables, SRP Batcher audits,
shader variant stripping passes, GPU occlusion culling evaluation.

## How to verify (each milestone)

1. Build a **development build to device**; run `PerformanceOverlay` (FPS, frame ms, GC, draw calls).
2. Unity Profiler over USB (`-profiler-enable`); capture 60 s of combat.
3. Check: main thread, render thread, GC Alloc column (must be flat), draw calls, tris.
4. Record results as a short note in the milestone PR. Update budgets if measurements prove them wrong —
   with the measurement attached.
