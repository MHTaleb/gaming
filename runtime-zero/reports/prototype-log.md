# Prototype build log

Running evidence for prototype-phase tickets (P0–P1). Raw artifacts stay in ignored
`reports/local/`; this file records their location, hash and the measured outcome.

## RZ-004 — independent Godot project and first launch (2026-09-20)

Engine: **Godot 4.7.2.stable.official.ed1daf0bf** (GDScript build, sha512-verified in
`config/toolchain.lock.json`), installed at `~/.local/godot/`.

Project layout created:

```
game/project.godot            GDScript project; main scene res://scenes/title.tscn
game/scenes/title.tscn        provisional title screen (placeholder labels)
game/src/presentation/title.gd
game/src/{domain,application,infrastructure}/README.md   layer boundaries
```

Renderer: **GL Compatibility** (`rendering_method` and `.mobile`). Rationale: works
through WSLg (which exposes OpenGL 3.3 via Mesa/D3D12) and travels best to Android;
placeholder 2D does not need Forward+/Vulkan. Viewport 1280×720, `canvas_items`
stretch, orientation 0 (landscape) for the provisional landscape target.

### Checks actually run

| Command | Result |
|---|---|
| `~/.local/bin/godot --headless --path game --editor --quit` | exit 0; filesystem scan and editor init completed; no parse errors; `title.gd.uid` generated |
| `~/.local/bin/godot --path game --quit-after 300 -- --smoke-shot` | exit 0; window opened through WSLg (OpenGL 3.3 Core, Mesa 21.2.6, D3D12 device: RTX 4050); title scene rendered |

GUI-render evidence (not committed, recorded by hash):

- `reports/local/rz-004-title-smoke.png` — 1280×720 RGBA PNG, sha256
  `1304aa63480204d73240bdb079ffe758e011c2fc4b285a7a6d48bce7f413669e`
- Captured by the scene itself via `--smoke-shot` (user arg) which saves
  `user://title_smoke.png` after 5 frames and quits; the hook is presentation-only and
  inert during normal play.

Observed non-fatal warnings on WSLg (recorded, not hidden):

- `Could not set V-Sync mode ... not supported by the graphics driver`
- `libxkbcommon ... undefined symbol` messages from the WSLg X11 stack

Neither blocked rendering or input startup. If they grow into input problems, the
documented fallback is a Windows-editor/WSL-CLI split with matched engine versions.

No export templates were installed and no export preset exists yet (P6 owns that).

## RZ-005 — deterministic combat commands and events (2026-09-20)

Implemented in `game/src/domain/` (pure RefCounted data, no scene/timer/IO access):

| File | Role |
|---|---|
| `rules.gd` | Versioned rule constants (`RULES_VERSION` 1), mitigation and guard-floor math, round cap 50 |
| `actor_state.gd` | Actor stats/state incl. hero guard flag, boss telegraph + normal-attack counter |
| `combat_state.gd` | Turn index, actors, outcome (ONGOING/VICTORY/DEFEAT/STALLED), `rng_state` (reserved; v1 consumes none), `state_hash()` |
| `combat_command.gd` / `combat_event.gd` | DATA_CONTRACTS shapes, monotonic event sequence |
| `combat_resolver.gd` | Pure `resolve(state, command)` → `{accepted, reason, state, events}`; rejection consumes nothing |

Rules implemented per `docs/GAME_DESIGN.md`: Attack `max(1, atk-def)`; Guard halves with
integer floor/min 1; Skill costs 3 energy and deals `max(1, 2*atk-def)`; enemies act in
stable actor-ID order after the hero and dead actors never act; +1 energy at round end up
to cap; boss telegraphs after every third normal attack and then hits for double attack;
victory/defeat evaluated after every action; round cap → STALLED (never a win); HP/energy
clamped; rejected commands change no state, consume no sequence number and emit no events.

Pinned interpretation for owner review (RZ-012): "guard expires at the hero's next turn"
is implemented as *every* incoming hit while active is halved (floor, min 1), and the flag
clears when the hero's next turn begins — not as a single-use shield. One line to change
if the owner prefers single-hit semantics.

### Checks actually run

| Command | Result |
|---|---|
| `~/.local/bin/godot --headless --path game --editor --quit` | exit 0 (registers global class names after new scripts are added) |
| `~/.local/bin/godot --headless --path game --script res://tests/run_tests.gd` | exit 0 — **ALL TESTS PASSED (86 checks)**: deterministic replay (identical state hash + event stream for the same inputs), invalid-input rejection without state change, stale/duplicate command rejection, guard halving/expiry/no-stacking, enemy ordering with dead-skip, clamps, terminal states, boss telegraph/heavy, round-cap stall, monotonic event sequences |

Note for CI (RZ-011): a fresh checkout must run the headless editor import once before
`--script` tests, so the GDScript global class cache exists in `.godot/`.
