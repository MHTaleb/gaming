# Art direction and review orders

Status: provisional visual direction until RZ-012/RZ-018 owner review. Theme: dark technological fantasy. Favor readable silhouettes and restrained electric accents over noise. A phone must communicate enemy intent and equipment identity at gameplay scale.

## Initial style contract

Use graphite/navy backgrounds, warm neutral character bodies, cyan for player technology and amber for warnings; reserve high contrast for actionable information. Do not encode state in color alone. Keep one consistent light direction and a limited palette per environment. Start with one view and one character reference, not a full animation set.

Use original fictional motifs: server architecture as ruins, circuit patterns as magic, memory fragments as equipment. Do not reproduce company logos or imitate a specific living artist. Final title, protagonist identity and costume need owner review. Placeholder shapes remain acceptable until the game loop passes.

## Prototype hero identity (owner-directed, 2026-09-21, RZ-036)

The owner locked the hero read in round 5: **a young man with a laptop.** The
prototype (deterministic generator `tools/make_character_anim.gd`, 128 px
frames, palette-locked) draws: dark cropped hair with a fringe, a warm-neutral
face, a teal/navy engineer jacket with the cyan TRIM zipper (cyan = player
technology), a shoulder strap, dark trousers and shoes, and a laptop held open
in front with a glowing cyan screen plus one amber indicator (amber = warning,
used sparingly). Six-frame walk cycle and two-frame idle; nothing is encoded in
colour alone — posture and animation carry state.

This satisfies "start with one view and one character reference" as a
**prototype**; the production contract (approved parts → manual cleanup →
Skeleton2D/AnimationPlayer, per the table below) still stands for later phases.

## Asset families

| Family | Prototype | Production candidate contract |
|---|---|---|
| Hero | Single simple silhouette | Consistent proportions, approved front/side reference, separable parts for rigging |
| Enemy | Distinct shape per behavior | Readable attack cue and silhouette, reference-conditioned variations |
| Item icon | Shape plus label | Centered object, transparent final PNG, readable at 64 px |
| Background | Flat layered shapes | Separate far/mid/foreground layers, no accidental UI-like text |
| VFX | Procedural flash/pulse | Short readable cues, reduced-motion alternative |
| UI | Native Godot controls | Consistent spacing, scalable text and explicit focus states |

## Generation review

Generate at batch 1. Use a recorded seed and prompt template. Start at 768-square where practical; choose larger sizes only after measurement. Inspect edges, anatomy, duplicated objects, unwanted text, halos, silhouette and consistency at actual display size. Background removal is postprocessing, not a guarantee of native transparency.

Use IP-Adapter/reference conditioning and ControlNet only after a base workflow succeeds. Verify compatible checkpoint families and encoder/node versions. Do not claim they guarantee identity. Keep rejected candidates outside game/assets/ and retain reasons in the manifest.

Do not rely on independently generated animation frames as the primary character animation pipeline. Prefer approved parts → manual cleanup → Skeleton2D/AnimationPlayer; record pivots, layer order and attachment points. Use frame animation only after checking temporal consistency.

No LoRA training until Housseyn approves a coherent reference set and rights to train on it are recorded. Training is optional future scope. A provisional prompt token is not a trained adapter.
