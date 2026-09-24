# AI_ASSET_PIPELINE.md — where each asset type should come from

> Status: guidance, reviewed 2026-09-24. Nothing gets purchased automatically. Paid tool calls require
> explicit owner approval per batch (`AGENTS.md` rule). Log every asset (§4).

## 1. Service map (for later activation — none are purchased)

| Need | Primary | Alternatives | Notes |
| --- | --- | --- | --- |
| Concept art / mood boards | Scenario, Midjourney-like tools | Photobash | Feed `ART_DIRECTION.md` as the prompt contract |
| 3D characters | Meshy (text/image-to-3D + rig + animate) | Tripo, Character Creator | Expect Blender cleanup; AI rigs need retargeting review |
| 3D props | **Fab** / Unity Asset Store first | Meshy | Generic props are usually better+cheaper from pro packs |
| Environment kits (arena shells) | **Fab** / Quixel Megascans (stone, moss, timber) | Meshy | Use pro kits to hit the "premium" bar faster |
| Textures / PBR materials | Quixel Megascans, Substance 3D (Source/Designer for custom) | Scenario texture gen | Channel-packed ORM pipeline; see ART_DIRECTION material language |
| Rigging | Meshy auto-rig (draft) → Blender review | Rokoko Studio | Humanoid rig must retarget to Unity Humanoid |
| Animation (clips) | Mixamo (free, retarget-friendly) | Rokoko (mocap from video), DeepMotion | See `ANIMATION_PIPELINE.md` for the retarget/import contract |
| Motion capture | Rokoko / DeepMotion (paid, approval required) | Phone-video → DeepMotion | Only when authored animation can't sell the weight |
| VFX | In-Unity (Shuriken/VFX Graph via code bootstrap) | Fab VFX packs | Readability contract in ART_DIRECTION; mobile budgets in PERFORMANCE_BUDGET |
| Skyboxes / atmosphere | Procedural gradients + fog (current) | Scenario skybox, HDRI from Poly Haven (CC0) | Keep one HDR pipeline decision when we add real skies |
| Sound placeholders | Procedural synth (in-repo: `PlaceholderAudioFactory`) | — | Real SFX later: freesound/Fab, license-checked |
| Music | Later (sourced/licensed) | — | Not needed for slice |

**Rule of thumb:** *use professional assets for generic objects; use AI generation where custom art is the
value* (the hero look, the distinctive enemy, arena hero props).

## 2. Intake pipeline (every asset, no exceptions)

```
source found → license check → download to assets-staging/ (gitignored)
→ Blender pass (BLENDER_PIPELINE.md) for 3D → scale/axis/UV/collider/LOD check
→ naming per ART_DIRECTION conventions → import to Assets/_Game/Art/... → validate (Editor ▸ Validate Art Assets)
→ log in §4 → commit (LFS for binaries)
```

## 3. Validation checks (automated where possible)

Editor menu `Glad to See You ▸ Validate ▸ Art Assets` checks: naming pattern, scale (meters), pivot at
origin/feet for characters, material count vs budget, texture max size, poly counts vs budget, LOD presence
for >5k tris, missing LOD groups. Manual checks it can't do: license correctness, silhouette readability,
style match — those are review gates.

## 4. Asset log (fill on every import)

| Date | Asset | Source URL | License / commercial use | Poly count | Textures | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| (example) | Stone trim sheet A | Fab — "Medieval Trim Atlas" | Fab Standard license, commercial OK | n/a (texture) | 2048² ×2 | shared atlas for arena shell |

## 5. Secrets & safety

- Generation services: keys only via `.env`/VS Code prompts; never in prompts that get committed.
- Do not upload unreleased game content (character designs) to third-party services without owner approval.
- Meshy/Trpo et al. retain cloud copies per their ToS — acceptable for the slice, review before launch.
- Keep `assets-staging/` gitignored (raw downloads, candidates, .blend working files until LFS-committed).
