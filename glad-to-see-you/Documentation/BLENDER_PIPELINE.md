# BLENDER_PIPELINE.md — from generated/downloaded model to Unity-ready asset

Blender **5.2.2** (installed: `~/apps/blender-5.2.2-linux-x64/blender`, symlink `~/.local/bin/blender`).
Blender MCP server: `mcp-for-blender` v2.0.4 (see `MCP_SETUP.md` §2). MCP is optional — everything here
works manually too.

## The pipeline

```
AI-generated model (Meshy)  ──┐
Fab / store asset           ──┤→ 1. Import to Blender (assets-staging/)
Hand-modelled blockout      ──┘     2. Scene inspection (MCP) → units, origin, count
                                    3. Scale & orientation verification (1 unit = 1 m, forward +Z, up +Y, pivot at feet/origin)
                                    4. Topology review (manifold-ness not required; game-ready density, no ngons on deforming areas)
                                    5. Cleanup (merge verts, remove interior faces, triangulate where needed, rename)
                                    6. LOD generation (decimate ratios) → LOD0/LOD1/LOD2 in one .blend, separate objects suffixed _LOD#
                                    7. Material review (names to M_*, no unsupported nodes; base color/rough/metal/emissive channels only)
                                    8. Collider planning (convex hull proxy objects for props; capsule plan for chars — created later in Unity)
                                    9. Export FBX per object with Unity settings (Y-up, scale 1, no leaf bones)
                                   10. Unity import validation (see checklist)  → log in AI_ASSET_PIPELINE.md §4
```

## MCP usage (when Blender is running with the addon server ON)

Typical agent requests (each is a *reviewed* step, not a blanket "do whatever"):
- "Inspect the scene: list objects, dimensions, origins, material slots."
- "The character is 1.9 m tall but our target is 1.8 m — scale it to 1.80 m keeping feet at z=0."
- "Create LOD1 (ratio 0.5) and LOD2 (ratio 0.25) from the selected mesh, keep UVs."
- "Rename objects per convention and apply transforms."
- "Export the three LODs as FBX (Y-up, 1 m) to assets-staging/exports/."

**Security:** the Blender addon server executes `bpy` operations. Keep it bound to localhost, never run it
on shared networks, and treat any request that writes arbitrary files/scripts as suspicious until reviewed.
The MCP client (VS Code) is the only intended client.

## Unity import settings (contract — do not deviate silently)

| Setting | Value | Why |
| --- | --- | --- |
| Scale Factor | 1 (asset authored in meters) | prevents "why is the sword 10 m" |
| Mesh Compression | Off for hero/enemy, Medium for props | mobile memory vs fidelity |
| Read/Write | **Off** (on only for meshes modified at runtime) | memory |
| Generate Colliders | Off — colliders are authored per asset type | avoids wrong physics |
| Normals | Import | |
| Materials | Import via `Material Remap` or per-project; names must match `M_*` | consistency |
| Animation | Import only for animated assets; loop matches set per clip ("Loop Time" on cycles) | |
| Rig (characters) | **Humanoid** rig type; verify avatar auto-mapping, fix fingers if present | retargeting + Mixamo compatibility |

## Manual Blender spot-checks (before export, every time)

- [ ] Object transforms applied (rotation 0, scale 1)
- [ ] Pivot at the right place (feet for characters; logical mount point for props)
- [ ] No negative scale (flips normals in Unity)
- [ ] UVs exist, no overlapping faces destined for unique texturing
- [ ] Material count ≤ 2 per hero asset, ≤ 1 per prop (budget file)
- [ ] Texture references packed/organized; ORM channel packing matches URP Lit expectations
- [ ] Poly budget: hero ≤ 40k tris LOD0, enemy ≤ 25k, prop ≤ 5k (High profile)

## Export presets

- Format: **FBX**, `Apply Modifiers`, `Selected Objects`, `Y-up`, scale `1.0`, `Tangent Space` on.
- One FBX per logical asset (character + LODs in one file is fine; Unity splits by object name `_LOD#`).
- Characters: include skeleton, exclude leaf bones (Unity adds them otherwise).
- Put exports in `assets-staging/exports/` (gitignored until promoted), then import + validate + log + commit.
