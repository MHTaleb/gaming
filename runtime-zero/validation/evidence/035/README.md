# RZ-035 evidence — region work map with mini map and select-to-fight

Owner feedback (RZ-012 rounds 3–4, with Obsidian Knight screenshots): "we are in
map, we have mini map, and once we select a spot we start the war of IT engineer".

## What changed

- `game/scenes/map.tscn` + `game/src/presentation/map.gd` — one region per screen:
  region banner (Intrusion / Load Spike / Server Cathedral), HUD chips
  (TICKETS n/3, CLEARED n/3), winding stone route, dock buttons (CONTRACTS,
  CHESTS, INVENTORY, ABANDON), MUTE/MOTION/QUIT top-right, backdrop tint+pan per
  region.
- `game/src/presentation/map_route.gd` — canvas-drawn stone route with states
  (current/visited/ahead) and the ticket pennant; no textures.
- `game/src/presentation/minimap.gd` — mini map panel: scaled route with stone
  states and the engineer's position dot.
- Movement: tap a stone ahead → the engineer walks it (tween; instant under
  reduced motion); later stones locked, cleared stones walkable. Selecting the
  region's TICKET stone **starts the war immediately** (`auto_start`; tests and
  captures can disable it, the CONTRACTS dock still shows the ticket text).

## Verification

| Check | Result |
|---|---|
| `map_tests.gd` | **ALL MAP TESTS PASSED (28 checks)** — locks, walking, motion modes, mini map shown, select-ticket-stone starts the war |
| `run_flow_tests.gd` | **48 checks** — loadout → map → war ×3, result → map → next war, replay |
| `tools/demo.sh capture <png> map` | works (starts a demo run so tickets render) |
| captures | `work-map.png` (region 1, mini map drawing), `work-map-region2.png` (region 2 progress) |
| full battery | `battery.log` — all suites exit 0 |
