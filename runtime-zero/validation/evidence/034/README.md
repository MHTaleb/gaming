# RZ-034 evidence — war presentation (battlefield staging)

Owner feedback (RZ-012 rounds 2–3, with Obsidian Knight screenshots): "I see cubes
and buttons, where is my expected gaming experience"; the fight must look like a war.

## What changed

- `tools/make_combat_art.gd` — deterministic procedural fighter sprites in the
  landing-art language: operator, memory_leak, server_cathedral (128×128 RGBA8,
  pure math, no downloads; regeneration is byte-identical — see `art-generator.log`).
- `game/scenes/combat.tscn` + `game/src/presentation/combat.gd` — battlefield
  staging: hero left / hostiles right on a ground band over the arena backdrop,
  HP pills under each fighter (green hero, red enemies), intent + name labels,
  mission banner ("Ticket n — <region>"), centered action dock (Attack/Guard/
  Skill/Continue/Retry) and a combat log panel. Reduced-motion aware impact
  pulses and banner flourish.

## Verification

| Check | Result |
|---|---|
| `make_combat_art.gd` two runs | identical sha256 for all three sprites (`art-generator.log`) |
| `presentation_tests.gd` | **ALL PRESENTATION TESTS PASSED (112 checks)** incl. sprites + backdrop |
| `replay_tests.gd` | **56 checks** — restaged scene reports identical state hashes/event digests |
| captures | `combat-encounter1.png`, `combat-boss.png` (battlefield, banner, dock, HP pills) |
