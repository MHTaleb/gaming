# RZ-036 evidence — animated hero (young man with laptop) and painted region stages

Owner feedback (round 5, verbatim): "please try to create great art, background
and also I need the character to be able to move, walk in animated mode, like any
2D game where characters are humanoids, our character is a young man with a
laptop. you task now is to install tools and use them to achieve this".

This ticket is the *character and stage* half of that request; the local graphics
toolchain install is RZ-037.

## What changed

- `tools/make_character_anim.gd` (NEW) — deterministic SDF painter for the hero:
  a young engineer with a laptop. 128×128 frames, palette-locked (graphite/navy
  jacket, cyan TRIM zipper, amber screen dot, hair-cap + fringe head). Emits:
  - `game/assets/characters/operator.png` — single frame for cards/HUD;
  - `game/assets/characters/operator_idle.png` — 2-frame idle (breathing bob,
    screen brightens on frame 2);
  - `game/assets/characters/operator_walk.png` — 6-frame walk cycle: leg swing
    ±11 px at the hip with counter-swinging arms, body bob, planted feet, moving
    shadow. No randomness anywhere; sha256 printed per run.
- `tools/make_stage_art.gd` (NEW) — 1280×720 region backdrops, one per region:
  `intrusion` (night skyline, horizon glow), `load_spike` (magenta spike field
  with data lines), `server_cathedral` (LED-grid pillars, vaulted ceiling ribs,
  central energy beam, perspective server-rack rows with blinkenlights, aisle
  runner). Same palette and determinism rules.
- `tools/make_combat_art.gd` — operator generation removed (single source of
  truth is now `make_character_anim.gd`); enemies unchanged (hashes identical to
  RZ-034).
- `game/scenes/map.tscn` — the character node is now an `AnimatedSprite2D`
  (unique `%Character`, z 5); the old `TextureRect` and its scene texture import
  are gone.
- `game/src/presentation/map.gd` — builds `SpriteFrames` from the two sheets at
  runtime (walk: 6 frames, 10 fps; idle: 2 frames, 2 fps); plays `walk` while the
  tween moves (flipping `flip_h` when the next stone is to the left), `idle` on
  rest, instant/reduced motion stays still. `CHARACTER_OFFSET` is now
  `Vector2(0, -54)` so the sprite's feet plant on the stone centre.
  `REGION_TINTS` (modulate hack) replaced by `REGION_BACKDROPS`, applied in
  `_apply_region_look()`.
- `game/src/presentation/combat.gd` + `combat.tscn` — `_apply_region_backdrop()`
  shows the matching region painting behind the fight (encounter index from the
  live run, or the `--encounter` id in standalone mode), dimmed for readability.
- `game/tests/map_tests.gd` — `OFFSET` updated to the new character anchor; new
  checks: 6-frame walk sheet + 2-frame idle sheet wired, walk cycle plays while
  moving right, engineer faces left when walking back, rests in idle on arrival.
- `game/tests/run_flow_tests.gd` — new checks: the fight opens on the region's
  painted backdrop (intrusion), second region (load_spike), boss
  (server_cathedral).

## Verification

| Check | Result |
|---|---|
| `map_tests.gd` | **ALL MAP TESTS PASSED (33 checks)** — incl. 5 new animation checks |
| `run_flow_tests.gd` | **52 checks** — three regional backdrops asserted through the real scene chain |
| `presentation_tests.gd` | 112 checks — hero chip, enemy chips, backdrop non-null |
| full battery | `battery.log` — import + 8 suites + guard + `verify.js`, all exit 0 (463 checks total) |
| generator determinism | `art-hashes.txt` — two consecutive runs byte-identical (diff clean) |
| captures | `work-map-animated.png` (engineer planted on START stone, intrusion skyline, mini map), `battle-intrusion.png` (fight on the region painting), `hero-anim-sheet.png` (walk cycle + idle review strip) |

## How to look at it

```
tools/demo.sh run map          # walk stone to stone: the cycle plays, he faces left/right
tools/demo.sh capture /tmp/map.png map
```

Reduced motion (MOTION button) still teleports with no walk animation: the
accessibility guarantee from RZ-035 is unchanged (asserted in map_tests).
