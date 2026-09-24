# ART_DIRECTION.md — art bible (v0, owner-reviewable)

> Style gate: any asset that ignores this file is rejected, no matter how nice it is.
> Consistency beats individual asset quality.

## The look

**Dark stylized medieval fantasy — "weathered, restrained, cinematic."**

Reference language (for prompting/grading, not for copying assets):
- Semi-realistic proportions (think 6.5–7 heads, slightly heroic hands/weapons).
- Strong, readable silhouette first: every character/prop reads at 100 px tall.
- Lived-in materials: worn metal, aged leather, rough stone, stained cloth, ash, rain-slick grime.
- Cool environment base lighting (moon/overcast/shadow-blue), **warm fire/torch/ember accents**.
- Restrained palette: stone greys, desaturated cold blues, oxblood/bronze accents, one saturated
  hero color (embers/orange-red) reserved for danger and VFX.
- Fog + volumetric feel sells atmosphere; silhouettes emerge from darkness rather than from brightness.

## What we do NOT do

- No neon-pastel palettes, no sci-fi, no anime-crossover styling, no chunky cartoon proportions.
- No mixed biome kits in one arena; one coherent location per environment.
- No noisy texture detail that fights the silhouette at mobile resolution.
- No realistic photorealism chasing — stylization is the performance and identity strategy.

## Production constraints baked into the style

| Constraint (mobile) | Art decision it forces |
| --- | --- |
| Few real-time lights | Bake moody base + few dynamic "story" lights (torch, portal, hero rim) |
| Limited shadow map budget | One strong directional shadow; contact shadow "cheats" (decals) elsewhere |
| Fill-rate sensitive | Large flat surfaces get gradient/vertex detail, not layered micro-textures |
| Texture memory | 1024² default character textures, 2048² only for hero; channel-packed masks (ORM) |
| Draw calls | Trim sheets + shared atlases per location; hero/enemy share one atelier |

## Material language (URP Lit-based)

- **Stone:** roughness 0.7–0.9, low metallic, subtle normal (softened edges), 15–25% desaturation.
- **Worn metal:** metallic 0.8–1.0, roughness 0.35–0.65 with roughness breakup (water streaks, scratches);
  edges catch a cold specular — never chrome.
- **Leather/cloth:** roughness 0.6–0.85, albedo variance via large-scale AO grime, not noise.
- **Emissive accents (hero-adjacent):** embers, runes, eye-glow only. Max 1 emissive hue family per scene.

## Lighting language

- Key: cool directional (moon/overcast), low intensity, long soft shadows.
- Pools of warm local light guide the player's route through the arena.
- Hero is always the brightest readable element in combat (rim/spec separation), enemies read darker
  until they attack (telegraph flash = saturated warning color).
- Post: subtle bloom (emissives only), restrained vignette, filmic tonemap, gentle contrast S-curve.

## VFX language (readability > realism)

- **Attack telegraph:** high-saturation enemy-tinted flash/arc — must read in a screenshot.
- **Impact:** sparks + dust + short-lived glow (≤0.4 s), scale to hit weight (light vs heavy).
- **Dodge:** ground dust ring + brief motion smear; never a full-screen effect.
- **Death:** enemy dissolution into embers/ash (ties to the ember accent color).
- VFX color contract: player = warm ember/orange; enemy = cold violet/teal; environment = neutral grey.

## Animation language

- Weight over speed: wind-up anticipation is longer than the release; recoveries have follow-through.
- Dodge = quick burst + low pose; attacks = rooted swings with torso rotation, not arm-only.
- Hit reaction = flinch away from the impact vector (directional reactions, not a single shake).

## Asset intake checklist (mandatory)

Every external/generated asset gets logged in `Documentation/AI_ASSET_PIPELINE.md` with:
source, license, commercial-use rights, poly count, material count, texture sizes, UVs, skeleton (if any),
scale (meters; 1 unit = 1 m), forward axis (+Z, Unity convention), naming per conventions, LOD plan,
collider plan. **Unlogged assets do not enter `Assets/_Game/Art/`.**

## Naming conventions (assets)

- Meshes: `SM_<Area>_<Name>_LOD0` (chars: `SK_<Name>`), Materials `M_<Name>`, Textures `T_<Name>_<Base|Norm|ORM|Emi>`,
  VFX `VFX_<Name>`, Audio `SFX_<Name>` / `MUS_<Name>`, Animations `AN_<Character>_<Action>`.
- No spaces, no version numbers in names; variants go in folders (`_V2` only inside staging).
